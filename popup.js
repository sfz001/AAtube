const DEFAULT_PROMPT = `请对以下 YouTube 视频字幕内容进行总结，使用中文回答。要求：
1. 先给出简洁的整体摘要（3-5句话）
2. 然后按内容分段，每段标注对应的时间戳 [MM:SS]，给出该段的要点
3. 总结要简洁有条理，突出关键信息

格式要求：
## 摘要
（整体概述）

## 详细内容
[00:00] **段落标题** - 要点描述
[02:30] **段落标题** - 要点描述

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
      { value: 'gpt-5.2', label: 'GPT-5.2 — 最强' },
      { value: 'gpt-5-mini', label: 'GPT-5 mini — 推荐' },
      { value: 'gpt-5-nano', label: 'GPT-5 nano — 最快' },
    ]
  },
  gemini: {
    label: 'Gemini API Key',
    keyField: 'geminiKey',
    placeholder: 'AIza...',
    helpUrl: 'https://aistudio.google.com/apikey',
    models: [
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash — 推荐' },
      { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro — 最强' },
    ]
  }
};

const $ = (sel) => document.querySelector(sel);

let currentProvider = 'claude';
// Cache keys in memory so switching tabs doesn't lose unsaved input
let keyCache = { apiKey: '', openaiKey: '', geminiKey: '' };

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['provider', 'apiKey', 'openaiKey', 'geminiKey', 'model', 'prompt'], (data) => {
    keyCache.apiKey = data.apiKey || '';
    keyCache.openaiKey = data.openaiKey || '';
    keyCache.geminiKey = data.geminiKey || '';

    currentProvider = data.provider || 'claude';
    switchProvider(currentProvider, data.model);

    $('#prompt').value = data.prompt || DEFAULT_PROMPT;
  });

  // Provider tab clicks
  document.querySelectorAll('.provider-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Save current key input to cache before switching
      const cfg = PROVIDERS[currentProvider];
      keyCache[cfg.keyField] = $('#currentKey').value.trim();

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

    // Save all keys + current provider + model
    chrome.storage.sync.set({
      provider: currentProvider,
      apiKey: keyCache.apiKey,
      openaiKey: keyCache.openaiKey,
      geminiKey: keyCache.geminiKey,
      model,
      prompt,
    }, () => {
      showStatus('设置已保存 ✓', 'success');
    });
  });
});

function switchProvider(id, savedModel) {
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

  // Restore saved model if it belongs to this provider
  if (savedModel && cfg.models.some(m => m.value === savedModel)) {
    select.value = savedModel;
  }
}

function showStatus(text, type) {
  const el = $('#status');
  el.textContent = text;
  el.className = 'status ' + type;
  setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 2000);
}
