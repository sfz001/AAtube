const DEFAULT_PROMPT = `请对以下 YouTube 视频字幕内容进行总结。

## 输出格式：

### 摘要
3-5句话概述视频主要内容

### 关键要点
提取 3-5 个最重要的收获，每个一句话

### 详细内容
按内容分段，标注时间戳 [MM:SS]：
[00:00] 段落标题 - 要点描述
[02:30] 段落标题 - 要点描述

## 要求：
- 语言简洁，避免废话
- 关键要点不要跟摘要重复，要有信息增量
- 时间戳准确对应内容变化点
- 时间戳只用单个起始时间点格式 [0:00]，不要用时间范围 [0:00-0:32]

---
字幕内容：
{transcript}`;

const PROVIDERS = {
  claude: {
    label: 'Claude API Key',
    keyField: 'apiKey',
    placeholder: 'sk-ant-api03-...',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — 推荐' },
      { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — 更快' },
      { value: 'claude-opus-4-6', label: 'Opus 4.6 — 最强' },
    ]
  },
  openai: {
    label: 'OpenAI API Key',
    keyField: 'openaiKey',
    placeholder: 'sk-...',
    helpUrl: 'https://platform.openai.com/api-keys',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o mini — 推荐' },
      { value: 'gpt-4o', label: 'GPT-4o — 最强' },
    ]
  },
  gemini: {
    label: 'Gemini API Key',
    keyField: 'geminiKey',
    placeholder: 'AIza...',
    helpUrl: 'https://aistudio.google.com/apikey',
    models: [
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — 推荐' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash — 更快' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — 最强' },
    ]
  }
};

const $ = (sel) => document.querySelector(sel);

let currentProvider = 'claude';
// Cache keys and model selection per provider so switching tabs doesn't lose unsaved input
let keyCache = { apiKey: '', openaiKey: '', geminiKey: '' };
let modelCache = { claude: '', openai: '', gemini: '' };

function parseNotionPageId(input) {
  if (!input) return '';
  input = input.trim();
  // Raw 32-char hex ID (with or without dashes)
  var rawId = input.replace(/-/g, '');
  if (/^[0-9a-f]{32}$/i.test(rawId)) return rawId;
  // Extract from Notion URL: last 32 hex chars before optional query
  var match = input.match(/([0-9a-f]{32})/i);
  if (match) return match[1];
  return input;
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['provider', 'apiKey', 'openaiKey', 'geminiKey', 'claudeModel', 'openaiModel', 'geminiModel', 'model', 'prompt', 'notionToken', 'notionPageId'], (data) => {
    keyCache.apiKey = data.apiKey || '';
    keyCache.openaiKey = data.openaiKey || '';
    keyCache.geminiKey = data.geminiKey || '';

    // 加载各 provider 独立的 model，向下兼容旧的全局 model 字段
    modelCache.claude = data.claudeModel || '';
    modelCache.openai = data.openaiModel || '';
    modelCache.gemini = data.geminiModel || '';

    currentProvider = data.provider || 'claude';
    // 向下兼容：旧版只存了全局 model，作为当前 provider 的 fallback
    if (!modelCache[currentProvider] && data.model) {
      modelCache[currentProvider] = data.model;
    }
    switchProvider(currentProvider);

    $('#prompt').value = data.prompt || DEFAULT_PROMPT;

    // Notion settings
    $('#notionToken').value = data.notionToken || '';
    $('#notionPageId').value = data.notionPageId || '';
  });

  // Provider tab clicks
  document.querySelectorAll('.provider-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Save current key and model to cache before switching
      const cfg = PROVIDERS[currentProvider];
      keyCache[cfg.keyField] = $('#currentKey').value.trim();
      modelCache[currentProvider] = $('#model').value;

      switchProvider(tab.dataset.provider);
    });
  });

  $('#resetPrompt').addEventListener('click', () => {
    $('#prompt').value = DEFAULT_PROMPT;
    showStatus('已恢复默认 Prompt', 'success');
  });

  $('#toggleKey').addEventListener('click', () => {
    const input = $('#currentKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('#toggleNotionToken').addEventListener('click', () => {
    const input = $('#notionToken');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('#save').addEventListener('click', () => {
    const cfg = PROVIDERS[currentProvider];
    const key = $('#currentKey').value.trim();
    const model = $('#model').value;
    const prompt = $('#prompt').value.trim();

    if (!key) {
      showStatus('请输入 API Key', 'error');
      return;
    }

    if (!prompt.includes('{transcript}')) {
      showStatus('Prompt 中需要包含 {transcript}', 'error');
      return;
    }

    // Update cache
    keyCache[cfg.keyField] = key;
    modelCache[currentProvider] = model;

    // Notion settings
    const notionToken = $('#notionToken').value.trim();
    const notionPageId = parseNotionPageId($('#notionPageId').value);

    // Save all keys + per-provider models, remove legacy global 'model' field
    chrome.storage.sync.remove('model');
    chrome.storage.sync.set({
      provider: currentProvider,
      apiKey: keyCache.apiKey,
      openaiKey: keyCache.openaiKey,
      geminiKey: keyCache.geminiKey,
      claudeModel: modelCache.claude,
      openaiModel: modelCache.openai,
      geminiModel: modelCache.gemini,
      prompt,
      notionToken,
      notionPageId,
    }, () => {
      showStatus('设置已保存 ✓', 'success');
    });
  });
});

function switchProvider(id) {
  currentProvider = id;
  const cfg = PROVIDERS[id];

  // Update tab active state
  document.querySelectorAll('.provider-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.provider === id);
  });

  // Update key label, placeholder, help link
  $('#keyLabel').textContent = cfg.label;
  $('#currentKey').placeholder = cfg.placeholder;
  $('#currentKey').value = keyCache[cfg.keyField] || '';
  $('#currentKey').type = 'password';
  $('#helpLink').href = cfg.helpUrl;

  // Populate model select
  const select = $('#model');
  select.innerHTML = '';
  cfg.models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    select.appendChild(opt);
  });

  // Restore this provider's cached model selection
  if (modelCache[id] && cfg.models.some(m => m.value === modelCache[id])) {
    select.value = modelCache[id];
  }
}

function showStatus(text, type) {
  const el = $('#status');
  el.textContent = text;
  el.className = 'status ' + type;
  setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 2000);
}
