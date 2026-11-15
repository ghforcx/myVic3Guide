---
name: data-sources
description: >-
  vic3db 数据源速查表：要找某类游戏数据（商品价格/人口/州资源/税率/需求/州名/DLC/成就…）时，
  指明去哪个文件找（游戏本体 vs 镜像）、字段形态、单位换算与已知坑。
  任何取数工作先查此表，避免重蹈已知的坑。
---

# 数据源速查表

## 使用原则

1. **游戏文件 = 最高真相**（AGENTS.md 真相层级）；镜像只做大宗便利层，用前先看本表「已知坑」列。
2. 路径约定：`GAME = C:/Program Files (x86)/Steam/steamapps/common/Victoria 3/game`；镜像 versions/ 已停用（2026-11 迁移完成，全部生成器直读游戏文件）；共享直读层 = guides/game-data.mjs（当前 1.15.0，版本常量 GAME_VERSION）。
3. 游戏更新后镜像未必同步——**数值类字段一律直读游戏文件**，镜像只用于结构性大宗数据（国家列表/州列表/本地化批量）。

## 速查表

| 要找什么 | 去哪 | 字段/形态 | 单位与换算 | 已知坑 |
|---|---|---|---|---|
| 商品原价 | 游戏 `common/goods/00_goods.txt` | `key = { cost = N }` | N÷100 = £（grain 20=£0.20, oil 40） | **镜像 goods.price 有错值**（fabric=70，游戏实为 20）——价格一律用游戏文件 |
| 生产方式（雇工/产出/投入） | 游戏 `common/production_methods/*.txt` | `level_scaled` 里 `building_employment_<职业>_add`；`workforce_scaled` 里 `goods_output_<g>_add` / `goods_input_<g>_add` | 每工每周产出 = **value × price ÷ 250**（商品单位）；官方注释 `# N` = value×price = 每 250 工·周价单位（六点实证） | 镜像 PM effects 数值与原文比例不一致，勿用；**雇工数不在 buildings.txt，在 PM 里** |
| PM 组 → 建筑映射 | 游戏 `common/production_method_groups/*.txt` | `pmg_<组>_building_<建筑>` 块内列 PM keys | — | — |
| 建筑定义 | 游戏 `common/buildings/*.txt` | 建筑元信息（分组/解锁科技/PM组引用） | — | 雇工与产出来 PM；schema 见同目录 `buildings.md` |
| 州资源（耕地/矿/可发现） | 镜像 `data-regions.js` → `stateRegions` | `arable_land` + `arable_resources[]`（农场类型）；`capped_resources[].amount`；`discoverable_resources[].undiscovered_amount` | 容量 = 可建建筑级数（每级雇工看该建筑最优 PM） | **可发现资源的量在 `undiscovered_amount`（`amount` 为 null）**；石油绝大多数在可发现层 |
| 初始人口 | 游戏 `common/history/pops/*.txt` | `s:STATE_X → region_state:TAG → create_pop.size` | `size` = 绝对人数；按 `region_state:TAG` 聚合即国家人口 | **history 在 `common/` 之下**（`game/history` 不存在）；镜像与上游站均无人口分块 |
| 各国初始财富档 | 游戏 `common/history/population/<tag> - <名>.txt` | `effect_starting_pop_wealth_low/baseline/...` | — | 只有档位效果，无具体数字 |
| 税法税率 | 游戏 `common/laws/01_taxation.txt` | 每法条内 `tax_modifier_very_low..very_high { tax_consumption/per_capita/land/income_add }` | 各税种成分加值率（如人均税中档：消费+0.25/人头+0.70/土地+0.35/所得+0.10） | 镜像 law 分块**剥掉了 tax_modifier 块**（modifiers 为空） |
| 经济体制→税制约束 | 游戏 `common/laws/01_economic_system.txt` | `disallowing_laws`（如传统主义禁三种现代税制） | — | — |
| 消费需求（购买包） | 镜像 `data-needs.js` → `needsData.current` | `needs`（15 类别→商品权重+供应占比）；`packages`（99 财富级→类别权重+total） | 权重的人数尺度是黑箱 → 用校准常数 S（锚：基础农场世界=W4，当前 S≈9226 人/权重，见 tools/economy-analysis.mjs） | 游戏源为 `common/pop_needs/00_pop_needs.txt` + `common/buy_packages/00_buy_packages.txt`（注释含 Sum=总计） |
| 国家开局（州/法律/tag） | 镜像 `data-countries-*.js`（4 块要拼接） | `startingStates` / `startingLaws` / `existsAtStart` / `tag` | — | **大清 tag = CHI**（不是 QIN）；730 国分块存储 |
| 州名与动态州名 | 游戏 `localization/<lang>/map/states_l_*.yml` + `dynamic_state_and_hub_names_l_*.yml` + `common/scripted_effects/00_dynamic_state_names*.txt` | `STATE_X` 基础名；`STATE_X_<后缀>` 动态名；scripted_effect 里 `if={limit={条件} set_state_name}` | — | **动态名 loc 在单独文件**；localization 有子目录，顶层 `*.yml` grep 会漏 |
| 通用本地化 | 游戏 `localization/<lang>/`（递归）+ 镜像 `locale-*.js` | 镜像键形如 `country:USA.name` | — | 镜像国家键**无 c_ 前缀、tag 大写**；文件名 `locale-countries-N`（countr**ies**）易与键前缀 countr**y** 混淆 |
| DLC 名称 | 无游戏/Steam 中文源 | — | — | 游戏各语言 loc 与 Steam 中文页标题**均为英文**；中文建议译名唯一维护位置 = `locales/terminology.md` |
| 成就攻略原文 | `guides/wiki-achievements.en.txt` | JSONL `.data.text`，维基模板语法 | — | 模板残留形态见 `tools/check-decode-residue.mjs` 的拦截模式 |
| 镜像总索引/更新 | `versions/<ver>/data-index.js` / `update.mjs` | chunks 清单（各域 keys/counts） | — | counts 元数据可能滞后（needs 标 0 实有 100KB） |
| 全局常数 | 游戏 `common/defines/00_defines.txt` | `Nxxx = value` | — | 无产量乘数类常数（找过） |
| 各域 schema 官方文档 | `common/<域>/*.md`（如 `buildings.md`、`production_methods.md`、`goods.md`） | 格式说明+字段注释 | — | **挖新数据先读对应 .md**，比试错快 |

## 找不到时的搜索顺序

1. 本表；2. 猜 `GAME/common/<域名>/`（goods/laws/pop_needs/…命名直观）；3. 读该目录的 `*.md` schema 文档；4. `common/defines/00_defines.txt`；5. 镜像 `data-index.js` 的 chunks 清单；6. 确认不存在后再考虑外部源（Steam 商店页等，须在术语表/决策记录注明）。

## 维护规则

- 每次踩到新坑或挖到新数据位置，**当次就更新本表**（这是本 skill 存在的全部意义）；条目格式照抄表列。
- 单位换算的实证依据写在「单位与换算」列，不确定就标注待验证，宁缺毋假。
