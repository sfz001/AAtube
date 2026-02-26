// content.js — YouTube 页面内容脚本

(function () {
  'use strict';

  const DEFAULT_PROMPT = `请对以下 YouTube 视频字幕内容进行总结。要求：
1. 先给出简洁的整体摘要（3-5句话）
2. 然后按内容分段，每段标注对应的时间戳 [MM:SS]，给出该段的要点

格式示例：
## 摘要
...

## 详细内容
[00:00] 段落标题 - 要点描述
[02:30] 段落标题 - 要点描述

---
字幕内容：
{transcript}`;

  const HTML_PROMPT = `请根据以下 YouTube 视频字幕内容，生成一个精美的 HTML 笔记页面。

要求：
1. 输出完整的 HTML（包含 <style> 内联样式），不要包含 \`\`\`html 代码块标记
2. 使用现代美观的设计风格（渐变色标题、卡片布局、合理的间距和排版）
3. 包含：视频概述、关键要点（带时间戳）、详细内容分段
4. 时间戳格式 [MM:SS]，配以醒目样式
5. 配色方案使用紫色主题 (#7c3aed)
6. 响应式布局，max-width: 800px 居中

字幕内容：
{transcript}`;

  const CARDS_PROMPT = `请根据以下 YouTube 视频字幕内容，生成知识卡片（Flashcards）用于学习复习。

要求：
1. 提取 10-20 个关键知识点
2. 每张卡片包含正面（问题/术语）和背面（解释/答案）
3. 如果有对应时间戳请标注 [MM:SS]
4. 严格按以下 JSON 格式输出，不要包含代码块标记：
[{"front":"问题或术语","back":"解释或答案","time":"MM:SS"},...]

字幕内容：
{transcript}`;

  const MINDMAP_PROMPT = `请根据以下 YouTube 视频字幕内容，生成一个结构化的思维导图 JSON 数据。

要求：
1. 输出一个嵌套的 JSON 对象树，根节点是视频主题
2. 每个节点格式：{"label": "节点标签", "time": "MM:SS", "children": [...]}
3. time 字段可选，表示该内容对应的视频时间戳，没有则留空字符串
4. 最多 4 层深度，每个节点标签不超过 30 个字
5. 第一层为主题分类（3-7个），第二层为具体要点，第三四层为细节
6. 严格输出 JSON，不要包含代码块标记或其他文字

字幕内容：
{transcript}`;

  let panel = null;
  let currentVideoId = null;
  let summaryText = '';
  let isSummarizing = false;
  let transcriptData = null;
  let activeTab = 'summary';
  let htmlText = '';
  let isGeneratingHtml = false;
  let resizerInjected = false;

  // 互动问答状态
  let chatMessages = [];    // {role, content} 对话历史
  let chatReplyText = '';    // 当前流式回复
  let isChatting = false;

  // 知识卡片状态
  let cardsData = [];        // [{front, back, time}]
  let cardsRawText = '';
  let isGeneratingCards = false;

  // 思维导图状态
  let mindmapData = null;
  let mindmapRawText = '';
  let isGeneratingMindmap = false;
  let mindmapTransform = { x: 0, y: 0, scale: 1 };
  let mindmapCollapsed = new Set();

  // ── 入口 ──────────────────────────────────────────────
  function init() {
    document.addEventListener('yt-navigate-finish', onNavigate);
    onNavigate();
  }

  function onNavigate() {
    const videoId = getVideoId();
    if (!videoId) { removePanel(); removeResizer(); return; }
    if (videoId === currentVideoId && panel) return;
    currentVideoId = videoId;
    summaryText = '';
    htmlText = '';
    transcriptData = null;
    isSummarizing = false;
    isGeneratingHtml = false;
    activeTab = 'summary';
    chatMessages = [];
    chatReplyText = '';
    isChatting = false;
    cardsData = [];
    cardsRawText = '';
    isGeneratingCards = false;
    mindmapData = null;
    mindmapRawText = '';
    isGeneratingMindmap = false;
    mindmapTransform = { x: 0, y: 0, scale: 1 };
    mindmapCollapsed = new Set();
    waitForContainer(() => injectPanel());
  }

  function getVideoId() {
    const url = new URL(location.href);
    return url.searchParams.get('v');
  }

  // ── 等待右侧栏加载 ────────────────────────────────────
  function waitForContainer(callback, retries = 30) {
    const container = document.querySelector('#secondary, #secondary-inner');
    if (container) { callback(); }
    else if (retries > 0) { setTimeout(() => waitForContainer(callback, retries - 1), 500); }
  }

  // ── 面板注入 ─────────────────────────────────────────
  function injectPanel() {
    removePanel();
    panel = document.createElement('div');
    panel.id = 'ytx-panel';
    panel.innerHTML = `
      <div id="ytx-header">
        <span class="ytx-title">YouTubeX</span>
        <div id="ytx-actions">
          <div id="ytx-actions-summary">
            <button id="ytx-summarize" class="ytx-btn ytx-btn-primary">总结视频</button>
            <button id="ytx-copy" class="ytx-btn ytx-btn-secondary" style="display:none">复制</button>
          </div>
          <div id="ytx-actions-html" style="display:none">
            <button id="ytx-generate-html" class="ytx-btn ytx-btn-primary">生成笔记</button>
            <button id="ytx-copy-html" class="ytx-btn ytx-btn-secondary" style="display:none">复制 HTML</button>
            <button id="ytx-open-html" class="ytx-btn ytx-btn-secondary" style="display:none">新标签打开</button>
          </div>
          <div id="ytx-actions-chat" style="display:none">
            <button id="ytx-clear-chat" class="ytx-btn ytx-btn-secondary">清空对话</button>
          </div>
          <div id="ytx-actions-cards" style="display:none">
            <button id="ytx-generate-cards" class="ytx-btn ytx-btn-primary">生成卡片</button>
          </div>
          <div id="ytx-actions-mindmap" style="display:none">
            <button id="ytx-generate-mindmap" class="ytx-btn ytx-btn-primary">生成导图</button>
            <button id="ytx-export-mindmap" class="ytx-btn ytx-btn-secondary" style="display:none">导出 SVG</button>
          </div>
        </div>
      </div>
      <div id="ytx-tabs">
        <button class="ytx-tab active" data-tab="summary">总结</button>
        <button class="ytx-tab" data-tab="html">笔记</button>
        <button class="ytx-tab" data-tab="chat">问答</button>
        <button class="ytx-tab" data-tab="cards">卡片</button>
        <button class="ytx-tab" data-tab="mindmap">导图</button>
      </div>
      <div id="ytx-content">
        <div class="ytx-empty">点击「总结视频」获取 AI 总结</div>
      </div>
      <div id="ytx-content-html">
        <div class="ytx-empty">点击「生成笔记」将视频内容生成精美 HTML 页面</div>
      </div>
      <div id="ytx-content-chat">
        <div class="ytx-chat-messages" id="ytx-chat-messages">
          <div class="ytx-empty">基于视频内容提问，AI 助教为你解答</div>
        </div>
        <div class="ytx-chat-input-wrap">
          <input type="text" id="ytx-chat-input" placeholder="输入你的问题..." />
          <button id="ytx-chat-send" class="ytx-btn ytx-btn-primary">发送</button>
        </div>
      </div>
      <div id="ytx-content-cards">
        <div class="ytx-empty">点击「生成卡片」提取视频中的关键知识点</div>
      </div>
      <div id="ytx-content-mindmap">
        <div class="ytx-empty">点击「生成导图」将视频内容生成思维导图</div>
      </div>
      <div id="ytx-transcript-section">
        <button id="ytx-transcript-toggle">
          <span>查看字幕</span>
          <span class="arrow">▼</span>
        </button>
        <div id="ytx-transcript-body"></div>
      </div>
    `;
    const secondary = document.querySelector('#secondary, #secondary-inner');
    if (secondary) secondary.prepend(panel);

    panel.querySelector('#ytx-summarize').addEventListener('click', startSummarize);
    panel.querySelector('#ytx-copy').addEventListener('click', copySummary);
    panel.querySelector('#ytx-generate-html').addEventListener('click', startGenerateHtml);
    panel.querySelector('#ytx-copy-html').addEventListener('click', copyHtml);
    panel.querySelector('#ytx-open-html').addEventListener('click', openHtmlInNewTab);
    panel.querySelector('#ytx-transcript-toggle').addEventListener('click', toggleTranscript);
    panel.querySelector('#ytx-chat-send').addEventListener('click', sendChatMessage);
    panel.querySelector('#ytx-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
    panel.querySelector('#ytx-clear-chat').addEventListener('click', clearChat);
    panel.querySelector('#ytx-generate-cards').addEventListener('click', startGenerateCards);
    panel.querySelector('#ytx-generate-mindmap').addEventListener('click', startGenerateMindmap);
    panel.querySelector('#ytx-export-mindmap').addEventListener('click', exportMindmapSvg);
    panel.querySelectorAll('.ytx-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    setupTimestampClickHandler(panel);
    injectResizer();
  }

  function removePanel() {
    if (panel) { panel.remove(); panel = null; }
  }

  // ── 可拖拽分栏条 ─────────────────────────────────────
  function injectResizer() {
    if (resizerInjected) return;
    const columns = document.querySelector('ytd-watch-flexy #columns');
    const primary = columns?.querySelector('#primary');
    const secondary = columns?.querySelector('#secondary');
    if (!columns || !primary || !secondary) return;

    // 插入拖拽条
    const resizer = document.createElement('div');
    resizer.id = 'ytx-resizer';
    resizer.innerHTML = '<div class="ytx-resizer-handle"><div class="ytx-resizer-dot"></div><div class="ytx-resizer-dot"></div><div class="ytx-resizer-dot"></div></div>';
    columns.insertBefore(resizer, secondary);
    resizerInjected = true;

    // 给 columns 强制 flex 布局
    columns.style.display = 'flex';
    columns.style.flexWrap = 'nowrap';

    let isDragging = false;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      resizer.classList.add('ytx-resizer-active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      let overlay = document.getElementById('ytx-drag-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ytx-drag-overlay';
        document.body.appendChild(overlay);
      }
      overlay.style.display = 'block';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const columnsRect = columns.getBoundingClientRect();
      const totalWidth = columnsRect.width;
      const resizerWidth = 24;
      let primaryWidth = e.clientX - columnsRect.left;
      const minPrimary = totalWidth * 0.3;
      const minSecondary = 300;
      primaryWidth = Math.max(minPrimary, Math.min(primaryWidth, totalWidth - minSecondary - resizerWidth));

      primary.style.width = primaryWidth + 'px';
      primary.style.maxWidth = 'none';
      primary.style.minWidth = '0';
      primary.style.flex = 'none';

      secondary.style.width = (totalWidth - primaryWidth - resizerWidth) + 'px';
      secondary.style.maxWidth = 'none';
      secondary.style.minWidth = '0';
      secondary.style.flex = 'none';

      // 让 YouTube 视频播放器跟随容器宽度
      forceVideoResize(primary);
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      resizer.classList.remove('ytx-resizer-active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const overlay = document.getElementById('ytx-drag-overlay');
      if (overlay) overlay.style.display = 'none';
      // 最终再触发一次
      forceVideoResize(primary);
    });
  }

  function forceVideoResize(primary) {
    // 强制视频播放器适应新的容器宽度
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy) watchFlexy.classList.add('ytx-resized');

    const playerContainer = primary.querySelector('#player-container-inner');
    if (playerContainer) {
      playerContainer.style.maxWidth = '100%';
    }
    const moviePlayer = primary.querySelector('#movie_player');
    if (moviePlayer) {
      const w = primary.querySelector('#player-container-outer')?.clientWidth || primary.clientWidth;
      const h = Math.round(w * 9 / 16);
      moviePlayer.style.width = w + 'px';
      moviePlayer.style.height = h + 'px';
    }
    // 通知 YouTube 重算布局
    window.dispatchEvent(new Event('resize'));
  }

  function removeResizer() {
    const resizer = document.getElementById('ytx-resizer');
    if (resizer) resizer.remove();
    const overlay = document.getElementById('ytx-drag-overlay');
    if (overlay) overlay.remove();
    resizerInjected = false;
    // 恢复 YouTube 默认布局
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy) watchFlexy.classList.remove('ytx-resized');
    const columns = document.querySelector('ytd-watch-flexy #columns');
    const primary = columns?.querySelector('#primary');
    const secondary = columns?.querySelector('#secondary');
    if (primary) { primary.style.width = ''; primary.style.maxWidth = ''; primary.style.minWidth = ''; primary.style.flex = ''; }
    if (secondary) { secondary.style.width = ''; secondary.style.maxWidth = ''; secondary.style.minWidth = ''; secondary.style.flex = ''; }
    // 恢复播放器
    const playerContainer = primary?.querySelector('#player-container-inner');
    if (playerContainer) playerContainer.style.maxWidth = '';
    const moviePlayer = primary?.querySelector('#movie_player');
    if (moviePlayer) { moviePlayer.style.width = ''; moviePlayer.style.height = ''; }
    window.dispatchEvent(new Event('resize'));
  }

  // ── 标签切换 ─────────────────────────────────────────
  function switchTab(tab) {
    if (!panel) return;
    activeTab = tab;
    panel.querySelectorAll('.ytx-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    const tabs = ['summary', 'html', 'chat', 'cards', 'mindmap'];
    const contentIds = { summary: '#ytx-content', html: '#ytx-content-html', chat: '#ytx-content-chat', cards: '#ytx-content-cards', mindmap: '#ytx-content-mindmap' };
    const actionIds = { summary: '#ytx-actions-summary', html: '#ytx-actions-html', chat: '#ytx-actions-chat', cards: '#ytx-actions-cards', mindmap: '#ytx-actions-mindmap' };
    const flexTabs = ['chat', 'cards', 'mindmap'];
    tabs.forEach(t => {
      panel.querySelector(contentIds[t]).style.display = t === tab ? (flexTabs.includes(t) ? 'flex' : 'block') : 'none';
      panel.querySelector(actionIds[t]).style.display = t === tab ? 'flex' : 'none';
    });
    if (tab === 'chat') {
      const input = panel.querySelector('#ytx-chat-input');
      setTimeout(() => input.focus(), 100);
    }
  }

  // ── 生成精美笔记 ─────────────────────────────────────
  async function startGenerateHtml() {
    if (isGeneratingHtml) return;
    isGeneratingHtml = true;
    htmlText = '';

    const btn = panel.querySelector('#ytx-generate-html');
    const contentEl = panel.querySelector('#ytx-content-html');
    const copyBtn = panel.querySelector('#ytx-copy-html');
    const openBtn = panel.querySelector('#ytx-open-html');

    btn.disabled = true;
    copyBtn.style.display = 'none';
    openBtn.style.display = 'none';

    try {
      if (!transcriptData) {
        btn.textContent = '获取字幕中...';
        contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在获取字幕...</span></div>';
        transcriptData = await fetchTranscript();
        renderTranscript();
      }

      btn.textContent = '生成中...';
      contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在生成精美笔记...</span></div>';

      const settings = await getSettings();

      chrome.runtime.sendMessage({
        type: 'GENERATE_HTML',
        transcript: transcriptData.full,
        prompt: HTML_PROMPT,
        provider: settings.provider,
        apiKey: settings.apiKey,
        openaiKey: settings.openaiKey,
        geminiKey: settings.geminiKey,
        model: settings.model,
      });

    } catch (err) {
      contentEl.innerHTML = `<div class="ytx-error" style="margin:14px 16px">${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = '生成笔记';
      isGeneratingHtml = false;
    }
  }

  function renderHtmlToIframe(html) {
    if (!panel) return;
    const contentEl = panel.querySelector('#ytx-content-html');
    contentEl.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-same-origin';
    iframe.srcdoc = html;
    contentEl.appendChild(iframe);

  }

  function copyHtml() {
    navigator.clipboard.writeText(htmlText).then(() => {
      const btn = panel.querySelector('#ytx-copy-html');
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = '复制 HTML'; }, 1500);
    });
  }

  function openHtmlInNewTab() {
    const blob = new Blob([htmlText], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  // ── 互动问答 ─────────────────────────────────────────
  async function sendChatMessage() {
    if (isChatting || !panel) return;
    const input = panel.querySelector('#ytx-chat-input');
    const question = input.value.trim();
    if (!question) return;

    input.value = '';
    isChatting = true;
    chatReplyText = '';
    const sendBtn = panel.querySelector('#ytx-chat-send');
    sendBtn.disabled = true;

    const msgContainer = panel.querySelector('#ytx-chat-messages');
    // 清空空状态提示
    const empty = msgContainer.querySelector('.ytx-empty');
    if (empty) empty.remove();

    // 添加用户消息气泡
    const userBubble = document.createElement('div');
    userBubble.className = 'ytx-chat-bubble ytx-chat-user';
    userBubble.textContent = question;
    msgContainer.appendChild(userBubble);

    // 添加 AI 回复气泡（流式填充）
    const aiBubble = document.createElement('div');
    aiBubble.className = 'ytx-chat-bubble ytx-chat-ai';
    aiBubble.innerHTML = '<div class="ytx-loading"><div class="ytx-spinner"></div></div>';
    msgContainer.appendChild(aiBubble);
    msgContainer.scrollTop = msgContainer.scrollHeight;

    // 加入对话历史
    chatMessages.push({ role: 'user', content: question });

    try {
      if (!transcriptData) {
        aiBubble.innerHTML = '<div class="ytx-loading"><div class="ytx-spinner"></div><span>获取字幕中...</span></div>';
        transcriptData = await fetchTranscript();
        renderTranscript();
      }

      const settings = await getSettings();
      chrome.runtime.sendMessage({
        type: 'CHAT_ASK',
        transcript: transcriptData.full,
        messages: chatMessages,
        provider: settings.provider,
        apiKey: settings.apiKey,
        openaiKey: settings.openaiKey,
        geminiKey: settings.geminiKey,
        model: settings.model,
      });
    } catch (err) {
      aiBubble.innerHTML = `<span class="ytx-chat-err">${err.message}</span>`;
      isChatting = false;
      sendBtn.disabled = false;
    }
  }

  function clearChat() {
    chatMessages = [];
    chatReplyText = '';
    if (!panel) return;
    const msgContainer = panel.querySelector('#ytx-chat-messages');
    msgContainer.innerHTML = '<div class="ytx-empty">基于视频内容提问，AI 助教为你解答</div>';
  }

  // ── 知识卡片 ─────────────────────────────────────────
  async function startGenerateCards() {
    if (isGeneratingCards) return;
    isGeneratingCards = true;
    cardsRawText = '';
    cardsData = [];

    const btn = panel.querySelector('#ytx-generate-cards');
    const contentEl = panel.querySelector('#ytx-content-cards');
    btn.disabled = true;

    try {
      if (!transcriptData) {
        btn.textContent = '获取字幕中...';
        contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在获取字幕...</span></div>';
        transcriptData = await fetchTranscript();
        renderTranscript();
      }

      btn.textContent = '生成中...';
      contentEl.innerHTML = '<div class="ytx-loading" style="padding:14px 16px"><div class="ytx-spinner"></div><span>正在生成知识卡片...</span></div>';

      const settings = await getSettings();
      chrome.runtime.sendMessage({
        type: 'GENERATE_CARDS',
        transcript: transcriptData.full,
        prompt: CARDS_PROMPT,
        provider: settings.provider,
        apiKey: settings.apiKey,
        openaiKey: settings.openaiKey,
        geminiKey: settings.geminiKey,
        model: settings.model,
      });
    } catch (err) {
      contentEl.innerHTML = `<div class="ytx-error" style="margin:14px 16px">${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = '生成卡片';
      isGeneratingCards = false;
    }
  }

  function renderCards() {
    if (!panel || cardsData.length === 0) return;
    const contentEl = panel.querySelector('#ytx-content-cards');

    contentEl.innerHTML = `
      <div class="ytx-cards-counter">共 ${cardsData.length} 张卡片</div>
      <div class="ytx-cards-list">
        ${cardsData.map((card, i) => `
          <div class="ytx-card" data-index="${i}">
            <div class="ytx-card-inner">
              <div class="ytx-card-front">
                <div class="ytx-card-label">问题</div>
                <div class="ytx-card-text">${escapeHtml(card.front)}</div>
                ${card.time ? `<span class="ytx-timestamp ytx-card-time" data-time="${timeToSeconds(card.time)}">[${card.time}]</span>` : ''}
                <div class="ytx-card-hint">点击翻转查看答案</div>
              </div>
              <div class="ytx-card-back">
                <div class="ytx-card-label">答案</div>
                <div class="ytx-card-text">${escapeHtml(card.back)}</div>
                ${card.time ? `<span class="ytx-timestamp ytx-card-time" data-time="${timeToSeconds(card.time)}">[${card.time}]</span>` : ''}
                <div class="ytx-card-hint">点击翻转回正面</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    contentEl.querySelectorAll('.ytx-card').forEach(cardEl => {
      cardEl.addEventListener('click', (e) => {
        if (e.target.closest('.ytx-timestamp')) return;
        cardEl.classList.toggle('flipped');
      });
    });
  }

  // ── 思维导图 ─────────────────────────────────────────
  async function startGenerateMindmap() {
    if (isGeneratingMindmap) return;
    isGeneratingMindmap = true;
    mindmapRawText = '';
    mindmapData = null;
    mindmapCollapsed = new Set();
    mindmapTransform = { x: 0, y: 0, scale: 1 };

    const btn = panel.querySelector('#ytx-generate-mindmap');
    const contentEl = panel.querySelector('#ytx-content-mindmap');
    const exportBtn = panel.querySelector('#ytx-export-mindmap');
    btn.disabled = true;
    exportBtn.style.display = 'none';

    try {
      if (!transcriptData) {
        btn.textContent = '获取字幕中...';
        contentEl.innerHTML = '<div class="ytx-empty"><div class="ytx-loading"><div class="ytx-spinner"></div><span>正在获取字幕...</span></div></div>';
        transcriptData = await fetchTranscript();
        renderTranscript();
      }

      btn.textContent = '生成中...';
      contentEl.innerHTML = '<div class="ytx-empty"><div class="ytx-loading"><div class="ytx-spinner"></div><span>正在生成思维导图...</span></div></div>';

      const settings = await getSettings();
      chrome.runtime.sendMessage({
        type: 'GENERATE_MINDMAP',
        transcript: transcriptData.full,
        prompt: MINDMAP_PROMPT,
        provider: settings.provider,
        apiKey: settings.apiKey,
        openaiKey: settings.openaiKey,
        geminiKey: settings.geminiKey,
        model: settings.model,
      });
    } catch (err) {
      contentEl.innerHTML = `<div class="ytx-error" style="margin:14px 16px">${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = '生成导图';
      isGeneratingMindmap = false;
    }
  }

  // ── 思维导图 SVG 引擎 ──────────────────────────────────
  function assignNodeIds(node, path = '0') {
    node._id = path;
    if (node.children) {
      node.children.forEach((child, i) => assignNodeIds(child, `${path}-${i}`));
    }
  }

  // 布局常量
  const MM_NODE_HEIGHT = 36;
  const MM_V_GAP = 18;
  const MM_H_GAP = 80;
  const MM_TOGGLE_SPACE = 24;

  function measureNodeWidth(node) {
    const label = node.label || '';
    let charWidth = 0;
    for (const ch of label) {
      charWidth += ch.charCodeAt(0) > 0x7f ? 14 : 8;
    }
    let w = charWidth + 28; // text padding
    if (node.time) w += 44;  // timestamp badge space
    return Math.max(90, w);
  }

  function layoutMindmap(node, depth = 0) {
    node._width = measureNodeWidth(node);
    node._height = MM_NODE_HEIGHT;
    node._depth = depth;

    const isCollapsed = mindmapCollapsed.has(node._id);
    const visibleChildren = (!isCollapsed && node.children && node.children.length > 0) ? node.children : [];

    if (visibleChildren.length === 0) {
      node._subtreeHeight = MM_NODE_HEIGHT;
    } else {
      visibleChildren.forEach(child => layoutMindmap(child, depth + 1));
      const totalChildHeight = visibleChildren.reduce((sum, c) => sum + c._subtreeHeight, 0) + (visibleChildren.length - 1) * MM_V_GAP;
      node._subtreeHeight = Math.max(MM_NODE_HEIGHT, totalChildHeight);
    }
    node._visibleChildren = visibleChildren;
  }

  function positionMindmap(node, x, y) {
    node._x = x;
    node._y = y;

    if (node._visibleChildren && node._visibleChildren.length > 0) {
      // H_GAP + extra space for toggle circle
      const hasToggle = node.children && node.children.length > 0;
      const childX = x + node._width + (hasToggle ? MM_TOGGLE_SPACE : 0) + MM_H_GAP;
      const totalChildHeight = node._visibleChildren.reduce((sum, c) => sum + c._subtreeHeight, 0) + (node._visibleChildren.length - 1) * MM_V_GAP;
      let childY = y + (node._subtreeHeight - totalChildHeight) / 2;
      node._visibleChildren.forEach(child => {
        const cy = childY + child._subtreeHeight / 2 - child._height / 2;
        positionMindmap(child, childX, cy);
        childY += child._subtreeHeight + MM_V_GAP;
      });
    }
  }

  function getMindmapBounds(node) {
    let minX = node._x, minY = node._y;
    const toggleExtra = (node.children && node.children.length > 0) ? MM_TOGGLE_SPACE : 0;
    let maxX = node._x + node._width + toggleExtra, maxY = node._y + node._height;
    if (node._visibleChildren) {
      node._visibleChildren.forEach(child => {
        const b = getMindmapBounds(child);
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
      });
    }
    return { minX, minY, maxX, maxY };
  }

  function renderMindmap() {
    if (!panel || !mindmapData) return;
    const contentEl = panel.querySelector('#ytx-content-mindmap');

    assignNodeIds(mindmapData);
    layoutMindmap(mindmapData);
    positionMindmap(mindmapData, 30, 30);

    const bounds = getMindmapBounds(mindmapData);
    const PAD = 40;
    const treeW = bounds.maxX - bounds.minX + PAD * 2;
    const treeH = bounds.maxY - bounds.minY + PAD * 2;

    const DEPTH_COLORS = ['#7c3aed', '#ede9fe', '#f5f3ff', '#faf5ff'];
    const DEPTH_TEXT_COLORS = ['#ffffff', '#5b21b6', '#6d28d9', '#7c3aed'];
    const DEPTH_BORDER_COLORS = ['#7c3aed', '#c4b5fd', '#ddd6fe', '#e9d5ff'];

    let edgesHtml = '';
    let nodesHtml = '';

    function renderEdges(node) {
      if (!node._visibleChildren) return;
      node._visibleChildren.forEach(child => {
        const hasToggle = node.children && node.children.length > 0;
        const x1 = node._x + node._width + (hasToggle ? MM_TOGGLE_SPACE : 0);
        const y1 = node._y + node._height / 2;
        const x2 = child._x;
        const y2 = child._y + child._height / 2;
        const dx = x2 - x1;
        const cx1 = x1 + dx * 0.45;
        const cx2 = x2 - dx * 0.45;
        edgesHtml += `<path d="M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}" fill="none" stroke="#c4b5fd" stroke-width="2" opacity="0.7"/>`;
        renderEdges(child);
      });
    }

    function renderNodes(node) {
      const d = Math.min(node._depth, 3);
      const fill = DEPTH_COLORS[d];
      const textColor = DEPTH_TEXT_COLORS[d];
      const borderColor = DEPTH_BORDER_COLORS[d];
      const rx = d === 0 ? 18 : 10;
      const fontSize = d === 0 ? 14 : 12;

      nodesHtml += `<g class="ytx-mm-node" data-id="${node._id}">`;
      nodesHtml += `<rect x="${node._x}" y="${node._y}" width="${node._width}" height="${node._height}" rx="${rx}" fill="${fill}" stroke="${borderColor}" stroke-width="1.5"/>`;

      // Label text — centered, or left-aligned if timestamp present
      const textX = node._x + 14;
      const textY = node._y + node._height / 2;
      const maxTextW = node._width - 28 - (node.time ? 44 : 0);
      nodesHtml += `<text x="${textX}" y="${textY}" fill="${textColor}" font-size="${fontSize}" font-weight="${d === 0 ? 600 : 500}" text-anchor="start" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><tspan textLength="${Math.max(0, maxTextW)}" lengthAdjust="spacing">${escapeHtml(node.label || '')}</tspan></text>`;

      // Timestamp badge
      if (node.time) {
        const badgeW = 40;
        const badgeX = node._x + node._width - badgeW - 6;
        const badgeY = node._y + node._height / 2;
        const secs = timeToSeconds(node.time);
        nodesHtml += `<g class="ytx-mm-timestamp" data-time="${secs}" style="cursor:pointer">`;
        nodesHtml += `<rect x="${badgeX}" y="${badgeY - 10}" width="${badgeW}" height="20" rx="10" fill="${d === 0 ? 'rgba(255,255,255,0.25)' : '#ede9fe'}" stroke="none"/>`;
        nodesHtml += `<text x="${badgeX + badgeW / 2}" y="${badgeY}" fill="${d === 0 ? '#fff' : '#7c3aed'}" font-size="10" font-weight="600" text-anchor="middle" dominant-baseline="central" font-family="Consolas,Monaco,monospace">${node.time}</text>`;
        nodesHtml += `</g>`;
      }

      // Collapse/expand toggle
      if (node.children && node.children.length > 0) {
        const cx = node._x + node._width + MM_TOGGLE_SPACE / 2;
        const cy = node._y + node._height / 2;
        const isCollapsed = mindmapCollapsed.has(node._id);
        nodesHtml += `<g class="ytx-mm-toggle" data-id="${node._id}" style="cursor:pointer">`;
        nodesHtml += `<circle cx="${cx}" cy="${cy}" r="8" fill="#fff" stroke="#c4b5fd" stroke-width="1.5"/>`;
        nodesHtml += `<text x="${cx}" y="${cy}" fill="#7c3aed" font-size="12" font-weight="700" text-anchor="middle" dominant-baseline="central">${isCollapsed ? '+' : '−'}</text>`;
        nodesHtml += `</g>`;
      }

      nodesHtml += `</g>`;

      if (node._visibleChildren) {
        node._visibleChildren.forEach(child => renderNodes(child));
      }
    }

    renderEdges(mindmapData);
    renderNodes(mindmapData);

    contentEl.innerHTML = `
      <div class="ytx-mindmap-toolbar">
        <button class="ytx-mm-zoom-btn" data-action="zoom-in" title="放大">+</button>
        <button class="ytx-mm-zoom-btn" data-action="zoom-out" title="缩小">−</button>
        <button class="ytx-mm-zoom-btn" data-action="zoom-reset" title="重置">⟲</button>
      </div>
      <div class="ytx-mindmap-viewport">
        <svg class="ytx-mindmap-svg" xmlns="http://www.w3.org/2000/svg">
          <g class="ytx-mm-canvas">
            ${edgesHtml}
            ${nodesHtml}
          </g>
        </svg>
      </div>
    `;

    // Auto-fit: calculate transform to fit tree in viewport
    const viewport = contentEl.querySelector('.ytx-mindmap-viewport');
    const svg = contentEl.querySelector('.ytx-mindmap-svg');
    const canvas = contentEl.querySelector('.ytx-mm-canvas');
    if (viewport && svg && canvas) {
      const vw = viewport.clientWidth || 400;
      const vh = viewport.clientHeight || 400;
      svg.setAttribute('width', vw);
      svg.setAttribute('height', vh);

      // Only auto-fit on first render (scale === 1 and no offset)
      if (mindmapTransform.scale === 1 && mindmapTransform.x === 0 && mindmapTransform.y === 0) {
        const scaleX = vw / treeW;
        const scaleY = vh / treeH;
        const fitScale = Math.min(scaleX, scaleY, 1.5) * 0.92; // 92% to leave margin
        const offsetX = (vw - treeW * fitScale) / 2;
        const offsetY = (vh - treeH * fitScale) / 2;
        mindmapTransform = { x: offsetX, y: offsetY, scale: fitScale };
      }
      canvas.setAttribute('transform', `translate(${mindmapTransform.x},${mindmapTransform.y}) scale(${mindmapTransform.scale})`);
    }

    setupMindmapZoomPan(contentEl);
    setupMindmapToolbar(contentEl);
    setupMindmapInteractions(contentEl);
  }

  function setupMindmapZoomPan(container) {
    const viewport = container.querySelector('.ytx-mindmap-viewport');
    const svg = container.querySelector('.ytx-mindmap-svg');
    const canvas = container.querySelector('.ytx-mm-canvas');
    if (!viewport || !svg || !canvas) return;

    let isPanning = false;
    let startX, startY, startTx, startTy;

    viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('.ytx-mm-toggle, .ytx-mm-timestamp, .ytx-mm-node')) return;
      isPanning = true;
      startX = e.clientX;
      startY = e.clientY;
      startTx = mindmapTransform.x;
      startTy = mindmapTransform.y;
      viewport.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      mindmapTransform.x = startTx + (e.clientX - startX);
      mindmapTransform.y = startTy + (e.clientY - startY);
      canvas.setAttribute('transform', `translate(${mindmapTransform.x},${mindmapTransform.y}) scale(${mindmapTransform.scale})`);
    });

    document.addEventListener('mouseup', () => {
      if (!isPanning) return;
      isPanning = false;
      viewport.style.cursor = 'grab';
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const oldScale = mindmapTransform.scale;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(3, oldScale * delta));

      // Zoom toward cursor
      mindmapTransform.x = mouseX - (mouseX - mindmapTransform.x) * (newScale / oldScale);
      mindmapTransform.y = mouseY - (mouseY - mindmapTransform.y) * (newScale / oldScale);
      mindmapTransform.scale = newScale;

      canvas.setAttribute('transform', `translate(${mindmapTransform.x},${mindmapTransform.y}) scale(${mindmapTransform.scale})`);
    }, { passive: false });
  }

  function setupMindmapToolbar(container) {
    container.querySelectorAll('.ytx-mm-zoom-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const canvas = container.querySelector('.ytx-mm-canvas');
        if (!canvas) return;

        if (action === 'zoom-in') {
          mindmapTransform.scale = Math.min(3, mindmapTransform.scale * 1.2);
        } else if (action === 'zoom-out') {
          mindmapTransform.scale = Math.max(0.2, mindmapTransform.scale * 0.8);
        } else if (action === 'zoom-reset') {
          // Re-fit to viewport
          mindmapTransform = { x: 0, y: 0, scale: 1 };
          renderMindmap();
          return;
        }
        canvas.setAttribute('transform', `translate(${mindmapTransform.x},${mindmapTransform.y}) scale(${mindmapTransform.scale})`);
      });
    });
  }

  function setupMindmapInteractions(container) {
    // Toggle collapse/expand
    container.querySelectorAll('.ytx-mm-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = toggle.dataset.id;
        if (mindmapCollapsed.has(id)) {
          mindmapCollapsed.delete(id);
        } else {
          mindmapCollapsed.add(id);
        }
        renderMindmap();
      });
    });

    // Timestamp click → jump video
    container.querySelectorAll('.ytx-mm-timestamp').forEach(ts => {
      ts.addEventListener('click', (e) => {
        e.stopPropagation();
        const time = parseInt(ts.dataset.time, 10);
        if (isNaN(time)) return;
        const video = document.querySelector('video');
        if (video) { video.currentTime = time; video.play(); }
      });
    });
  }

  function exportMindmapSvg() {
    if (!panel || !mindmapData) return;
    const svgEl = panel.querySelector('.ytx-mindmap-svg');
    if (!svgEl) return;

    // Recalculate bounds for proper export dimensions
    const bounds = getMindmapBounds(mindmapData);
    const PAD = 40;
    const exportW = bounds.maxX - bounds.minX + PAD * 2;
    const exportH = bounds.maxY - bounds.minY + PAD * 2;

    const clone = svgEl.cloneNode(true);
    clone.setAttribute('width', exportW);
    clone.setAttribute('height', exportH);
    const canvas = clone.querySelector('.ytx-mm-canvas');
    if (canvas) canvas.setAttribute('transform', 'translate(0,0) scale(1)');

    // Add white background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', exportW);
    bg.setAttribute('height', exportH);
    bg.setAttribute('fill', '#fff');
    clone.insertBefore(bg, clone.firstChild);

    const svgData = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindmap-${currentVideoId || 'video'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── 字幕获取（全部通过 background.js 代理）─────────────
  async function fetchTranscript() {
    const videoId = currentVideoId;

    // 让 background.js 获取字幕（它没有 CSP 和 cookie 限制）
    const result = await sendToBg({ type: 'FETCH_TRANSCRIPT', videoId });

    if (result.error) throw new Error(result.error);
    if (!result.segments || result.segments.length === 0) throw new Error('字幕内容为空');

    const segments = result.segments;
    const full = segments.map(s => `[${fmtTime(s.start)}] ${s.text}`).join('\n');
    return { segments, full };
  }

  // ── 总结流程 ─────────────────────────────────────────
  async function startSummarize() {
    if (isSummarizing) return;
    isSummarizing = true;
    summaryText = '';

    const btn = panel.querySelector('#ytx-summarize');
    const contentEl = panel.querySelector('#ytx-content');
    const copyBtn = panel.querySelector('#ytx-copy');

    btn.disabled = true;
    btn.textContent = '获取字幕中...';
    copyBtn.style.display = 'none';
    contentEl.innerHTML = '<div class="ytx-loading"><div class="ytx-spinner"></div><span>正在获取字幕...</span></div>';

    try {
      transcriptData = await fetchTranscript();
      renderTranscript();

      btn.textContent = '总结中...';
      contentEl.innerHTML = '<div class="ytx-loading"><div class="ytx-spinner"></div><span>正在生成总结...</span></div>';

      const settings = await getSettings();

      chrome.runtime.sendMessage({
        type: 'SUMMARIZE',
        transcript: transcriptData.full,
        prompt: settings.prompt || DEFAULT_PROMPT,
        provider: settings.provider,
        apiKey: settings.apiKey,
        openaiKey: settings.openaiKey,
        geminiKey: settings.geminiKey,
        model: settings.model,
      });

    } catch (err) {
      contentEl.innerHTML = `<div class="ytx-error">${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = '总结视频';
      isSummarizing = false;
    }
  }

  // 监听 background 返回的流式消息
  chrome.runtime.onMessage.addListener((message) => {
    if (!panel) return;

    // ── 总结消息 ──
    if (message.type === 'SUMMARY_CHUNK') {
      const contentEl = panel.querySelector('#ytx-content');
      if (summaryText === '' || contentEl.querySelector('.ytx-loading')) {
        contentEl.innerHTML = '';
      }
      summaryText += message.text;
      contentEl.innerHTML = renderMarkdown(summaryText);
    }
    if (message.type === 'SUMMARY_DONE') {
      panel.querySelector('#ytx-summarize').disabled = false;
      panel.querySelector('#ytx-summarize').textContent = '重新总结';
      panel.querySelector('#ytx-copy').style.display = 'inline-block';
      isSummarizing = false;
    }
    if (message.type === 'SUMMARY_ERROR') {
      panel.querySelector('#ytx-content').innerHTML = `<div class="ytx-error">${message.error}</div>`;
      panel.querySelector('#ytx-summarize').disabled = false;
      panel.querySelector('#ytx-summarize').textContent = '总结视频';
      isSummarizing = false;
    }

    // ── HTML 笔记消息 ──
    if (message.type === 'HTML_CHUNK') {
      htmlText += message.text;
    }
    if (message.type === 'HTML_DONE') {
      renderHtmlToIframe(htmlText);
      panel.querySelector('#ytx-generate-html').disabled = false;
      panel.querySelector('#ytx-generate-html').textContent = '重新生成';
      panel.querySelector('#ytx-copy-html').style.display = 'inline-block';
      panel.querySelector('#ytx-open-html').style.display = 'inline-block';
      isGeneratingHtml = false;
    }
    if (message.type === 'HTML_ERROR') {
      panel.querySelector('#ytx-content-html').innerHTML = `<div class="ytx-error" style="margin:14px 16px">${message.error}</div>`;
      panel.querySelector('#ytx-generate-html').disabled = false;
      panel.querySelector('#ytx-generate-html').textContent = '生成笔记';
      isGeneratingHtml = false;
    }

    // ── 互动问答消息 ──
    if (message.type === 'CHAT_CHUNK') {
      const aiBubble = panel.querySelector('.ytx-chat-ai:last-child');
      if (aiBubble) {
        if (chatReplyText === '' || aiBubble.querySelector('.ytx-loading')) {
          aiBubble.innerHTML = '';
        }
        chatReplyText += message.text;
        aiBubble.innerHTML = renderMarkdown(chatReplyText);
        const msgContainer = panel.querySelector('#ytx-chat-messages');
        msgContainer.scrollTop = msgContainer.scrollHeight;
      }
    }
    if (message.type === 'CHAT_DONE') {
      chatMessages.push({ role: 'assistant', content: chatReplyText });
      isChatting = false;
      panel.querySelector('#ytx-chat-send').disabled = false;
      panel.querySelector('#ytx-chat-input').focus();
    }
    if (message.type === 'CHAT_ERROR') {
      const aiBubble = panel.querySelector('.ytx-chat-ai:last-child');
      if (aiBubble) aiBubble.innerHTML = `<span class="ytx-chat-err">${message.error}</span>`;
      isChatting = false;
      panel.querySelector('#ytx-chat-send').disabled = false;
    }

    // ── 知识卡片消息 ──
    if (message.type === 'CARDS_CHUNK') {
      cardsRawText += message.text;
    }
    if (message.type === 'CARDS_DONE') {
      try {
        // 从原始文本中提取 JSON 数组
        const jsonMatch = cardsRawText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          cardsData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('未找到有效的 JSON 数据');
        }
        renderCards();
      } catch (err) {
        panel.querySelector('#ytx-content-cards').innerHTML = `<div class="ytx-error" style="margin:14px 16px">卡片解析失败: ${err.message}</div>`;
      }
      panel.querySelector('#ytx-generate-cards').disabled = false;
      panel.querySelector('#ytx-generate-cards').textContent = '重新生成';
      isGeneratingCards = false;
    }
    if (message.type === 'CARDS_ERROR') {
      panel.querySelector('#ytx-content-cards').innerHTML = `<div class="ytx-error" style="margin:14px 16px">${message.error}</div>`;
      panel.querySelector('#ytx-generate-cards').disabled = false;
      panel.querySelector('#ytx-generate-cards').textContent = '生成卡片';
      isGeneratingCards = false;
    }

    // ── 思维导图消息 ──
    if (message.type === 'MINDMAP_CHUNK') {
      mindmapRawText += message.text;
    }
    if (message.type === 'MINDMAP_DONE') {
      try {
        const jsonMatch = mindmapRawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          mindmapData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('未找到有效的 JSON 数据');
        }
        renderMindmap();
        panel.querySelector('#ytx-export-mindmap').style.display = 'inline-block';
      } catch (err) {
        panel.querySelector('#ytx-content-mindmap').innerHTML = `<div class="ytx-error" style="margin:14px 16px">导图解析失败: ${err.message}</div>`;
      }
      panel.querySelector('#ytx-generate-mindmap').disabled = false;
      panel.querySelector('#ytx-generate-mindmap').textContent = '重新生成';
      isGeneratingMindmap = false;
    }
    if (message.type === 'MINDMAP_ERROR') {
      panel.querySelector('#ytx-content-mindmap').innerHTML = `<div class="ytx-error" style="margin:14px 16px">${message.error}</div>`;
      panel.querySelector('#ytx-generate-mindmap').disabled = false;
      panel.querySelector('#ytx-generate-mindmap').textContent = '生成导图';
      isGeneratingMindmap = false;
    }
  });

  // ── Markdown 渲染 ───────────────────────────────────
  function renderMarkdown(text) {
    // 按段落分割（两个以上换行 = 段落分隔）
    const blocks = text.split(/\n{2,}/);
    const rendered = blocks.map(block => {
      block = block.trim();
      if (!block) return '';

      let html = escapeHtml(block);

      // ## 标题
      html = html.replace(/^## (.+)$/gm, '</p><h2>$1</h2><p>');

      // **粗体**
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

      // ---
      html = html.replace(/^---$/gm, '</p><hr><p>');

      // 时间戳 [MM:SS] 或 [H:MM:SS]
      html = html.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (match, time) => {
        const secs = timeToSeconds(time);
        return `<span class="ytx-timestamp" data-time="${secs}">[${time}]</span>`;
      });

      // 单个换行 → <br>
      html = html.replace(/\n/g, '<br>');

      return html;
    });

    return '<p>' + rendered.filter(Boolean).join('</p><p>') + '</p>';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── 字幕面板 ─────────────────────────────────────────
  function renderTranscript() {
    if (!transcriptData || !panel) return;
    const body = panel.querySelector('#ytx-transcript-body');
    body.innerHTML = transcriptData.segments.map(s =>
      `<div class="ytx-transcript-line">
        <span class="ytx-ts" data-time="${s.start}">${fmtTime(s.start)}</span>
        <span>${escapeHtml(s.text)}</span>
      </div>`
    ).join('');
  }

  function toggleTranscript() {
    const body = panel.querySelector('#ytx-transcript-body');
    const arrow = panel.querySelector('#ytx-transcript-toggle .arrow');
    body.classList.toggle('open');
    arrow.classList.toggle('open');
  }

  // ── 时间戳跳转（面板级事件委托）───────────────────────
  function setupTimestampClickHandler(panelEl) {
    panelEl.addEventListener('click', (e) => {
      const ts = e.target.closest('.ytx-timestamp, .ytx-ts');
      if (!ts) return;
      e.preventDefault();
      e.stopPropagation();
      const time = parseInt(ts.dataset.time, 10);
      if (isNaN(time)) return;
      const video = document.querySelector('video');
      if (video) { video.currentTime = time; video.play(); }
    });
  }

  // ── 复制 ─────────────────────────────────────────────
  function copySummary() {
    navigator.clipboard.writeText(summaryText).then(() => {
      const btn = panel.querySelector('#ytx-copy');
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = '复制'; }, 1500);
    });
  }

  // ── 工具函数 ─────────────────────────────────────────
  function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function timeToSeconds(str) {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return parts[0] * 60 + parts[1];
  }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['provider', 'apiKey', 'openaiKey', 'geminiKey', 'model', 'prompt'], resolve);
    });
  }

  function sendToBg(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(resp);
      });
    });
  }

  // 启动
  init();
})();
