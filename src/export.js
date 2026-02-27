// src/export.js — 导出模块：Markdown 下载 + Notion 导出

YTX.Export = {

  // ── 读取 Notion 设置 ─────────────────────────────────
  getNotionSettings: function () {
    return new Promise(function (resolve) {
      chrome.storage.sync.get(['notionToken', 'notionPageId'], function (data) {
        resolve({ token: data.notionToken || '', pageId: data.notionPageId || '' });
      });
    });
  },

  // ── 视频标题 ─────────────────────────────────────────
  getVideoTitle: function () {
    var el = document.querySelector('yt-formatted-string.ytd-watch-metadata') ||
             document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
             document.querySelector('#title h1 yt-formatted-string') ||
             document.querySelector('h1.title');
    return (el && el.textContent || '').trim() || 'YouTube Video';
  },

  getSafeFilename: function (title) {
    return title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 80) || 'export';
  },

  // ── Markdown 下载（纯本地）─────────────────────────────
  downloadMarkdown: function (md, filename) {
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename + '.md';
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── HTML → Markdown 转换 ──────────────────────────────
  htmlToMarkdown: function (html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var body = doc.body;
    if (!body) return html;

    function walk(node) {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1) return '';

      var tag = node.tagName.toLowerCase();
      var children = Array.from(node.childNodes).map(walk).join('');

      switch (tag) {
        case 'h1': return '# ' + children.trim() + '\n\n';
        case 'h2': return '## ' + children.trim() + '\n\n';
        case 'h3': return '### ' + children.trim() + '\n\n';
        case 'h4': return '#### ' + children.trim() + '\n\n';
        case 'h5': return '##### ' + children.trim() + '\n\n';
        case 'h6': return '###### ' + children.trim() + '\n\n';
        case 'p': return children.trim() + '\n\n';
        case 'br': return '\n';
        case 'strong': case 'b': return '**' + children + '**';
        case 'em': case 'i': return '*' + children + '*';
        case 'code': return '`' + children + '`';
        case 'blockquote': return children.trim().split('\n').map(function (l) { return '> ' + l; }).join('\n') + '\n\n';
        case 'hr': return '---\n\n';
        case 'ul': return children + '\n';
        case 'ol': return children + '\n';
        case 'li':
          var prefix = node.parentElement && node.parentElement.tagName === 'OL' ? '1. ' : '- ';
          return prefix + children.trim() + '\n';
        case 'a':
          var href = node.getAttribute('href') || '';
          return '[' + children + '](' + href + ')';
        case 'img':
          var src = node.getAttribute('src') || '';
          var alt = node.getAttribute('alt') || '';
          return '![' + alt + '](' + src + ')';
        default:
          return children;
      }
    }

    var md = walk(body).replace(/\n{3,}/g, '\n\n').trim();
    return md;
  },

  // ── 导图 JSON → Markdown（缩进 bullet list）──────────
  mindmapToMarkdown: function (node, depth) {
    depth = depth || 0;
    var indent = '';
    for (var i = 0; i < depth; i++) indent += '  ';
    var prefix = depth === 0 ? '# ' : indent + '- ';
    var timePart = node.time ? ' [' + node.time + ']' : '';
    var line = prefix + (node.label || '') + timePart + '\n';

    if (node.children && node.children.length > 0) {
      var childLines = node.children.map(function (child) {
        return YTX.Export.mindmapToMarkdown(child, depth + 1);
      }).join('');
      return line + childLines;
    }
    return line;
  },

  // ── HTML → Notion blocks ──────────────────────────────
  htmlToNotionBlocks: function (html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var body = doc.body;
    if (!body) return [];

    var blocks = [];

    function parseRichText(node) {
      var result = [];
      if (!node) return result;
      node.childNodes.forEach(function (child) {
        if (child.nodeType === 3) {
          var text = child.textContent;
          if (text) result.push({ type: 'text', text: { content: text } });
        } else if (child.nodeType === 1) {
          var tag = child.tagName.toLowerCase();
          var content = child.textContent || '';
          if (!content) return;
          var annotations = {};
          if (tag === 'strong' || tag === 'b') annotations.bold = true;
          if (tag === 'em' || tag === 'i') annotations.italic = true;
          if (tag === 'code') annotations.code = true;
          if (tag === 'a') {
            result.push({
              type: 'text',
              text: { content: content, link: { url: child.getAttribute('href') || '' } },
              annotations: annotations
            });
            return;
          }
          // For nested formatting, recurse
          if (tag === 'strong' || tag === 'b' || tag === 'em' || tag === 'i' || tag === 'code') {
            var inner = parseRichText(child);
            inner.forEach(function (rt) {
              rt.annotations = Object.assign({}, rt.annotations || {}, annotations);
            });
            result = result.concat(inner);
            return;
          }
          result.push({ type: 'text', text: { content: content } });
        }
      });
      return result;
    }

    function parseListItems(ul, type) {
      var items = [];
      Array.from(ul.children).forEach(function (li) {
        if (li.tagName !== 'LI') return;
        var richText = [];
        var nestedBlocks = [];
        li.childNodes.forEach(function (child) {
          if (child.nodeType === 3) {
            var t = child.textContent;
            if (t.trim()) richText.push({ type: 'text', text: { content: t } });
          } else if (child.nodeType === 1) {
            var ct = child.tagName.toLowerCase();
            if (ct === 'ul' || ct === 'ol') {
              nestedBlocks = nestedBlocks.concat(parseListItems(child, ct === 'ol' ? 'numbered_list_item' : 'bulleted_list_item'));
            } else {
              richText = richText.concat(parseRichText(child));
            }
          }
        });
        if (richText.length === 0) richText.push({ type: 'text', text: { content: ' ' } });
        var block = { type: type };
        block[type] = { rich_text: richText };
        if (nestedBlocks.length > 0) block[type].children = nestedBlocks;
        items.push(block);
      });
      return items;
    }

    function walkElements(parent) {
      Array.from(parent.children).forEach(function (el) {
        var tag = el.tagName.toLowerCase();

        if (/^h([1-6])$/.test(tag)) {
          var level = parseInt(RegExp.$1, 10);
          var hType = level <= 1 ? 'heading_1' : level <= 2 ? 'heading_2' : 'heading_3';
          var rt = parseRichText(el);
          if (rt.length === 0) rt.push({ type: 'text', text: { content: el.textContent || '' } });
          var block = { type: hType };
          block[hType] = { rich_text: rt };
          blocks.push(block);
          return;
        }

        if (tag === 'p') {
          var rt = parseRichText(el);
          if (rt.length === 0 && !el.textContent.trim()) return;
          if (rt.length === 0) rt.push({ type: 'text', text: { content: el.textContent || '' } });
          blocks.push({ type: 'paragraph', paragraph: { rich_text: rt } });
          return;
        }

        if (tag === 'ul' || tag === 'ol') {
          var type = tag === 'ol' ? 'numbered_list_item' : 'bulleted_list_item';
          blocks = blocks.concat(parseListItems(el, type));
          return;
        }

        if (tag === 'hr') {
          blocks.push({ type: 'divider', divider: {} });
          return;
        }

        if (tag === 'blockquote') {
          var rt = parseRichText(el);
          if (rt.length === 0) rt.push({ type: 'text', text: { content: el.textContent || '' } });
          blocks.push({ type: 'quote', quote: { rich_text: rt } });
          return;
        }

        // div/section/article → recurse
        if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'header' || tag === 'footer') {
          walkElements(el);
          return;
        }

        // fallback: treat as paragraph if has text
        if (el.textContent && el.textContent.trim()) {
          blocks.push({ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: el.textContent } }] } });
        }
      });
    }

    walkElements(body);
    return blocks;
  },

  // ── 导图 JSON → Notion blocks ─────────────────────────
  mindmapToNotionBlocks: function (node) {
    var blocks = [];

    // 根节点 → heading_2
    blocks.push({
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: node.label || '' } }]
      }
    });

    function buildChildren(children) {
      var items = [];
      if (!children) return items;
      children.forEach(function (child) {
        var label = child.label || '';
        if (child.time) label += ' [' + child.time + ']';
        var block = {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: label } }]
          }
        };
        if (child.children && child.children.length > 0) {
          block.bulleted_list_item.children = buildChildren(child.children);
        }
        items.push(block);
      });
      return items;
    }

    if (node.children && node.children.length > 0) {
      blocks = blocks.concat(buildChildren(node.children));
    }

    return blocks;
  },

  // ── 发送到 Notion ─────────────────────────────────────
  sendToNotion: function (title, blocks, callback) {
    YTX.Export.getNotionSettings().then(function (settings) {
      if (!settings.token) {
        callback({ error: '请先在扩展设置中配置 Notion Integration Token' });
        return;
      }
      if (!settings.pageId) {
        callback({ error: '请先在扩展设置中配置 Notion 父级页面' });
        return;
      }
      YTX.sendToBg({
        type: 'EXPORT_NOTION',
        token: settings.token,
        pageId: settings.pageId,
        title: title,
        blocks: blocks
      }).then(function (resp) {
        callback(resp);
      }).catch(function (err) {
        callback({ error: err.message });
      });
    });
  },

  // ── 按钮状态闪烁 ─────────────────────────────────────
  flashButton: function (btn, text, ms) {
    var original = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(function () {
      btn.textContent = original;
      btn.disabled = false;
    }, ms || 1500);
  },

  // ── 飞书预留 ─────────────────────────────────────────
  sendToFeishu: function (title, blocks, callback) {
    callback({ error: '飞书导出功能暂未实现，敬请期待' });
  }
};
