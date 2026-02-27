# AATube

Chrome 扩展（Manifest V3）— 在 YouTube 页面内用 AI 学习视频内容。支持 Claude / OpenAI / Gemini 三家模型，无字幕视频自动切换 Gemini 视频分析。

## 功能

| 标签 | 说明 |
|------|------|
| 总结 | 流式生成带时间戳的结构化摘要 |
| 笔记 | 生成精美 HTML 笔记，支持下载、新标签打开、导出 Notion |
| 问答 | 基于视频内容的多轮对话，支持连续追问 |
| 卡片 | 提取关键概念，生成可翻转知识闪卡 |
| 导图 | 生成交互式思维导图（SVG），支持缩放 / 折叠 / 导出 |
| 学英语 | 从英文字幕中提取高级词汇短语，附音标、释义、例句 |

其他：
- **时间戳跳转** — 点击 `[MM:SS]` 直接跳到视频对应位置
- **可调分栏** — 拖拽分割条自由调整视频区与侧栏宽度
- **无字幕自动降级** — 视频无字幕时自动调用 Gemini 分析视频内容，生成虚拟字幕，后续所有功能基于此运行，且自动切换 Gemini 作为 AI 提供商
- **历史缓存** — 已生成的结果缓存到 IndexedDB，再次打开同一视频自动恢复
- **Notion 导出** — 笔记和导图可一键导出到 Notion 页面
- **全部生成** — 一键并行生成所有内容（总结 + 笔记 + 卡片 + 导图 + 词汇）
- **亮/暗色适配** — 自动跟随 YouTube 主题

## 安装

1. 克隆本仓库
2. 打开 `chrome://extensions/`，开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择项目文件夹
4. 点击扩展图标，配置 API Key

## 设置

点击扩展图标打开设置页，顶部切换 AI 提供商：

| 提供商 | 可选模型 | 获取 Key |
|--------|----------|----------|
| Claude | Sonnet 4.6（推荐）/ Haiku 4.5 / Opus 4.6 | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| OpenAI | GPT-5 mini（推荐）/ GPT-5 nano / GPT-5.2 | [OpenAI Platform](https://platform.openai.com/api-keys) |
| Gemini | Gemini 3 Flash（推荐）/ Gemini 3.1 Pro / Gemini 2.5 Flash | [AI Studio](https://aistudio.google.com/apikey) |

> 建议同时配置 Gemini Key：当视频无字幕时，扩展会自动使用 Gemini 分析视频画面生成内容。

其他设置项：
- **自定义 Prompt** — 可修改总结提示词，`{transcript}` 为字幕插入位置
- **Notion 导出** — 填入 Integration Token 和父级页面 ID 即可使用导出功能

## 技术要点

- **纯原生** — HTML/CSS/JS，零依赖，无构建步骤
- **模块化** — `src/` 下按功能拆分为 10 个独立文件，共享 `YTX` 全局命名空间
- **字幕获取** — `chrome.scripting.executeScript` 在 MAIN world 抓取 YouTube 字幕 DOM
- **流式渲染** — SSE streaming → `chrome.tabs.sendMessage` 逐块转发 → 实时渲染 Markdown
- **笔记隔离** — `srcdoc` iframe 渲染 HTML，样式与 YouTube 互不干扰
- **导图引擎** — 纯 SVG 实现，支持自动布局、缩放平移、节点折叠展开
- **SPA 适配** — 监听 `yt-navigate-finish` 处理 YouTube 页面导航

## 许可

仅供个人使用。
