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
           '<button id="ytx-open-html" class="ytx-btn ytx-btn-secondary" style="display:none">新标签打开</button>' +
           '<button id="ytx-dl-html" class="ytx-btn ytx-btn-secondary" style="display:none">下载 HTML</button>' +
           '<button id="ytx-export-notion-html" class="ytx-btn ytx-btn-secondary" style="display:none">导出 Notion</button>';
  },

  contentHtml: function () {
    return '<div class="ytx-empty">点击「生成笔记」将视频内容生成精美 HTML 页面</div>';
  },

  bindEvents: function (panel) {
    var self = this;
    panel.querySelector('#ytx-generate-html').addEventListener('click', function () { self.start(); });
    panel.querySelector('#ytx-open-html').addEventListener('click', function () { self.openInNewTab(); });
    panel.querySelector('#ytx-dl-html').addEventListener('click', function () { self.downloadHtml(); });
    panel.querySelector('#ytx-export-notion-html').addEventListener('click', function () { self.exportNotion(); });
  },

  start: async function () {
    if (this.isGenerating) return;
    this.isGenerating = true;
    this.text = '';

    var btn = YTX.panel.querySelector('#ytx-generate-html');
    var contentEl = YTX.panel.querySelector('#ytx-content-html');
    var openBtn = YTX.panel.querySelector('#ytx-open-html');

    btn.disabled = true;
    openBtn.style.display = 'none';
    YTX.panel.querySelector('#ytx-dl-html').style.display = 'none';
    YTX.panel.querySelector('#ytx-export-notion-html').style.display = 'none';

    try {
      btn.textContent = '获取字幕中...';
      contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在获取字幕...</span></div>';
      await YTX.ensureTranscript();

      btn.textContent = '生成中...';
      contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在生成精美笔记...</span></div>';

      var settings = await YTX.getSettings();
      var payload = YTX.getContentPayload();

      chrome.runtime.sendMessage(Object.assign({
        type: 'GENERATE_HTML',
        prompt: YTX.prompts.HTML,
        provider: settings.provider,
        activeKey: settings.activeKey,
        model: settings.model,
      }, payload));

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
    YTX.panel.querySelector('#ytx-open-html').style.display = 'inline-block';
    YTX.panel.querySelector('#ytx-dl-html').style.display = 'inline-block';
    YTX.panel.querySelector('#ytx-export-notion-html').style.display = 'inline-block';
    this.isGenerating = false;
    YTX.cache.save(YTX.currentVideoId, 'html', { text: this.text });
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

  openInNewTab: function () {
    var blob = new Blob([this.text], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  },

  downloadHtml: function () {
    var title = YTX.Export.getVideoTitle();
    var filename = YTX.Export.getSafeFilename(title) + '-笔记.html';
    var blob = new Blob([this.text], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    var btn = YTX.panel.querySelector('#ytx-dl-html');
    YTX.Export.flashButton(btn, '已下载', 1500);
  },

  exportNotion: function () {
    var btn = YTX.panel.querySelector('#ytx-export-notion-html');
    btn.textContent = '导出中...';
    btn.disabled = true;
    var blocks = YTX.Export.htmlToNotionBlocks(this.text);
    var title = YTX.Export.getVideoTitle() + ' - 笔记';
    YTX.Export.sendToNotion(title, blocks, function (resp) {
      if (resp.error) {
        btn.textContent = '导出失败';
        btn.disabled = false;
        alert(resp.error);
        setTimeout(function () { btn.textContent = '导出 Notion'; }, 1500);
      } else {
        YTX.Export.flashButton(btn, '已导出', 2000);
        if (resp.url) window.open(resp.url, '_blank');
      }
    });
  },
};
