// background.js — Service Worker: 字幕获取 + 多模型 API 流式调用

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
  if (message.type === 'GENERATE_VOCAB') {
    handleSummarize(message, sender.tab.id, 'VOCAB');
    sendResponse({ started: true });
    return true;
  }
  if (message.type === 'CHAT_ASK') {
    handleChat(message, sender.tab.id);
    sendResponse({ started: true });
    return true;
  }
  if (message.type === 'TRANSCRIBE_VIDEO') {
    handleTranscribeVideo(message).then(sendResponse);
    return true;
  }
  if (message.type === 'EXPORT_NOTION') {
    handleExportNotion(message).then(sendResponse);
    return true;
  }
  return false;
});

// ── 字幕获取 ────────────────────────────────────────────
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
    console.log('[AATube]', msg);
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

        const moreButtons = document.querySelectorAll(
          'ytd-watch-metadata ytd-menu-renderer button, ' +
          'ytd-watch-metadata ytd-menu-renderer yt-button-shape button, ' +
          '#actions ytd-menu-renderer button, ' +
          '#menu-container ytd-menu-renderer button'
        );

        let moreBtn = null;
        for (const btn of moreButtons) {
          const label = btn.getAttribute('aria-label') || '';
          if (label.includes('更多') || label.includes('More') || label.includes('操作')) {
            moreBtn = btn;
            break;
          }
        }
        if (!moreBtn && moreButtons.length > 0) {
          moreBtn = moreButtons[moreButtons.length - 1];
        }

        if (moreBtn) {
          addLog('点击 "..." 菜单按钮');
          moreBtn.click();
          await sleep(500);

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

          if (!opened) {
            document.body.click();
            await sleep(200);
          }
        } else {
          addLog('"..." 按钮未找到');
        }
      }

      // === 步骤4: 暴力搜索 ===
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

    // 优先用 ytd-transcript-segment-renderer，找不到再用 .segment，避免重复匹配
    let segmentElements = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
    if (segmentElements.length === 0) {
      segmentElements = transcriptPanel.querySelectorAll('ytd-transcript-segment-list-renderer .segment');
    }

    addLog('找到 segment 元素: ' + segmentElements.length);

    if (segmentElements.length === 0) {
      await sleep(1500);
      const retryElements = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
      addLog('重试找到 segment: ' + retryElements.length);

      if (retryElements.length === 0) {
        const allText = transcriptPanel.innerText;
        addLog('面板文本长度: ' + allText.length + ' 前200字: ' + allText.substring(0, 200));

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
              currentTime = -1;
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

// ── 总结/生成路由 ────────────────────────────────────────
async function handleSummarize(message, tabId, mode = 'SUMMARY') {
  const { transcript, prompt, model, activeKey } = message;
  const provider = message.provider || 'claude';
  const key = activeKey || message.apiKey;
  const PREFIX = mode;

  if (!key) {
    safeSend(tabId, { type: `${PREFIX}_ERROR`, error: '请先在扩展设置中填入 API Key' });
    return;
  }

  const fullPrompt = prompt.replace('{transcript}', transcript);
  const messages = [{ role: 'user', content: fullPrompt }];

  await callProvider(provider, { key, model, messages, maxTokens: 8096, tabId, PREFIX });
}

// ── 多轮对话路由 ─────────────────────────────────────────
async function handleChat(message, tabId) {
  const { transcript, messages, model, activeKey } = message;
  const provider = message.provider || 'claude';
  const key = activeKey || message.apiKey;
  const PREFIX = 'CHAT';

  if (!key) {
    safeSend(tabId, { type: 'CHAT_ERROR', error: '请先在扩展设置中填入 API Key' });
    return;
  }

  const systemPrompt = `你是一个视频内容助教。以下是用户正在观看的 YouTube 视频的字幕内容，请基于这些内容回答用户的问题。
回答要求：
1. 准确引用视频内容，标注时间戳 [MM:SS]
2. 如果问题超出视频内容范围，诚实告知
3. 回答简洁清晰，使用中文

字幕内容：
${transcript}`;

  await callProvider(provider, { key, model, systemPrompt, messages, maxTokens: 4096, tabId, PREFIX });
}

// ── 校验 model 是否属于当前 provider，不匹配则清空让默认值生效 ──
const MODEL_PREFIX = { claude: 'claude-', openai: 'gpt-', gemini: 'gemini-' };
function sanitizeModel(provider, model) {
  if (!model) return '';
  const prefix = MODEL_PREFIX[provider];
  return (prefix && model.startsWith(prefix)) ? model : '';
}

// ── Service Worker 保活（防止视频处理期间被终止）──────────
function startKeepalive() {
  const id = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  return () => clearInterval(id);
}

// ── 视频转录（一次性生成虚拟字幕）─────────────────────────
async function handleTranscribeVideo(message) {
  const { videoUrl, activeKey } = message;
  const key = activeKey;
  const model = 'gemini-2.5-flash';

  if (!key) return { error: '请先在扩展设置中填入 Gemini API Key' };

  const stopKeepalive = startKeepalive();
  try {
    console.log('[AATube] 视频转录开始:', videoUrl);

    const body = {
      contents: [{
        parts: [
          { text: '请详细描述这个视频的完整内容。按时间顺序逐段描述，标注时间戳 [MM:SS]。输出纯文本，不要用 Markdown 格式。要求：\n1. 尽可能详细还原视频中说的每一个要点\n2. 保留专业术语和关键数据\n3. 每段用时间戳开头，如 [00:00] [01:30]\n4. 必须使用简体中文描述，不要使用繁体中文' },
          { file_data: { file_uri: videoUrl } }
        ]
      }],
      generationConfig: { maxOutputTokens: 8096 }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('[AATube] 视频转录失败:', response.status, errText);
      return { error: classifyApiError(response.status, errText, 'gemini') };
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      const reason = result.candidates?.[0]?.finishReason || result.promptFeedback?.blockReason || '未知原因';
      return { error: '视频转录无结果: ' + reason };
    }

    console.log('[AATube] 视频转录完成，长度:', text.length);
    return { text };
  } catch (err) {
    console.error('[AATube] 视频转录异常:', err);
    return { error: '视频分析失败: ' + (err.message || '') };
  } finally {
    stopKeepalive();
  }
}

// ── API 错误分类提示 ─────────────────────────────────────
function classifyApiError(status, body, provider) {
  const lower = body.toLowerCase();
  const providerName = { claude: 'Claude', openai: 'OpenAI', gemini: 'Gemini' }[provider] || provider;

  // 401 / 403 — 认证失败
  if (status === 401 || status === 403 || lower.includes('invalid_api_key') || lower.includes('invalid api key') || lower.includes('unauthorized') || lower.includes('api_key_invalid')) {
    return `${providerName} API Key 无效或已过期，请在扩展设置中检查 Key 是否正确`;
  }

  // 429 — 限流 / 配额用尽
  if (status === 429 || lower.includes('rate_limit') || lower.includes('rate limit') || lower.includes('quota')) {
    if (lower.includes('quota') || lower.includes('billing') || lower.includes('exceeded') || lower.includes('insufficient')) {
      return `${providerName} 账户余额不足或配额已用完，请前往 ${providerName} 控制台充值`;
    }
    return `${providerName} 请求太频繁，请稍等几秒后重试`;
  }

  // 400 — 请求错误
  if (status === 400) {
    if (lower.includes('context_length') || lower.includes('max_tokens') || lower.includes('token') || lower.includes('too long') || lower.includes('too large')) {
      return '视频内容太长，超出模型上下文限制。可尝试换一个支持更长上下文的模型';
    }
    if (lower.includes('model')) {
      return `所选模型不可用，请在扩展设置中更换 ${providerName} 模型`;
    }
    return `请求参数错误 (${status}): ${body.substring(0, 200)}`;
  }

  // 404 — 模型不存在
  if (status === 404) {
    return `所选模型不存在或未开通权限，请在扩展设置中更换 ${providerName} 模型`;
  }

  // 500+ — 服务端错误
  if (status >= 500) {
    return `${providerName} 服务暂时不可用 (${status})，请稍后重试`;
  }

  // 其他
  return `${providerName} API 错误 (${status}): ${body.substring(0, 200)}`;
}

// ── 统一调用入口 ─────────────────────────────────────────
async function callProvider(provider, opts) {
  const { key, systemPrompt, messages, maxTokens, tabId, PREFIX } = opts;
  const model = sanitizeModel(provider, opts.model);

  // 计算实际使用的模型 ID
  const DEFAULT_MODEL = { claude: 'claude-sonnet-4-6', openai: 'gpt-4o-mini', gemini: 'gemini-2.5-flash' };
  const actualModel = model || DEFAULT_MODEL[provider] || DEFAULT_MODEL.claude;

  // 通知 content.js 当前使用的模型
  safeSend(tabId, { type: `${PREFIX}_MODEL`, provider, model: actualModel });

  try {
    let response;

    if (provider === 'openai') {
      const apiMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: actualModel,
          messages: apiMessages,
          max_completion_tokens: maxTokens,
          stream: true,
        }),
      });
    } else if (provider === 'gemini') {
      const modelId = actualModel;
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
      if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
    } else {
      // Claude (默认)
      const body = {
        model: actualModel,
        max_tokens: maxTokens,
        stream: true,
        messages,
      };
      if (systemPrompt) body.system = systemPrompt;
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      const friendlyError = classifyApiError(response.status, errText, provider);
      safeSend(tabId, { type: `${PREFIX}_ERROR`, error: friendlyError });
      return;
    }

    await readSSEStream(response, tabId, PREFIX, provider);
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::')) {
      safeSend(tabId, { type: `${PREFIX}_ERROR`, error: '网络连接失败，请检查网络后重试' });
    } else {
      safeSend(tabId, { type: `${PREFIX}_ERROR`, error: `请求失败: ${msg}` });
    }
  }
}

// ── 统一 SSE 流式读取 ───────────────────────────────────
async function readSSEStream(response, tabId, PREFIX, provider) {
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
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        if (!doneSent) {
          safeSend(tabId, { type: `${PREFIX}_DONE` });
          doneSent = true;
        }
        continue;
      }
      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        let text;

        if (provider === 'openai') {
          text = parsed.choices?.[0]?.delta?.content;
          if (parsed.choices?.[0]?.finish_reason === 'stop' && !doneSent) {
            safeSend(tabId, { type: `${PREFIX}_DONE` });
            doneSent = true;
          }
        } else if (provider === 'gemini') {
          text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        } else {
          // Claude
          if (parsed.type === 'content_block_delta') text = parsed.delta?.text;
          if (parsed.type === 'message_stop' && !doneSent) {
            safeSend(tabId, { type: `${PREFIX}_DONE` });
            doneSent = true;
          }
        }

        if (text) {
          safeSend(tabId, { type: `${PREFIX}_CHUNK`, text });
        }
      } catch {}
    }
  }

  if (!doneSent) {
    safeSend(tabId, { type: `${PREFIX}_DONE` });
  }
}

// ── Notion 导出 ──────────────────────────────────────
async function handleExportNotion(message) {
  const { token, pageId, title, blocks } = message;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };

  try {
    // 首批最多 100 块
    const firstBatch = blocks.slice(0, 100);
    const resp = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        parent: { page_id: pageId },
        properties: {
          title: { title: [{ text: { content: title } }] }
        },
        children: firstBatch,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { error: `Notion API 错误 (${resp.status}): ${err}` };
    }

    const page = await resp.json();
    const newPageId = page.id;

    // 超出 100 块，分批追加
    if (blocks.length > 100) {
      for (let i = 100; i < blocks.length; i += 100) {
        const batch = blocks.slice(i, i + 100);
        const appendResp = await fetch(`https://api.notion.com/v1/blocks/${newPageId}/children`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ children: batch }),
        });
        if (!appendResp.ok) {
          const err = await appendResp.text();
          return { error: `追加内容失败 (${appendResp.status}): ${err}` };
        }
      }
    }

    return { success: true, url: page.url };
  } catch (err) {
    return { error: `导出失败: ${err.message}` };
  }
}
