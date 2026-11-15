---
name: new-page
description: >-
  vic3db 新增攻略页面的完整流程（cookbook）。当要在站点新增一个页面/页签（如意识形态、
  新专题指南）时使用，确保壳、导航注册、数据来源、守卫与验证一次走对，不产生游离页面。
---

# 新增攻略页面（cookbook）

> 状态：**框架版**（2026-10-12 立骨架）。规范依据见仓库 `AGENTS.md`（使命、真相层级、UI 宪法）。
> 本技能是工具无关的仓库内版本——AutoClaw 与 ZCode 会话都按此执行（ZCode 另有全局 skill `vic3db-project` 做项目定位）。

## 流程骨架

1. **定位与命名**：页面回答玩家的什么问题（使命：面向决策不面向罗列）？定文件名（如 `ideologies.html`）与页签 key。
2. **注册导航**：`guides/shell.mjs` 的 TAB_DEFS 加条目（key/label/href 三元组；同页锚点 vs 跨页链接的写法参照既有条目）。
3. **套壳**：页面头部由 `pageShell({ page, title, lede, counts, back })` 生成；样式只用 shell.mjs 的 CSS 变量族与站点既有色板。
4. **数据来源**：按真相层级取数（数值→本地游戏文件/versions 镜像；术语→`locales/terminology.md`；叙述→guides/notes-*）；禁止编造。
5. **写生成脚本**：`guides/generate-<页名>.mjs`（Node 18+ 零依赖，风格对齐 generate-laws.mjs）；页面是脚本产物，不是手写文件。
6. **守卫与豁免**：`node tools/check-tabs.mjs` 必须通过；确属页签体系外的页面在 `tools/tab-exceptions.json` 写明原因与过期条件。
7. **本地验证**：`node serve.mjs` → curl HTTP 200 + 关键内容抽查（含术语用词符合术语表）。
8. **提交**：中文一行式 commit，写清页面定位与数据口径。

## 何时独立成页 vs 首页锚点分区

页签 href 有两种形态（TAB_DEFS 已有先例）：

- **`index.html#xxx`（首页锚点分区）**：内容块住在首页长页里。适合：体量小、与首页共用数据/交互（成就筛选、公司求解器联动）、总览型内容。现有：成就/公司/科技/建筑/事件。
- **`xxx.html`（独立页面）**：有自己的 HTML 文件和专属生成器。适合：大信息量、独立数据管线、独立更新节奏。现有：laws（867KB）、states（106KB）、ideologies（评审中）。

拆分判断标准（拿不准时**默认独立成页**）：
1. 生成内容预计超过 ~200KB，或需要专属 `generate-<页名>.mjs` → 独立页；
2. 与首页运行时强耦合（共用筛选器状态、求解器联动）→ 首页锚点；
3. 首页已 1.5MB——原则上**不再向首页新增区块**，旧区块只做原地维护。

## 参照页

- `laws.html`（generate-laws.mjs）：大信息量折叠分组页的典范。
- `ideologies-a/b.html`（评审中）：A/B 双方案与契约守卫的产物，落位后取其一。

## 明日填充

- [ ] 每步的代码级示例（以一个真实小页面走一遍）
- [ ] counts 页签计数的口径说明（哪类页面给计数、计数从哪统计）
- [ ] 与 data-pipeline 技能的衔接（页面依赖新数据提取时先走管线）
- [ ] 使用说明.html 玩家手册的同步更新提醒步骤
