// background.js — Service Worker: 字幕获取 + Claude API 流式调用

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_TRANSCRIPT') {
    handleFetchTranscript(message.videoId, sender.tab.id).then(sendResponse);
    return true;
  }
  if (message.type === 'SUMMARIZE') {
    handleSummarize(message, sender.tab.id, 'SUMMARY');
    sendResponse({ started: true });
    return true;
  }
  if (message.type === 'GENERATE_HTML') {
    handleSummarize(message, sender.tab.id, 'HTML');
    sendResponse({ started: true });
    return true;
  }
  if (message.type === 'GENERATE_CARDS') {
    handleSummarize(message, sender.tab.id, 'CARDS');
    sendResponse({ started: true });
    return true;
  }
  if (message.type === 'GENERATE_MINDMAP') {
    handleSummarize(message, sender.tab.id, 'MINDMAP');
    sendResponse({ started: true });
    return true;
  }
  if (message.type === 'CHAT_ASK') {
    handleChat(message, sender.tab.id);
    sendResponse({ started: true });
    return true;
  }
  return false;
});

// ── 字幕获取 ────────────────────────────────────────────
// 方案：打开 YouTube 自带的字幕面板，从 DOM 中读取字幕内容
async function handleFetchTranscript(videoId, tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: scrapeTranscriptFromDOM,
      args: [videoId],
    });

    const result = results?.[0]?.result;
    if (!result) return { error: '无法执行页面脚本' };
    if (result.error) return { error: result.error };
    if (result.segments?.length > 0) return { segments: result.segments };
    return { error: '字幕内容为空' };
  } catch (err) {
    return { error: `获取字幕失败: ${err.message}` };
  }
}

// ── 在页面 MAIN world 中执行：打开字幕面板并抓取 DOM ──────
async function scrapeTranscriptFromDOM(videoId) {
  const log = [];
  function addLog(msg) {
    log.push(msg);
    console.log('[YouTubeX]', msg);
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  try {
    // 检查字幕面板是否已经打开
    let transcriptPanel = document.querySelector('ytd-transcript-renderer');
    let wasAlreadyOpen = !!transcriptPanel;

    if (!transcriptPanel) {
      addLog('字幕面板未打开，尝试打开...');
      let opened = false;

      // === 步骤1: 展开视频描述区 ===
      const expandSelectors = [
        'tp-yt-paper-button#expand',
        '#expand',
        '#description-inline-expander #expand',
        'ytd-text-inline-expander #expand',
      ];
      for (const sel of expandSelectors) {
        const btn = document.querySelector(sel);
        if (btn) {
          addLog('展开描述区: ' + sel);
          btn.click();
          await sleep(600);
          break;
        }
      }

      // === 步骤2: 在描述区找 "显示转录稿" 按钮 ===
      // YouTube 的转录按钮在 ytd-video-description-transcript-section-renderer 内
      const transcriptSection = document.querySelector('ytd-video-description-transcript-section-renderer');
      if (transcriptSection) {
        const btn = transcriptSection.querySelector('button')
          || transcriptSection.querySelector('a')
          || transcriptSection.querySelector('[role="button"]');
        if (btn) {
          addLog('找到描述区转录按钮');
          btn.click();
          opened = true;
        }
      }

      // === 步骤3: 通过 "..." 菜单打开 ===
      if (!opened) {
        addLog('尝试通过 "..." 菜单...');

        // 找到视频操作区的 "..." 按钮
        const moreButtons = document.querySelectorAll(
          'ytd-watch-metadata ytd-menu-renderer button, ' +
          'ytd-watch-metadata ytd-menu-renderer yt-button-shape button, ' +
          '#actions ytd-menu-renderer button, ' +
          '#menu-container ytd-menu-renderer button'
        );

        let moreBtn = null;
        for (const btn of moreButtons) {
          const label = btn.getAttribute('aria-label') || '';
          // "更多操作" (中文) / "More actions" (英文)
          if (label.includes('更多') || label.includes('More') || label.includes('操作')) {
            moreBtn = btn;
            break;
          }
        }
        // 如果没找到带 label 的，取菜单中最后一个按钮（通常是 "..."）
        if (!moreBtn && moreButtons.length > 0) {
          moreBtn = moreButtons[moreButtons.length - 1];
        }

        if (moreBtn) {
          addLog('点击 "..." 菜单按钮');
          moreBtn.click();
          await sleep(500);

          // 在弹出菜单中找 "显示转录稿" / "Show transcript"
          const menuItems = document.querySelectorAll(
            'tp-yt-paper-listbox ytd-menu-service-item-renderer, ' +
            'ytd-menu-popup-renderer ytd-menu-service-item-renderer, ' +
            'tp-yt-paper-listbox yt-formatted-string, ' +
            'ytd-menu-popup-renderer yt-formatted-string'
          );

          addLog('菜单项数量: ' + menuItems.length);

          for (const item of menuItems) {
            const text = item.textContent?.trim() || '';
            addLog('菜单项: "' + text + '"');
            if (text.includes('转录') || text.includes('Transcript') || text.includes('transcript')) {
              addLog('找到转录菜单项: ' + text);
              item.click();
              opened = true;
              break;
            }
          }

          // 如果没找到，关闭菜单
          if (!opened) {
            document.body.click(); // 关闭弹出菜单
            await sleep(200);
          }
        } else {
          addLog('"..." 按钮未找到');
        }
      }

      // === 步骤4: 暴力搜索页面上所有包含"转录"文字的可点击元素 ===
      if (!opened) {
        addLog('暴力搜索转录按钮...');
        const clickables = document.querySelectorAll('button, a, [role="button"], ytd-button-renderer, yt-formatted-string');
        for (const el of clickables) {
          const text = el.textContent?.trim() || '';
          if (text && text.length < 30 &&
            (text.includes('转录') || text.includes('Transcript') ||
             text.includes('transcript') || text === '显示转录稿' || text === 'Show transcript')) {
            addLog('暴力搜索找到: "' + text + '" tag=' + el.tagName);
            el.click();
            opened = true;
            break;
          }
        }
      }

      if (!opened) {
        return { error: '未找到字幕/转录按钮，该视频可能没有字幕\n' + log.join('\n') };
      }

      // 等待字幕面板加载
      for (let i = 0; i < 20; i++) {
        await sleep(300);
        transcriptPanel = document.querySelector('ytd-transcript-renderer');
        if (transcriptPanel) {
          addLog('字幕面板已加载 (等待' + ((i + 1) * 300) + 'ms)');
          break;
        }
      }

      if (!transcriptPanel) {
        return { error: '字幕面板加载超时\n' + log.join('\n') };
      }
    } else {
      addLog('字幕面板已打开');
    }

    // 等待内容渲染
    await sleep(500);

    // 从 DOM 中读取字幕段落
    const segments = [];

    // YouTube 字幕面板的 DOM 结构:
    // ytd-transcript-segment-renderer 包含每个字幕段
    //   .segment-timestamp 包含时间戳
    //   .segment-text 或 yt-formatted-string 包含文本
    const segmentElements = transcriptPanel.querySelectorAll(
      'ytd-transcript-segment-renderer, ytd-transcript-segment-list-renderer .segment'
    );

    addLog('找到 segment 元素: ' + segmentElements.length);

    if (segmentElements.length === 0) {
      // 可能还在加载，再等等
      await sleep(1500);
      const retryElements = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
      addLog('重试找到 segment: ' + retryElements.length);

      if (retryElements.length === 0) {
        // 尝试其他选择器
        const allText = transcriptPanel.innerText;
        addLog('面板文本长度: ' + allText.length + ' 前200字: ' + allText.substring(0, 200));

        // 如果有文本但没有标准结构，尝试解析纯文本
        if (allText.length > 50) {
          const lines = allText.split('\n').filter(l => l.trim());
          let currentTime = 0;
          for (const line of lines) {
            const timeMatch = line.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (timeMatch) {
              const h = timeMatch[3] ? parseInt(timeMatch[1]) : 0;
              const m = timeMatch[3] ? parseInt(timeMatch[2]) : parseInt(timeMatch[1]);
              const s = timeMatch[3] ? parseInt(timeMatch[3]) : parseInt(timeMatch[2]);
              currentTime = h * 3600 + m * 60 + s;
            } else if (line.trim() && currentTime >= 0) {
              segments.push({ start: currentTime, text: line.trim() });
              currentTime = -1; // 防止重复
            }
          }
          addLog('纯文本解析段数: ' + segments.length);
        }
      } else {
        for (const el of retryElements) {
          parseSegmentElement(el, segments);
        }
      }
    } else {
      for (const el of segmentElements) {
        parseSegmentElement(el, segments);
      }
    }

    function parseSegmentElement(el, segments) {
      const timeEl = el.querySelector('.segment-timestamp, [class*="timestamp"]');
      const textEl = el.querySelector('.segment-text, yt-formatted-string, [class*="text"]');
      const timeStr = timeEl?.textContent?.trim() || '';
      const text = textEl?.textContent?.trim() || el.textContent?.replace(timeStr, '')?.trim() || '';

      if (text) {
        let startSec = 0;
        const tm = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (tm) {
          const h = tm[3] ? parseInt(tm[1]) : 0;
          const m = tm[3] ? parseInt(tm[2]) : parseInt(tm[1]);
          const s = tm[3] ? parseInt(tm[3]) : parseInt(tm[2]);
          startSec = h * 3600 + m * 60 + s;
        }
        segments.push({ start: startSec, text });
      }
    }

    addLog('最终段数: ' + segments.length);

    // 如果面板是我们打开的，关闭它
    if (!wasAlreadyOpen) {
      const closeBtn = transcriptPanel.querySelector('button[aria-label="关闭"]')
        || transcriptPanel.closest('ytd-engagement-panel-section-list-renderer')?.querySelector('button[aria-label="Close"]')
        || transcriptPanel.closest('ytd-engagement-panel-section-list-renderer')?.querySelector('#visibility-button button');
      if (closeBtn) {
        closeBtn.click();
        addLog('已关闭字幕面板');
      }
    }

    if (segments.length === 0) {
      return { error: '无法从字幕面板读取内容\n' + log.join('\n') };
    }

    return { segments };

  } catch (e) {
    addLog('异常: ' + e.message);
    return { error: '获取字幕异常: ' + e.message + '\n' + log.join('\n') };
  }
}

// ── 安全发送消息（忽略 tab 不存在的错误）─────────────────
function safeSend(tabId, msg) {
  try {
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  } catch {}
}

// ── Claude API 流式调用 ────────────────────────────────
async function handleSummarize(message, tabId, mode = 'SUMMARY') {
  const { transcript, prompt, apiKey, model } = message;
  const PREFIX = mode; // 'SUMMARY' or 'HTML'

  if (!apiKey) {
    safeSend(tabId, { type: `${PREFIX}_ERROR`, error: '请先在扩展设置中填入 Claude API Key' });
    return;
  }

  const fullPrompt = prompt.replace('{transcript}', transcript);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: 8096,
        stream: true,
        messages: [{ role: 'user', content: fullPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      safeSend(tabId, { type: `${PREFIX}_ERROR`, error: `API 错误 (${response.status}): ${err}` });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let doneSent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            safeSend(tabId, { type: `${PREFIX}_CHUNK`, text: parsed.delta.text });
          }
          if (parsed.type === 'message_stop' && !doneSent) {
            safeSend(tabId, { type: `${PREFIX}_DONE` });
            doneSent = true;
          }
        } catch {}
      }
    }

    if (!doneSent) {
      safeSend(tabId, { type: `${PREFIX}_DONE` });
    }
  } catch (err) {
    safeSend(tabId, { type: `${PREFIX}_ERROR`, error: `请求失败: ${err.message}` });
  }
}

// ── 多轮对话（互动问答）────────────────────────────────
async function handleChat(message, tabId) {
  const { transcript, messages, apiKey, model } = message;

  if (!apiKey) {
    safeSend(tabId, { type: 'CHAT_ERROR', error: '请先在扩展设置中填入 Claude API Key' });
    return;
  }

  const systemPrompt = `你是一个视频内容助教。以下是用户正在观看的 YouTube 视频的字幕内容，请基于这些内容回答用户的问题。
回答要求：
1. 准确引用视频内容，标注时间戳 [MM:SS]
2. 如果问题超出视频内容范围，诚实告知
3. 回答简洁清晰，使用中文

字幕内容：
${transcript}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      safeSend(tabId, { type: 'CHAT_ERROR', error: `API 错误 (${response.status}): ${err}` });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let doneSent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            safeSend(tabId, { type: 'CHAT_CHUNK', text: parsed.delta.text });
          }
          if (parsed.type === 'message_stop' && !doneSent) {
            safeSend(tabId, { type: 'CHAT_DONE' });
            doneSent = true;
          }
        } catch {}
      }
    }

    if (!doneSent) {
      safeSend(tabId, { type: 'CHAT_DONE' });
    }
  } catch (err) {
    safeSend(tabId, { type: 'CHAT_ERROR', error: `请求失败: ${err.message}` });
  }
}
