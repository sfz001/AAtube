// 鼠标手势：右键按住拖动触发
// ← 后退   → 前进   ↓→ 关闭标签页   ←↑ 恢复关闭的标签页
(function () {
  'use strict';
  if (window.top !== window) return; // 只在顶层窗口启用，跳过 iframe

  const MIN_SEGMENT = 30; // 单段最小位移（像素）
  const MIN_GESTURE = 8;  // 累计移动超过此值才视为手势（屏蔽误触）

  // contextmenu 抑制策略（保留菜单 + 启用手势的两全方案）：
  // - Windows/Linux：contextmenu 在 mouseup 之后触发 → mouseup 时根据 totalMoved 判断
  //   普通右键弹菜单、右键拖动识别手势，无需 modifier
  // - macOS：contextmenu 在 mousedown 时立即触发，无法事后判断 → 用 Shift 键区分
  //   普通右键 → 弹菜单；Shift + 右键 → 抑制菜单，进入手势识别
  // 这样所有平台都能弹右键菜单，macOS 用户做手势时按住 Shift
  const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform || '');

  let enabled = true; // 总开关，默认启用，由 storage 决定
  let tracking = false;
  let lastPoint = null;
  let directions = [];
  let totalMoved = 0;
  let suppressContext = false;
  let indicator = null;

  // 启动时读取设置；监听变化实时响应（无需刷新页面）
  try {
    chrome.storage.sync.get(['enableGestures'], (data) => {
      enabled = data.enableGestures !== false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.enableGestures) {
        enabled = changes.enableGestures.newValue !== false;
        if (!enabled) { tracking = false; hideIndicator(); }
      }
    });
  } catch (_) {}

  const GESTURES = {
    'L':  { label: '← 后退',          run: () => history.back() },
    'R':  { label: '→ 前进',          run: () => history.forward() },
    'U':  { label: '↑ 滚动到顶部',     run: () => window.scrollTo({ top: 0, behavior: 'auto' }) },
    'D':  { label: '↓ 滚动到底部',     run: () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' }) },
    'DR': { label: '↓→ 关闭标签页',    run: () => chrome.runtime.sendMessage({ type: 'GESTURE_CLOSE_TAB' }) },
    'LU': { label: '←↑ 恢复关闭页',    run: () => chrome.runtime.sendMessage({ type: 'GESTURE_REOPEN_TAB' }) },
    'UD': { label: '↑↓ 强制刷新',      run: () => chrome.runtime.sendMessage({ type: 'GESTURE_RELOAD_HARD' }) },
  };

  function dirOf(dx, dy) {
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
  }

  function ensureIndicator() {
    if (indicator) return indicator;
    indicator = document.createElement('div');
    indicator.style.cssText = [
      'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
      'background:rgba(20,20,20,0.82)', 'color:#fff',
      'padding:10px 18px', 'border-radius:10px',
      'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'z-index:2147483647', 'pointer-events:none', 'user-select:none',
      'box-shadow:0 6px 20px rgba(0,0,0,0.3)', 'display:none',
    ].join(';');
    (document.body || document.documentElement).appendChild(indicator);
    return indicator;
  }

  function showIndicator(text, matched) {
    const el = ensureIndicator();
    el.textContent = text;
    el.style.opacity = matched ? '1' : '0.7';
    el.style.display = 'block';
  }

  function hideIndicator() {
    if (indicator) indicator.style.display = 'none';
  }

  document.addEventListener('mousedown', function (e) {
    if (!enabled) return;
    if (!e.isTrusted) return;
    if (e.button !== 2) return;
    // macOS 上：普通右键放行让菜单弹出；只有 Shift+右键才进入手势追踪
    // 其他平台：直接进入手势追踪，mouseup 时再决定是否抑制菜单
    if (isMac && !e.shiftKey) return;
    tracking = true;
    lastPoint = { x: e.clientX, y: e.clientY };
    directions = [];
    totalMoved = 0;
    // macOS 上必须 mousedown 时就抑制（contextmenu 立即触发）
    // 其他平台等 mouseup 时根据是否手势再决定
    suppressContext = isMac;
  }, true);

  document.addEventListener('mousemove', function (e) {
    if (!tracking) return;
    if (!e.isTrusted) return;
    const dx = e.clientX - lastPoint.x;
    const dy = e.clientY - lastPoint.y;
    const dist = Math.hypot(dx, dy);
    totalMoved += dist;
    if (Math.abs(dx) < MIN_SEGMENT && Math.abs(dy) < MIN_SEGMENT) return;

    const d = dirOf(dx, dy);
    if (directions[directions.length - 1] !== d) directions.push(d);
    lastPoint = { x: e.clientX, y: e.clientY };

    if (totalMoved < MIN_GESTURE) return;
    const key = directions.join('');
    const g = GESTURES[key];
    showIndicator(g ? g.label : '手势 ' + (key.split('').map(c => ({L:'←',R:'→',U:'↑',D:'↓'}[c])).join('')), !!g);
  }, true);

  // macOS 触摸板按住右键 + 另一根手指滑动 → 系统发 wheel 事件而非 mousemove
  // tracking 期间把 wheel 也算成手势位移；deltaX/deltaY 取反以匹配手指物理方向（macOS 自然滚动）
  document.addEventListener('wheel', function (e) {
    if (!tracking) return;
    if (!e.isTrusted) return;
    const dx = -e.deltaX;
    const dy = -e.deltaY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    totalMoved += dist;
    if (Math.abs(dx) < MIN_SEGMENT && Math.abs(dy) < MIN_SEGMENT) return;

    const d = dirOf(dx, dy);
    if (directions[directions.length - 1] !== d) directions.push(d);

    if (totalMoved < MIN_GESTURE) return;
    const key = directions.join('');
    const g = GESTURES[key];
    showIndicator(g ? g.label : '手势 ' + (key.split('').map(c => ({L:'←',R:'→',U:'↑',D:'↓'}[c])).join('')), !!g);

    // 阻止页面同时滚动（用户在做手势，不是在浏览内容）
    e.preventDefault();
  }, { passive: false, capture: true });

  document.addEventListener('mouseup', function (e) {
    if (!tracking || e.button !== 2) return;
    if (!e.isTrusted) return;
    tracking = false;
    hideIndicator();

    if (totalMoved < MIN_GESTURE) {
      // 普通右键（无拖动）：非 macOS 上保持 suppressContext=false → 菜单正常弹
      // macOS 上 mousedown 时已经抑制了，无法补救
      return;
    }

    // 有手势：抑制 contextmenu 防止菜单弹出（macOS 上已经抑制了，这里 idempotent）
    suppressContext = true;
    setTimeout(() => { suppressContext = false; }, 200);

    const key = directions.join('');
    const g = GESTURES[key];
    if (g) {
      try { g.run(); } catch (_) {}
    }
  }, true);

  document.addEventListener('contextmenu', function (e) {
    if (suppressContext) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // 拖出窗口或切窗口时复位
  window.addEventListener('blur', function () {
    tracking = false;
    hideIndicator();
  });
})();
