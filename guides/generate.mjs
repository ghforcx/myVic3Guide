// Vicdata 目标指南生成器：游戏文件直读生成羊皮纸风格的 index.html（主页）
// 用法: node guides/generate.mjs   （游戏更新后重新运行即可刷新指南——数据全部来自本地游戏目录，见 AGENTS.md）
import fs from "node:fs";
import path from "node:path";
import { ACH_ORIGIN } from "./ach-origin.mjs";
import { SHELL_CSS } from "./shell.mjs";
import * as GD from "./game-data.mjs";

const OUT = path.resolve(import.meta.dirname, "../index.html");

// ---------- 数据（游戏文件直读；镜像 versions/ 已停用） ----------
const data = {
  laws: GD.loadLaws(),
  lawGroups: GD.loadLawGroups(),
  countries: GD.loadCountries(),
  ideologies: GD.loadIdeologies(),
  technologies: GD.loadTechnologies(),
  achievements: GD.loadAchievements(),
  companies: GD.loadCompanies(),
  goods: GD.loadGoods(),
  prestigeGoods: GD.loadPrestigeGoods(),
  cultures: GD.loadCultures(),
  buildings: GD.loadBuildings(),
  productionMethodGroups: GD.loadPMGroups(),
  productionMethods: GD.loadPMs(),
  stateRegions: GD.loadStateRegions().map((s) => ({ key: s.key, strategic_regions: (s.srs || []).map((k) => ({ key: k })), starting_owners: [] })),
};

// 本地化（游戏全目录裸键；对象形态保持 ZH[...] / GAME_ZH[...] 兼容旧调用）
const ZH = Object.fromEntries(GD.loadGameLoc("simp_chinese"));
const EN = Object.fromEntries(GD.loadGameLoc("english"));
const GAME_ZH = ZH;
const GAME_EN = EN;
console.log("游戏本地化键: zh", Object.keys(ZH).length, "/ en", Object.keys(EN).length);

// ---------- 英文游戏名 → 中文译名（州/法律/科技/国家，来源：游戏本地化裸键） ----------
const stateEnToZh = {}, lawEnToZh = {}, techEnToZh = {}, countryEnToZh = {};
for (const k of Object.keys(GAME_EN)) {
  const en = GAME_EN[k], zh = GAME_ZH[k];
  if (!en || !zh || en === zh || /[[\]]/.test(en) || /[[\]]/.test(zh)) continue;
  if (/^STATE_\w+$/.test(k)) stateEnToZh[en] = zh;                       // 州名（states_l + 动态名全目录已合并）
  else if (/^law_\w+$/.test(k)) lawEnToZh[en] = zh;
  else if (/^[A-Z]{3}$/.test(k)) countryEnToZh[en] = zh;                 // 国家 TAG
  else if (/^[a-z][a-z0-9_]*$/.test(k) && !/^(building|pm|pmg|ig_|ideology|lawgroup|institution|amendment|goods|concept|modifier|country|state|culture|region|prestige)/.test(k)) techEnToZh[en] = zh; // 科技为裸词键
}
const zhNameEntries = [];
for (const map of [stateEnToZh, lawEnToZh, techEnToZh, countryEnToZh]) {
  for (const [en, zh] of Object.entries(map)) if (en && zh) zhNameEntries.push([en, zh]);
}
zhNameEntries.sort((a, b) => b[0].length - a[0].length);
const zhNameRe = new RegExp("(?<![\\w-])(" + zhNameEntries.map(x => x[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\w-])", "gi");

// ---------- 州 → 战略区域（成就「涉及区域」聚合用） ----------
const STATE_TO_SR = new Map();
const SR_ZH = new Map();
const ZH_STATE = new Map();
{
  for (const s of data.stateRegions) {
    const srk = ((s.strategic_regions || [])[0] || {}).key;
    if (srk) STATE_TO_SR.set(s.key, srk);
  }
  for (const k of Object.keys(ZH)) {
    if (/^region_\w+$/.test(k) && ZH[k]) SR_ZH.set(k, ZH[k]);            // 战略区域 loc 裸键
    if (/^STATE_\w+$/.test(k) && ZH[k]) ZH_STATE.set(ZH[k], k);          // 中文州名 → STATE_ 键（成就区域聚合反查）
  }
}
const zhNameLookup = new Map(zhNameEntries.map(([en, zh]) => [en.toLowerCase(), zh]));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// L 键形适配：旧镜像形 prefix:key.name / key.description → 游戏裸键 key / key_desc；zh 优先 en 兜底
const L = (key) => {
  if (!key) return "";
  let m = String(key).match(/^\w+:([\w.]+)\.name$/);
  if (m) return ZH[m[1]] ?? EN[m[1]] ?? "";
  m = String(key).match(/^\w+:([\w.]+)\.description$/);
  if (m) return ZH[m[1] + "_desc"] ?? EN[m[1] + "_desc"] ?? "";
  return (ZH[key] ?? EN[key]) || "";
};
const pretty = (key) => String(key || "").replace(/^(law_|prestige_good_|building_|technology_|state_region_|company_|amendment_|ig_)/, "").replace(/_/g, " ");

// ---------- 维基源文本读取（BOM / JSON 包装 / 字面 \n 兼容） ----------
function readWikiText(file) {
  const raw = fs.readFileSync(file);
  let t = (raw[0] === 0xFF && raw[1] === 0xFE) ? raw.toString("utf16le").slice(1) : raw.toString("utf8").replace(/^\uFEFF/, "");
  t = t.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  t = t.replace(/Aquitane/g, "Aquitaine").replace(/Alejento/g, "Alentejo");
  if (t.trim().startsWith("{")) {
    try { t = JSON.parse(t).data.text; } catch {}
  }
  return t;
}

// ---------- 成就 ----------
const GROUP_LABEL = { easy_group: "简单", medium_group: "中等", hard_group: "困难", very_hard_group: "极难" };
const GROUP_ORDER = { very_hard_group: 0, hard_group: 1, medium_group: 2, easy_group: 3 };
const countryName = (tag) => L("country:" + tag + ".name") || tag;
const ACH_CONSTRAINTS = (JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "ach-constraints.json"), "utf8").replace(/^\uFEFF/, "")).entries) || {};
  for (const [k, enName] of Object.entries(GAME_EN)) {
    if (!/^STATE_/.test(k)) continue;
    const zhName = GAME_ZH[k];
    if (enName && zhName && !stateEnToZh[enName]) stateEnToZh[enName] = zhName;
  }
const ACH_DLC = {
    base: { name: "原版 Base Game", icon: "assets/dlc/dlc008.png" },
    ip1: { name: "人民之声 Voice of the People", icon: "assets/dlc/ip1.png" },
    rp1: { name: "南方巨人 Colossus of the South", icon: "assets/dlc/rp1.png" },
    ep1: { name: "势力范围 Sphere of Influence", icon: "assets/dlc/ep1.png" },
    ip2: { name: "帝国支柱 Pivot of Empire", icon: "assets/dlc/ip2.png" },
    mp1: { name: "商业特许 Charters of Commerce", icon: "assets/dlc/mp1.png" },
    ip3: { name: "民族觉醒 National Awakening", icon: "assets/dlc/ip3.png" },
    ip4: { name: "伊比利亚黄昏 Iberian Twilight", icon: "assets/dlc/ip4.png" },
    ip5: { name: "国家与革命 State and Revolution", icon: "assets/dlc/ip4.png" },
    ep2: { name: "滔天巨浪 The Great Wave", icon: "assets/dlc/ep2.png" },
  };
  // Steam 商店页官方中文名（游戏内 zh locale 未译 DLC 名，官方中文名以 Steam 商店为准）
  const DLC_ZH_NAME = { ip1: "人民之声", rp1: "南方巨人", ep1: "势力范围", ip2: "帝国支柱", mp1: "商业特许", ip3: "民族觉醒", ip4: "伊比利亚黄昏", ep2: "滔天巨浪", ip5: "国家与革命" };
  const cultureCountries = new Map();
  {
    // 国家主流文化 → 国家集（common/country_definitions 直读；镜像 primaryCultures 已停用）
    const tagCultures = GD.loadCountryCultures();
    for (const c of (data.countries || [])) for (const cu of (tagCultures.get(c.key) || [])) {
      if (!cultureCountries.has(cu)) cultureCountries.set(cu, []);
      if (!cultureCountries.get(cu).some((x) => x.key === c.key)) cultureCountries.get(cu).push(c);
    }
  }
  const COUNTRY_RELIGIONS = GD.loadCountryReligions(); // 开局国教近似（pop 宗教加权推导，pop 未声明时取文化默认）
  const achievements = (data.achievements || []).map(a => ({
  key: a.key,
  name: L(a.loc?.name) || pretty(a.key),
  desc: L(a.loc?.description) || "",
  group: a.group_key || "other",
  groupLabel: GROUP_LABEL[a.group_key] || L(a.loc?.groupName) || a.group_key,
  groupOrder: a.group_order ?? 0,
  icon: `assets/achievements/${encodeURIComponent(a.key)}.webp`,
  happened: a.script?.happened || "",
  tags: (() => {
    const con = ACH_CONSTRAINTS[a.key];
    // 有主文化/国家限定时以约束为准（游戏脚本里的 c:PRU ?= { prestige < ROOT } 这类是竞争对手，不是可完成国家）
    if (con) {
      if (con.anyCountry) return []; // 全局门槛（如附庸国成就）不限国家，求解器不按国家过滤
      const out = [...(con.countries || [])];
      for (const cu of (con.cultures || [])) for (const cc of (cultureCountries.get(cu) || [])) if (!out.includes(cc.key)) out.push(cc.key);
      if (!out.length && (con.cultures || []).length) return ["_none"]; // 文化锁但 1836 无此主流文化国家（需转变主流文化，如保加利亚）
      return out;
    }
    // 未校准条目，按脚本限定展开（只看 possible——资格条件；happened 里出现的是目标而非资格）
    const raw = String(a.script?.possible || "");
    // ① 国教限定（country_has_state_religion = rel:X）→ 开局国教为 X 的国家集
    const rels = [...new Set([...raw.matchAll(/country_has_state_religion\s*=\s*rel:(\w+)/g)].map((m) => m[1]))];
    if (rels.length) {
      const out = [];
      for (const c of (data.countries || [])) {
        const r = COUNTRY_RELIGIONS.get(c.key);
        if (r && rels.includes(r) && !out.includes(c.key)) out.push(c.key);
      }
      return out;
    }
    // ② 主流文化限定（country_has_primary_culture = cu:X）→ 该文化国家集
    const raw2 = raw + String(a.script?.happened || "");
    const cus = [...new Set([...raw2.matchAll(/country_has_primary_culture\s*=\s*cu:(\w+)/g)].map((m) => m[1]))];
    if (cus.length) {
      const out = [];
      for (const cu of cus) for (const cc of (cultureCountries.get(cu) || [])) if (!out.includes(cc.key)) out.push(cc.key);
      if (!out.length) return ["_none"];
      return out;
    }
    return (a.related_countries || []).map(x => x.key || x.tag || String(x.id || "").replace("country:", ""));
  })(),
  countries: (a.related_countries || []).map(x => countryName(x.key || x.tag || String(x.id || "").replace("country:", ""))),
  cultureNeed: (() => { // 文化锁但开局无此主流文化国家：展示提示用（独立判定，不依赖本对象其他字段）
    const con = ACH_CONSTRAINTS[a.key];
    const cu = (con && (con.cultures || [])[0]) || [...new Set([...String(a.script?.happened || "").matchAll(/country_has_primary_culture\s*=\s*cu:(\w+)/g)].map((m) => m[1]))][0] || "";
    if (!cu) return "";
    return (cultureCountries.get(cu) || []).length ? "" : (ZH[cu] || "");
  })(),
  regions: (() => { // 成就脚本（happened/possible 对象）涉及的州/区域 → 战略区域聚合（去重）
    const srs = new Set();
    const src = JSON.stringify(a.script || {});
    for (const m of src.matchAll(/STATE_([A-Z0-9_]+)\\b/g)) {
      const sr = STATE_TO_SR.get("STATE_" + m[1]);
      if (sr) srs.add(sr);
    }
    for (const m of src.matchAll(/sr:(region_\w+)/g)) srs.add(m[1]);
    return [...srs].map(k => SR_ZH.get(k) || k);
  })(),
  dlc: ACH_DLC[String(a.source_file || "").split(/[\\/]/).pop().split("_")[0]] || null,
  dlcId: String(a.source_file || "").split(/[\\/]/).pop().split("_")[0],
  source: (a.source_file || "").split(/[\\/]/).pop(),
}));
  for (const a of achievements) {
    const con = ACH_CONSTRAINTS[a.key];
    if (!con) continue;
    const names = new Set(a.countries);
    for (const tag of (con.countries || [])) names.add(countryName(tag));
    for (const cu of (con.cultures || [])) for (const cc of (cultureCountries.get(cu) || [])) names.add(countryName(cc.key));
    if ((con.laws || []).length) {
      for (const c of (data.countries || [])) {
        if (!c.existsAtStart) continue;
        const lawSet = new Set((c.startingLaws || []).map(l => l.key));
        let ok = false;
        for (const l of con.laws) if (lawSet.has(l)) { ok = true; break; }
        if (ok && !names.has(countryName(c.key))) names.add(countryName(c.key));
      }
    }
    a.countries = [...names];
  }

// ---------- 维基成就表（Potential/Requirements/Notes） ----------
const wikiAch = new Map();
{
  let wt = readWikiText(path.join(import.meta.dirname, "wiki-achievements.en.txt"));
  const frags = wt.split(/(?=\|\s*\{\{Iconbox)/g);
  for (const frag of frags) {
    if (!frag.includes("{{Iconbox")) continue;
    const headEnd = frag.indexOf("\n");
    const head = headEnd < 0 ? frag : frag.slice(0, headEnd);
    const nm = head.match(/\{\{Iconbox\|([^|]+)\|/);
    if (!nm) continue;
    const name = nm[1].trim();
    const body = frag.slice(headEnd + 1);
    const cells = body.split(/\n\|/).map(s => s.replace(/^\|/, "").replace(/\|$/, "").trim());
    wikiAch.set(name, {
      potential: cells[0] || "",
      requirements: cells[1] || "",
      notes: cells.slice(2).join("\n"),
    });
  }
}

// 维基标记 → HTML（含模板、列表层级、转义清理）
// 条件句英文短语 → 中文（wiki 源是英文，国名已由 zhNameRe 换成中文，连接词/动词短语在此翻译；长短语在前防部分覆盖）
const EN_ZH_RULES = [
  [/Started as or /g, "开局为"],
  [/Started as a /g, "开局为"],
  [/Started as /g, "开局为"],
  [/Started with the /g, "开局拥有"],
  [/Has a higher Standard of Living than/g, "生活水平高于"],
  [/Has higher Standard of Living than/g, "生活水平高于"],
  [/Has higher GDP than/g, "GDP 高于"],
  [/Has higher literacy than/g, "识字率高于"],
  [/Has at least /g, "至少拥有 "],
  [/Has at level /g, "等级达到 "],
  [/Has a Treaty /g, "签有"],
  [/Fully owns all /g, "完全拥有全部 "],
  [/Fully owns the /g, "完全拥有"],
  [/Fully owns /g, "完全拥有"],
  [/does not exist/g, "不存在"],
  [/does not block/g, "不阻挡"],
  [/[Dd]o not count/g, "不计入"],
  [/is a subject/g, "为附庸"],
  [/Is not a /g, "并非"],
  [/is either /g, "为"],
  [/is required/g, "为必需科技"],
  [/or less/g, "以内"],
  [/or more/g, "以上"],
  [/\bequal to\b/g, "等于"],
  [/\bOR\b/g, "或"],
  [/\bor\b/g, "或"],
  [/\band\b/g, "且"],
];
const translateEn = (s) => EN_ZH_RULES.reduce((s2, [re, zh]) => s2.replace(re, zh), s)
  .replace(/([^（]+?)（\1）/g, "$1"); // wiki 冗余括注（如 "Gran Pará (Gran Pará)" 译后「大帕拉（大帕拉）」）去重
function wikiToHtml(s) {
  if (!s || !s.trim() || s.trim() === "—") return "";
  s = s.replace(/Aquitane/g, "Aquitaine").replace(/Alejento/g, "Alentejo");
  s = s.replace(/Eastern Andalusia|Eastern 安达卢西亚/g, "上安达卢西亚").replace(/Western Andalusia|Western 安达卢西亚/g, "下安达卢西亚").replace(/Baleares/g, "巴利阿里群岛");
  // 连续的 ** 二级项合并为一行（顿号分隔），避免每个州占一行；** 后空格可选（wiki 源两种形态都有）
  s = s.split("\n").reduce((acc, line) => {
    if (/^\*\* ?\S/.test(line)) {
      const bare = line.replace(/^\*\* ?/, "");
      if (acc.length && /^\*\* /.test(acc[acc.length - 1])) acc[acc.length - 1] += "、" + bare;
      else acc.push("** " + bare);
    } else acc.push(line);
    return acc;
  }, []).join("\n").replace(/^\*\* /gm, "");
  return translateEn(esc(s)
    .replace(/\\&quot;/g, "&quot;")                                   // \" 转义引号还原
    .replace(/\\'/g, "'")
    .replace(/\{\{icon\|([^}|]*)\}\}/gi, '<span class="ok">✓</span>')
    .replace(/\{\{flag\|([^|}]*)\|0\}\}/g, "$1")
    .replace(/\{\{flag\|([^|}]*)\|([^|}]*)\}\}/g, "$2")
    .replace(/\{\{flag\|([^|}]*)\}\}/g, "$1")
    .replace(/\{\{multiColumn\|\n?([\s\S]*?)\|\d+\}\}/gi, "$1")            // multiColumn 含列数参数（吞掉首换行保持组内紧凑）
    .replace(/\[\[File:[^\]]*\]\]/gi, "")                                  // 文件/图标链接整体清除（残段 24pxlink= 的源头）
    .replace(/\{\{collapse list\|/gi, "")
    .replace(/(^|\n)type=/g, "$1")                                          // collapse list 的 type= 参数名残留
    .replace(/\|?body=/g, "")                                               // collapse list 的 body= 参数分隔残留
    .replace(/\{\{collapse\|/gi, "")
    .replace(/\{\{DI\|([^}]*)\}\}/gi, "")
    .replace(/\{\{(?:iconify|ideology|technology|law|principle|concept)\|([^|}]*)[^}]*\}\}/gi, "$1")   // 带参模板取首参
    .replace(/\{\{red\|([^}]*)\}\}/gi, '<span class="red">$1</span>')
    .replace(/\{\{green\|([^}]*)\}\}/gi, '<span class="green">$1</span>')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\[\[[^\]]*\[[^\]]*\][^\]]*\]\]/g, (m) => {                  // 内嵌方括号的链接（如 [[A#b''The [Ruler Name] Restoration]]）：取 #/| 后的显示文本
      const inner = m.slice(2, -2);
      const after = inner.split(/#|\|/).pop() || inner;
      return after.replace(/^'+/, "");
    })
    .replace(/\{\{[^{}]*\}\}/g, "")                                   // 其余模板连同参数一并清除
    .replace(/\{\{/g, "")
    .replace(/\}\}/g, "")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<b>$1</b>")
    .replace(/\*\*([^*]+)\*\*/g, '<span class="subhead">$1</span>')      // ** 二级标题（州分组）
    .replace(/^\\\* /gm, "• ")
    .replace(/^\* /gm, "• ")
    .replace(/\n\|-?/g, "\n")
    .replace(/\|/g, "")
    .replace(zhNameRe, (m) => zhNameLookup.get(m.toLowerCase()) || m))
    .replace(/\n/g, "<br>");
}

const norm = (s) => String(s).toLowerCase().replace(/[\u2018\u2019\u02BC`]/g, "'").replace(/\s+/g, " ").trim();
let notesZh = {};
try {
  for (const f of fs.readdirSync(import.meta.dirname).filter(f => /^notes-zh-part\d+\.json$/.test(f))) {
    for (const line of fs.readFileSync(path.join(import.meta.dirname, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const item = JSON.parse(line); if (item.name && item.zh) notesZh[norm(item.name)] = item.zh; } catch {}
    }
  }
} catch {}
const enNameOf = (a) => (EN["ACHIEVEMENT_" + a.key] || "").trim(); // 成就 loc 键带 ACHIEVEMENT_ 前缀
const wikiAchByNorm = new Map();
for (const [k, v] of wikiAch) wikiAchByNorm.set(norm(k), v);
for (const a of achievements) {
  const w = wikiAchByNorm.get(norm(enNameOf(a)));
  if (w) {
    a.wikiPotential = wikiToHtml(w.potential);
    a.wikiRequirements = wikiToHtml(String(w.requirements).replace(/(\*\s*\[\[[^\]]+\]\]\s*(?:\r?\n|$))+/g, (m2) => m2.trim().split(/\r?\n/).map(x => x.replace(/^\*\s*/, "")).join("、") + "\n"));
    // wiki 条件文本里的中文州名 → 战略区域聚合（脚本 STATE_ 键之外的补充来源）
    {
      const plain = (String(a.wikiPotential || "") + String(a.wikiRequirements || "")).replace(/<[^>]+>/g, "");
      const srs = new Set(a.regions || []);
      for (const [zhName, stateKey] of ZH_STATE) {
        if (zhName.length >= 2 && plain.includes(zhName)) {
          const sr = STATE_TO_SR.get(stateKey);
          if (sr) srs.add(sr);
        }
      }
      a.regions = [...srs].map(k => SR_ZH.get(k) || k);
    }
    a.wikiNotes = wikiToHtml(w.notes);
    const zhNote = notesZh[norm(enNameOf(a))];
    if (zhNote) a.wikiNotes = wikiToHtml(zhNote);
    a._wikiFlags = [...new Set([...w.potential.matchAll(/\{\{flag\|([^|}]+)/g)].map(m => m[1].trim()))];
  }
}
// 维基资格条件补漏：数据无 related_countries 但维基 {{flag|X}} 有国家限定的成就（如大博弈→俄罗斯）
const WIKI_FLAG_TAG = {}; // 已停用：wiki 旗帜不再映射为求解器 tags
// setter 派生约束（全局门槛变量发放记录）已在 ACH_CONSTRAINTS 展开，此处 wiki 旗帜只作展示补充
for (const a of achievements) {
  if (a.tags.length || !a._wikiFlags) continue;
  const flags = a._wikiFlags.join("、");
  if (flags) a.countries = [...new Set([...a.countries, flags])];
}
const wikiMerged = achievements.filter(a => a.wikiRequirements || a.wikiPotential || a.wikiNotes).length;
console.log(`维基成就表: 命中 ${wikiMerged} / ${achievements.length}`);

// ---------- 中文攻略提示（人工翻译映射，覆盖则优先显示） ----------

// ---------- 修正案 ----------
const lawName = (key) => L(`law:${key}.name`) || pretty(key);
const laws = data.laws || [];
const lawGroupCat = new Map((data.lawGroups || []).map(g => [g.key, g.category || ""]));
const CAT_LABEL = { power_structure: "权力结构", economy: "经济", human_rights: "人权" };
const CAT_ORDER = ["权力结构", "经济", "人权", "其他"];
const lawCatByKey = new Map((data.laws || []).map(l => [l.key, CAT_LABEL[lawGroupCat.get(l.group_key)] || "其他"]));
const amendments = new Map();
for (const law of laws) for (const am of (law.amendments || [])) {
  if (!amendments.has(am.key)) amendments.set(am.key, { ...am, key: am.key });
}
const amendmentList = [...amendments.values()].map(am => ({
  key: am.key,
  name: L(am.loc?.name) || pretty(am.key),
  desc: L(am.loc?.description) || "",
  parent: am.parent_law || "",
  parentName: lawName(am.parent_law),
  parentCat: lawCatByKey.get(am.parent_law) || "其他",
  allowed: (am.allowed_laws || []).map(lawName),
  allowedKeys: (am.allowed_laws || []),
  effects: (am.modifiers || []).map(m => L(m.loc?.summary) || `${m.key} ${m.value_raw}`),
  igFlavor: (am.modifiers || []).map(m => m.key).filter(k => k.startsWith("interest_group_ig_")).map(k => k.replace("interest_group_ig_", "").replace(/_(add|mult|pol_str_mult).*$/, "")),
  trigger: am.possible?.raw || "",
  event: null, // 由维基事件表填充
  source: (am.source_file || "").split(/[\\/]/).pop(),
})).sort((a, b) => a.parentName.localeCompare(b.parentName, "zh-Hans") || a.name.localeCompare(b.name, "zh-Hans"));

// 维基事件表（辩论/推进/停滞）——解析自 vic3.paradoxwikis.com/Amendments
let amWikiText = "";
try { amWikiText = readWikiText(path.join(import.meta.dirname, "wiki-amendments.en.txt")); } catch {}
if (amWikiText) {
  const namePositions = [];
  for (const am of amendmentList) {
    const enName = (EN[am.key] || "").trim(); // 修正案裸键
    if (!enName) continue;
    const pos = amWikiText.indexOf("**" + enName + "**");
    if (pos >= 0) namePositions.push({ am, pos });
  }
  namePositions.sort((a, b) => a.pos - b.pos);
  let eventMapped = 0;
  namePositions.forEach((entry, i) => {
    const end = i + 1 < namePositions.length ? namePositions[i + 1].pos : amWikiText.length;
    const seg = amWikiText.slice(entry.pos, end);
    const m = seg.match(/\*\s*([^*(]+?)\s*\(\*\*(Debate|Advance|Stall)\*\*\)/);
    if (m) { entry.am.event = { type: m[2], name: m[1].trim() }; eventMapped++; }
  });
  console.log(`维基事件表: 定位 ${namePositions.length} / ${amendmentList.length}，命中事件 ${eventMapped}`);
}

// ---------- 公司 ----------
const buildingName = (key) => L(`building:${key}.name`) || pretty(key);
const prestigeName = (key) => L(`prestige_good:${key}.name`) || pretty(key);
const stateName = (key) => L(`state_region:${key}.name`) || pretty(key.replace(/^STATE_/, ""));
const techName = (key) => L(`technology:${key}.name`) || pretty(key);
// ---------- 产业分组与名贵商品分类（参考公司求解器/计算器） ----------
const INDUSTRY_GROUPS = [
  { key: "resources", label: "资源开采", buildings: ["building_coal_mine", "building_iron_mine", "building_lead_mine", "building_sulfur_mine", "building_gold_mine", "building_fishing_wharf", "building_whaling_station", "building_logging_camp", "building_rubber_plantation", "building_oil_rig"] },
  { key: "agriculture", label: "农业种植", buildings: ["building_wheat_farm", "building_rye_farm", "building_rice_farm", "building_maize_farm", "building_millet_farm", "building_livestock_ranch", "building_vineyard", "building_coffee_plantation", "building_tea_plantation", "building_tobacco_plantation", "building_opium_plantation", "building_banana_plantation", "building_sugar_plantation", "building_silk_plantation", "building_cotton_plantation", "building_dye_plantation"] },
  { key: "light_industry", label: "轻工业", buildings: ["building_glassworks", "building_textile_mill", "building_tooling_workshop", "building_furniture_manufactory", "building_food_industry", "building_shipyard", "building_paper_mill"] },
  { key: "heavy_military", label: "重工军事", buildings: ["building_electrics_industry", "building_motor_industry", "building_chemical_plant", "building_synthetics_plant", "building_steel_mill", "building_automotive_industry", "building_explosives_factory", "building_munition_plant", "building_artillery_foundry", "building_arms_industry"] },
  { key: "infrastructure", label: "基础设施", buildings: ["building_power_plant", "building_port", "building_trade_center", "building_railway", "building_art_academy"] },
];
const INDUSTRY_LABELS = Object.fromEntries(INDUSTRY_GROUPS.map(g => [g.key, g.label]));
const buildingIndustry = new Map();
for (const g of INDUSTRY_GROUPS) for (const b of g.buildings) buildingIndustry.set(b, g.key);
const GOOD_CAT_LABELS = { staple: "生活资料", luxury: "奢侈品", industrial: "工业品", military: "军用品", other: "其他" };
let _techIconFiles = null;
function techIconFile(t) {
  if (!_techIconFiles) {
    _techIconFiles = new Set();
    try { for (const f of fs.readdirSync(path.join(import.meta.dirname, "../assets/technologies"))) _techIconFiles.add(f); } catch {}
  }
  if (_techIconFiles.has(t.key + ".webp")) return t.key + ".webp";
  const base = String(t.icon || "").split("/").pop().replace(/\.dds$/i, "");
  if (base && _techIconFiles.has(base + ".webp")) return base + ".webp";
  return "";
}
const goodCatByKey = new Map((data.goods || []).map(g => [g.key, GOOD_CAT_LABELS[g.category] ? g.category : "other"]));
const baseGoodByPrestigeKey = new Map((data.prestigeGoods || []).map(p => [p.key, p.base_good_key]));

const companyIdx = new Map();
const companies = (data.companies || []).map((c, idx) => {
  companyIdx.set(c.key, idx);
  const goods = (c.possible_prestige_goods || []).map(p => {
    const bk = baseGoodByPrestigeKey.get(p.key || p) || "";
    return { key: bk, name: prestigeName(p.key || p), cat: goodCatByKey.get(bk) || "other" };
  });
  const inds = [...new Set([...(c.building_types || []).map(b => b?.key || b), ...(c.extension_building_types || []).map(b => b?.key || b)].map(bk => buildingIndustry.get(bk)).filter(Boolean))];
  return ({
  key: c.key,
  idx,
  iconFile: companyIconFile(c),
  hist: (c.company_kind || "") === "historical",
  restricted: (c.referenced_cultures || []).length > 0 || (c.referenced_countries || []).length > 0,
  name: L(c.loc?.name) || pretty(c.key),
  kind: c.company_kind || "",
  prestigeKind: c.prestige_goods_kind || "",
  fixed: (c.building_types || []).map(b => buildingName(b.key || b)),
  ext: (c.extension_building_types || []).map(b => buildingName(b.key || b)),
  prestige: (c.possible_prestige_goods || []).map(p => prestigeName(p.key || p)),
  gkeys: goods.map(g => g.key).filter(Boolean),
  gmeta: goods,
  inds,
  prosperity: (c.prosperity_modifiers || []).map(m => L(m.loc?.summary) || `${m.key} ${m.value_raw}`),
  states: (c.referenced_state_regions || []).map(r => stateName(r.key || r)),
  geoRegions: (c.referenced_geographic_regions || []).map(r => r.key || r),
  countries: (c.referenced_countries || []).map(x => countryName(x.key || x.tag || String(x.id || "").replace("country:", ""))),
  cultures: (c.referenced_cultures || []).map(x => L(x.loc?.name) || x.key || ""),
  techs: (c.required_technologies || []).map(t => techName(t.key || t)),
  potential: c.potential_raw || "",
  easterEgg: !!c.is_easter_egg_company,
  });
}).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans"));

// ---------- 公司图标映射（按键名或游戏图标路径名匹配 assets/companies/*.png） ----------
function companyIconFile(c) {
  if (!companyIconFile._files) {
    companyIconFile._files = new Set();
    try { for (const f of fs.readdirSync(path.join(import.meta.dirname, "../assets/companies"))) companyIconFile._files.add(f); } catch {}
  }
  const keyBase = String(c.key || "").replace(/^company_/, "");
  if (companyIconFile._files.has(keyBase + ".png")) return keyBase + ".png";
  const base = String(c.icon || "").split("/").pop().replace(/\.dds$/i, "");
  if (base && companyIconFile._files.has(base + ".png")) return base + ".png";
  return "";
}

// ---------- 公司可行性（生成期解析 potential，国家 → 可组建公司索引） ----------
const CONSTRAINT_RE = /has_interest_marker_in_region\s*=\s*sr:(\w+)|country_has_primary_culture\s*=\s*cu:(\w+)|\bc:(\w+)\s*\?=|was_formed_from\s*=\s*(\w+)|has_state_in_state_region\s*=\s*(\w+)/g;
const grabConstraints = (text) => [...text.matchAll(CONSTRAINT_RE)].map(m => {
  const [region, culture, c1, c2, state] = m.slice(1);
  if (region) return { type: "region", key: region };
  if (culture) return { type: "culture", key: culture };
  if (c1) return { type: "country", key: c1 };
  if (c2) return { type: "country", key: c2 };
  return { type: "state", key: state };
});
function constraintGroups(raw) {
  if (!raw) return [];
  const groups = [];
  const rest = String(raw).replace(/OR\s*=\s*\{([^{}]*)\}/gi, (_, inner) => {
    const cons = grabConstraints(inner);
    if (cons.length) groups.push(cons);
    return " ";
  });
  groups.push(...grabConstraints(rest).map(c => [c]));
  return groups;
}
for (const c of companies) c.groups = constraintGroups((data.companies || []).find(x => x.key === c.key)?.potential_raw || "");
const countryInfo = new Map();
for (const c of (data.countries || [])) {
  countryInfo.set(c.key, {
    regions: new Set((c.locationStrategicRegions || []).map(r => r.key)),
    states: new Set(c.startingStates || []),
    cultures: new Set(c.primaryCultures || []),
  });
}
const stateOwners = new Map();
for (const sr of (data.stateRegions || [])) {
  stateOwners.set(sr.key, new Set((sr.starting_owners || []).map(o => String(o?.key || o?.id || "").replace(/^country:/, ""))));
}
const groupPass = (g, tag, info) => g.some(({ type, key }) =>
  type === "region" ? info.regions.has(key)
  : type === "culture" ? info.cultures.has(key)
  : type === "country" ? tag === key
  : type === "state" ? (info.states.has(key) || (stateOwners.get(key)?.has(tag) ?? false))
  : true);
const possibleByCountry = {};
for (const [tag, info] of countryInfo) {
  const list = [];
  for (const c of companies) {
    if (c.groups.length && c.groups.every(g => groupPass(g, tag, info))) list.push(c.idx);
  }
  if (list.length) possibleByCountry[tag] = list;
}
const countryNamesByTag = {};
for (const c of (data.countries || [])) { if (!c.existsAtStart) continue; const n = countryName(c.key); if (n && n !== c.key) countryNamesByTag[c.key] = n; }
const freeCompanyIdx = companies.filter(c => !c.groups.length).map(c => c.idx);
// 名贵商品分类元数据 + 产业 pills + 公司数量选项（参考公司求解器/计算器）
const CO_GOOD_META = {};
for (const c of companies) for (const g of (c.gmeta || [])) { if (g.key && !CO_GOOD_META[g.key]) CO_GOOD_META[g.key] = { n: g.name, c: g.cat }; }
const GOOD_CATS = [...new Set(Object.values(CO_GOOD_META).map(g => g.c))].sort((a, b) => (GOOD_CAT_LABELS[a] || "z").localeCompare(GOOD_CAT_LABELS[b] || "z", "zh-Hans"));
const goodsPanelHtml = GOOD_CATS.map(cat => {
  const chips = Object.entries(CO_GOOD_META).filter(([, g]) => g.c === cat).sort((a, b) => a[1].n.localeCompare(b[1].n, "zh-Hans")).map(([k, g]) => `<button type="button" class="pill-btn good-chip" data-gkey="${esc(k)}">${esc(g.n)}</button>`).join("");
  return chips ? `<div class="goods-cat"><b>${esc(GOOD_CAT_LABELS[cat] || cat)}</b><div class="goods-chips">${chips}</div></div>` : "";
}).join("");
const industryPillsHtml = INDUSTRY_GROUPS.map(g => `<button type="button" class="pill-btn ind-chip" data-ind="${esc(g.key)}">${esc(g.label)}</button>`).join("");
const coCountOptions = [1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === 3 ? " selected" : ""}>${n} 家</option>`).join("");

// ---------- 渲染 ----------
const fmtScript = (raw) => raw ? `<pre class="script">${esc(raw)}</pre>` : `<span class="none">（无条件/恒真）</span>`;
const IG_ZH = { armed_forces: "军队", devout: "教会", industrialists: "实业家", intelligentsia: "知识分子", landowners: "地主", rural_folk: "乡村民众", trade_unions: "工会", capitalists: "资本家", petty_bourgeoisie: "小市民", bureaucrats: "官僚", machinists: "机械师" };
const igNames = (flavors) => flavors.map(f => IG_ZH[f] || f).join("、");

const achievementCard = (a) => `
<article class="card" data-search="${esc((a.name + " " + a.desc + " " + a.happened).toLowerCase())}" data-kind="achievement" data-dlc-id="${esc(a.dlcId || "base")}">
  <div class="card-head-grid"><img class="icon" src="${a.icon}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
    <h4>${esc(a.name)}</h4>
    <span class="tag">${esc(a.groupLabel)}</span>
    <span class="sub">${esc(a.source)}</span>
    <span class="ach-marks"><button type="button" class="mark-btn want" data-ach="${esc(a.key)}" title="正向选择：优先完成">优先</button><button type="button" class="mark-btn done" data-ach="${esc(a.key)}" title="排除：已完成">已完成</button></span></div>
  ${a.dlc ? `<div class="dlc-line"><img class="dlc-icon" src="${ACH_DLC[a.dlcId]?.icon || ""}" alt="" loading="lazy"><div class="dlc-names"><span class="dlc-label">需要DLC</span><span class="dlc-name">${esc(DLC_ZH_NAME[a.dlcId] || a.dlc.name)}</span></div></div>` : ""}
  ${ACH_ORIGIN[a.key] ? `<details class="origin-box"><summary>成就来源</summary><p class="origin-text"><b>${esc(ACH_ORIGIN[a.key].o)}</b> — ${esc(ACH_ORIGIN[a.key].t)}</p></details>` : ""}
  <p class="desc">${esc(a.desc)}</p>
  ${a.cultureNeed ? `<p class="meta"><b>⚠ 需转变主流文化为「${esc(a.cultureNeed)}」</b>（1836 年无此主流文化国家，不计入求解器）</p>` : ""}
  ${a.countries.length ? `<p class="meta">相关国家：<span class="country-short">${esc(a.countries.slice(0, 15).join("、"))}</span>${a.countries.length > 15 ? `<span class="country-rest" hidden>${esc(a.countries.slice(15).join("、"))}</span><span class="country-more">等共 ${a.countries.length} 国 <button type="button" class="country-toggle">显示所有国家</button></span>` : ""}</p>` : ""}
  ${a.regions?.length ? `<p class="meta"><b>涉及战略区域：</b>${a.regions.map(r => esc(r)).join("、")}</p>` : ""}
  ${a.wikiPotential ? `<p class="meta"><b>资格条件：</b><br>${a.wikiPotential}</p>` : ""}
  ${a.wikiRequirements ? `<p class="meta"><b>真实达成条件（含脚本触发器解码）：</b><br>${a.wikiRequirements}</p>` : ""}
  ${a.wikiNotes ? `<p class="meta"><b>攻略提示：</b><br>${a.wikiNotes}</p>` : ""}
  <details><summary>需求脚本（游戏原文）</summary>${fmtScript(a.happened)}</details>
</article>`;

const amendmentCard = (a) => `
<article class="card" data-search="${esc((a.name + " " + a.desc + " " + a.parentName).toLowerCase())}" data-kind="amendment" data-ig="${esc(a.igFlavor.join(","))}" data-cat="${esc(a.parentCat)}" data-groups="${esc(a.groupList.join("|"))}" data-parent="${esc(a.parent)}" data-allowed="${esc(a.allowedKeys.join("|"))}">
  <div class="card-head"><div><h4>${esc(a.name)}</h4><span class="sub">${esc(a.source)}</span></div>
    <span class="tag">${esc(a.event ? (a.event.type === "Debate" ? "辩论事件" : a.event.type === "Advance" ? "推进事件" : "停滞事件") : "立法事件")}${a.event ? "：" + esc(a.event.name) : ""}</span></div>
  ${a.desc ? `<p class="desc">${esc(a.desc)}</p>` : ""}
  <p class="meta">父法：<a href="laws.html#${esc(a.parent)}">${esc(a.parentName)}</a></p>
  ${a.effects.length ? `<p class="meta">效果：${esc(a.effects.join("；"))}</p>` : ""}
  <p class="meta">获取要点：立法「${esc(a.parentName)}」期间，把${esc(a.igFlavor.length ? igNames(a.igFlavor) : "相关")}利益集团拉进政府，等待「${esc(a.event?.name || "对应")}」事件出现并接受修正案。</p>
  ${a.allowed.length ? `<p class="meta"><b>适用法律：</b>${a.allowed.map(x => `<a href="laws.html#${esc(laws.find(l => l.key === x)?.key || x)}">${esc(x)}</a>`).join("、")}</p>` : ""}
  <details><summary>触发脚本（原样截取）</summary>${fmtScript(a.trigger)}</details>
</article>`;

const companyCard = (c) => `
<article class="card" data-search="${esc((c.name + " " + c.key + " " + c.fixed.join(" ") + " " + c.ext.join(" ") + " " + c.prestige.join(" ") + " " + c.states.join(" ") + " " + c.cultures.join(" ") + " " + c.techs.join(" ") + " " + c.countries.join(" ")).toLowerCase())}" data-kind="company" data-prestige="${c.prestige.length ? 1 : 0}" data-egg="${c.easterEgg ? 1 : 0}" data-hist="${c.hist ? 1 : 0}" data-restricted="${c.restricted ? 1 : 0}" data-idx="${c.idx}" data-goods="${esc(c.prestige.join("|"))}" data-buildings="${esc(c.fixed.concat(c.ext).join("|"))}" data-gkeys="${esc(c.gkeys.join("|"))}" data-inds="${esc(c.inds.join("|"))}">
  <div class="card-head">${c.iconFile ? `<img class="icon" src="assets/companies/${esc(c.iconFile)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}<div><h4>${esc(c.name)}</h4><span class="sub">${esc(c.key)}</span></div>
    <span class="tag">${c.hist ? "史实公司" : c.kind === "generic" ? "通用公司" : "彩蛋公司"}</span></div>
  <p class="meta"><b>固定建筑：</b>${esc(c.fixed.join("、")) || "（无）"}<br>
    ${c.ext.length ? `<b>可选扩展：</b>${esc(c.ext.join("、"))}<br>` : ""}
    ${c.prestige.length ? `<b>名贵商品：</b>${esc(c.prestige.join("、"))}<br>` : ""}
    ${c.states.length ? `<b>可达州：</b>${esc(c.states.join("、"))}<br>` : ""}
    ${c.cultures.length ? `<b>适用文化：</b>${esc(c.cultures.join("、"))}<br>` : ""}
    ${c.countries.length ? `<b>关联国家：</b>${esc(c.countries.join("、"))}<br>` : ""}
    ${c.techs.length ? `<b>需求科技：</b>${esc(c.techs.join("、"))}<br>` : ""}
    ${c.potential ? `<b>潜力条件：</b>${esc(c.potential.replace(/\s+/g, " "))}` : ""}</p>
  ${c.prosperity.length ? `<p class="meta"><b>繁荣加成：</b>${esc(c.prosperity.join("；"))}</p>` : ""}
</article>`;

const groupSections = (list, render, orderMap) => {
  const byGroup = new Map();
  for (const item of list) {
    const g = item.groupLabel || "其他";
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(item);
  }
  const orderOf = (label) => {
    if (!orderMap) return 0;
    const idx = Object.values(orderMap).indexOf(label);
    return idx < 0 ? 9 : idx;
  };
  return [...byGroup.entries()]
    .sort((a, b) => orderOf(a[0]) - orderOf(b[0]))
    .map(([g, items]) => `
    <details class="group-fold" open><summary class="group-title">${esc(g)} <span class="count">${items.length}</span></summary>
    <div class="grid">${items.map(render).join("")}</div></details>`).join("");
};

// ---------- 科技 ----------
const TECH_CAT_ZH = { production: "生产", military: "军事", society: "社会" };
let TECH_EVENTS = {};
let TECH_EVENTS_ENTRIES = [];
try {
  const teRaw = fs.readFileSync(path.join(import.meta.dirname, "tech-events.json"), "utf8").replace(/^\uFEFF/, "");
  const teJson = JSON.parse(teRaw);
  TECH_EVENTS_ENTRIES = teJson.entries || [];
  for (const e of (teJson.entries || [])) {
    if (!TECH_EVENTS[e.tech]) TECH_EVENTS[e.tech] = [];
    TECH_EVENTS[e.tech].push({ title: e.title || "", text: e.text || "", source: e.source || "", eventId: e.eventId || "" });
  }
} catch {}
const techList = (data.technologies || []).map(t => ({
  key: t.key,
  name: L(t.loc?.name) || pretty(t.key),
  desc: L(t.loc?.description) || "",
  era: t.era || "",
  eraLabel: (t.era || "").replace(/^era_(\d)$/, "第$1时代"),
  cat: t.category || "",
  mods: (t.modifiers || []).map(m => L(m.loc?.summary) || `${m.key} ${m.value_raw}`),
  prereq: (t.prerequisites || []).map(p => { const k = p?.key || p; const src = (data.technologies || []).find(x => x.key === k); return src ? (L(src.loc?.name) || pretty(k)) : pretty(k); }),
  prereqKeys: (t.prerequisites || []).map(p => p?.key || p),
  cost: t.era_cost || 0,
  unlocksPm: (((t.references || {}).production_methods || [])).map(p => {
    const pk = p.key || p;
    const pm = (data.productionMethods || data.production_methods || []).find(x => x.key === pk);
    const nm = pm ? (L(pm.loc?.name) || pretty(pk)) : pretty(pk);
    let bld = "";
    for (const g of (data.productionMethodGroups || [])) if ((g.production_method_keys || []).includes(pk)) { const m = g.key.match(/_building_(.+)$/); if (m) { bld = m[1]; break; } }
    return { name: nm, bld };
  }),
  sortOrder: t.sort_order ?? 0,
  iconFile: techIconFile(t),
  events: TECH_EVENTS[t.key] || [],
})).sort((a, b) => (a.era || "").localeCompare(b.era || "") || a.name.localeCompare(b.name, "zh-Hans"));
for (const t of techList) t.followUps = techList.filter(x => x.prereqKeys.includes(t.key)).map(x => x.name);
const TECH_PAGE_COUNTS = {};
  const EVENTS_LIST = [];
  // 事件文本清理：[SCOPE.sState('x').GetName] 等运行时作用域模板（渲染时才有值）→「该州」；其余 ROOT/Prev 链删除；Get 链直译重复「该地的该地」→「该地」
  const evText = (s) => esc(String(s || "")).replace(/\[SCOPE\.sState\('[^']*'\)\.GetName\]/g, "该州").replace(/\[(SCOPE|ROOT|Prev|FIXED)[^\]]*\]/g, "").replace(/该地的该地/g, "该地");
  const evTitle = (s) => evText(s).replace(/^该州/, "");
  {
    const nameByKey = new Map(techList.map(t => [t.key, t.name]));
    for (const e of TECH_EVENTS_ENTRIES) {
      EVENTS_LIST.push({ ...e, techName: nameByKey.get(e.tech) || e.tech, evKey: String(e.eventId || e.tech).replace(/\./g, "-") });
    }
  }
  const eventCards = EVENTS_LIST.map(e => `
<article class="card" data-search="${evTitle(e.title) + " " + evText(e.text) + " " + esc(e.techName).toLowerCase()}" data-kind="event" data-evkey="${esc(e.evKey)}">
  <div class="card-head"><div><h4>${evTitle(e.title)}</h4><span class="sub">${esc(e.eventId)}</span></div>${e.value ? `<span class="tag">研发进度 +${esc(e.value)}</span>` : ""}</div>
  <p class="desc">${evText(e.text)}</p>
  <p class="meta"><b>影响科技：</b><button type="button" class="tech-jump" data-tech="${esc(e.tech)}">${esc(e.techName)}</button></p>
</article>`).join("");
for (const t of techList) TECH_PAGE_COUNTS[t.cat] = (TECH_PAGE_COUNTS[t.cat] || 0) + 1;
const techCard = (t) => `
<article class="card" data-search="${esc((t.name + " " + t.desc + " " + t.mods.join(" ")).toLowerCase())}" data-kind="tech" data-era="${esc(t.era)}" data-cat="${esc(t.cat)}">
  <div class="card-head"><img class="icon" src="${t.iconFile ? `assets/technologies/${esc(t.iconFile)}` : ""}" alt="" loading="lazy" ${t.iconFile ? "" : "style=\"display:none\""} onerror="this.style.display='none'">
    <div><h4>${esc(t.name)}</h4><span class="sub">${esc(t.eraLabel)} · ${esc(TECH_CAT_ZH[t.cat] || t.cat)} · ${(t.cost || 0).toLocaleString()} 创新力${t.prereq.length ? " · 前置：" + esc(t.prereq.join("、")) : ""}</span></div></div>
  ${t.desc ? `<p class="desc">${esc(t.desc)}</p>` : ""}
  ${t.mods.length ? `<p class="meta">${t.mods.map(m => `<span class="ok">▸</span> ${esc(m)}`).join("<br>")}</p>` : ""}
  ${t.unlocksPm.length ? `<p class="meta"><b>解锁生产方式：</b>${t.unlocksPm.map(u => `<button type="button" class="pm-link" data-bld="${esc(u.bld)}">${esc(u.name)}</button>`).join("、")}</p>` : ""}
  ${t.followUps.length ? `<p class="meta"><b>后续科技：</b>${esc(t.followUps.join("、"))}</p>` : ""}
  ${t.events.length ? `<p class="meta tech-events">${t.events.map(ev => `<b>📌 ${evTitle(ev.title)}</b>　${evText(ev.text)}<br><span class="ev-src">—— <button type="button" class="ev-link" data-ev="${esc(ev.eventId || "")}">${esc(ev.source)}</button></span>`).join("<br>")}</p>` : ""}
</article>`;
const techEraSections = ["era_1", "era_2", "era_3", "era_4", "era_5"].map(era => {
  const items = techList.filter(t => t.era === era);
  if (!items.length) return "";
  return `<details class="group-fold" open><summary class="group-title">${esc(items[0].eraLabel || era)} <span class="count">${items.length}</span></summary><div class="grid">${items.map(techCard).join("")}</div></details>`;
}).join("");
const techEraTabs = ["era_1", "era_2", "era_3", "era_4", "era_5"].map(era => {
  const items = techList.filter(t => t.era === era);
  return items.length ? `<button type="button" class="subtab" data-era="${era}">${esc(items[0].eraLabel || era)}（${items.length}）</button>` : "";
}).join("");

// ---------- 修正案三级菜单数据（大类 → 法律组 → 法律） ----------
const lawGroupZh = (k) => L(`law_group:${k}.name`) || L(`lawgroup:${k}.name`) || pretty(k);
const amLawKeys = [...new Set(amendmentList.flatMap(a => [a.parent, ...a.allowedKeys]).filter(Boolean))];
const AM_GROUP_LAWS = {};
for (const k of amLawKeys) {
  const gk = (laws.find(l => l.key === k) || {}).group_key || "other";
  (AM_GROUP_LAWS[gk] = AM_GROUP_LAWS[gk] || []).push([k, lawName(k)]);
}
const CAT_AM_GROUPS = {};
for (const [gk, ls] of Object.entries(AM_GROUP_LAWS)) {
  const cat = lawCatByKey.get(ls[0][0]) || "其他";
  (CAT_AM_GROUPS[cat] = CAT_AM_GROUPS[cat] || []).push([gk, lawGroupZh(gk)]);
}
for (const a of amendmentList) {
  const gs = new Set();
  for (const k of [a.parent, ...a.allowedKeys]) { const gk = (laws.find(l => l.key === k) || {}).group_key; if (gk) gs.add(gk); }
  a.groupList = [...gs];
}
const CAT_LAWS = {};
for (const cat of ["权力结构", "经济", "人权"]) {
  CAT_LAWS[cat] = amLawKeys.filter(k => lawCatByKey.get(k) === cat).sort((a, b) => lawName(a).localeCompare(lawName(b), "zh-Hans")).map(k => [k, lawName(k)]);
}
const amCategorySections = CAT_ORDER.map(cat => {
  const items = amendmentList.filter(a => a.parentCat === cat);
  if (!items.length) return "";
  return `<details class="group-fold" open><summary class="group-title">${esc(cat)} <span class="count">${items.length}</span></summary><div class="grid">${items.map(amendmentCard).join("")}</div></details>`;
}).join("");

  const goodZh = (gk) => GAME_ZH[gk] || L(`goods:${gk}.name`) || pretty(gk);
  const popZh = (pk) => {
    const a = GAME_ZH[pk + "_no_icon"], b = GAME_ZH[pk];
    if (a && !a.startsWith("@")) return a;
    if (b && !b.startsWith("@")) return b;
    return L(`pop_type:${pk}.name`) || pretty(pk);
  };
  const effectZh = (key, val) => {
    let m;
    if ((m = key.match(/^goods_input_(\w+?)_add$/))) return "投入：" + goodZh(m[1]) + " " + (val > 0 ? "+" : "") + val;
    if ((m = key.match(/^goods_output_(\w+?)_add$/))) return "产出：" + goodZh(m[1]) + " " + (val > 0 ? "+" : "") + val;
    if ((m = key.match(/^building_employment_(\w+?)_add$/))) return "雇佣：" + popZh(m[1]) + " " + (val > 0 ? "+" : "") + val;
    if ((m = key.match(/^building_throughput_(\w+?)_add$/))) return "该建筑吞吐 " + (val > 0 ? "+" : "") + val + "%";
    if (/pollution/.test(key)) return "地区污染 " + (val > 0 ? "+" : "") + val;
    if (/^state_migration_(\w+)_add$/.test(key)) return "迁徙吸引 " + (val > 0 ? "+" : "") + val;
    return L(key) || key;
  };

  // ---------- 建筑（含生产方式交互） ----------
  const PMG_BY_KEY = new Map((data.productionMethodGroups || []).map(g => [g.key, g]));
  const PM_BY_KEY = new Map((data.productionMethods || []).map(x => [x.key, x]));
  const BOARD_ORDER = ["agriculture", "resources", "industry", "infrastructure", "military", "ownership", "wonders"];
  const buildings = (data.buildings || []).map(b => {
    const groups = (b.production_method_group_keys || []).map(gk => {
      const g = PMG_BY_KEY.get(gk);
      if (!g) return null;
      const options = (g.production_method_keys || []).map(pk => {
        const pm = PM_BY_KEY.get(pk);
        if (!pm || pm.vc_change_kind) return null;   // VC 变体不复刻
        const effects = (pm.effects || []).map(e => ({ s: effectZh(e.key, e.value ?? 0), v: e.value ?? "", scaling: e.scaling || "" }));
        return { key: pk, name: L(pm.loc?.name) || pretty(pk), tech: (pm.unlocking_technologies || []).map(x => L(x.loc?.name) || pretty(x.key || x)), effects, vc: !!pm.vc_change_kind };
      }).filter(Boolean);
      if (!options.length) return null;
      return { key: gk, name: L(g.loc?.name) || pretty(gk), options };
    }).filter(Boolean);
    return {
      key: b.key,
      name: L(b.loc?.name) || pretty(b.key),
      icon: "assets/buildings/" + b.key + ".webp",
      board: b.board_group?.key || "other",
      boardLabel: L(b.board_group?.loc?.name) || pretty(b.board_group?.key || ""),
      boardOrder: b.board_group?.order ?? 99,
      groupLabel: L(b.building_group?.loc?.categoryName) || L(b.building_group?.loc?.name) || pretty(b.building_group?.key || ""),
      unlockTechs: (b.unlocking_technologies || []).map(x => L(x.loc?.name) || pretty(x.key || x)),
      construction: pretty(b.required_construction || ""),
      groups,
    };
  });
  // 奇观分级变体去重（kaiserforum_1..4 / sagrada_familia_1..3 同名同图标只是等级档位，保留首级）
  {
    const seen = new Set();
    for (let i = 0; i < buildings.length; i++) {
      const k = buildings[i].key;
      if (!/_\d+$/.test(k)) continue;
      const base = k.replace(/_\d+$/, "");
      if (seen.has(base)) { buildings.splice(i, 1); i--; }
      else seen.add(base);
    }
  }
  const bldBoardSections = BOARD_ORDER.map(bk => {
    const items = buildings.filter(b => b.board === bk).sort((a, b) => a.boardOrder - b.boardOrder || a.name.localeCompare(b.name, "zh-Hans"));
    if (!items.length) return "";
    const label = items[0].boardLabel || bk;
    return '<details class="group-fold" open><summary class="group-title">' + esc(label) + ' <span class="count">' + items.length + '</span></summary><div class="bld-grid">' +
      items.map(b => '<article class="bld-card" data-bld="' + b.key + '" data-search="' + esc((b.name + " " + b.key).toLowerCase()) + '"><img src="' + b.icon + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"><span>' + esc(b.name) + '</span></article>').join("") +
      '</div></details>';
  }).join("");
  const bldDetailsHtml = buildings.map(b => {
    const groupHtml = b.groups.map(g => '<div class="pmg"><div class="pmg-name">' + esc(g.name) + '</div><div class="pmg-opts">' +
      g.options.map((o, oi) => '<button type="button" class="pm-opt' + (oi === 0 ? " is-sel" : "") + '" data-pm="' + esc(o.key) + '" data-effects="' + esc(JSON.stringify(o.effects)) + '">' + esc(o.name) + (o.tech.length ? '<span class="pm-tech">' + esc(o.tech.join("、")) + '</span>' : '') + '</button>').join("") +
      '</div></div>').join("");
    return '<div class="bld-det" id="bld-det-' + b.key + '" style="display:none">' +
      '<h4><img src="' + b.icon + '" style="width:30px;height:30px;vertical-align:-8px;margin-right:8px" onerror="this.style.display=&quot;none&quot;">' + esc(b.name) + '　<span style="font-weight:400;font-size:12px;color:var(--ink-soft)">' + esc(b.key) + '</span></h4>' +
      '<p class="meta">' + esc(b.groupLabel) + (b.unlockTechs.length ? '<br><b>解锁科技：</b>' + esc(b.unlockTechs.join("、")) : '') + (b.construction ? '<br><b>建造：</b>' + esc(b.construction) : '') + '</p>' +
      groupHtml +
      '<div class="pmg"><div class="pmg-name">当前组合合计</div><div class="pm-sum" data-sum></div></div>' +
      '</div>';
  }).join("");


const html = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vicdata 目标指南 · 成就 / 修正案 / 公司</title>
<style>
${SHELL_CSS}
  section h2{font-size:24px;margin:38px 0 6px;padding-left:12px;border-left:5px solid var(--gold);letter-spacing:1px}
  section p.mech{background:var(--parchment-2);border:1px solid var(--line);border-radius:8px;padding:12px 16px;font-size:14px;line-height:1.8;color:var(--ink-soft)}
  h3.group-title{margin:26px 0 10px;font-size:18px;color:var(--red)}
  h3.group-title .count{color:var(--ink-soft);font-size:13px;font-weight:400;margin-left:6px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
  .card{background:var(--parchment-2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;box-shadow:2px 3px 0 rgba(139,109,59,.12)}
  .card-head{display:flex;gap:10px;align-items:flex-start}
  .card-head-grid{display:grid;grid-template-columns:56px minmax(0,1fr) auto;grid-template-rows:auto auto;grid-template-areas:"icon name diff" "icon file marks";column-gap:12px;row-gap:6px;align-items:center}
  .card-head-grid .icon{grid-area:icon;width:56px;height:56px;border:1px solid var(--line);border-radius:6px;background:var(--parchment);object-fit:cover}
  .card-head-grid h4{grid-area:name;margin:0;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card-head-grid .tag{grid-area:diff}
  .card-head-grid .sub{grid-area:file;font-size:11px;color:var(--ink-soft);font-family:Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card-head-grid .ach-marks{grid-area:marks}
  .card-head-grid .ach-marks{grid-area:marks}
  .section-sub{margin:2px 0 10px;color:var(--ink-soft);font-weight:400;font-size:14px}
  .law-pills{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 14px}
  .law-pill{cursor:pointer;border:1px solid var(--line);background:var(--parchment-2);color:var(--ink-soft);border-radius:999px;padding:3px 14px;font-size:12.5px;font-family:inherit}
  .law-pill:hover{border-color:var(--gold);color:var(--ink)}
  .law-pill.is-on{border-color:var(--gold);color:#fff;background:var(--gold)}
  #am-selects select{border:1px solid var(--line);background:var(--parchment-2);color:var(--ink);border-radius:8px;padding:5px 10px;font-size:13px;font-family:inherit}
  #am-selects .tb-label{font-size:12.5px;color:var(--ink-soft)}
  .card-head-grid .tag{flex:none;font-size:12px;border:1px solid var(--gold);color:var(--gold);border-radius:999px;padding:2px 10px;background:rgba(200,164,91,.12);align-self:center}
  .card-head>div{min-width:0;flex:1}
  .card-head .icon{width:44px;height:44px;border:1px solid var(--line);border-radius:6px;background:var(--parchment);object-fit:cover}
  .dlc-line{display:flex;align-items:center;gap:10px;margin:8px 0 2px}
  .dlc-icon{width:30px;height:30px;object-fit:contain;flex:none;border-radius:50%;background:var(--parchment);border:1px solid var(--line)}
  .dlc-names{display:flex;flex-direction:column;line-height:1.35}
  .dlc-label{font-size:11px;color:var(--ink-soft)}
  .dlc-name{font-size:13.5px;font-weight:600;color:var(--ink)}
  .origin-box{margin:6px 0 2px;border:1px solid var(--line);border-radius:8px;background:var(--parchment-2)}
  .origin-box summary{cursor:pointer;padding:6px 12px;font-size:12.5px;font-weight:600;color:var(--gold);list-style:none}
  .origin-box summary::-webkit-details-marker{display:none}
  .origin-box summary::before{content:"▸ "}
  .origin-box[open] summary::before{content:"▾ "}
  .origin-box[open] summary{border-bottom:1px dashed var(--line)}
  .origin-text{margin:8px 12px;font-size:13px;line-height:1.85;color:var(--ink-soft)}
  .origin-text b{color:var(--ink)}
  .country-more{color:var(--gold);font-size:12.5px;white-space:nowrap}
  .country-toggle{cursor:pointer;border:1px solid var(--gold);background:rgba(200,164,91,.12);color:var(--gold);border-radius:999px;padding:1px 10px;font-size:12px;font-family:inherit}
  .country-toggle:hover{background:rgba(200,164,91,.25)}
  .card-head h4{margin:0;font-size:16px}
  .card-head .sub{font-size:11px;color:var(--ink-soft);font-family:Consolas,monospace;overflow-wrap:anywhere}
  .card-head .tag{margin-left:auto;flex:none;font-size:12px;border:1px solid var(--gold);color:var(--gold);border-radius:999px;padding:2px 10px;background:rgba(200,164,91,.12)}
  .desc{font-size:13.5px;line-height:1.7;margin:8px 0 4px}
  .meta{font-size:12.5px;line-height:1.7;margin:6px 0;color:var(--ink-soft)}
  .meta b{color:var(--ink)}
  .meta a{color:var(--gold);text-decoration:none;border-bottom:1px dashed var(--line)}
  .subhead{display:block;margin:6px 0 2px;color:var(--ink);font-weight:700}
  details{margin-top:8px}
  details summary{cursor:pointer;font-size:13px;color:var(--gold);font-weight:600}
  pre.script{background:#2e2a20;color:#efe3c8;border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.6;overflow-x:auto;white-space:pre-wrap;font-family:Consolas,monospace}
  .none{font-size:12.5px;color:var(--ink-soft)}
  .ok{color:var(--gold);font-weight:700}
  .toolbar{position:sticky;top:0;z-index:9;display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:10px 2px;background:linear-gradient(var(--parchment) 85%, rgba(240,228,200,0))}
  .toolbar input{flex:1;min-width:220px;padding:8px 12px;border:1px solid var(--gold);border-radius:8px;background:var(--parchment-2);color:var(--ink);font:inherit;font-size:14px}
  .toolbar label{font-size:13.5px;color:var(--ink-soft);display:inline-flex;gap:6px;align-items:center;cursor:pointer}
  .empty{padding:30px;text-align:center;color:var(--ink-soft)}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 6px}
  .tabs .tablink{padding:9px 18px;border:1px solid var(--gold);border-radius:999px;background:var(--parchment-2);color:var(--ink);text-decoration:none;font-size:14px;font-weight:600}
  .tabs .tablink.is-active{background:var(--gold);color:#fff;border-color:var(--gold)}
  .toolbar select{padding:7px 10px;border:1px solid var(--gold);border-radius:8px;background:var(--parchment-2);color:var(--ink);font:inherit;font-size:13px;max-width:230px}
  .toolbar .count{font-size:12.5px;color:var(--ink-soft);margin-left:auto;white-space:nowrap}
  .top-row{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
  .refs{font-size:12px;color:var(--ink-soft);display:flex;gap:8px;flex-wrap:wrap;align-items:center;max-width:460px;justify-content:flex-end}
  .refs a{color:var(--gold);text-decoration:none;border-bottom:1px dashed var(--line);white-space:nowrap}
  .refs .refs-label{white-space:nowrap}
  .mech-list{margin:6px 0;padding-left:22px;font-size:13px;line-height:1.9;color:var(--ink-soft)}
 .rules-panel{margin:10px 0;border:1px solid var(--line);border-radius:10px;background:var(--parchment-2)}
 .rules-panel > summary{cursor:pointer;padding:9px 16px;font-size:13px;font-weight:600;color:var(--gold);list-style:none}
 .rules-panel > summary::-webkit-details-marker{display:none}
 .rules-panel > summary::before{content:"▸ "}
 .rules-panel[open] > summary::before{content:"▾ "}
 .rules-panel[open] > summary{border-bottom:1px solid var(--line)}
 .rules-body{padding:4px 16px 12px}
 .rules-body code{font-size:12px;background:var(--parchment);border:1px solid var(--line);border-radius:4px;padding:1px 5px}
  .mech-list b{color:var(--ink)}
  details.group-fold{margin:10px 0}
  details.group-fold > summary.group-title{cursor:pointer;user-select:none;font-size:19px;font-weight:700;color:var(--red);margin:14px 0 6px}
  details.group-fold > summary.group-title .count{font-size:14px;font-weight:400;color:var(--ink-soft);margin-left:6px}
  details.group-fold > summary.group-title::marker{color:var(--gold)}
  .subtabs{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0}
  .subtab{font:inherit;font-size:13px;padding:5px 13px;border:1px solid var(--line);border-radius:999px;background:var(--parchment-2);color:var(--ink-soft);cursor:pointer}
  .subtab:hover{border-color:var(--gold);color:var(--gold)}
  .subtab.is-active{background:var(--gold);border-color:var(--gold);color:#fff;font-weight:600}
  .mark-btn{font:inherit;font-size:11px;padding:2px 8px;border:1px solid var(--line);border-radius:999px;background:var(--parchment-2);color:var(--ink-soft);cursor:pointer}
  .mark-btn.want.is-on{border-color:var(--gold);background:rgba(200,164,91,.18);color:var(--gold);font-weight:700}
  .mark-btn.done.is-on{border-color:#7a9a6d;background:rgba(122,154,109,.16);color:#5a7a4d;font-weight:700}
  .ach-marks{display:flex;gap:4px;flex:none}
  .ach-actions{display:flex;justify-content:flex-end;margin:2px 0 6px}
  .solve-btn{font:inherit;font-size:13px;font-weight:600;padding:7px 14px;border:1px solid var(--gold);border-radius:8px;background:rgba(200,164,91,.14);color:var(--gold);cursor:pointer;white-space:nowrap}
  .solve-btn:hover{background:rgba(200,164,91,.28)}
  .solve-result{margin:10px 0;padding:12px 14px;border:1px solid var(--gold);border-radius:10px;background:var(--parchment-2)}
  .solve-result h4{margin:0 0 8px;font-size:14px}
  .solve-row{display:flex;gap:8px;align-items:baseline;padding:4px 0;border-bottom:1px dashed var(--line);font-size:13px}
  .solve-row:last-child{border-bottom:none}
  .solve-row .rank{color:var(--gold);font-weight:700;flex:none;width:34px}
  .solve-row details{margin:0;flex:1}
  .solve-row summary{cursor:pointer;color:var(--gold);font-size:12.5px}
  .chip-list{display:flex;flex-wrap:wrap;gap:5px;padding:6px 0}
  .ach-chip{display:inline-flex;gap:3px;align-items:center;font-size:12.5px;padding:2px 6px 2px 9px;border:1px solid var(--line);border-radius:999px;background:var(--parchment);color:var(--ink);cursor:pointer}
  .ach-chip.is-want{border-color:var(--gold);background:rgba(200,164,91,.16)}
  .ach-chip.is-done{border-color:#7a9a6d;background:rgba(122,154,109,.14);text-decoration:line-through;color:var(--ink-soft)}
  .chip-btn{font:inherit;font-size:10.5px;line-height:1;padding:2px 5px;border:none;border-left:1px dashed var(--line);background:transparent;color:var(--ink-soft);cursor:pointer}
  .ach-chip.is-want .chip-want,.ach-chip.is-done .chip-done{color:var(--gold);font-weight:700}
  .pill-btn{font:inherit;font-size:12.5px;padding:4px 13px;border:1px solid var(--line);border-radius:999px;background:var(--parchment-2);color:var(--ink-soft);cursor:pointer;white-space:nowrap}
  .pill-btn:hover{border-color:var(--gold);color:var(--gold)}
  .pill-btn.is-on{border-color:var(--gold);background:rgba(200,164,91,.18);color:var(--gold);font-weight:700}
  .tb-label{font-size:12.5px;color:var(--ink-soft);white-space:nowrap}
  .goods-panel{position:relative;flex:none}
  .goods-panel > summary{cursor:pointer;font-size:12.5px;padding:4px 13px;border:1px solid var(--line);border-radius:999px;background:var(--parchment-2);color:var(--ink-soft);list-style:none;white-space:nowrap}
  .goods-panel > summary::-webkit-details-marker{display:none}
  .goods-panel > summary::before{content:"▸ "}
  .goods-panel[open] > summary::before{content:"▾ "}
  .goods-panel[open] > summary{border-color:var(--gold);color:var(--gold)}
  .goods-cats{position:absolute;left:0;top:calc(100% + 6px);z-index:20;width:min(560px, 90vw);max-height:320px;overflow:auto;padding:10px 12px;border:1px solid var(--gold);border-radius:10px;background:var(--parchment);box-shadow:0 6px 18px rgba(46,42,32,.25);color-scheme:light}
  .goods-cat{margin:6px 0}
  .goods-cat > b{display:block;font-size:12px;color:var(--ink);margin-bottom:4px}
  .goods-chips{display:flex;gap:4px;flex-wrap:wrap}
  .goods-chips .pill-btn{font-size:11.5px;padding:3px 10px}
  select, input{color-scheme:light}
  select option{background:var(--parchment-2);color:var(--ink)}
  .suggest-wrap{position:relative;flex:1;min-width:200px}
  .suggest-wrap input{width:100%;padding:8px 12px;border:1px solid var(--gold);border-radius:8px;background:var(--parchment-2);color:var(--ink);font:inherit;font-size:14px;color-scheme:light}
  .suggest-box{display:none;position:absolute;left:0;top:calc(100% + 4px);z-index:21;width:100%;max-height:280px;overflow:auto;border:1px solid var(--gold);border-radius:8px;background:var(--parchment);box-shadow:0 6px 18px rgba(46,42,32,.25);color-scheme:light}
  .suggest-box.open{display:block}
  .suggest-item{display:flex;gap:8px;justify-content:space-between;align-items:center;padding:6px 12px;font-size:13px;cursor:pointer;color:var(--ink)}
  .suggest-item:hover{background:rgba(200,164,91,.16)}
  .suggest-item .tag{font-size:11px;color:var(--ink-soft);font-family:Consolas,monospace}
  .co-rec-row{display:flex;gap:8px;align-items:baseline;padding:5px 0;border-bottom:1px dashed var(--line);font-size:13px;flex-wrap:wrap}
  .co-rec-row:last-child{border-bottom:none}
  .co-rec-row .rank{color:var(--gold);font-weight:700;flex:none;width:28px}
  .co-rec-cov{font-size:12px;color:var(--ink-soft)}
  .pm-link{font:inherit;font-size:inherit;padding:0 2px;border:none;background:none;color:var(--gold);cursor:pointer;text-decoration:underline dotted}
  .bld-layout{display:flex;gap:14px;align-items:flex-start}
  #bld-list{flex:1;min-width:0}
  #bld-detail{flex:none;width:min(430px,44%);position:sticky;top:52px;max-height:calc(100vh - 70px);overflow:auto;border:1px solid var(--gold);border-radius:12px;background:var(--parchment);padding:12px 14px}
  .bld-hint{color:var(--ink-soft);font-size:13px}
  .bld-grid{display:flex;gap:8px;flex-wrap:wrap;padding:8px 0}
  .bld-card{display:flex;flex-direction:column;align-items:center;gap:4px;width:96px;padding:8px 6px;border:1px solid var(--line);border-radius:10px;background:var(--parchment-2);cursor:pointer;text-align:center}
  .bld-card img{width:44px;height:44px;object-fit:contain}
  .bld-card span{font-size:12px;color:var(--ink)}
  .bld-card:hover{border-color:var(--gold)}
  .bld-card.is-sel{border-color:var(--gold);background:rgba(200,164,91,.18);box-shadow:0 0 0 1px var(--gold)}
  .bld-det h4{margin:0 0 6px;font-size:15px}
  .pmg{margin:10px 0;border-top:1px dashed var(--line);padding-top:8px}
  .pmg-name{font-size:12.5px;font-weight:700;color:var(--ink);margin-bottom:6px}
  .pmg-opts{display:flex;gap:6px;flex-wrap:wrap}
  .pm-opt{font:inherit;font-size:12px;padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:var(--parchment-2);color:var(--ink-soft);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
  .pm-opt:hover{border-color:var(--gold);color:var(--gold)}
  .pm-opt.is-sel{border-color:var(--gold);background:rgba(200,164,91,.2);color:var(--gold);font-weight:700}
  .pm-opt .pm-tech{font-size:10.5px;color:var(--ink-soft);font-weight:400}
  .pm-sum{font-size:12.5px;line-height:1.9;color:var(--ink)}
  .card.is-flash{outline:3px solid var(--gold);box-shadow:0 0 0 6px rgba(200,164,91,.25)}
  .tech-jump{font:inherit;font-size:inherit;padding:0 2px;border:none;background:none;color:var(--gold);cursor:pointer;text-decoration:underline dotted}
  .ev-src button{font:inherit;font-size:inherit;padding:0;border:none;background:none;color:var(--gold);cursor:pointer;text-decoration:underline dotted}
  @media (max-width:720px){ .grid{grid-template-columns:1fr} header.top h1{font-size:24px} .bld-layout{flex-direction:column} #bld-detail{width:100%;position:static} }
  .co-rec-cov{font-size:12px;color:var(--ink-soft)}
  .pm-link{font:inherit;font-size:inherit;padding:0 2px;border:none;background:none;color:var(--gold);cursor:pointer;text-decoration:underline dotted}
  .bld-layout{display:flex;gap:14px;align-items:flex-start}
  #bld-list{flex:1;min-width:0}
  #bld-detail{flex:none;width:min(430px,44%);position:sticky;top:52px;max-height:calc(100vh - 70px);overflow:auto;border:1px solid var(--gold);border-radius:12px;background:var(--parchment);padding:12px 14px}
  .bld-hint{color:var(--ink-soft);font-size:13px}
  .bld-grid{display:flex;gap:8px;flex-wrap:wrap;padding:8px 0}
  .bld-card{display:flex;flex-direction:column;align-items:center;gap:4px;width:96px;padding:8px 6px;border:1px solid var(--line);border-radius:10px;background:var(--parchment-2);cursor:pointer;text-align:center}
  .bld-card img{width:44px;height:44px;object-fit:contain}
  .bld-card span{font-size:12px;color:var(--ink)}
  .bld-card:hover{border-color:var(--gold)}
  .bld-card.is-sel{border-color:var(--gold);background:rgba(200,164,91,.18);box-shadow:0 0 0 1px var(--gold)}
  .bld-det h4{margin:0 0 6px;font-size:15px}
  .pmg{margin:10px 0;border-top:1px dashed var(--line);padding-top:8px}
  .pmg-name{font-size:12.5px;font-weight:700;color:var(--ink);margin-bottom:6px}
  .pmg-opts{display:flex;gap:6px;flex-wrap:wrap}
  .pm-opt{font:inherit;font-size:12px;padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:var(--parchment-2);color:var(--ink-soft);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
  .pm-opt:hover{border-color:var(--gold);color:var(--gold)}
  .pm-opt.is-sel{border-color:var(--gold);background:rgba(200,164,91,.2);color:var(--gold);font-weight:700}
  .pm-opt .pm-tech{font-size:10.5px;color:var(--ink-soft);font-weight:400}
  .pm-sum{font-size:12.5px;line-height:1.9;color:var(--ink)}
  .card.is-flash{outline:3px solid var(--gold);box-shadow:0 0 0 6px rgba(200,164,91,.25)}
  .tech-jump{font:inherit;font-size:inherit;padding:0 2px;border:none;background:none;color:var(--gold);cursor:pointer;text-decoration:underline dotted}
  .ev-src button{font:inherit;font-size:inherit;padding:0;border:none;background:none;color:var(--gold);cursor:pointer;text-decoration:underline dotted}
  @media (max-width:720px){ .grid{grid-template-columns:1fr} header.top h1{font-size:24px} .bld-layout{flex-direction:column} #bld-detail{width:100%;position:static} }
  .tech-events{border:1px solid var(--gold);border-radius:8px;background:rgba(200,164,91,.1);padding:6px 10px}
  .tech-events .ev-src{color:var(--ink-soft);font-size:11px}
  #tech-tree-wrap{margin:10px 0}
  .tree-hint{font-size:12px;color:var(--ink-soft);margin-bottom:6px}
  #tech-tree-viewport{height:74vh;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,#f6efdc,#efe3c8);cursor:grab;position:relative}
  #tech-tree-viewport:active{cursor:grabbing}
  #tech-tree-canvas{transform-origin:0 0;position:absolute;left:0;top:0}
  #tech-detail{position:absolute;right:14px;top:14px;z-index:30;width:min(420px,86%);max-height:calc(100% - 28px);overflow:auto;box-shadow:0 8px 24px rgba(46,42,32,.35)}
  .tnode{cursor:pointer}
  .tnode rect{fill:#faf3e0;stroke:var(--line);stroke-width:1}
  .tnode text{font-size:11px;fill:var(--ink);pointer-events:none}
  .tnode.cat-production rect{stroke:#7a9a6d}
  .tnode.cat-military rect{stroke:#b0604d}
  .tnode.cat-society rect{stroke:#6d7a9a}
  .tnode.has-ev rect{stroke:var(--gold);stroke-width:1.6}
  .tnode:hover rect,.tnode.hl rect,.tnode.hit rect{fill:rgba(200,164,91,.28);stroke:var(--gold);stroke-width:1.6}
  .tnode.dim{opacity:.22}
  .tedge{fill:none;stroke:rgba(46,42,32,.5);stroke-width:1.5}
  .tedge.hl{stroke:var(--gold);stroke-width:1.6}
  .tree-era-head{font-size:14px;font-weight:700;fill:var(--ink)}
  .tree-lane-head{font-size:12px;font-weight:700;fill:var(--ink-soft)}
  @media (max-width:720px){ .grid{grid-template-columns:1fr} header.top h1{font-size:24px} }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="top-row">
      <h1>Vicdata 目标指南</h1>
      <nav class="refs"><span class="refs-label">参考资料：</span><a href="https://vic3.paradoxwikis.com/Victoria_3_Wiki" target="_blank" rel="noopener">Victoria 3 Wiki</a><a href="https://vic3.parawikis.com/wiki/%E9%A6%96%E9%A1%B5" target="_blank" rel="noopener">Parawikis</a><a href="https://forum.paradoxplaza.com/forum/forums/victoria-3.1095/" target="_blank" rel="noopener">官方论坛</a><a href="https://space.bilibili.com/3546875974126422" target="_blank" rel="noopener">B站官方账号</a></nav>
    </div>
    <p class="lede">以目标为导向的攻略手册：成就怎么做 · 法律怎么改 · 公司怎么组。内容由游戏文件（1.15.1）程序化提取生成，条件原文照录游戏脚本；「真实达成条件」与「攻略提示」来自 Paradox 社区维基（维基编者从游戏文件解码），攻略提示已译为中文。</p>
  </header>
  <nav class="tabs">
    <a href="#achievements" class="tablink is-active" data-tab="achievements">成就指南（${achievements.length}）</a>
    <a href="laws.html" class="tablink-ext">法律指南（${laws.length}）</a>
    <a href="ideologies.html" class="tablink-ext">意识形态</a>
    <a href="states.html" class="tablink-ext">州名</a>
    <a href="politics.html" class="tablink-ext">人群政治</a>
    <a href="#companies" class="tablink" data-tab="companies">公司经营（${companies.length}）</a>
    <a href="#tech" class="tablink" data-tab="tech">科技（${techList.length}）</a>
    <a href="calculator.html" class="tablink-ext">建筑</a>
    <a href="#events" class="tablink" data-tab="events">事件（${EVENTS_LIST.length}）</a>
    <a href="calculator.html" class="tablink-ext">计算器</a>
  </nav>

  <section id="achievements">
    <h2>成就指南</h2>
    <p class="mechan section-sub">怎么做成就？玩哪个国家能完成最多的成就？</p>
    <details class="rules-panel" id="ach-rules-panel">
      <summary>脚本读法与求解器规则（直接规则 / 间接规则）</summary>
      <div class="rules-body">
        <p class="mechan">成就的解锁条件就是卡片底部的「需求脚本」——游戏会逐条检查这些脚本，全部满足即弹出成就。常见<b>直接规则</b>（成就脚本里写明的条件）：</p>
        <ul class="mech-list">
          <li><b>game_date &gt; 日期</b> —— 坚持到该日期（多为挂机类成就）</li>
          <li><b>has_global_variable</b> —— 需要前置事件或成就链设置的标记</li>
          <li><b>any_scope_state / owns_global_state</b> —— 占有特定州（或全球状态检查）</li>
          <li><b>country_has_primary_culture</b> —— 主流文化条件</li>
          <li><b>has_technology</b> —— 已研究某科技</li>
          <li><b>hidden_trigger</b> —— 隐藏检查，不影响玩法提示但必须满足</li>
        </ul>
        <p class="mechan">求解器同时维护<b>间接规则</b>——条件本身不限国家，但实际能选哪些国家由游戏文件推导：</p>
        <ul class="mech-list">
          <li><b>要求有特定主流文化</b> —— 求解器展开为“开局即拥有该主流文化的国家”，或可通过决议/成立链获得该文化的可成立国家。真实案例：「我的舰就是你的舰」要求阿伊努主流文化 → 展开为 阿伊努茅希利、虾夷地；「阿米什人乐园」要求扬基文化 → 展开 7 个开局扬基国家（美利坚、新英格兰、加利福尼亚等）。</li>
          <li><b>要求持有特定变量</b>（has_variable / has_global_variable）—— 变量在游戏文件里有明确的发放记录：求解器识别发放方式，并把可获取该变量的 tag 计入。真实案例：「大博弈」的 possible 写着 <code>has_variable = great_game_ach_possible</code>，该变量在 <code>00_global.txt</code> 的 every_country/limit 块发放，limit 里 <code>c:RUS ?= this</code> → 只有俄罗斯可做（「再无人博弈」更复杂：其变量由大博弈日志结算时发放，可用国家=推荐列表开局六国+阿富汗统一路线，不是任意国家）；「巴巴里再临」同一机制 → 穆阿斯凯尔、君士坦丁、阿伊特阿巴斯、图古尔特四国；「团队杀手」引用脚本触发器 <code>is_balkan_league_candidate</code>，递归展开定义 → 希腊、塞尔维亚、黑山、保加利亚。</li>
        </ul>
        <p class="mechan">其余门槛同样自动提取：未受认可国家类（is_country_type）、开局法律类（种姓/农奴制）、开局识字率、可成立国家（can_form_nation）。脚本化触发器（如条约港系列）已在「真实达成条件」中解码。可先勾选<b>优先</b>（想拿的）与<b>已完成</b>（排除）成就，再用下方求解器推荐国家。</p>
      </div>
    </details>
    <div class="toolbar">
      <input id="q-ach" type="search" placeholder="搜索成就名称 / 描述 / 脚本…">
      <button type="button" id="solve-ach" class="solve-btn">🏆 求解：一次可实现最多的国家</button>
      <details class="goods-panel marks-panel" id="ach-marks-panel">
        <summary>优先/已完成（<span id="ach-marks-n">0</span>）</summary>
        <div class="goods-cats marks-cats">
          ${["极难", "困难", "中等", "简单"].map(label => {
            const items = achievements.filter(a => a.groupLabel === label);
            if (!items.length) return "";
            const chips = items.map(a => `<span class="ach-chip" data-ach="${esc(a.key)}">${esc(a.name)}<button type="button" class="chip-btn chip-want" data-ach="${esc(a.key)}" title="标记为优先">优</button><button type="button" class="chip-btn chip-done" data-ach="${esc(a.key)}" title="标记为已完成">完</button></span>`).join("");
            return `<div class="goods-cat"><b>${esc(label)}</b><div class="goods-chips">${chips}</div></div>`;
          }).join("")}
        </div>
      </details>
      <span class="count" id="ach-mark-count"></span>
    </div>
    <div class="subtabs" id="ach-dlc-tabs">
      <button type="button" class="subtab is-active" data-dlc="">全部（${achievements.length}）</button>
      ${["base","ep2","ip1","ep1","rp1","mp1","ip2","ip3","ip4","ip5"].map(d => {
        const n = achievements.filter(a => a.dlcId === d).length;
        if (!n) return "";
        const meta = ACH_DLC[d];
        return `<button type="button" class="subtab" data-dlc="${d}">${meta ? meta.name.split(" ")[0] : d}（${n}）</button>`;
      }).join("")}
    </div>
    <div id="solve-result" class="solve-result" style="display:none"></div>
    <div id="list-ach">${groupSections(achievements, achievementCard, ["极难", "困难", "中等", "简单"])}</div>
    <p class="empty" id="empty-ach" style="display:none">没有匹配的成就。</p>
  </section>



  <section id="companies">
    <h2>公司经营指南</h2>
    <p class="mechan"><b>槽位规则：</b>公司槽位靠社会科技解锁——基础 1 槽，此后<b>公司特许 → 股份公司 → 投资银行 → 公司治理 → 宏观经济学</b> 每项科技 +1（最高 5 槽）；颁布 <b>技术官僚</b> 法律或特定集团原则可再 +1。所以第二时代研究完「公司特许」即有 2 槽。<br>
    <b>组建条件：</b>公司要求<b>合并州</b>内拥有其固定建筑（部分公司还限定可达州/地区/文化/科技，见各卡片）；选中公司后可搭配<b>可选扩展建筑</b>改变产出。<b>名贵商品</b>只由对应公司生产，组建含名贵商品的公司能垄断溢价。<b>繁荣度</b>达标后公司还会给全国性的额外加成。</p>
    <div class="toolbar"><input id="q-co" type="search" placeholder="搜索公司 / 建筑 / 名贵商品 / 地区…"><span class="count" id="co-count"></span></div>
    <div class="toolbar">
      <span class="tb-label">类型</span>
      <button type="button" class="pill-btn" id="f-co-prestige">只看有名贵商品</button>
      <button type="button" class="pill-btn" id="f-co-hist">只看史实公司</button>
      <button type="button" class="pill-btn" id="f-co-nonhist">只看非史实公司</button>
      <button type="button" class="pill-btn" id="f-co-free">只看无限制公司</button>
    </div>
    <div class="toolbar">
      <span class="tb-label">产业覆盖</span>
      ${industryPillsHtml}
      <details class="goods-panel" id="co-goods-panel">
        <summary>名贵商品（<span id="co-goods-n">0</span>）</summary>
        <div class="goods-cats">${goodsPanelHtml}</div>
      </details>
    </div>
    <div class="toolbar">
      <div class="suggest-wrap"><input id="f-co-country" autocomplete="off" placeholder="按国家筛选（输入国名，可留空）…"><div class="suggest-box" id="sb-country"></div></div>
      <div class="suggest-wrap"><input id="f-co-building" autocomplete="off" placeholder="按建筑筛选（可留空）…"><div class="suggest-box" id="sb-building"></div></div>
      <span class="tb-label">公司数量</span>
      <select id="f-co-count">${coCountOptions}</select>
      <button type="button" class="pill-btn solve-btn" id="co-recommend">🏆 推荐组合</button>
    </div>
    <div id="co-recommend-result" class="solve-result" style="display:none"></div>
    <div id="list-co"><div class="grid">${companies.map(companyCard).join("")}</div></div>
    <p class="empty" id="empty-co" style="display:none">没有匹配的公司。</p>
  </section>

  <section id="tech">
    <h2>科技一览</h2>
    <p class="mechan">全部 ${techList.length} 项技术按时代分组，效果摘要来自游戏本地化；点科技名可跳转科技详情。时代与分类可组合筛选。</p>
    <div class="toolbar"><input id="q-tech" type="search" placeholder="搜索科技名 / 效果…"><button type="button" class="pill-btn is-on" id="tech-view-tree">科技树</button><button type="button" class="pill-btn" id="tech-view-list">列表</button><span class="count" id="tech-count"></span></div>
    <div class="subtabs" id="tech-page-tabs">
      <button type="button" class="subtab is-active" data-page="production">生产科技（${(TECH_PAGE_COUNTS.production || 0)}）</button>
      <button type="button" class="subtab" data-page="society">社会科技（${(TECH_PAGE_COUNTS.society || 0)}）</button>
      <button type="button" class="subtab" data-page="military">军事科技（${(TECH_PAGE_COUNTS.military || 0)}）</button>
    </div>
    <div id="tech-tree-wrap">
      <div class="tree-hint">滚轮缩放 · 拖拽平移 · 点击节点查看效果与科技进度事件 · 📊 图标表示该科技有事件备注</div>
      <div id="tech-tree-viewport"><div id="tech-tree-canvas"></div><div id="tech-detail" class="solve-result" style="display:none"></div></div>
    </div>
    <div class="subtabs" id="tech-era-tabs" style="display:none">
      <button type="button" class="subtab is-active" data-era="">全部时代</button>
      ${techEraTabs}
    </div>
    <div id="list-tech">${techEraSections}</div>
    <p class="empty" id="empty-tech" style="display:none">没有匹配的科技。</p>
  </section>

  <section id="buildings">
    <h2>建筑一览</h2>
    <p class="mechan">全部 ${buildings.length} 项原版建筑，按大类分组；生产方式组可交互切换，组合合计实时更新。资料来自游戏文件（1.15.1），不含任何 VC 调整内容。</p>
    <div class="toolbar"><input id="q-bld" type="search" placeholder="搜索建筑名 / 类别…"><span class="count" id="bld-count"></span></div>
    <div class="bld-layout">
      <div id="bld-list">${bldBoardSections}</div>
      <div id="bld-detail"><div class="bld-hint">点击左侧建筑查看生产方式。</div></div>
    </div>
    <div id="bld-det-pool" style="display:none">${bldDetailsHtml}</div>
  </section>

  <section id="events">
    <h2>科技进度事件</h2>
    <p class="mechan">游戏中会给特定科技直接提供研发进度的事件，共 ${EVENTS_LIST.length} 条——提取自游戏事件文件与简中本地化（部分事件与生产方式联动，如共同基金→公开交易）。点击事件里的<b>科技名</b>可跳转到科技树对应节点。</p>
    <div class="toolbar"><input id="q-ev" type="search" placeholder="搜索事件名 / 描述 / 科技…"><span class="count" id="ev-count"></span></div>
    <div id="list-ev" class="grid">${eventCards}</div>
    <p class="empty" id="empty-ev" style="display:none">没有匹配的事件。</p>
  </section>
  </section>
</div>
<script>
  // ---------- Tab 切换 ----------
  const TABS = ["achievements", "companies", "tech", "buildings", "events"];
  const el = id => document.getElementById(id);
  function activateTab(name) {
    if (!TABS.includes(name)) name = "achievements";
    TABS.forEach(t => {
      document.getElementById(t).style.display = t === name ? "" : "none";
      const link = document.querySelector('.tablink[data-tab="' + t + '"]');
      if (link) link.classList.toggle("is-active", t === name);
    });
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  }
  document.querySelectorAll(".tablink").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    activateTab(a.dataset.tab);
    window.scrollTo(0, 0);
  }));
  window.addEventListener("hashchange", () => activateTab(location.hash.slice(1)));

  function bindFilter(inputId, listId, emptyId) {
    const input = document.getElementById(inputId);
    const apply = () => {
      const q = (input.value || "").trim().toLowerCase();
      let shown = 0;
      document.querySelectorAll("#" + listId + " .card").forEach(card => {
        const ok = !card.classList.contains("dlc-off") && (!q || (card.getAttribute("data-search") || "").includes(q) || (card.textContent || "").toLowerCase().includes(q));
        card.style.display = ok ? "" : "none";
        if (ok) shown++;
      });
      document.getElementById(emptyId).style.display = shown ? "none" : "";
    };
    input.addEventListener("input", apply);
    input.__reapply = apply;
  }
  bindFilter("q-ach", "list-ach", "empty-ach");


  // ---------- 成就求解器（正向选择 + 排除） ----------
  const ACH_TAGS = ${JSON.stringify(Object.fromEntries(achievements.filter(a => a.tags.length).map(a => [a.key, a.tags])))};
  const ACH_NAME = ${JSON.stringify(Object.fromEntries(achievements.map(a => [a.key, a.name])))};
  const ALL_ACH = ${JSON.stringify(achievements.map(a => a.key))};
  const TAG_NAME = ${JSON.stringify(countryNamesByTag)};
  const wantSet = new Set(JSON.parse(localStorage.getItem("vic3_ach_want") || "[]"));
  const doneSet = new Set(JSON.parse(localStorage.getItem("vic3_ach_done") || "[]"));
  const saveMarks = () => {
    localStorage.setItem("vic3_ach_want", JSON.stringify([...wantSet]));
    localStorage.setItem("vic3_ach_done", JSON.stringify([...doneSet]));
    document.getElementById("ach-mark-count").textContent = "优先 " + wantSet.size + " · 已完成 " + doneSet.size;
    document.getElementById("ach-marks-n").textContent = wantSet.size + doneSet.size;
    document.querySelectorAll(".ach-chip").forEach(ch => {
      const k = ch.dataset.ach;
      ch.classList.remove("is-want", "is-done");
      if (wantSet.has(k)) ch.classList.add("is-want"); else if (doneSet.has(k)) ch.classList.add("is-done");
    });
  };
  document.querySelectorAll(".mark-btn").forEach(btn => {
    const key = btn.dataset.ach;
    const isWant = btn.classList.contains("want");
    const set = isWant ? wantSet : doneSet;
    if (set.has(key)) btn.classList.add("is-on");
    btn.addEventListener("click", () => {
      if (set.has(key)) { set.delete(key); btn.classList.remove("is-on"); }
      else {
        set.add(key); btn.classList.add("is-on");
        const otherSet = isWant ? doneSet : wantSet;
        if (otherSet.has(key)) {
          otherSet.delete(key);
          const otherBtn = document.querySelector(".mark-btn." + (isWant ? "done" : "want") + '[data-ach="' + key + '"]');
          if (otherBtn) otherBtn.classList.remove("is-on");
        }
      }
      saveMarks();
    });
  });
  saveMarks();
  const achStateClass = (k) => wantSet.has(k) ? " is-want" : (doneSet.has(k) ? " is-done" : "");
  const renderChip = (k) => '<span class="ach-chip' + achStateClass(k) + '" data-ach="' + k + '">' + (ACH_NAME[k] || k) +
    '<button type="button" class="chip-btn chip-want" data-ach="' + k + '" title="标记为优先">优</button>' +
    '<button type="button" class="chip-btn chip-done" data-ach="' + k + '" title="标记为已完成">完</button></span>';
  function syncMarks(k) {
    document.querySelectorAll('.mark-btn[data-ach="' + k + '"]').forEach(b => {
      const isWant = b.classList.contains("want");
      b.classList.toggle("is-on", isWant ? wantSet.has(k) : doneSet.has(k));
    });
  }
  document.getElementById("solve-ach").addEventListener("click", () => {
    const poolAll = ALL_ACH.filter(k => !doneSet.has(k));
    const want = [...wantSet].filter(k => ALL_ACH.includes(k) && !doneSet.has(k));
    const rows = [];
    for (const [tag, name] of Object.entries(TAG_NAME)) {
      const feasible = poolAll.filter(k => { const tags = ACH_TAGS[k]; return tags && tags[0] === "_none" ? false : (!tags || tags.includes(tag)); }); // _none=文化锁但开局无国满足（如巴尔干的普鲁士需转保加利亚主流），不计入任何国家
      const pri = want.length ? feasible.filter(k => want.includes(k)).length : 0;
      if (want.length && pri === 0) continue;   // 必须能实现全部优先成就才有资格入选
      rows.push([name, feasible.length, feasible, pri]);
    }
    rows.sort((a, b) => b[3] - a[3] || b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans"));
    const box = document.getElementById("solve-result");
    box.style.display = "";
    if (!rows.length) { box.innerHTML = '<h4>没有能满足当前优先成就组合的国家，试试减少勾选。</h4>'; return; }
    const top = rows.slice(0, 10);
    const head = want.length
      ? '一次可实现成就最多的国家（Top ' + top.length + '）：先满足你勾选的 ' + want.length + ' 项优先成就，再按可推进的未完成成就数排序'
      : '一次可实现成就最多的国家（Top ' + top.length + '，基于开局国家与成就国家限定）';
    box.innerHTML = '<h4>' + head + '</h4>' + top.map(([name, count, names, pri], i) =>
      '<div class="solve-row"><span class="rank">#' + (i + 1) + '</span><b>' + name + '</b><span>' + (want.length ? '优先 ' + pri + '/' + want.length + ' · ' : '') + '可推进 ' + count + ' 项</span><details><summary>查看清单（点成就名标优先 / 点“完”标已完成）</summary><div class="chip-list">' + names.map(renderChip).join("") + '</div></details></div>').join("");
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  // 清单与折叠面板内的快捷标记（事件委托，重渲染后依然有效）
  function bindChipDelegation(container) {
    container.addEventListener("click", (e) => {
      const chipBtn = e.target.closest(".chip-btn");
      const chip = e.target.closest(".ach-chip");
      if (chipBtn) {
        const k = chipBtn.dataset.ach;
        if (chipBtn.classList.contains("chip-want")) {
          if (wantSet.has(k)) wantSet.delete(k); else { wantSet.add(k); doneSet.delete(k); }
        } else {
          if (doneSet.has(k)) doneSet.delete(k); else { doneSet.add(k); wantSet.delete(k); }
        }
        saveMarks(); syncMarks(k);
      } else if (chip && e.target === chip) {
        const k = chip.dataset.ach;
        if (wantSet.has(k)) wantSet.delete(k); else { wantSet.add(k); doneSet.delete(k); }
        saveMarks(); syncMarks(k);
      }
    });
  }
  bindChipDelegation(document.getElementById("solve-result"));
  bindChipDelegation(document.getElementById("ach-marks-panel"));
  // 相关国家"显示所有国家"折叠切换（事件委托）
  document.getElementById("list-ach").addEventListener("click", (e) => {
    const btn = e.target.closest(".country-toggle");
    if (!btn) return;
    const meta = btn.closest(".meta");
    const rest = meta.querySelector(".country-rest");
    const short = meta.querySelector(".country-short");
    if (!rest) return;
    const show = rest.hidden;
    rest.hidden = !show;
    short.hidden = show;
    btn.textContent = show ? "收起" : "显示所有国家";
  });

  // ---------- 科技筛选（三分类页面 + 树/列表双视图） ----------
  const TECHS = ${JSON.stringify(techList)};
  const TECH_BY_KEY = Object.fromEntries(TECHS.map(t => [t.key, t]));
  const TECH_CAT_ZH = { production: "生产", society: "社会", military: "军事" };
  const TECH_PAGE_COUNTS = {};
  for (const t of TECHS) TECH_PAGE_COUNTS[t.cat] = (TECH_PAGE_COUNTS[t.cat] || 0) + 1;
  const techCards = document.querySelectorAll("#list-tech .card");
  const techEmpty = document.getElementById("empty-tech");
  const techCount = document.getElementById("tech-count");
  let techPage = "production", techEra = "", techMode = "tree";
  let scale = 1, tx = 0, ty = 0, drag = false, sx = 0, sy = 0, techFitFn = null, treeFitted = false;
  const applyT = () => { const cv = document.getElementById("tech-tree-canvas"); if (cv) cv.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")"; };
  function techMatches(t, q) { return !q || (t.name + " " + t.desc + " " + t.mods.join(" ")).toLowerCase().includes(q); }
  function applyTechFilters() {
    const q = (el("q-tech").value || "").trim().toLowerCase();
    if (techMode === "tree") {
      if (q) { setTechView("list"); return; } // 树视图只做高亮不够醒目——输入搜索词自动切列表视图（完整过滤+计数）
      document.querySelectorAll("#tech-tree-canvas .tnode").forEach(n => {
        const t = TECH_BY_KEY[n.dataset.key];
        const hit = techMatches(t, q);
        n.classList.toggle("hit", !!q && hit);
        n.classList.toggle("dim", !!q && !hit);
      });
      techCount.textContent = (TECH_CAT_ZH[techPage] || techPage) + "科技 " + TECH_PAGE_COUNTS[techPage] + " 项（树视图）";
      return;
    }
    let shown = 0;
    techCards.forEach(card => {
      let ok = card.dataset.cat === techPage;
      if (ok) ok = !q || (card.getAttribute("data-search") || "").includes(q) || (card.textContent || "").toLowerCase().includes(q);
      if (ok && techEra && card.dataset.era !== techEra) ok = false;
      card.style.display = ok ? "" : "none";
      if (ok) shown++;
    });
    techCount.textContent = "显示 " + shown + " / " + TECH_PAGE_COUNTS[techPage];
    techEmpty.style.display = shown ? "none" : "";
  }

  // ---------- 科技树（深度整洁布局：子节点对齐父节点正下方，仿游戏内效果） ----------
  let techRenderPage = null;
  (function buildTechTree() {
    const canvas = el("tech-tree-canvas");
    const ERAS = ["era_1", "era_2", "era_3", "era_4", "era_5"];
    const CAT_HEAD = { production: "生产", society: "社会", military: "军事" };
    const NODE_W = 132, NODE_H = 78, GAP_X = 22, GAP_Y = 16, HEAD_H = 52, LEFT = 84;
    const esc2 = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    function renderPage(cat) {
      techPage = cat;
      const techs = TECHS.filter(t => t.cat === cat);
      const byKey = new Map(techs.map(t => [t.key, t]));
      const kidsOf = new Map(), prqOf = new Map();
      for (const t of techs) {
        const ps = t.prereqKeys.filter(pk => byKey.has(pk));
        prqOf.set(t.key, ps);
        for (const pk of ps) { if (!kidsOf.has(pk)) kidsOf.set(pk, []); kidsOf.get(pk).push(t.key); }
      }
      const depth = new Map();
      const depthOf = (k) => {
        if (depth.has(k)) return depth.get(k);
        let d = 0;
        for (const pk of (prqOf.get(k) || [])) d = Math.max(d, depthOf(pk) + 1);
        depth.set(k, d);
        return d;
      };
      for (const t of techs) depthOf(t.key);
      // 时代带强制分层：baseD 单调递增，带内按深度错位（与游戏内一致）
      const baseD = {};
      let lastRow = -1;
      for (const era of ERAS) {
        const base = lastRow + 1;
        baseD[era] = base;
        let maxOff = 0;
        for (const t of techs.filter(t2 => t2.era === era)) maxOff = Math.max(maxOff, Math.max(0, (depth.get(t.key) || 0) - base));
        lastRow = base + maxOff;
      }
      const rowOf = (k) => Math.max(0, (depth.get(k) || 0) - baseD[byKey.get(k).era]);
      const roots = techs.filter(t => !(prqOf.get(t.key) || []).length).sort((a, b) => a.sortOrder - b.sortOrder);
      const pos = {};
      const cursor = new Map();
      const PITCH_X = NODE_W + GAP_X;
      const rowKey = (k) => byKey.get(k).era + ":" + rowOf(k);
      const place = (k) => {
        if (pos[k]) return pos[k].x;
        const kids = kidsOf.get(k) || [];
        const rk = rowKey(k);
        let x;
        if (kids.length) {
          const xs = kids.map(place);
          x = (Math.min(...xs) + Math.max(...xs)) / 2;
          const cur = cursor.get(rk) || LEFT;
          if (x < cur) x = cur;
          cursor.set(rk, x + PITCH_X);
        } else {
          const cur = cursor.get(rk) || LEFT;
          x = cur;
          cursor.set(rk, x + PITCH_X);
        }
        pos[k] = { x, row: rowOf(k) };
        return x;
      };
      for (const r of roots) place(r.key);
      for (const t of techs) if (!pos[t.key]) {
        const rk = rowKey(t.key);
        const cur = cursor.get(rk) || LEFT;
        pos[t.key] = { x: cur, row: rowOf(t.key) };
        cursor.set(rk, cur + PITCH_X);
      }
      const bandRows = {};
      for (const t of techs) bandRows[t.era] = Math.max(bandRows[t.era] || 0, pos[t.key].row + 1);
      const W = Math.max(...Object.values(pos).map(p => p.x)) + NODE_W + 20;
      const bandY = {};
      let yy = HEAD_H;
      for (const era of ERAS) { bandY[era] = yy; yy += (bandRows[era] || 1) * (NODE_H + GAP_Y) + 34; }
      const H = yy + 6;
      let edges = "", nodes = "", heads = "";
      for (const era of ERAS) {
        if (!bandRows[era]) continue;
        heads += '<text class="tree-era-head" x="8" y="' + (bandY[era] + 46) + '">' + esc2((techs.find(t => t.era === era) || {}).eraLabel || era) + '</text>';
      }
      heads += '<text class="tree-cat-head" x="' + LEFT + '" y="30">' + esc2(CAT_HEAD[cat]) + '科技</text>';
      for (const t of techs) {
        const p = pos[t.key];
        if (!p) continue;
        const py = bandY[t.era] + 24 + p.row * (NODE_H + GAP_Y);
        const x1 = p.x + NODE_W / 2, y1 = py + NODE_H;
        for (const ck of (kidsOf.get(t.key) || [])) {
          const cp = pos[ck];
          if (!cp) continue;
          const cy = bandY[cp.era] + 24 + cp.row * (NODE_H + GAP_Y);
          const cx = cp.x + NODE_W / 2;
          let dpath;
          if (cp.era === t.era && cp.row === p.row) {
            const yb = py + NODE_H, dip = yb + 14;
            dpath = 'M' + x1 + ',' + yb + ' C' + x1 + ',' + dip + ' ' + cx + ',' + dip + ' ' + cx + ',' + yb;
          } else {
            const my = (y1 + cy) / 2;
            dpath = 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + my + ' ' + cx + ',' + my + ' ' + cx + ',' + cy;
          }
          edges += '<path class="tedge" data-from="' + t.key + '" data-to="' + ck + '" d="' + dpath + '"/>';
        }
      }
      for (const t of techs) {
        const p = pos[t.key];
        if (!p) continue;
        const ny = bandY[t.era] + 24 + p.row * (NODE_H + GAP_Y);
        nodes += '<g class="tnode cat-' + t.cat + (t.events.length ? ' has-ev' : '') + '" data-key="' + t.key + '">' +
          '<rect x="' + p.x + '" y="' + ny + '" width="' + NODE_W + '" height="' + NODE_H + '" rx="10"/>' +
          (t.iconFile ? '<image href="assets/technologies/' + esc2(t.iconFile) + '" x="' + (p.x + (NODE_W - 38) / 2) + '" y="' + (ny + 6) + '" width="38" height="38"/>' : '') +
          '<text x="' + (p.x + NODE_W / 2) + '" y="' + (ny + 63) + '" text-anchor="middle">' + (t.events.length ? '📌 ' : '') + esc2(t.name) + '</text></g>';
      }
      canvas.innerHTML = '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">' + heads + edges + nodes + '</svg>';
      canvas.dataset.w = W; canvas.dataset.h = H;
      document.querySelectorAll("#tech-page-tabs .subtab").forEach(x => x.classList.toggle("is-active", x.dataset.page === cat));
      techFitFn = () => { scale = Math.min(1.1, Math.max(0.25, (el("tech-tree-viewport").clientWidth - 20) / Number(canvas.dataset.w || 1))); tx = 10; ty = 6; applyT(); };
      canvas.querySelectorAll(".tnode").forEach(n => {
        n.addEventListener("click", () => {
          const t = TECH_BY_KEY[n.dataset.key];
          const box = el("tech-detail");
          box.style.display = "";
          box.innerHTML = '<h4><img src="assets/technologies/' + (t.iconFile || "") + '" style="width:26px;height:26px;vertical-align:-6px;margin-right:6px" onerror="this.style.display=&quot;none&quot;">' + esc2(t.name) + '　<span style="font-weight:400;font-size:12px;color:var(--ink-soft)">' + esc2(t.eraLabel) + ' · ' + CAT_HEAD[t.cat] + ' · ' + (t.cost || 0).toLocaleString() + ' 创新力</span></h4>' +
            (t.desc ? '<div>' + esc2(t.desc) + '</div>' : '') +
            (t.mods.length ? '<div>' + t.mods.map(m => '<span class="ok">▸</span> ' + esc2(m)).join('<br>') + '</div>' : '') +
            (t.unlocksPm.length ? '<div style="font-size:12px;margin-top:4px">解锁生产方式：' + t.unlocksPm.map(u => '<button type="button" class="pm-link" data-bld="' + u.bld + '">' + esc2(u.name) + '</button>').join('、') + '</div>' : '') +
            (t.followUps.length ? '<div style="font-size:12px;margin-top:4px">后续科技：' + esc2(t.followUps.join("、")) + '</div>' : '') +
            (t.prereq.length ? '<div style="margin-top:4px;font-size:12px;color:var(--ink-soft)">前置：' + esc2(t.prereq.join("、")) + '</div>' : '') +
            t.events.map(ev => {
              // 注意：本段在 html 模板字面量内，正则反斜杠须双写（模板会把 \[ 折叠成 [，曾致整脚本编译失败）
              const et = esc2(ev.text).replace(/\[SCOPE\\.sState\\('[^']*'\\)\\.GetName\\]/g, "该州").replace(/\[(SCOPE|ROOT|Prev|FIXED)[^\\]]*\\]/g, "").replace(/该地的该地/g, "该地");
              const eti = esc2(ev.title).replace(/\[(SCOPE|ROOT|Prev|FIXED)[^\\]]*\\]/g, "");
              return '<div class="tech-events" style="margin-top:8px"><b>📌 ' + eti + '</b>　' + et + '<br><span class="ev-src">—— <button type="button" class="ev-link" data-ev="' + esc2(ev.eventId || "") + '">' + esc2(ev.source) + '</button></span></div>';
            }).join("");
        });
        n.addEventListener("mouseenter", () => {
          canvas.querySelectorAll('.tedge[data-from="' + n.dataset.key + '"],.tedge[data-to="' + n.dataset.key + '"]').forEach(e2 => e2.classList.add("hl"));
        });
        n.addEventListener("mouseleave", () => {
          canvas.querySelectorAll(".tedge.hl").forEach(e2 => e2.classList.remove("hl"));
        });
      });
      scale = 1; tx = 0; ty = 0; applyT();
      if (el("tech-tree-viewport").clientWidth) techFitFn();
    }
    techRenderPage = renderPage;
    renderPage(techPage);
  })();
  const vp = el("tech-tree-viewport");
  vp.addEventListener("wheel", e => { e.preventDefault(); scale = Math.min(2.5, Math.max(0.35, scale * (e.deltaY < 0 ? 1.12 : 0.89))); applyT(); }, { passive: false });
  vp.addEventListener("mousedown", e => { if (e.target.closest(".tnode")) return; drag = true; sx = e.clientX - tx; sy = e.clientY - ty; });
  window.addEventListener("mousemove", e => { if (drag) { tx = e.clientX - sx; ty = e.clientY - sy; applyT(); } });
  window.addEventListener("mouseup", () => drag = false);

  // ---------- 视图切换 + 分类页切换 ----------
  function setTechView(mode) {
    techMode = mode;
    const tree = mode === "tree";
    el("tech-tree-wrap").style.display = tree ? "" : "none";
    el("tech-era-tabs").style.display = tree ? "none" : "";
    el("list-tech").style.display = tree ? "none" : "";
    el("empty-tech").style.display = "none";
    el("tech-view-tree").classList.toggle("is-on", tree);
    el("tech-view-list").classList.toggle("is-on", !tree);
    if (tree && !treeFitted) { treeFitted = true; if (techFitFn) techFitFn(); }
    applyTechFilters();
  }
  el("tech-view-tree").addEventListener("click", () => setTechView("tree"));
  el("tech-view-list").addEventListener("click", () => setTechView("list"));

  // ---------- 建筑交互 ----------
  const bldCards = document.querySelectorAll(".bld-card");
  const bldCount = document.getElementById("bld-count");
  const bldDetail = document.getElementById("bld-detail");
  function showBld(key) {
    document.querySelectorAll(".bld-card").forEach(x => x.classList.toggle("is-sel", x.dataset.bld === key));
    document.querySelectorAll(".bld-det").forEach(x => x.style.display = "none");
    const det = document.getElementById("bld-det-" + key);
    if (det) {
      det.style.display = "";
      bldDetail.innerHTML = "";
      bldDetail.appendChild(det);
      bindBldDetail(det);
    }
  }
  function bindBldDetail(det) {
    det.querySelectorAll(".pm-opt").forEach(btn => btn.addEventListener("click", () => {
      const group = btn.closest(".pmg-opts");
      group.querySelectorAll(".pm-opt").forEach(x => x.classList.toggle("is-sel", x === btn));
      updateBldSum(det);
    }));
    updateBldSum(det);
  }
  function updateBldSum(det) {
    const e2 = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const sum = new Map();
    det.querySelectorAll(".pmg-opts .pm-opt.is-sel").forEach(btn => {
      let effects = [];
      try { effects = JSON.parse(btn.dataset.effects || "[]"); } catch {}
      for (const e of effects) {
        const cur = sum.get(e.s) || { v: 0, scaling: e.scaling, count: 0 };
        if (typeof e.v === "number") cur.v += e.v;
        cur.count++;
        sum.set(e.s, cur);
      }
    });
    const box = det.querySelector("[data-sum]");
    if (!box) return;
    box.innerHTML = [...sum.values()].length
      ? [...sum.entries()].map(([s, e]) => '<span class="ok">▸</span> ' + e2(s) + (typeof e.v === "number" ? ' <b>' + (e.v > 0 ? "+" : "") + e.v + '</b>' : '') + (e.scaling === "workforce_scaled" ? ' <span style="color:var(--ink-soft)">（按就业规模）</span>' : '')).join('<br>')
      : '<span style="color:var(--ink-soft)">（无效果数据）</span>';
  }
  bldCards.forEach(card => card.addEventListener("click", () => showBld(card.dataset.bld)));
  document.getElementById("q-bld").addEventListener("input", () => {
    const q = (document.getElementById("q-bld").value || "").trim().toLowerCase();
    let shown = 0;
    bldCards.forEach(card => {
      const ok = !q || (card.dataset.search || "").includes(q);
      card.style.display = ok ? "" : "none";
      if (ok) shown++;
    });
    bldCount.textContent = "显示 " + shown + " / " + bldCards.length;
    document.querySelectorAll("#bld-list .group-fold").forEach(fold => {
      const any = [...fold.querySelectorAll(".bld-card")].some(c => c.style.display !== "none");
      fold.style.display = any ? "" : "none";
    });
  });
  document.getElementById("q-bld").dispatchEvent(new Event("input", { bubbles: true }));
  // ---------- 事件页：搜索 + 跳转 ----------
  const evCards = document.querySelectorAll("#list-ev .card");
  const evEmpty = document.getElementById("empty-ev");
  const evCount = document.getElementById("ev-count");
  function applyEvFilters() {
    const q = (document.getElementById("q-ev").value || "").trim().toLowerCase();
    let shown = 0;
    evCards.forEach(card => {
      const ok = !q || (card.getAttribute("data-search") || "").includes(q) || (card.textContent || "").toLowerCase().includes(q);
      card.style.display = ok ? "" : "none";
      if (ok) shown++;
    });
    evCount.textContent = "显示 " + shown + " / " + evCards.length;
    evEmpty.style.display = shown ? "none" : "";
  }
  document.getElementById("q-ev").addEventListener("input", applyEvFilters);
  applyEvFilters();
  function gotoEvent(evKey) {
    activateTab("events");
    const card = [...evCards].find(x => x.dataset.evkey === String(evKey).replace(/\./g, "-"));
    if (card) {
      const title = card.querySelector("h4")?.textContent || "";
      const q = document.getElementById("q-ev");
      if (q) { q.value = title; q.dispatchEvent(new Event("input", { bubbles: true })); }
      evCards.forEach(x => x.classList.remove("is-flash"));
      card.classList.add("is-flash");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => card.classList.remove("is-flash"), 2400);
    }
  }
  const achDlcTabs = document.getElementById("ach-dlc-tabs");
  let achDlc = "";
  function applyAchDlc() {
    document.querySelectorAll("#list-ach .card").forEach(card => {
      const dlcId = card.dataset.dlcId || "base";
      card.classList.toggle("dlc-off", !!achDlc && achDlc !== dlcId);
    });
    if (document.getElementById("q-ach").__reapply) document.getElementById("q-ach").__reapply();
  }
  achDlcTabs.querySelectorAll(".subtab").forEach(b => b.addEventListener("click", () => {
    achDlc = b.dataset.dlc;
    achDlcTabs.querySelectorAll(".subtab").forEach(x => x.classList.toggle("is-active", x === b));
    applyAchDlc();
  }));
  function gotoTechNode(techKey) {
    activateTab("tech");
    if (techMode !== "tree") setTechView("tree");
    const t = TECH_BY_KEY[techKey];
    if (t && techPage !== t.cat && techRenderPage) {
      techRenderPage(t.cat);
    }
    const node = document.querySelector('#tech-tree-canvas .tnode[data-key="' + techKey + '"]');
    if (node) {
      document.querySelectorAll("#tech-tree-canvas .tnode").forEach(x => x.classList.remove("hit"));
      node.classList.add("hit");
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  // 生产方式名 → 建筑跳转（来自科技详情/卡片）
  document.addEventListener("click", (e) => {
    const link = e.target.closest(".pm-link");
    if (link) {
      e.preventDefault();
      activateTab("buildings");
      if (link.dataset.bld) showBld(link.dataset.bld);
      return;
    }
    const evLink = e.target.closest(".ev-link");
    if (evLink) { e.preventDefault(); gotoEvent(evLink.dataset.ev || ""); return; }
    const jump = e.target.closest(".tech-jump");
    if (jump) { e.preventDefault(); gotoTechNode(jump.dataset.tech); }
  });
  document.getElementById("tech-page-tabs").querySelectorAll(".subtab").forEach(b => b.addEventListener("click", () => {
    techPage = b.dataset.page;
    document.getElementById("tech-page-tabs").querySelectorAll(".subtab").forEach(x => x.classList.toggle("is-active", x === b));
    if (techRenderPage) techRenderPage(techPage);
    treeFitted = false;
    if (techMode === "tree" && !treeFitted) { treeFitted = true; if (techFitFn) techFitFn(); }
    applyTechFilters();
  }));
  document.querySelector('.tablink[data-tab="tech"]').addEventListener("click", () => { if (!treeFitted) { treeFitted = true; if (techFitFn) techFitFn(); } });
  setTechView("tree");
  el("q-tech").addEventListener("input", applyTechFilters); // 搜索框接线（树视图输入即自动切列表，见 applyTechFilters）
  applyTechFilters();
  // ---------- 公司筛选（按钮化 UI + 产业/商品多选 + 推荐组合） ----------
  const POSSIBLE = ${JSON.stringify(possibleByCountry)};
  const FREE_IDX = new Set(${JSON.stringify(freeCompanyIdx)});
  const COUNTRY_TAG_BY_NAME = ${JSON.stringify(Object.fromEntries(Object.entries(countryNamesByTag).map(([tag, n]) => [n, tag])))};
  const CO_BUILDINGS = ${JSON.stringify([...new Set(companies.flatMap(c => c.fixed.concat(c.ext)))].sort((a, b) => a.localeCompare(b, "zh-Hans")))};
  const CO_IND_NAMES = ${JSON.stringify(INDUSTRY_LABELS)};
  const CO_GOOD_NAMES = ${JSON.stringify(Object.fromEntries(Object.entries(CO_GOOD_META).map(([k, g]) => [k, g.n])))};
  const coCards = document.querySelectorAll("#list-co .card");
  const coEmpty = document.getElementById("empty-co");
  const coCount = document.getElementById("co-count");
  const selGoods = new Set(), selInds = new Set();
  const pill = (id, onToggle) => {
    const b = el(id);
    b.addEventListener("click", () => { b.classList.toggle("is-on"); if (onToggle) onToggle(b); applyCompanyFilters(); });
    return b;
  };
  const fHist = pill("f-co-hist", b => { if (b.classList.contains("is-on")) el("f-co-nonhist").classList.remove("is-on"); });
  const fNonhist = pill("f-co-nonhist", b => { if (b.classList.contains("is-on")) el("f-co-hist").classList.remove("is-on"); });
  pill("f-co-prestige"); pill("f-co-free");
  el("co-goods-panel").querySelectorAll(".good-chip").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.gkey;
    if (selGoods.has(k)) { selGoods.delete(k); b.classList.remove("is-on"); } else { selGoods.add(k); b.classList.add("is-on"); }
    el("co-goods-n").textContent = selGoods.size;
    applyCompanyFilters();
  }));
  document.querySelectorAll(".ind-chip").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.ind;
    if (selInds.has(k)) { selInds.delete(k); b.classList.remove("is-on"); } else { selInds.add(k); b.classList.add("is-on"); }
    applyCompanyFilters();
  }));
  const countryTagFor = () => COUNTRY_TAG_BY_NAME[(el("f-co-country").value || "").trim()] || "";
  function applyCompanyFilters() {
    const q = (el("q-co").value || "").trim().toLowerCase();
    const bld = (el("f-co-building").value || "").trim().toLowerCase();
    const tag = countryTagFor();
    let shown = 0;
    coCards.forEach(card => {
      let ok = !q || (card.getAttribute("data-search") || "").includes(q) || (card.textContent || "").toLowerCase().includes(q);
      if (ok && el("f-co-prestige").classList.contains("is-on") && card.dataset.prestige !== "1") ok = false;
      if (ok && el("f-co-hist").classList.contains("is-on") && card.dataset.hist !== "1") ok = false;
      if (ok && el("f-co-nonhist").classList.contains("is-on") && card.dataset.hist !== "0") ok = false;
      if (ok && el("f-co-free").classList.contains("is-on") && card.dataset.restricted !== "0") ok = false;
      if (ok && selGoods.size) {
        const gk = (card.dataset.gkeys || "").split("|");
        if (!gk.some(k => selGoods.has(k))) ok = false;
      }
      if (ok && selInds.size) {
        const ik = (card.dataset.inds || "").split("|");
        if (!ik.some(k => selInds.has(k))) ok = false;
      }
      if (ok && bld && !(card.dataset.buildings || "").toLowerCase().includes(bld)) ok = false;
      if (ok && tag) {
        const idx = Number(card.dataset.idx);
        if (!FREE_IDX.has(idx) && !(POSSIBLE[tag] || []).includes(idx)) ok = false;
      }
      card.style.display = ok ? "" : "none";
      if (ok) shown++;
    });
    coCount.textContent = (tag ? "对所选国家可行：" : "显示 ") + shown + " / " + coCards.length;
    coEmpty.style.display = shown ? "none" : "";
  }
  el("q-co").addEventListener("input", applyCompanyFilters);
  el("f-co-country").addEventListener("input", applyCompanyFilters);
  el("f-co-building").addEventListener("input", applyCompanyFilters);
  applyCompanyFilters();

  // ---------- 自绘建议下拉（统一羊皮纸配色） ----------
  function attachSuggester(inputId, boxId, items, onPick) {
    const input = el(inputId), box = el(boxId);
    const render = () => {
      const q = (input.value || "").trim().toLowerCase();
      const hits = items.filter(([label, sub]) => !q || label.toLowerCase().includes(q) || sub.toLowerCase().includes(q)).slice(0, 30);
      if (!hits.length) { box.classList.remove("open"); box.innerHTML = ""; return; }
      box.innerHTML = hits.map(([label, sub]) => '<div class="suggest-item" data-label="' + label + '"><span>' + label + '</span><span class="tag">' + sub + '</span></div>').join("");
      box.classList.add("open");
      box.querySelectorAll(".suggest-item").forEach(item => item.addEventListener("mousedown", e => {
        e.preventDefault();
        input.value = item.dataset.label;
        box.classList.remove("open");
        onPick(input.value);
      }));
    };
    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("blur", () => setTimeout(() => box.classList.remove("open"), 160));
    input.addEventListener("keydown", e => { if (e.key === "Escape") box.classList.remove("open"); });
  }
  attachSuggester("f-co-country", "sb-country", Object.entries(COUNTRY_TAG_BY_NAME).sort((a, b) => a[0].localeCompare(b[0], "zh-Hans")), () => applyCompanyFilters());
  attachSuggester("f-co-building", "sb-building", CO_BUILDINGS.map(b => [b, ""]), () => applyCompanyFilters());

  // ---------- 推荐组合（贪心覆盖：产业 + 名贵商品，公司数量可调） ----------
  el("co-recommend").addEventListener("click", () => {
    const count = Number(el("f-co-count").value) || 3;
    const tag = countryTagFor();
    const wantGoods = [...selGoods], wantInds = [...selInds];
    const box = el("co-recommend-result");
    box.style.display = "";
    if (!wantGoods.length && !wantInds.length) {
      box.innerHTML = '<h4>请先在上方选择产业覆盖或名贵商品，再点推荐组合。</h4>';
      return;
    }
    const cands = [...coCards].map(card => ({
      key: (card.querySelector("a") || {}).getAttribute ? (card.querySelector("a").getAttribute("href") || "").split("/company/")[1] : "",
      name: card.querySelector("h4")?.textContent || "",
      gkeys: (card.dataset.gkeys || "").split("|").filter(Boolean),
      inds: (card.dataset.inds || "").split("|").filter(Boolean),
      idx: Number(card.dataset.idx),
    })).filter(c => {
      const card = coCards[c.idx];
      if (el("f-co-hist").classList.contains("is-on") && card.dataset.hist !== "1") return false;
      if (el("f-co-nonhist").classList.contains("is-on") && card.dataset.hist !== "0") return false;
      if (el("f-co-free").classList.contains("is-on") && card.dataset.restricted !== "0") return false;
      if (tag && !FREE_IDX.has(c.idx) && !(POSSIBLE[tag] || []).includes(c.idx)) return false;
      return true;
    });
    const picked = []; const covG = new Set(), covI = new Set();
    for (let step = 0; step < count; step++) {
      let best = null, bestScore = 0;
      for (const c of cands) {
        if (picked.some(p => p.idx === c.idx)) continue;
        const ng = wantGoods.filter(k => c.gkeys.includes(k) && !covG.has(k)).length;
        const ni = wantInds.filter(k => c.inds.includes(k) && !covI.has(k)).length;
        const score = ng * 2 + ni + Math.min(c.gkeys.length, 6) * 0.01;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (!best || bestScore <= 0.005) break;
      picked.push(best);
      best.gkeys.forEach(k => covG.add(k));
      best.inds.forEach(k => covI.add(k));
    }
    if (!picked.length) { box.innerHTML = '<h4>没有满足条件的公司，试试放宽筛选。</h4>'; return; }
    const missG = wantGoods.filter(k => !covG.has(k)).map(k => CO_GOOD_NAMES[k] || k);
    const missI = wantInds.filter(k => !covI.has(k)).map(k => CO_IND_NAMES[k] || k);
    box.innerHTML = '<h4>推荐组合（' + picked.length + '/' + count + ' 家' + (tag ? '，限所选国家' : '') + '）</h4>' +
      picked.map((c, i) => '<div class="co-rec-row"><span class="rank">#' + (i + 1) + '</span><b>' + c.name + '</b><span class="co-rec-cov">覆盖商品：' + (c.gkeys.map(k => CO_GOOD_NAMES[k] || k).join("、") || "无") + '　产业：' + (c.inds.map(k => CO_IND_NAMES[k] || k).join("、") || "无") + '</span></div>').join("") +
      (missG.length || missI.length ? '<div class="co-rec-row"><span class="co-rec-cov">未覆盖：' + missG.concat(missI).join("、") + '（增加公司数量或放宽条件可提升覆盖）</span></div>' : '');
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });


  activateTab(location.hash.slice(1) || "achievements");
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);

// 产物自检：内联脚本必须通过 JS 编译（曾因模板字面量折叠正则反斜杠产出非法正则，整脚本不执行致科技区初始化中断）
{
  const vm = await import("node:vm");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!scripts.length) throw new Error("index.html 未找到内联脚本");
  scripts.forEach((m, i) => {
    try { new vm.Script(m[1]); } catch (e) { throw new Error(`index.html 第 ${i + 1} 个脚本编译失败: ${e.message}`); }
  });
}
console.log(`index.html（目标指南主页）生成完毕: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB | 成就 ${achievements.length} · 修正案 ${amendmentList.length} · 公司 ${companies.length} | 维基条件合并 ${wikiMerged}`);
