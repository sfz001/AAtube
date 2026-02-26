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

const $ = (sel) => document.querySelector(sel);

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['apiKey', 'model', 'prompt'], (data) => {
    if (data.apiKey) $('#apiKey').value = data.apiKey;
    if (data.model) $('#model').value = data.model;
    $('#prompt').value = data.prompt || DEFAULT_PROMPT;
  });

  $('#resetPrompt').addEventListener('click', () => {
    $('#prompt').value = DEFAULT_PROMPT;
    showStatus('已恢复默认 Prompt', 'success');
  });

  $('#toggleKey').addEventListener('click', () => {
    const input = $('#apiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('#save').addEventListener('click', () => {
    const apiKey = $('#apiKey').value.trim();
    const model = $('#model').value;
    const prompt = $('#prompt').value.trim();

    if (!apiKey) {
      showStatus('请输入 API Key', 'error');
      return;
    }

    if (!prompt.includes('{transcript}')) {
      showStatus('Prompt 中需要包含 {transcript}', 'error');
      return;
    }

    chrome.storage.sync.set({ apiKey, model, prompt }, () => {
      showStatus('设置已保存 ✓', 'success');
    });
  });
});

function showStatus(text, type) {
  const el = $('#status');
  el.textContent = text;
  el.className = 'status ' + type;
  setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 2000);
}
