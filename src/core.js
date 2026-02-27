// src/core.js — YTX 命名空间、共享状态、工具函数、字幕获取、settings

var YTX = {
  // 共享状态
  panel: null,
  currentVideoId: null,
  transcriptData: null,
  videoMode: false, // true = 无字幕，使用 Gemini 视频模式
  activeTab: 'summary',
  resizerInjected: false,

  // 各功能模块注册到这里
  features: {},

  // 功能模块加载顺序（panel.js 中用于遍历）
  featureOrder: ['summary', 'html', 'chat', 'cards', 'mindmap', 'vocab'],
};

// ── 工具函数 ──────────────────────────────────────────

YTX.fmtTime = function (seconds) {
  var m = Math.floor(seconds / 60);
  var s = seconds % 60;
  return m + ':' + String(s).padStart(2, '0');
};

YTX.timeToSeconds = function (str) {
  var parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
};

// ── Settings ──────────────────────────────────────────

YTX.getSettings = function () {
  return new Promise(function (resolve) {
    chrome.storage.sync.get(
      ['provider', 'apiKey', 'openaiKey', 'geminiKey', 'claudeModel', 'openaiModel', 'geminiModel', 'model', 'prompt'],
      function (data) {
        var provider = data.provider || 'claude';
        var KEY_MAP = { claude: 'apiKey', openai: 'openaiKey', gemini: 'geminiKey' };
        var MODEL_MAP = { claude: 'claudeModel', openai: 'openaiModel', gemini: 'geminiModel' };
        resolve({
          provider: provider,
          activeKey: data[KEY_MAP[provider]] || '',
          model: data[MODEL_MAP[provider]] || '',
          prompt: data.prompt,
        });
      }
    );
  });
};

// ── 与 background.js 通信 ─────────────────────────────

YTX.sendToBg = function (message) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendMessage(message, function (resp) {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resp);
    });
  });
};

// ── 字幕获取 ──────────────────────────────────────────

YTX.fetchTranscript = async function () {
  var result = await YTX.sendToBg({ type: 'FETCH_TRANSCRIPT', videoId: YTX.currentVideoId });
  if (result.error) throw new Error(result.error);
  if (!result.segments || result.segments.length === 0) throw new Error('字幕内容为空');

  var segments = result.segments;
  var full = segments.map(function (s) { return '[' + YTX.fmtTime(s.start) + '] ' + s.text; }).join('\n');
  var wasTruncated = full.length > YTX.TRANSCRIPT_MAX_CHARS;
  full = YTX.truncateTranscript(full);
  return { segments: segments, full: full, truncated: wasTruncated };
};

// ── JSON 解析容错（剥离 markdown 围栏）──────────────

YTX.extractJSON = function (text, type) {
  // 先剥离 ```json ... ``` 或 ``` ... ``` 围栏
  var fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1];

  // 根据类型匹配 [] 或 {}
  var pattern = type === 'object' ? /\{[\s\S]*\}/ : /\[[\s\S]*\]/;
  var match = text.match(pattern);
  if (!match) return null;
  return JSON.parse(match[0]);
};

// ── 字幕截断保护（防止超出 API token 限制）────────────

YTX.TRANSCRIPT_MAX_CHARS = 60000; // ~15k tokens，适配大多数模型上下文窗口

YTX.truncateTranscript = function (full) {
  if (full.length <= YTX.TRANSCRIPT_MAX_CHARS) return full;
  var truncated = full.substring(0, YTX.TRANSCRIPT_MAX_CHARS);
  // 截到最后一个完整行
  var lastNewline = truncated.lastIndexOf('\n');
  if (lastNewline > 0) truncated = truncated.substring(0, lastNewline);
  truncated += '\n\n[... 字幕过长，已截断。以上为前 ' + Math.round(YTX.TRANSCRIPT_MAX_CHARS / 1000) + 'k 字符 ...]';
  return truncated;
};

// ── 视频模式相关 ────────────────────────────────────

YTX.getVideoUrl = function () {
  return 'https://www.youtube.com/watch?v=' + YTX.currentVideoId;
};

YTX.getGeminiKey = function () {
  return new Promise(function (resolve) {
    chrome.storage.sync.get(['geminiKey'], function (data) {
      resolve(data.geminiKey || '');
    });
  });
};

// 获取内容参数（统一返回 transcript）
YTX.getContentPayload = function () {
  return { transcript: YTX.transcriptData.full };
};

// ── 确保字幕已加载（各模块共用）───────────────────────

YTX.ensureTranscript = async function () {
  if (YTX.transcriptData) return;

  try {
    YTX.transcriptData = await YTX.fetchTranscript();
    YTX.renderTranscript(); // defined in panel.js
  } catch (err) {
    // 字幕获取失败，检查是否有 Gemini Key 可用
    var geminiKey = await YTX.getGeminiKey();
    if (!geminiKey) {
      throw new Error('该视频无字幕。配置 Gemini API Key 后可直接分析视频内容');
    }

    YTX.videoMode = true;
    if (YTX.panel) {
      var body = YTX.panel.querySelector('#ytx-transcript-body');
      if (body) body.innerHTML = '<div class="ytx-warning" style="padding:8px 12px;font-size:12px;color:#7c3aed;background:#ede9fe;border-radius:6px">该视频无字幕，正在使用 Gemini 分析视频内容...</div>';
    }

    // 一次性让 Gemini 生成虚拟字幕，后续所有功能复用
    var videoUrl = YTX.getVideoUrl();
    var result = await new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({
        type: 'TRANSCRIBE_VIDEO',
        videoUrl: videoUrl,
        activeKey: geminiKey,
      }, function (resp) {
        if (resp && resp.text) resolve(resp.text);
        else reject(new Error((resp && resp.error) || '视频分析失败'));
      });
    });

    YTX.transcriptData = { full: result };
    YTX.renderTranscript();
  }
};

// ── 历史记录持久化（IndexedDB）──────────────────────

YTX.cache = {
  DB_NAME: 'AATubeCache',
  DB_VERSION: 1,
  STORE: 'results',
  _db: null,

  open: function () {
    var self = this;
    if (this._db) return Promise.resolve(this._db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(self.DB_NAME, self.DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(self.STORE)) {
          db.createObjectStore(self.STORE, { keyPath: 'videoId' });
        }
      };
      req.onsuccess = function (e) { self._db = e.target.result; resolve(self._db); };
      req.onerror = function () { reject(new Error('IndexedDB 打开失败')); };
    });
  },

  // 保存某个 feature 的结果
  save: function (videoId, featureKey, data) {
    return this.open().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('results', 'readwrite');
        var store = tx.objectStore('results');
        var getReq = store.get(videoId);
        getReq.onsuccess = function () {
          var record = getReq.result || { videoId: videoId };
          record[featureKey] = data;
          record.updatedAt = Date.now();
          store.put(record);
          resolve();
        };
        getReq.onerror = function () { resolve(); };
      });
    }).catch(function () {});
  },

  // 加载某个视频的全部缓存
  load: function (videoId) {
    return this.open().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('results', 'readonly');
        var store = tx.objectStore('results');
        var req = store.get(videoId);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  },
};

// ── 全部生成（并行，跳过 chat）───────────────────────

YTX.generateAll = async function () {
  var keys = ['summary', 'html', 'cards', 'mindmap', 'vocab'];
  var allBtn = YTX.panel && YTX.panel.querySelector('#ytx-generate-all');
  if (allBtn) { allBtn.disabled = true; allBtn.textContent = '生成中...'; }

  // 立即禁用所有功能按钮，避免等待字幕期间按钮仍可点击
  var btnIds = ['#ytx-summarize', '#ytx-generate-html', '#ytx-generate-cards', '#ytx-generate-mindmap', '#ytx-generate-vocab'];
  btnIds.forEach(function (id) {
    var b = YTX.panel && YTX.panel.querySelector(id);
    if (b) { b.disabled = true; b.textContent = '等待中...'; }
  });

  // 先统一拿字幕，避免各模块重复获取
  await YTX.ensureTranscript();

  // 同时启动所有模块
  var promises = keys.map(function (key) {
    var f = YTX.features[key];
    if (!f || !f.start || f.isGenerating) return Promise.resolve();
    return new Promise(function (resolve) {
      var origDone = f.onDone;
      var origError = f.onError;
      f.onDone = function () {
        f.onDone = origDone;
        f.onError = origError;
        origDone.call(f);
        resolve();
      };
      f.onError = function (err) {
        f.onDone = origDone;
        f.onError = origError;
        origError.call(f, err);
        resolve();
      };
      f.start();
    });
  });

  await Promise.all(promises);
  if (allBtn) { allBtn.disabled = false; allBtn.textContent = '全部生成'; }
};
