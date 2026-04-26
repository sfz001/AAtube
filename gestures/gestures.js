// 鼠标手势：右键按住拖动触发
// ← 后退   → 前进   ↓→ 关闭标签页   ←↑ 恢复关闭的标签页
(function () {
  'use strict';
  if (window.top !== window) return; // 只在顶层窗口启用，跳过 iframe

  const MIN_SEGMENT = 30; // 单段最小位移（像素）
  const MIN_GESTURE = 8;  // 累计移动超过此值才视为手势（屏蔽误触）

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
    'DR': { label: '↓→ 关闭标签页',    run: () => chrome.runtime.sendMessage({ type: 'GESTURE_CLOSE_TAB' }) },
    'LU': { label: '←↑ 恢复关闭页',    run: () => chrome.runtime.sendMessage({ type: 'GESTURE_REOPEN_TAB' }) },
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
    tracking = true;
    lastPoint = { x: e.clientX, y: e.clientY };
    directions = [];
    totalMoved = 0;
    // macOS Chrome 在 mousedown 时立即触发 contextmenu，菜单弹出后事件流被系统接管，
    // mousemove/mouseup 收不到 → 手势失效。所以右键一按下就预先抑制 contextmenu，
    // 让事件流保持通畅。代价：右键不会弹原生菜单，需要时用 Ctrl+Click 替代
    suppressContext = true;
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

    // 200ms 后清掉 suppressContext，兜底防止 macOS 上 mouseup 后还有延后的 contextmenu
    setTimeout(() => { suppressContext = false; }, 200);

    if (totalMoved < MIN_GESTURE) return; // 没移动，不执行任何手势

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
