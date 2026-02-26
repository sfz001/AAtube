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
        </div>
      </div>
      <div id="ytx-tabs">
        <button class="ytx-tab active" data-tab="summary">总结</button>
        <button class="ytx-tab" data-tab="html">笔记</button>
        <button class="ytx-tab" data-tab="chat">问答</button>
        <button class="ytx-tab" data-tab="cards">卡片</button>
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
    const tabs = ['summary', 'html', 'chat', 'cards'];
    const contentIds = { summary: '#ytx-content', html: '#ytx-content-html', chat: '#ytx-content-chat', cards: '#ytx-content-cards' };
    const actionIds = { summary: '#ytx-actions-summary', html: '#ytx-actions-html', chat: '#ytx-actions-chat', cards: '#ytx-actions-cards' };
    tabs.forEach(t => {
      panel.querySelector(contentIds[t]).style.display = t === tab ? (t === 'chat' || t === 'cards' ? 'flex' : 'block') : 'none';
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
        apiKey: settings.apiKey,
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
        apiKey: settings.apiKey,
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
        apiKey: settings.apiKey,
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
        apiKey: settings.apiKey,
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
      chrome.storage.sync.get(['apiKey', 'model', 'prompt'], resolve);
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
