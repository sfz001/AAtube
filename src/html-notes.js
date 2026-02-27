// src/html-notes.js — HTML 笔记

YTX.features.html = {
  tab: { key: 'html', label: '笔记' },
  prefix: 'HTML',
  contentId: 'ytx-content-html',
  actionsId: 'ytx-actions-html',
  displayMode: 'block',

  // 状态
  text: '',
  isGenerating: false,

  reset: function () {
    this.text = '';
    this.isGenerating = false;
  },

  actionsHtml: function () {
    return '<button id="ytx-generate-html" class="ytx-btn ytx-btn-primary">生成笔记</button>' +
           '<button id="ytx-copy-html" class="ytx-btn ytx-btn-secondary" style="display:none">复制 HTML</button>' +
           '<button id="ytx-open-html" class="ytx-btn ytx-btn-secondary" style="display:none">新标签打开</button>';
  },

  contentHtml: function () {
    return '<div class="ytx-empty">点击「生成笔记」将视频内容生成精美 HTML 页面</div>';
  },

  bindEvents: function (panel) {
    var self = this;
    panel.querySelector('#ytx-generate-html').addEventListener('click', function () { self.start(); });
    panel.querySelector('#ytx-copy-html').addEventListener('click', function () { self.copy(); });
    panel.querySelector('#ytx-open-html').addEventListener('click', function () { self.openInNewTab(); });
  },

  start: async function () {
    if (this.isGenerating) return;
    this.isGenerating = true;
    this.text = '';

    var btn = YTX.panel.querySelector('#ytx-generate-html');
    var contentEl = YTX.panel.querySelector('#ytx-content-html');
    var copyBtn = YTX.panel.querySelector('#ytx-copy-html');
    var openBtn = YTX.panel.querySelector('#ytx-open-html');

    btn.disabled = true;
    copyBtn.style.display = 'none';
    openBtn.style.display = 'none';

    try {
      if (!YTX.transcriptData) {
        btn.textContent = '获取字幕中...';
        contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在获取字幕...</span></div>';
        YTX.transcriptData = await YTX.fetchTranscript();
        YTX.renderTranscript();
      }

      btn.textContent = '生成中...';
      contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在生成精美笔记...</span></div>';

      var settings = await YTX.getSettings();

      chrome.runtime.sendMessage({
        type: 'GENERATE_HTML',
        transcript: YTX.transcriptData.full,
        prompt: YTX.prompts.HTML,
        provider: settings.provider,
        activeKey: settings.activeKey,
        model: settings.model,
      });

    } catch (err) {
      contentEl.innerHTML = '<div class="ytx-error" style="margin:14px 16px">' + err.message + '</div>';
      btn.disabled = false;
      btn.textContent = '生成笔记';
      this.isGenerating = false;
    }
  },

  onChunk: function (text) {
    this.text += text;
  },

  onDone: function () {
    this.renderToIframe(this.text);
    YTX.panel.querySelector('#ytx-generate-html').disabled = false;
    YTX.panel.querySelector('#ytx-generate-html').textContent = '重新生成';
    YTX.panel.querySelector('#ytx-copy-html').style.display = 'inline-block';
    YTX.panel.querySelector('#ytx-open-html').style.display = 'inline-block';
    this.isGenerating = false;
  },

  onError: function (error) {
    YTX.panel.querySelector('#ytx-content-html').innerHTML = '<div class="ytx-error" style="margin:14px 16px">' + error + '</div>';
    YTX.panel.querySelector('#ytx-generate-html').disabled = false;
    YTX.panel.querySelector('#ytx-generate-html').textContent = '生成笔记';
    this.isGenerating = false;
  },

  renderToIframe: function (html) {
    if (!YTX.panel) return;
    var contentEl = YTX.panel.querySelector('#ytx-content-html');
    contentEl.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-same-origin';
    iframe.srcdoc = html;
    contentEl.appendChild(iframe);
  },

  copy: function () {
    var self = this;
    navigator.clipboard.writeText(this.text).then(function () {
      var btn = YTX.panel.querySelector('#ytx-copy-html');
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = '复制 HTML'; }, 1500);
    });
  },

  openInNewTab: function () {
    var blob = new Blob([this.text], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  },
};
