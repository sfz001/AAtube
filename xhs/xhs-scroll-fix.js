// 小红书帖子弹窗滚动修复
// 问题：打开帖子弹窗后，滚动鼠标会导致背景页面滚动而非弹窗内容滚动
// 原因：小红书用 JS 监听 wheel 事件驱动背景滚动，需同时 stopPropagation
(function () {
  'use strict';
  if (!/xiaohongshu\.com$/.test(location.hostname)) return;

  // 从 target 向上查找覆盖视口的 fixed 弹窗（不依赖类名）
  function findOverlay(el) {
    while (el && el !== document.documentElement) {
      if (el.offsetWidth > window.innerWidth * 0.4 &&
          el.offsetHeight > window.innerHeight * 0.4) {
        var s = getComputedStyle(el);
        if (s.position === 'fixed') return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // 查找最近的可滚动祖先
  function scrollableParent(el) {
    while (el && el !== document.documentElement) {
      if (el.scrollHeight > el.clientHeight + 1) {
        var s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowY)) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener('wheel', function (e) {
    var overlay = findOverlay(e.target);
    if (!overlay) return;
    // 阻止事件传播，防止小红书 JS 滚动处理器驱动背景滚动
    e.stopPropagation();
    var sc = scrollableParent(e.target);
    if (sc && overlay.contains(sc)) {
      // 弹窗内可滚动区域：到达边界时阻止穿透到背景
      if ((e.deltaY < 0 && sc.scrollTop <= 0) ||
          (e.deltaY > 0 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1)) {
        e.preventDefault();
      }
    } else {
      // 不可滚动或弹窗外：阻止背景滚动
      e.preventDefault();
    }
  }, { passive: false, capture: true });
})();
