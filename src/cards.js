// src/cards.js — 知识卡片

YTX.features.cards = {
  tab: { key: 'cards', label: '卡片' },
  prefix: 'CARDS',
  contentId: 'ytx-content-cards',
  actionsId: 'ytx-actions-cards',
  displayMode: 'flex',

  // 状态
  data: [],
  rawText: '',
  isGenerating: false,

  reset: function () {
    this.data = [];
    this.rawText = '';
    this.isGenerating = false;
  },

  actionsHtml: function () {
    return '<button id="ytx-generate-cards" class="ytx-btn ytx-btn-primary">生成卡片</button>';
  },

  contentHtml: function () {
    return '<div class="ytx-empty">点击「生成卡片」提取视频中的关键知识点</div>';
  },

  bindEvents: function (panel) {
    var self = this;
    panel.querySelector('#ytx-generate-cards').addEventListener('click', function () { self.start(); });
  },

  start: async function () {
    if (this.isGenerating) return;
    this.isGenerating = true;
    this.rawText = '';
    this.data = [];

    var btn = YTX.panel.querySelector('#ytx-generate-cards');
    var contentEl = YTX.panel.querySelector('#ytx-content-cards');
    btn.disabled = true;

    try {
      if (!YTX.transcriptData) {
        btn.textContent = '获取字幕中...';
        contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在获取字幕...</span></div>';
        YTX.transcriptData = await YTX.fetchTranscript();
        YTX.renderTranscript();
      }

      btn.textContent = '生成中...';
      contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在生成知识卡片...</span></div>';

      var settings = await YTX.getSettings();
      chrome.runtime.sendMessage({
        type: 'GENERATE_CARDS',
        transcript: YTX.transcriptData.full,
        prompt: YTX.prompts.CARDS,
        provider: settings.provider,
        activeKey: settings.activeKey,
        model: settings.model,
      });
    } catch (err) {
      contentEl.innerHTML = '<div class="ytx-error" style="margin:14px 16px">' + err.message + '</div>';
      btn.disabled = false;
      btn.textContent = '生成卡片';
      this.isGenerating = false;
    }
  },

  onChunk: function (text) {
    this.rawText += text;
  },

  onDone: function () {
    try {
      var jsonMatch = this.rawText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        this.data = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('未找到有效的 JSON 数据');
      }
      this.render();
    } catch (err) {
      YTX.panel.querySelector('#ytx-content-cards').innerHTML = '<div class="ytx-error" style="margin:14px 16px">卡片解析失败: ' + err.message + '</div>';
    }
    YTX.panel.querySelector('#ytx-generate-cards').disabled = false;
    YTX.panel.querySelector('#ytx-generate-cards').textContent = '重新生成';
    this.isGenerating = false;
  },

  onError: function (error) {
    YTX.panel.querySelector('#ytx-content-cards').innerHTML = '<div class="ytx-error" style="margin:14px 16px">' + error + '</div>';
    YTX.panel.querySelector('#ytx-generate-cards').disabled = false;
    YTX.panel.querySelector('#ytx-generate-cards').textContent = '生成卡片';
    this.isGenerating = false;
  },

  render: function () {
    if (!YTX.panel || this.data.length === 0) return;
    var contentEl = YTX.panel.querySelector('#ytx-content-cards');

    contentEl.innerHTML =
      '<div class="ytx-cards-counter">共 ' + this.data.length + ' 张卡片</div>' +
      '<div class="ytx-cards-list">' +
        this.data.map(function (card, i) {
          return '<div class="ytx-card" data-index="' + i + '">' +
            '<div class="ytx-card-inner">' +
              '<div class="ytx-card-front">' +
                '<div class="ytx-card-label">问题</div>' +
                '<div class="ytx-card-text">' + YTX.escapeHtml(card.front) + '</div>' +
                (card.time ? '<span class="ytx-timestamp ytx-card-time" data-time="' + YTX.timeToSeconds(card.time) + '">[' + card.time + ']</span>' : '') +
                '<div class="ytx-card-hint">点击翻转查看答案</div>' +
              '</div>' +
              '<div class="ytx-card-back">' +
                '<div class="ytx-card-label">答案</div>' +
                '<div class="ytx-card-text">' + YTX.escapeHtml(card.back) + '</div>' +
                (card.time ? '<span class="ytx-timestamp ytx-card-time" data-time="' + YTX.timeToSeconds(card.time) + '">[' + card.time + ']</span>' : '') +
                '<div class="ytx-card-hint">点击翻转回正面</div>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';

    contentEl.querySelectorAll('.ytx-card').forEach(function (cardEl) {
      cardEl.addEventListener('click', function (e) {
        if (e.target.closest('.ytx-timestamp')) return;
        cardEl.classList.toggle('flipped');
      });
    });
  },
};
