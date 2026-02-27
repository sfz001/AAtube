// src/prompts.js — 所有 prompt 常量

YTX.prompts = {};

YTX.prompts.DEFAULT = `【重要】无论字幕是什么语言，你必须全程使用简体中文回答，禁止使用其他任何语言。

请对以下 YouTube 视频字幕内容进行总结。

## 输出格式：

### 摘要
3-5句话概述视频主要内容

---

### 关键要点
提取 3-5 个最重要的收获，每个一句话

---

### 详细内容
按内容分段，标注时间戳 [MM:SS]：
[00:00] 段落标题 - 要点描述
[02:30] 段落标题 - 要点描述

## 要求：
- 必须使用简体中文回答，不要使用繁体中文
- 语言简洁，避免废话
- 关键要点不要跟摘要重复，要有信息增量
- 时间戳准确对应内容变化点
- 时间戳只用单个起始时间点格式 [0:00]，不要用时间范围 [0:00-0:32]

---
字幕内容：
{transcript}`;

YTX.prompts.HTML = `【重要】无论字幕是什么语言，你必须全程使用简体中文，禁止使用其他任何语言。

请根据以下 YouTube 视频字幕内容，生成一个精美的 HTML 笔记页面。

要求：
1. 必须使用简体中文，不要使用繁体中文
2. 输出完整的 HTML（包含 <style> 内联样式），不要包含 \`\`\`html 代码块标记
3. 使用现代美观的设计风格（渐变色标题、卡片布局、合理的间距和排版）
4. 包含：视频概述、关键要点（带时间戳）、详细内容分段
5. 时间戳格式 [MM:SS]，配以醒目样式
6. 配色方案使用紫色主题 (#7c3aed)
7. 响应式布局，max-width: 800px 居中

字幕内容：
{transcript}`;

YTX.prompts.CARDS = `【重要】无论字幕是什么语言，你必须全程使用简体中文，禁止使用其他任何语言。

请根据以下 YouTube 视频字幕内容，生成知识卡片（Flashcards）用于学习复习。

要求：
1. 必须使用简体中文，不要使用繁体中文
2. 提取 10-20 个关键知识点
3. 每张卡片包含正面（问题/术语）和背面（解释/答案）
4. 如果有对应时间戳请标注 [MM:SS]
5. 严格按以下 JSON 格式输出，不要包含代码块标记：
[{"front":"问题或术语","back":"解释或答案","time":"MM:SS"},...]

字幕内容：
{transcript}`;

YTX.prompts.MINDMAP = `【重要】无论字幕是什么语言，所有内容必须使用简体中文，禁止使用其他任何语言。

请根据以下 YouTube 视频字幕内容，生成一个结构化的思维导图 JSON 数据。

要求：
1. 输出一个嵌套的 JSON 对象树，根节点是视频主题
2. 每个节点格式：{"label": "节点标签", "time": "MM:SS", "children": [...]}
3. time 字段可选，表示该内容对应的视频时间戳，没有则留空字符串
4. 最多 4 层深度，每个节点标签不超过 30 个字
5. 第一层为主题分类（3-7个），第二层为具体要点，第三四层为细节
6. 严格输出 JSON，不要包含代码块标记或其他文字
7. 所有节点标签必须使用简体中文，不要使用繁体中文，即使原始字幕是英文也要翻译为简体中文

字幕内容：
{transcript}`;

YTX.prompts.VOCAB = `请从以下 YouTube 视频英文字幕中提取约 50 个值得学习的词汇和短语。

字幕格式说明：每行格式为 [MM:SS] 文本内容，方括号内是该句在视频中的时间戳。

要求：
1. 优先选择：高级词汇、常用短语/搭配、学术词汇、地道表达、习语俚语
2. 严格跳过以下简单词汇，不要收录：
   - 基础动词：be, is, am, are, was, were, have, has, had, do, does, did, go, get, make, take, come, give, say, tell, know, think, see, look, want, need, use, find, put, try, let, keep, start, begin, help, show, hear, play, run, move, live, feel, work, call, set, turn, hold, bring, happen, seem, leave, mean, end, might, must, shall, could, would, should
   - 基础名词：thing, people, time, day, way, year, man, woman, child, world, life, hand, part, place, case, week, company, system, program, question, home, point, number, story, fact, month, lot, right, study, book, eye, job, word, side, kind, head, house, area, money, room, mother, father
   - 基础形容词/副词：good, bad, big, small, new, old, great, little, long, high, right, left, first, last, next, own, other, much, many, very, really, just, also, too, well, still, already, only, even, never, always, often, here, there, now, then, again, back, away
   - 基础代词/连词/介词：I, you, he, she, it, we, they, this, that, what, which, who, how, where, when, why, and, but, or, if, so, because, about, after, before, between, into, through, during, without, against
   - 其他常见简单词：like, just, really, actually, okay, yeah, gonna, wanna, pretty, stuff, something, anything, everything, everyone, someone, another, different, important, actually, basically, probably, definitely, absolutely, completely
3. 目标难度：大学英语六级及以上水平，适合中高级英语学习者
3. 每个词条包含：
   - word: 词汇或短语
   - phonetic: 音标
   - pos: 词性缩写（n./v./adj./phr. 等）
   - meaning: 简体中文释义
   - example: 该词所在的字幕原句（英文原文，不要翻译）
   - time: 必须是该词实际出现的那一行字幕前面的时间戳，直接从字幕中复制，不要编造
4. 严格按以下 JSON 格式输出，不要包含代码块标记或其他文字：
[{"word":"elaborate","phonetic":"/ɪˈlæb.ə.reɪt/","pos":"v.","meaning":"详细说明，阐述","example":"Can you elaborate on that point?","time":"2:30"}]

字幕内容：
{transcript}`;
