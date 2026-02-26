# CLAUDE.md

## Project Overview

**YouTubeX** — 一个自用的 Chrome 扩展（Manifest V3），使用 Claude API 在 YouTube 页面内直接总结视频内容。

## Architecture

**技术栈**: 原生 HTML/CSS/JS，无框架依赖

**文件结构**:
- `manifest.json` — MV3 扩展配置
- `background.js` — Service Worker，调用 Claude API（流式响应）
- `content.js` — 内容脚本，注入 YouTube 页面，提取字幕，渲染面板
- `content.css` — 面板样式，适配 YouTube 亮/暗色主题
- `popup.html/js/css` — 弹出设置页（API Key、模型选择、自定义 Prompt）
- `icons/` — 扩展图标（16/48/128px）

**核心流程**:
1. content.js 监听 `yt-navigate-finish`，在右侧栏 `#secondary` 注入面板
2. 点击「总结视频」→ 通过 YouTube timedtext API 获取字幕
3. 发送字幕到 background.js → 调用 Claude Messages API（streaming）
4. 流式返回 → content.js 实时渲染 Markdown，时间戳可点击跳转

**关键细节**:
- 字幕获取: 从 `ytInitialPlayerResponse` 提取 captionTracks，请求 json3 格式
- 流式传输: background.js 通过 `chrome.tabs.sendMessage` 分段转发
- 时间戳: 解析 `[MM:SS]` 格式，点击调用 `video.currentTime`
- YouTube SPA: 监听 `yt-navigate-finish` 处理页面导航
