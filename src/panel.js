// src/panel.js — 面板注入、tab 切换、resizer、消息路由、init

(function () {
  'use strict';

  // ── 消息前缀到功能模块的映射 ─────────────────────────
  // SUMMARY_CHUNK → features.summary, HTML_CHUNK → features.html, etc.
  var prefixMap = {};
  YTX.featureOrder.forEach(function (key) {
    var f = YTX.features[key];
    if (f && f.prefix) {
      prefixMap[f.prefix] = f;
    }
  });

  // ── 入口 ──────────────────────────────────────────────

  function init() {
    document.addEventListener('yt-navigate-finish', onNavigate);
    onNavigate();
  }

  function onNavigate() {
    var videoId = getVideoId();
    if (!videoId) { removePanel(); removeResizer(); return; }
    if (videoId === YTX.currentVideoId && YTX.panel) return;
    YTX.currentVideoId = videoId;
    YTX.transcriptData = null;
    YTX.activeTab = 'summary';

    // 重置所有功能模块状态
    YTX.featureOrder.forEach(function (key) {
      var f = YTX.features[key];
      if (f && f.reset) f.reset();
    });

    waitForContainer(function () { injectPanel(); });
  }

  function getVideoId() {
    var url = new URL(location.href);
    return url.searchParams.get('v');
  }

  // ── 等待右侧栏加载 ────────────────────────────────────

  function waitForContainer(callback, retries) {
    retries = retries !== undefined ? retries : 30;
    var container = document.querySelector('#secondary, #secondary-inner');
    if (container) { callback(); }
    else if (retries > 0) { setTimeout(function () { waitForContainer(callback, retries - 1); }, 500); }
  }

  // ── 面板注入 ─────────────────────────────────────────

  function injectPanel() {
    removePanel();
    var panel = document.createElement('div');
    panel.id = 'ytx-panel';
    YTX.panel = panel;

    // 动态拼接 tabs
    var tabsHtml = YTX.featureOrder.map(function (key) {
      var f = YTX.features[key];
      var active = key === 'summary' ? ' active' : '';
      return '<button class="ytx-tab' + active + '" data-tab="' + key + '">' + f.tab.label + '</button>';
    }).join('');

    // 动态拼接 actions
    var actionsHtml = YTX.featureOrder.map(function (key) {
      var f = YTX.features[key];
      var display = key === 'summary' ? 'flex' : 'none';
      return '<div id="' + f.actionsId + '" style="display:' + display + '">' + f.actionsHtml() + '</div>';
    }).join('');

    // 动态拼接 content
    var contentHtml = YTX.featureOrder.map(function (key) {
      var f = YTX.features[key];
      var display = key === 'summary' ? f.displayMode : 'none';
      return '<div id="' + f.contentId + '" style="display:' + display + '">' + f.contentHtml() + '</div>';
    }).join('');

    panel.innerHTML =
      '<div id="ytx-header">' +
        '<span class="ytx-title">YouTubeX</span>' +
        '<div id="ytx-actions">' + actionsHtml + '</div>' +
      '</div>' +
      '<div id="ytx-tabs">' + tabsHtml + '</div>' +
      contentHtml +
      '<div id="ytx-transcript-section">' +
        '<button id="ytx-transcript-toggle">' +
          '<span>查看字幕</span>' +
          '<span class="arrow">\u25BC</span>' +
        '</button>' +
        '<div id="ytx-transcript-body"></div>' +
      '</div>';

    var secondary = document.querySelector('#secondary, #secondary-inner');
    if (secondary) secondary.prepend(panel);

    // 绑定各模块事件
    YTX.featureOrder.forEach(function (key) {
      var f = YTX.features[key];
      if (f && f.bindEvents) f.bindEvents(panel);
    });

    // 绑定 tab 切换
    panel.querySelectorAll('.ytx-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.dataset.tab); });
    });

    // 绑定字幕折叠
    panel.querySelector('#ytx-transcript-toggle').addEventListener('click', toggleTranscript);

    // 面板级时间戳点击委托
    setupTimestampClickHandler(panel);

    // 注入分栏条
    injectResizer();
  }

  function removePanel() {
    if (YTX.panel) { YTX.panel.remove(); YTX.panel = null; }
  }

  // ── 标签切换 ─────────────────────────────────────────

  function switchTab(tab) {
    if (!YTX.panel) return;
    YTX.activeTab = tab;
    YTX.panel.querySelectorAll('.ytx-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    YTX.featureOrder.forEach(function (key) {
      var f = YTX.features[key];
      var isActive = key === tab;
      YTX.panel.querySelector('#' + f.contentId).style.display = isActive ? f.displayMode : 'none';
      YTX.panel.querySelector('#' + f.actionsId).style.display = isActive ? 'flex' : 'none';
    });

    if (tab === 'chat') {
      var input = YTX.panel.querySelector('#ytx-chat-input');
      setTimeout(function () { input.focus(); }, 100);
    }
  }

  // ── 字幕面板 ─────────────────────────────────────────

  YTX.renderTranscript = function () {
    if (!YTX.transcriptData || !YTX.panel) return;
    var body = YTX.panel.querySelector('#ytx-transcript-body');
    body.innerHTML = YTX.transcriptData.segments.map(function (s) {
      return '<div class="ytx-transcript-line">' +
        '<span class="ytx-ts" data-time="' + s.start + '">' + YTX.fmtTime(s.start) + '</span>' +
        '<span>' + YTX.escapeHtml(s.text) + '</span>' +
      '</div>';
    }).join('');
  };

  function toggleTranscript() {
    var body = YTX.panel.querySelector('#ytx-transcript-body');
    var arrow = YTX.panel.querySelector('#ytx-transcript-toggle .arrow');
    body.classList.toggle('open');
    arrow.classList.toggle('open');
  }

  // ── 时间戳跳转（面板级事件委托）───────────────────────

  function setupTimestampClickHandler(panelEl) {
    panelEl.addEventListener('click', function (e) {
      var ts = e.target.closest('.ytx-timestamp, .ytx-ts');
      if (!ts) return;
      e.preventDefault();
      e.stopPropagation();
      var time = parseInt(ts.dataset.time, 10);
      if (isNaN(time)) return;
      var video = document.querySelector('video');
      if (video) { video.currentTime = time; video.play(); }
    });
  }

  // ── 可拖拽分栏条 ─────────────────────────────────────

  function injectResizer() {
    if (YTX.resizerInjected) return;
    var columns = document.querySelector('ytd-watch-flexy #columns');
    var primary = columns && columns.querySelector('#primary');
    var secondary = columns && columns.querySelector('#secondary');
    if (!columns || !primary || !secondary) return;

    var resizer = document.createElement('div');
    resizer.id = 'ytx-resizer';
    resizer.innerHTML = '<div class="ytx-resizer-handle"><div class="ytx-resizer-dot"></div><div class="ytx-resizer-dot"></div><div class="ytx-resizer-dot"></div></div>';
    columns.insertBefore(resizer, secondary);
    YTX.resizerInjected = true;

    columns.style.display = 'flex';
    columns.style.flexWrap = 'nowrap';

    var isDragging = false;

    resizer.addEventListener('mousedown', function (e) {
      e.preventDefault();
      isDragging = true;
      resizer.classList.add('ytx-resizer-active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      var overlay = document.getElementById('ytx-drag-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ytx-drag-overlay';
        document.body.appendChild(overlay);
      }
      overlay.style.display = 'block';
    });

    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var columnsRect = columns.getBoundingClientRect();
      var totalWidth = columnsRect.width;
      var resizerWidth = 24;
      var primaryWidth = e.clientX - columnsRect.left;
      var minPrimary = totalWidth * 0.3;
      var minSecondary = 300;
      primaryWidth = Math.max(minPrimary, Math.min(primaryWidth, totalWidth - minSecondary - resizerWidth));

      primary.style.width = primaryWidth + 'px';
      primary.style.maxWidth = 'none';
      primary.style.minWidth = '0';
      primary.style.flex = 'none';

      secondary.style.width = (totalWidth - primaryWidth - resizerWidth) + 'px';
      secondary.style.maxWidth = 'none';
      secondary.style.minWidth = '0';
      secondary.style.flex = 'none';

      forceVideoResize(primary);
    });

    document.addEventListener('mouseup', function () {
      if (!isDragging) return;
      isDragging = false;
      resizer.classList.remove('ytx-resizer-active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      var overlay = document.getElementById('ytx-drag-overlay');
      if (overlay) overlay.style.display = 'none';
      forceVideoResize(primary);
    });
  }

  function forceVideoResize(primary) {
    var watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy) watchFlexy.classList.add('ytx-resized');

    var playerContainer = primary.querySelector('#player-container-inner');
    if (playerContainer) {
      playerContainer.style.maxWidth = '100%';
    }
    var moviePlayer = primary.querySelector('#movie_player');
    if (moviePlayer) {
      var outer = primary.querySelector('#player-container-outer');
      var w = (outer && outer.clientWidth) || primary.clientWidth;
      var h = Math.round(w * 9 / 16);
      moviePlayer.style.width = w + 'px';
      moviePlayer.style.height = h + 'px';
    }
    window.dispatchEvent(new Event('resize'));
  }

  function removeResizer() {
    var resizer = document.getElementById('ytx-resizer');
    if (resizer) resizer.remove();
    var overlay = document.getElementById('ytx-drag-overlay');
    if (overlay) overlay.remove();
    YTX.resizerInjected = false;

    var watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy) watchFlexy.classList.remove('ytx-resized');
    var columns = document.querySelector('ytd-watch-flexy #columns');
    var primary = columns && columns.querySelector('#primary');
    var secondary = columns && columns.querySelector('#secondary');
    if (primary) { primary.style.width = ''; primary.style.maxWidth = ''; primary.style.minWidth = ''; primary.style.flex = ''; }
    if (secondary) { secondary.style.width = ''; secondary.style.maxWidth = ''; secondary.style.minWidth = ''; secondary.style.flex = ''; }

    var playerContainer = primary && primary.querySelector('#player-container-inner');
    if (playerContainer) playerContainer.style.maxWidth = '';
    var moviePlayer = primary && primary.querySelector('#movie_player');
    if (moviePlayer) { moviePlayer.style.width = ''; moviePlayer.style.height = ''; }
    window.dispatchEvent(new Event('resize'));
  }

  // ── 消息路由 ─────────────────────────────────────────

  chrome.runtime.onMessage.addListener(function (message) {
    if (!YTX.panel) return;

    // 模型信息（调试用，显示在面板底部）
    if (message.type && message.type.endsWith('_MODEL')) {
      var badge = YTX.panel.querySelector('#ytx-model-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'ytx-model-badge';
        badge.style.cssText = 'padding:4px 12px;font-size:11px;color:#9ca3af;text-align:right;';
        YTX.panel.appendChild(badge);
      }
      badge.textContent = message.provider + ' / ' + message.model;
    }

    // 按前缀分发到对应功能模块
    if (!message.type) return;
    var parts = message.type.match(/^(.+?)_(CHUNK|DONE|ERROR)$/);
    if (!parts) return;

    var prefix = parts[1];
    var action = parts[2];
    var feature = prefixMap[prefix];
    if (!feature) return;

    if (action === 'CHUNK' && feature.onChunk) {
      feature.onChunk(message.text);
    } else if (action === 'DONE' && feature.onDone) {
      feature.onDone();
    } else if (action === 'ERROR' && feature.onError) {
      feature.onError(message.error);
    }
  });

  // ── 启动 ─────────────────────────────────────────────
  init();
})();
