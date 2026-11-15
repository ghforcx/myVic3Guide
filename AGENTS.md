# vic3db（Vicdata）项目说明

## 这个项目为什么存在

服务维多利亚3（Victoria 3）玩家。三个目标，按优先级：

1. **做全成就** —— 成就、修正案是本站的核心资产，帮玩家看清"还差什么、下一步做什么"；
2. **提高游戏理解和游戏水平** —— 数据要能变成判断：不只罗列数值，要回答"这意味着我该怎么玩"；
3. **享受通过规划、执行完成自己目标的快乐** —— 维多利亚3的魅力在于定目标、做规划、看它落地。工具型页面（法律规划、公司求解器、成就看板）都要支撑玩家"目标 → 规划 → 执行 → 验证"的循环。

## 真相层级与版本政策

**最主要的真相来源是本地游戏定义文件**：`C:\Program Files (x86)\Steam\steamapps\common\Victoria 3\game\`（Steam 安装，随游戏自动更新）。名称、数值、规则、条件有争议时，以它为最终裁决。

1. **游戏文件**（最高权威）——条件/规则解析直接读游戏 `common/` 定义，用 `.agents/skills/pdx-script-parse/`；
2. **`versions/<最新>/`**——vic3database.org 拉取的预解析镜像（译名、图标、全量实体的大宗数据），是**便利层不是权威**；与游戏文件冲突时以游戏文件为准；
3. **`guides/notes-*` 等 Wiki 抓取**——叙述层（攻略怎么讲），数值冲突时让位。

术语用词以 **`locales/terminology.md`（术语校准层）** 为准——它同时是 **DLC 名称的唯一维护位置**（游戏与 Steam 中文商店的 DLC 标题均显示英文原名，2026-10-17 双源核实，官方无中文译名；社区惯用译名在该表定夺并注明来源）。

版本政策：**只维护最新游戏版本**（本地只有一份随 Steam 更新的游戏，不维护历史版本的游戏文件）。游戏更新后的刷新流程见 `.agents/.agents/skills/data-pipeline/`（数据管线技能）。旧版本目录（如 1.13.9/1.13.10）为历史存档，不再维护，已从 versions.js 注册表移除；**新内容禁止基于旧版本数据生成**。

## 目录（完整结构见 README.md）职责

| 目录 | 职责 | 真相角色 |
|---|---|---|
| `guides/` | 页面生成器（generate-*.mjs）、共享壳 shell.mjs、攻略源数据（notes/wiki 抓取）、生成器的固化数据输入（law-isvisible.json） | 变换器+叙述层数据 |
| `locales/` | 站点 UI 翻译 + **terminology.md 术语校准层（DLC 名唯一维护位置）** | 校准层 |
| `.agents/skills/` | 会话技能（pdx-script-parse 解析器、data-sources 数据源速查、data-pipeline 管线文档、new-page cookbook） | 操作规则 |
| `tools/` | 管线与守卫脚本（extract/expand-gates、check-tabs、check-region-lists、check-decode-residue）+ tab-exceptions.json | 执行器 |
| `assets/` | 图标与静态图片（sync-icons.py 从游戏 dds 生成） | — |
| `deploy/` | Cloudflare 部署 | — |

规则：**数据输入跟它的消费者走**（law-isvisible.json 住 guides/ 因为 generate-laws.mjs 读它）；**检查与变换脚本统一进 tools/**；**给会话看的操作规则进 .agents/skills/**；新增目录须先在本表登记职责。

## 由使命推导的内容原则

- **数据可信是底线**：数据里没有的就不写，宁缺毋假；文案用官方简中译名。
- **面向决策，不面向罗列**：每个页面先回答玩家的一个问题（这个成就怎么做？这条法律值不值得推？这个集团信什么？），数据为答案服务。
- **术语一致**：遵循游戏官方中文（如 concept_decentralized_nation = 松散部族）。

## UI 与结构宪法

约束的"为什么"记在这里，执行在别处——改规则先改本文件，再改执行层。

- **全站一套壳**：新页面用 `guides/shell.mjs` 的 pageShell()，并在同文件 TAB_DEFS 注册页签。导航一致性由 `tools/check-tabs.mjs` 守卫机械强制；豁免必须写进 `tools/tab-exceptions.json` 并注明原因与过期条件（守卫会点名过期豁免）。
- **全站一套色板**：颜色只用 shell.mjs 的 CSS 变量族（--parchment/--ink/--gold 系）及站点既有用色。引入新颜色属于架构变更：先在此登记理由，再改 shell.mjs，最后动页面。
- **大页面由脚本生成**：成就/法律/意识形态级别的页面由 `guides/generate-*.mjs` 产出，禁止手改生成物中的数据块。新页面完整流程（注册→套壳→取数→守卫→验证）见 `.agents/.agents/skills/new-page/`。

## 工作流程

改动 → 跑生成脚本 → `node serve.mjs` 本地验证（HTTP 200 + 关键内容抽查）→ 中文一行式 commit（写清改了什么、数据口径是什么）。

提交时 lefthook（`lefthook.yml`）自动运行两个守卫：`scripts/check-region-lists.mjs`（地区列表必须行内「、」排列）与 `tools/check-tabs.mjs`（页签注册）；手动跑：`npx -y lefthook run pre-commit`。

## 分支与合并规范

- **开发分支**：修改一律从 `main` 拉新分支（如 `feat/xxx`、`fix/xxx`），不在 `main` 上直接提交
- **合并走 PR**：分支开发完成后推到远端，开 Pull Request 到 `main`；CI（守卫三件套 + 部署闸门）通过后合并
- **合并提交**：PR 使用 merge commit（非 squash / rebase），保留分支拓扑
- 本地 `master` 跟踪远端 `main`；PR 合并后删除开发分支
