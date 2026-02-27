// src/summary.js — 总结功能

YTX.features.summary = {
  tab: { key: 'summary', label: '总结' },
  prefix: 'SUMMARY',
  contentId: 'ytx-content',
  actionsId: 'ytx-actions-summary',
  displayMode: 'block',

  // 状态
  text: '',
  isGenerating: false,
  _renderTimer: null,

  reset: function () {
    this.text = '';
    this.isGenerating = false;
    this._renderTimer = null;
  },

  actionsHtml: function () {
    return '<button id="ytx-summarize" class="ytx-btn ytx-btn-primary">总结视频</button>' +
           '<button id="ytx-generate-all" class="ytx-btn ytx-btn-secondary">全部生成</button>';
  },

  contentHtml: function () {
    return '<div class="ytx-empty">点击「总结视频」获取 AI 总结</div>';
  },

  bindEvents: function (panel) {
    var self = this;
    panel.querySelector('#ytx-summarize').addEventListener('click', function () { self.start(); });
    panel.querySelector('#ytx-generate-all').addEventListener('click', function () { YTX.generateAll(); });
  },

  start: async function () {
    if (this.isGenerating) return;
    this.isGenerating = true;
    this.text = '';

    var btn = YTX.panel.querySelector('#ytx-summarize');
    var contentEl = YTX.panel.querySelector('#ytx-content');

    btn.disabled = true;
    btn.textContent = '获取字幕中...';
    contentEl.innerHTML = '<div class="ytx-loading"><div class="ytx-spinner"></div><span>正在获取字幕...</span></div>';

    try {
      await YTX.ensureTranscript();

      btn.textContent = '总结中...';
      contentEl.innerHTML = '<div class="ytx-loading"><div class="ytx-spinner"></div><span>正在生成总结...</span></div>';

      var settings = await YTX.getSettings();
      var payload = YTX.getContentPayload();

      chrome.runtime.sendMessage(Object.assign({
        type: 'SUMMARIZE',
        prompt: settings.prompt || YTX.prompts.DEFAULT,
        provider: settings.provider,
        activeKey: settings.activeKey,
        model: settings.model,
      }, payload));

    } catch (err) {
      contentEl.innerHTML = '<div class="ytx-error">' + err.message + '</div>';
      btn.disabled = false;
      btn.textContent = '总结视频';
      this.isGenerating = false;
    }
  },

  onChunk: function (text) {
    var self = this;
    var contentEl = YTX.panel.querySelector('#ytx-content');
    if (this.text === '' || contentEl.querySelector('.ytx-loading')) {
      contentEl.innerHTML = '';
    }
    this.text += text;
    // 节流渲染：最多每 80ms 刷新一次，保留滚动位置
    if (!this._renderTimer) {
      this._renderTimer = setTimeout(function () {
        self._renderTimer = null;
        var el = YTX.panel.querySelector('#ytx-content');
        var scrollTop = el.scrollTop;
        el.innerHTML = YTX.renderMarkdown(self.text);
        el.scrollTop = scrollTop;
      }, 80);
    }
  },

  onDone: function () {
    // 清除节流计时器，立即渲染最终结果
    if (this._renderTimer) { clearTimeout(this._renderTimer); this._renderTimer = null; }
    var contentEl = YTX.panel.querySelector('#ytx-content');
    var scrollTop = contentEl.scrollTop;
    contentEl.innerHTML = YTX.renderMarkdown(this.text);
    contentEl.scrollTop = scrollTop;

    YTX.panel.querySelector('#ytx-summarize').disabled = false;
    YTX.panel.querySelector('#ytx-summarize').textContent = '重新总结';
    this.isGenerating = false;
    YTX.cache.save(YTX.currentVideoId, 'summary', { text: this.text });
  },

  onError: function (error) {
    YTX.panel.querySelector('#ytx-content').innerHTML = '<div class="ytx-error">' + error + '</div>';
    YTX.panel.querySelector('#ytx-summarize').disabled = false;
    YTX.panel.querySelector('#ytx-summarize').textContent = '总结视频';
    this.isGenerating = false;
  },

};
