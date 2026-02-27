# AATube

Chrome 扩展（Manifest V3）— 用 Claude AI 在 YouTube 页面内直接学习视频内容。

## 功能

- **AI 总结** — 一键提取字幕，流式生成带时间戳的结构化摘要
- **精美笔记** — 生成 HTML 笔记页面，面板内渲染，支持复制或新标签打开
- **互动问答** — 基于视频内容的多轮对话 Q&A
- **知识卡片** — 自动提取关键概念，生成可翻转闪卡（正面问题 / 背面答案）
- **时间戳跳转** — 点击 `[MM:SS]` 直接跳转到视频对应位置
- **可调分栏** — 拖拽分割条自由调整视频区与侧栏宽度
- **亮/暗色适配** — 自动跟随 YouTube 主题

## 安装

1. 克隆本仓库
2. 打开 `chrome://extensions/`，开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择项目文件夹
4. 点击扩展图标，填入 [Claude API Key](https://console.anthropic.com/settings/keys)

## 使用

打开任意 YouTube 视频，右侧栏顶部出现 AATube 面板，包含四个标签页：

| 标签 | 操作 |
|------|------|
| 总结 | 点击「总结视频」，流式生成结构化摘要 |
| 笔记 | 点击「生成笔记」，渲染精美 HTML 页面 |
| 问答 | 输入问题，AI 实时回答，支持连续追问 |
| 卡片 | 点击「生成卡片」，生成可翻转知识闪卡 |

拖拽视频与侧栏之间的竖条可调整分栏比例。

## 设置

| 选项 | 说明 |
|------|------|
| Claude API Key | 必填，从 [Anthropic Console](https://console.anthropic.com/settings/keys) 获取 |
| 模型 | Sonnet 4.6（推荐）/ Haiku 4.5（更快）/ Opus 4.6（最强） |
| 自定义 Prompt | 可修改总结提示词，`{transcript}` 为字幕插入位置 |

## 文件结构

```
manifest.json      # MV3 扩展配置
background.js      # Service Worker — Claude API 流式调用
content.js         # 内容脚本 — 面板注入、交互逻辑
content.css        # 面板样式 — 亮/暗色主题
popup.html/js/css  # 设置弹出页
icons/             # 扩展图标 (16/48/128px)
```

## 技术要点

- **纯原生** — HTML/CSS/JS，零依赖
- **字幕获取** — `chrome.scripting.executeScript` 在 MAIN world 读取 YouTube 字幕 DOM
- **流式渲染** — Claude streaming API → `chrome.tabs.sendMessage` 逐块转发 → 实时渲染
- **笔记隔离** — `srcdoc` iframe 渲染 HTML，样式与 YouTube 互不干扰
- **卡片翻转** — CSS `perspective` + `rotateY` 3D 翻转效果
- **分栏拖拽** — `#primary` / `#secondary` 间注入拖拽条，动态调整 flex 宽度并同步缩放播放器
- **SPA 适配** — 监听 `yt-navigate-finish` 处理 YouTube 页面导航

## 许可

仅供个人使用。
