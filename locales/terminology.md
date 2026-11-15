# 术语表（Terminology）—— 术语校准层

> **地位**：本表是 vic3db 的术语真相源（宪法《真相层级》的校准层）。攻略文案、生成器输出、页面 UI 用词与本表冲突时，以本表为准；本表与游戏冲突时，以游戏本地化文件为最终校准源。
>
> **收录标准**：只收「发生过漂移 / 容易漂移」的术语——官方概念、DLC 名、社区惯用译名与官方译名不一致的词条。不抄整个 locale（那是 `versions/<版本>/locale-*.js` 的事）。
>
> **新增条目必须写出处**（locale key、提交哈希、或 Steam 商店页），宁缺毋假。

## 一、核心概念

| en key / 原文 | 官方简中 | 出处 | 备注 |
|---|---|---|---|
| concept_decentralized_nation（未建合国家 ✗） | **松散部族** | 游戏 locale；术语修正提交 161939f | 社区旧译「未建合国家」已废弃，勿再用 |

<!-- 明日填充：其余已校准概念（成就描述、法律名、集团名中易错项） -->

## 二、DLC 名称

> **校准结论（2026-10-17 双源核实）**：游戏各语言 loc 文件与 Steam 中文商店页的 DLC **标题均显示英文原名**——游戏/商店层面无中文译名。
> **但官方开发日志会公布「建议译名」**（贴吧搬运/B站官方账号/腾讯频道等渠道），另有萌娘百科、Steam 简中成就攻略等半官方佐证——本表以此为校准源，逐条注明性质。
> 英文列取自 `game/localization/simp_chinese/dlc_l_simp_chinese.yml`（2026-10-12 核实）。

| key | 英文官方名 | 建议译名 | 出处与性质 |
|---|---|---|---|
| dlc001 | Victoria 2 Remastered Soundtrack | 《维多利亚2》重制原声 | 自拟（音乐包，无官方建议） |
| dlc002 | American Buildings Pack | 美式建筑包 | 自拟（美术包，无官方建议） |
| dlc003 | Melodies for the Masses | 大众旋律 | 自拟（音乐包，无官方建议） |
| dlc004 | Voice of the People | 人民之声 | B站官方/媒体长期通行 |
| dlc005 | Voice of the People Theme | 人民之声主题 | 自拟（主题包，无官方建议） |
| dlc006 | Voice of the People Preorder | 人民之声预购奖励 | 自拟（预购包，无官方建议） |
| dlc007 | Dawn of Wonder | 奇观黎明 | 自拟（美术包，无官方建议） |
| dlc008 | Colossus of the South | 南方巨像 | Steam 简中成就攻略通行（半官方） |
| dlc010 | Sphere of Influence | 势力范围 | 萌娘百科记为官方译名 |
| dlc011 | Pivot of Empire | 帝国之枢（备选：帝国支点/帝国枢纽） | 官方渠道推荐译名；B站「帝国之枢」为主流用法 |
| dlc012 | Trade Ships Bonus Pack | 贸易船舶奖励包 | 自拟（奖励包；Steam 页作 Trains Bonus Pack，两说待核） |
| dlc013 | Charters of Commerce | 商业特许（备选：商业特许状） | 官方开发日志 #144 / B站官方视频 |
| dlc014 | National Awakening | 民族觉醒 | 社区建议（贴吧称「奥皇版本」） |
| dlc015 | Songs of the Homeland | 祖国之歌 | 官方简中译名（Steam 商店页，2025-10-16；此前自拟「家园之歌」作废） |
| dlc016 | Iberian Twilight | 半岛暮光 | 官方日志建议译名（贴吧搬运） |
| dlc018 | The Great Wave | 滔天巨浪（备选：大浪潮） | 官方简中译名（快科技报道）；繁中社区作「大浪潮」 |
| ip5 | State and Revolution | 国家与革命 | 官方简中译名（Steam 商店页，1.15 版本入库） |

（dlc009、dlc017 不在游戏 dlc 本地化清单中，待确认是否存在。观察项：State and Revolution 已随 1.15 入库，译名行已补。站内 news-data.js 目前使用英文名，正式采用本表译名时需同步。）

## 三、待开类目（框架，明日填充）

- [ ] 常见误译纠正（社区惯用 vs 官方）
- [ ] 法律 / 修正案名易错项
- [ ] 利益集团与意识形态名易错项
- [ ] 机制术语（如 SoL、GDP、 rad 这种社区缩写是否收录的口径）
