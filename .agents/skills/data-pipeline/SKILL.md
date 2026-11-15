---
name: data-pipeline
description: >-
  vic3db 数据管线：从本地游戏定义文件与 vic3database.org 镜像到攻略页面的数据流动全图。
  当游戏更新后需要刷新数据、追溯某个数值/条件的来源、新增一类提取-固化-生成链路，
  或排查"这个数据从哪来/为什么过时"时，使用此技能。
---

# vic3db 数据管线

> 状态：**框架版**（2026-10-12 立骨架，内容逐段填充中）。真相反裁与版本政策见仓库 `AGENTS.md`。
> **每一类数据去哪个文件找、什么单位、有什么坑 → 查 `skills/data-sources/`（数据源速查表）**，本技能只管流动与变换流程。

## 管线总图

```
[最高真相] 本地游戏文件
  C:\Program Files (x86)\Steam\steamapps\common\Victoria 3\game\
      │
      ├─(A) 条件/规则提取 ──→ tools/extract-gates.mjs、tools/expand-gates.mjs（⚠ 未入库）
      │        └→ skills/pdx-script-parse/（解析器 parse.mjs + 固化件 law-isvisible.json ⚠ 住错管辖地）
      │
[便利镜像] vic3database.org ──(B) update.mjs──→ versions/<最新>/（data-*.js + locale-*.js 大宗数据）
      │
      ▼
[生成器] guides/generate-*.mjs（消费 A 的固化件 + B 的镜像 + guides/notes-*.json 叙述层）
      │
      ▼
[页面] index.html / laws.html / ideologies*.html …（派生产物，禁止手改数据块）
```

## 触发时机

| 事件 | 动作 |
|---|---|
| 游戏版本更新（Steam 自动更新） | 全链刷新：B → 按需重跑 A → 重生成页面 → 验证 → 提交（详见下节，流程待填充） |
| 仅页面/文案改动 | 只跑相关 generate-*.mjs，不碰数据层 |
| 数据疑似错误 | 先定管辖（数值→游戏文件；译名→locale/术语表；叙述→Wiki notes），再在正确的层修 |

## 各阶段说明（明日填充）

### A. 游戏文件提取
- extract-gates / expand-gates 的用法、输入输出 <!-- TODO -->
- pdx-script-parse 的调用方式与 law-isvisible.json 的再生成流程 <!-- TODO -->
- 待办：两个工具入库；law-isvisible.json 迁往数据家（如 guides/derived/）并同步 generate-laws.mjs 引用

### B. 镜像刷新
- `node update.mjs [版本]`：从 vic3database.org 拉站点壳/语言包/数据分块；地图底图有本地缩图例外
- 待办：上游改版断链的检测方式；镜像 vs 游戏文件的一致性抽查口径 <!-- TODO -->

### C. 页面生成
- guides/generate-*.mjs 逐个说明（输入、输出口径） <!-- TODO -->
- 待办：regenerate-diff 守卫（重生成后 diff 须为空，防手改生成物）

## 校验与验证

- `node tools/check-tabs.mjs`（页签注册守卫）
- `node serve.mjs` → http://127.0.0.1:8737 抽查
- <!-- TODO: 管线级端到端校验清单 -->
