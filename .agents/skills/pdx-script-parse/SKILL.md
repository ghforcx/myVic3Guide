---
name: pdx-script-parse
description: Parse Victoria 3 (PDX/Jomini) script condition blocks into readable Chinese for guide sites. Use when generating human-readable text from raw script conditions like can_enact, possible, custom_tooltip in game files — e.g. 法律限定条件、修正案触发脚本、成就脚本解码. Handles culture (cu:xxx → 中文名), country tags (c:XXX → 中文名), laws, variables, scripted triggers (scripted_triggers 目录递归展开), government types, country types, and common structural keywords (is_subject, is_country_type, OR/AND/NOR/NAND, any_scope_state 等).
---

# PDX Script Condition Parser（Victoria 3 脚本条件 → 中文）

把游戏脚本条件块解析成玩家能读懂的中文，用于攻略站/指南生成。

## 输入

- `raw`: 条件块原文（`can_enact.raw` / `possible.raw` / `happened.raw` 等）
- `ctx`: 上下文对象，提供翻译查表：
  - `L(key)`: 本地化函数（zh 优先 en 兜底）
  - `cultures`: 游戏数据 cultures 数组（`{key, loc:{name}}`，key 如 `yankee`）
  - `laws`: laws 数组（查法律名）
  - `countries`: countries 数组（查国家名，key 为三字 tag）
  - `GAME_ZH`: 游戏本体简中本地化键值对（custom_tooltip 的 text 键优先从这里查，键可带或不带 `_tt` 后缀）
  - `triggerDefs`: 可选，`Map<triggerName, rawDefinition>` 从 `game/common/scripted_triggers/*.txt` 预解析的脚本化触发器定义（用于递归展开）

## 解析顺序（优先级从高到低）

1. **custom_tooltip 的 text 键**：`text = xxx_tt` → 查 `GAME_ZH["xxx_tt"]` 或 `GAME_ZH["xxx"]`，命中即整句采用（游戏官方人话，最优先）。清理 `#bold #!` `[Concept(...)]` `[ROOT.GetCountry.GetName]` 等标记。
2. **变量**：`has_variable = xxx` / `has_global_variable = xxx` → 「需要变量 xxx」。
3. **文化**：`country_has_primary_culture = cu:yankee` → 「主流文化为扬基」；多个 OR 并列 → 「主流文化为 扬基/迪克西」。文化名查 `cultures` 数组（`cu:` 后缀即 cultures key）+ `L(culture:<key>.name)`。
4. **国家 tag**：`c:JAP ?= this` / `c:JAP = this` → 「国家为日本」；`NOT { c:JAP ?= this }` → 「不是日本」。
5. **政府/国家类型**：`has_government_type = gov_chartered_company` → 「政府类型是特许公司」；`is_country_type = decentralized` → 「松散部族（decentralized）」；`is_country_type = colonial` → 「殖民政府」；`company` → 「特许公司」。
6. **常见谓词**（见下方速查表）。
7. **脚本化触发器**：未知裸标识符 + `= yes`（如 `country_is_colonial_or_company = yes`）→ 查 `triggerDefs` 递归展开其定义体。无法展开时保留原名并标注「（脚本化条件）」。
8. **兜底**：块非空但无可识别模式 → 返回 null（调用方决定显示「其他脚本条件」+ 折叠原文）。

## 常见谓词速查表（raw → 中文）

| 模式 | 中文 |
|---|---|
| `is_subject = yes/no` | 是/不是附属国 |
| `is_revolutionary = yes` | 处于革命中 |
| `always = yes` | （无条件，整块忽略） |
| `country_is_colonial_or_company = yes` | 是殖民政府或特许公司 |
| `any_scope_state = { is_incorporated = no }` | 拥有未合宪州 |
| `is_homeland_of_country_cultures = ROOT` | 拥有本国文化的祖传州 |
| `any_decentralized_country = { is_adjacent_to_country = root }` | 与松散部族接壤 |
| `modifier:country_forbid_electoral_fraud_bool = no` | 未受「禁止选举舞弊」修正 |
| `has_social_hierarchy = edo_system` | 实施江户等级制度 |
| `literacy_rate <= 0.2` | 识字率 ≤ 20% |
| `country_rank >= rank_value:great_power` | 国家等级至少列强（major_power=主要强权, minor_power=次要强权） |
| `has_law_or_variant = law_type:law_x` | 已实施某法律（可变体） |
| `is_in_government = no` + ig 上下文 | 某利益集团不在政府内 |
| `is_power_bloc_leader = yes/no` | 是/不是国家集团领袖 |
| `NAND/NOT/OR/AND` | 且/非/或 结构递归展开，每个子条件一条 |

## 输出格式

- `parseConditions(raw, ctx)` → `{ conds: string[], always: bool, raw }`；`conds` 为去重后的中文条目数组（顺序保持脚本可读顺序：先主句后嵌套）；`always: true` 表示无条件。
- 单条不超过 60 字；超出时截断加「…」。
- 不确定的表达保留原文片段，不要编造。

## 已知坑

- `can_enact.loc.summary` 键会错位（显示别的法律的名字），**绝不能用**。
- 同一修正案在多部法律的 amendments 里重复出现，解析结果按 key 缓存。
- `cu:` 前缀对应 cultures 数据的 `key` 字段（如 `cu:yankee` → cultures 里 key=`yankee`），本地化键是 `culture:yankee.name`（不是 `culture:cu_yankee.name`）。
- custom_tooltip text 键可能引用 `[GetPlayer.GetModifier...]` 动态内容，清理标记后若仍有方括号残留，删掉整个片段而不是保留半句。
- 递归展开脚本化触发器最多 3 层，防止循环引用。


## 附带数据 law-isvisible.json（已迁往 guides/law-isvisible.json，此处仅文档说明）

从 `game/common/laws/*.txt` 提取的 18 条 `is_visible` 块原文（键=法律 key）。`is_visible` 与 `can_enact` 不同：前者控制「这法律对哪些国家**显示**」（如王冠领地议会仅奥地利及其附属可见），后者控制「能否颁布」。解析人话时用「仅 … 可见/可用」措辞；NOR = 非该文化附属 → 「不适用于 …」。
