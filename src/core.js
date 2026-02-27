// src/core.js — YTX 命名空间、共享状态、工具函数、字幕获取、settings

var YTX = {
  // 共享状态
  panel: null,
  currentVideoId: null,
  transcriptData: null,
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
  return { segments: segments, full: full };
};

// ── 确保字幕已加载（各模块共用）───────────────────────

YTX.ensureTranscript = async function () {
  if (!YTX.transcriptData) {
    YTX.transcriptData = await YTX.fetchTranscript();
    YTX.renderTranscript(); // defined in panel.js
  }
};
