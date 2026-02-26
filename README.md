# YouTubeX — YouTube 视频 AI 学习助手

一个自用的 Chrome 扩展（Manifest V3），使用 Claude API 在 YouTube 页面内提供多维度的视频学习工具。

## 功能

- **AI 视频总结** — 一键提取字幕，调用 Claude API 流式生成带时间戳的结构化摘要
- **精美笔记** — 将视频内容生成精美的 HTML 笔记页面，内嵌渲染在面板中，支持复制 HTML 或新标签打开
- **互动问答** — 基于视频内容的对话式 Q&A，像私人助教一样回答你对视频的任何疑问，支持多轮对话
- **知识卡片** — 自动提取视频中的关键概念，生成可翻转的闪卡（正面问题 / 背面答案），方便复习记忆
- **时间戳跳转** — 点击总结/笔记/卡片中的 `[MM:SS]` 时间戳，视频直接跳转到对应位置
- **可调分栏** — 视频区和侧栏之间有可拖拽的分割条，自由调整两侧宽度
- **字幕查看** — 可展开查看完整的视频字幕原文
- **亮/暗色适配** — 自动适配 YouTube 的亮色和暗色主题

## 截图预览

> 安装后打开任意 YouTube 视频，右侧栏顶部会出现 YouTubeX 面板。

## 安装

1. 下载或克隆本仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 打开右上角「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本项目文件夹
5. 点击扩展图标，在弹出设置页中填入你的 **Claude API Key**

## 使用

1. 打开任意 YouTube 视频页面
2. 右侧栏顶部出现 **YouTubeX** 面板
3. 面板提供四个标签页：
   - **总结** — 点击「总结视频」，流式生成结构化摘要
   - **笔记** — 点击「生成笔记」，生成精美 HTML 页面，面板内直接渲染
   - **问答** — 输入问题，AI 基于视频内容实时回答，支持连续追问
   - **卡片** — 点击「生成卡片」，自动提取知识点，点击卡片翻转查看答案
4. **调整分栏** — 拖拽视频和侧栏之间的竖条，调整两侧宽度比例
5. **时间戳跳转** — 点击任意 `[MM:SS]` 跳转到视频对应位置

## 设置

点击扩展图标打开设置页：

| 选项 | 说明 |
|------|------|
| Claude API Key | 必填，从 [Anthropic Console](https://console.anthropic.com/settings/keys) 获取 |
| 模型 | Sonnet 4.6（推荐）/ Haiku 4.5（更快）/ Opus 4.6（最强） |
| 自定义 Prompt | 可自定义总结的提示词，用 `{transcript}` 表示字幕插入位置 |

## 文件结构

```
YouTubeX/
├── manifest.json      # MV3 扩展配置
├── background.js      # Service Worker — 字幕获取 + Claude API 流式调用
├── content.js         # 内容脚本 — 面板注入、标签切换、分栏拖拽
├── content.css        # 面板样式 — 亮/暗色主题适配
├── popup.html         # 设置弹出页
├── popup.js           # 设置页逻辑
├── popup.css          # 设置页样式
└── icons/             # 扩展图标 (16/48/128px)
```

## 技术细节

- **纯原生实现** — HTML/CSS/JS，无框架依赖
- **字幕获取** — 通过 `chrome.scripting.executeScript` 在页面 MAIN world 中打开 YouTube 字幕面板，从 DOM 读取字幕内容
- **流式传输** — background.js 调用 Claude Messages API（streaming），通过 `chrome.tabs.sendMessage` 逐块转发到 content.js 实时渲染
- **HTML 笔记** — 使用 `srcdoc` iframe 渲染生成的 HTML，样式隔离不影响 YouTube 页面
- **多轮对话** — 互动问答使用 Claude Messages API 的 system prompt 注入字幕上下文，维护完整对话历史
- **知识卡片** — Claude 输出 JSON 格式，前端解析后渲染为可翻转卡片，CSS `perspective` + `transform: rotateY` 实现 3D 翻转效果
- **分栏拖拽** — 在 YouTube `#columns` 的 `#primary` 和 `#secondary` 之间注入拖拽条，动态调整 flex 布局宽度，同步缩放视频播放器
- **SPA 适配** — 监听 `yt-navigate-finish` 事件处理 YouTube 单页应用导航

## 许可

仅供个人使用。
