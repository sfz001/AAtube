// src/vocab.js — 学英语/词汇

YTX.features.vocab = {
  tab: { key: 'vocab', label: '学英语' },
  prefix: 'VOCAB',
  contentId: 'ytx-content-vocab',
  actionsId: 'ytx-actions-vocab',
  displayMode: 'flex',

  // 状态
  text: '',
  data: [],
  isGenerating: false,

  reset: function () {
    this.text = '';
    this.data = [];
    this.isGenerating = false;
  },

  actionsHtml: function () {
    return '<button id="ytx-generate-vocab" class="ytx-btn ytx-btn-primary">提取词汇</button>' +
           '<button id="ytx-refresh-vocab" class="ytx-btn ytx-btn-secondary" style="display:none">换一批</button>' +
           '<button id="ytx-copy-vocab" class="ytx-btn ytx-btn-secondary" style="display:none">复制</button>';
  },

  contentHtml: function () {
    return '<div class="ytx-empty">点击「提取词汇」从视频字幕中提取值得学习的词汇和短语</div>';
  },

  bindEvents: function (panel) {
    var self = this;
    panel.querySelector('#ytx-generate-vocab').addEventListener('click', function () { self.start(); });
    panel.querySelector('#ytx-refresh-vocab').addEventListener('click', function () { self.refresh(); });
    panel.querySelector('#ytx-copy-vocab').addEventListener('click', function () { self.copy(); });
  },

  start: async function () {
    if (this.isGenerating) return;
    this.isGenerating = true;
    this.text = '';
    this.data = [];

    var btn = YTX.panel.querySelector('#ytx-generate-vocab');
    var contentEl = YTX.panel.querySelector('#ytx-content-vocab');
    var copyBtn = YTX.panel.querySelector('#ytx-copy-vocab');
    btn.disabled = true;
    copyBtn.style.display = 'none';

    try {
      btn.textContent = '获取字幕中...';
      contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在获取字幕...</span></div>';
      await YTX.ensureTranscript();

      btn.textContent = '提取中...';
      contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在提取词汇短语...</span></div>';

      var settings = await YTX.getSettings();
      var payload = YTX.getContentPayload();

      chrome.runtime.sendMessage(Object.assign({
        type: 'GENERATE_VOCAB',
        prompt: YTX.prompts.VOCAB,
        provider: settings.provider,
        activeKey: settings.activeKey,
        model: settings.model,
      }, payload));
    } catch (err) {
      contentEl.innerHTML = '<div class="ytx-error" style="margin:14px 16px">' + err.message + '</div>';
      btn.disabled = false;
      btn.textContent = '提取词汇';
      this.isGenerating = false;
    }
  },

  onChunk: function (text) {
    this.text += text;
  },

  onDone: function () {
    try {
      this.data = YTX.extractJSON(this.text, 'array');
      if (!this.data) {
        throw new Error('AI 返回的内容不包含有效 JSON，请重新生成');
      }
      this.render();
      YTX.panel.querySelector('#ytx-copy-vocab').style.display = 'inline-block';
      YTX.panel.querySelector('#ytx-refresh-vocab').style.display = 'inline-block';
    } catch (err) {
      YTX.panel.querySelector('#ytx-content-vocab').innerHTML = '<div class="ytx-error" style="margin:14px 16px">词汇解析失败: ' + err.message + '<br>可尝试点击「重新提取」</div>';
    }
    YTX.panel.querySelector('#ytx-generate-vocab').disabled = false;
    YTX.panel.querySelector('#ytx-generate-vocab').textContent = '重新提取';
    this.isGenerating = false;
    if (this.data.length > 0) YTX.cache.save(YTX.currentVideoId, 'vocab', { data: this.data });
  },

  onError: function (error) {
    YTX.panel.querySelector('#ytx-content-vocab').innerHTML = '<div class="ytx-error" style="margin:14px 16px">' + error + '</div>';
    YTX.panel.querySelector('#ytx-generate-vocab').disabled = false;
    YTX.panel.querySelector('#ytx-generate-vocab').textContent = '提取词汇';
    this.isGenerating = false;
  },

  render: function () {
    if (!YTX.panel || this.data.length === 0) return;
    var contentEl = YTX.panel.querySelector('#ytx-content-vocab');

    contentEl.innerHTML =
      '<div class="ytx-vocab-counter">共 ' + this.data.length + ' 个词汇/短语</div>' +
      '<div class="ytx-vocab-list">' +
        this.data.map(function (item) {
          return '<div class="ytx-vocab-item">' +
            '<div class="ytx-vocab-header">' +
              '<span class="ytx-vocab-word">' + YTX.escapeHtml(item.word) + '</span>' +
              '<span class="ytx-vocab-phonetic">' + YTX.escapeHtml(item.phonetic || '') + '</span>' +
              (item.time ? '<span class="ytx-timestamp ytx-vocab-time" data-time="' + YTX.timeToSeconds(item.time) + '">[' + item.time + ']</span>' : '') +
            '</div>' +
            '<div class="ytx-vocab-meaning"><span class="ytx-vocab-pos">' + YTX.escapeHtml(item.pos || '') + '</span> ' + YTX.escapeHtml(item.meaning || '') + '</div>' +
            (item.example ? '<div class="ytx-vocab-example">' + YTX.escapeHtml(item.example) + '</div>' : '') +
          '</div>';
        }).join('') +
      '</div>';
  },

  copy: function () {
    if (this.data.length === 0) return;
    var text = this.data.map(function (item) {
      return item.word + ' (' + item.pos + ') - ' + item.meaning;
    }).join('\n');
    var btn = YTX.panel.querySelector('#ytx-copy-vocab');
    navigator.clipboard.writeText(text).then(function () {
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = '复制'; }, 1500);
    }).catch(function () {
      btn.textContent = '复制失败';
      setTimeout(function () { btn.textContent = '复制'; }, 1500);
    });
  },

  refresh: function () {
    if (this.isGenerating) return;
    var excludeList = this.data.map(function (item) { return item.word; }).join(', ');
    this.isGenerating = true;
    this.text = '';
    this.data = [];

    var btn = YTX.panel.querySelector('#ytx-generate-vocab');
    var contentEl = YTX.panel.querySelector('#ytx-content-vocab');
    var copyBtn = YTX.panel.querySelector('#ytx-copy-vocab');
    var refreshBtn = YTX.panel.querySelector('#ytx-refresh-vocab');
    btn.disabled = true;
    copyBtn.style.display = 'none';
    refreshBtn.style.display = 'none';

    btn.textContent = '提取中...';
    contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在换一批词汇...</span></div>';

    var refreshPrompt = YTX.prompts.VOCAB + '\n\n注意：以下词汇已经提取过，请排除它们，提取其他不同的词汇：\n' + excludeList;
    var payload = YTX.getContentPayload();

    YTX.getSettings().then(function (settings) {
      chrome.runtime.sendMessage(Object.assign({
        type: 'GENERATE_VOCAB',
        prompt: refreshPrompt,
        provider: settings.provider,
        activeKey: settings.activeKey,
        model: settings.model,
      }, payload));
    });
  },
};
