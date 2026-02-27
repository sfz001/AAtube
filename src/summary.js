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

  reset: function () {
    this.text = '';
    this.isGenerating = false;
  },

  actionsHtml: function () {
    return '<button id="ytx-summarize" class="ytx-btn ytx-btn-primary">总结视频</button>' +
           '<button id="ytx-copy" class="ytx-btn ytx-btn-secondary" style="display:none">复制</button>';
  },

  contentHtml: function () {
    return '<div class="ytx-empty">点击「总结视频」获取 AI 总结</div>';
  },

  bindEvents: function (panel) {
    var self = this;
    panel.querySelector('#ytx-summarize').addEventListener('click', function () { self.start(); });
    panel.querySelector('#ytx-copy').addEventListener('click', function () { self.copy(); });
  },

  start: async function () {
    if (this.isGenerating) return;
    this.isGenerating = true;
    this.text = '';

    var btn = YTX.panel.querySelector('#ytx-summarize');
    var contentEl = YTX.panel.querySelector('#ytx-content');
    var copyBtn = YTX.panel.querySelector('#ytx-copy');

    btn.disabled = true;
    btn.textContent = '获取字幕中...';
    copyBtn.style.display = 'none';
    contentEl.innerHTML = '<div class="ytx-loading"><div class="ytx-spinner"></div><span>正在获取字幕...</span></div>';

    try {
      await YTX.ensureTranscript();

      btn.textContent = '总结中...';
      contentEl.innerHTML = '<div class="ytx-loading"><div class="ytx-spinner"></div><span>正在生成总结...</span></div>';

      var settings = await YTX.getSettings();

      chrome.runtime.sendMessage({
        type: 'SUMMARIZE',
        transcript: YTX.transcriptData.full,
        prompt: settings.prompt || YTX.prompts.DEFAULT,
        provider: settings.provider,
        activeKey: settings.activeKey,
        model: settings.model,
      });

    } catch (err) {
      contentEl.innerHTML = '<div class="ytx-error">' + err.message + '</div>';
      btn.disabled = false;
      btn.textContent = '总结视频';
      this.isGenerating = false;
    }
  },

  onChunk: function (text) {
    var contentEl = YTX.panel.querySelector('#ytx-content');
    if (this.text === '' || contentEl.querySelector('.ytx-loading')) {
      contentEl.innerHTML = '';
    }
    this.text += text;
    contentEl.innerHTML = YTX.renderMarkdown(this.text);
  },

  onDone: function () {
    YTX.panel.querySelector('#ytx-summarize').disabled = false;
    YTX.panel.querySelector('#ytx-summarize').textContent = '重新总结';
    YTX.panel.querySelector('#ytx-copy').style.display = 'inline-block';
    this.isGenerating = false;
  },

  onError: function (error) {
    YTX.panel.querySelector('#ytx-content').innerHTML = '<div class="ytx-error">' + error + '</div>';
    YTX.panel.querySelector('#ytx-summarize').disabled = false;
    YTX.panel.querySelector('#ytx-summarize').textContent = '总结视频';
    this.isGenerating = false;
  },

  copy: function () {
    var self = this;
    navigator.clipboard.writeText(this.text).then(function () {
      var btn = YTX.panel.querySelector('#ytx-copy');
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = '复制'; }, 1500);
    });
  },
};
