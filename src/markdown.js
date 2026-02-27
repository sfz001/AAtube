// src/markdown.js — renderMarkdown、escapeHtml

YTX.escapeHtml = function (text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

YTX.renderMarkdown = function (text) {
  var blocks = text.split(/\n{2,}/);
  var rendered = blocks.map(function (block) {
    block = block.trim();
    if (!block) return '';

    var html = YTX.escapeHtml(block);

    // ## 标题
    html = html.replace(/^## (.+)$/gm, '</p><h2>$1</h2><p>');

    // **粗体**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // ---
    html = html.replace(/^---$/gm, '</p><hr><p>');

    // 时间戳 [MM:SS] 或 [H:MM:SS]
    html = html.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, function (match, time) {
      var secs = YTX.timeToSeconds(time);
      return '<span class="ytx-timestamp" data-time="' + secs + '">[' + time + ']</span>';
    });

    // 单个换行 → <br>
    html = html.replace(/\n/g, '<br>');

    return html;
  });

  return '<p>' + rendered.filter(Boolean).join('</p><p>') + '</p>';
};
