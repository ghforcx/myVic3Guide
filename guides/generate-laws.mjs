// Vicdata 法律指南生成器：独立页面 laws.html，交互参考游戏内立法界面
// 用法: node guides/generate-laws.mjs   （数据更新后重新运行即可刷新）
// 结构：左栏法律组（按大类）→ 中间法律光谱（progressiveness 排布）→ 右侧立法面板（效果/修正案池）
import fs from "node:fs";
import path from "node:path";
import { pageShell, SHELL_CSS } from "./shell.mjs";
import { parseConditions } from "../.agents/skills/pdx-script-parse/parse.mjs";
const LAW_ISVISIBLE = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "law-isvisible.json"), "utf8"));

const OUT = path.resolve(import.meta.dirname, "../laws.html");
const DB = "database.html";

// ---------- 数据（游戏文件直读；镜像 versions/ 已停用，见 AGENTS.md 真相层级） ----------
import { GAME, read, topBlocks, subBlock, loadGameLoc, loadCountryStartingLaws, loadIdeologies, loadLaws, loadLawGroups, loadCountries } from "./game-data.mjs";
const data = {};

data.laws = loadLaws();
data.lawGroups = loadLawGroups();
data.ideologies = loadIdeologies();
data.countries = loadCountries();

// 本地化字典（游戏全目录裸键；镜像 locale-* 的 prefix:key.name 键形由 L 适配器换算）
const LOCZH = loadGameLoc("simp_chinese");
const LOCEN = loadGameLoc("english");


const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// L 键形适配：镜像形 prefix:key.name / key.description → 游戏裸键 key / key_desc；返回值再解一层 $key$ 引用并剥 [Nbsp]
const L = (key) => {
  if (!key) return "";
  let m = String(key).match(/^\w+:([\w.]+)\.name$/);
  let v = m ? (LOCZH.get(m[1]) || LOCEN.get(m[1]) || "") : String(LOCZH.get(key) || LOCEN.get(key) || key);
  if (!m) {
    const d = String(key).match(/^\w+:([\w.]+)\.description$/);
    if (d) v = LOCZH.get(d[1] + "_desc") || LOCEN.get(d[1] + "_desc") || "";
  }
  v = v.replace(/\[Nbsp\]/g, "");
  const r = v.match(/^\$([\w:.]+)\$$/);
  if (r) v = LOCZH.get(r[1]) || LOCEN.get(r[1]) || v;
  return v.replace(/\[Nbsp\]/g, "");
};
const pretty = (key) => String(key || "").replace(/^(law_|prestige_good_|building_|technology_|state_region_|company_|amendment_|ig_)/, "").replace(/_/g, " ");
// modifier 效果中文名（共享层解引用；法律/修正案效果行渲染用）
import { modZh as modZhOf } from "./game-data.mjs";
// 本地化文本清理：#b #! 标记、$变量$、[Concept(...)] 引用、遗留原始键
const cleanLoc = (v) => String(v || "")
  .replace(/\[Concept\('(?:[^']+)',\s*'\$?([\w.]+?)\$?'\)\]/g, "$1")
  .replace(/\[Get[a-zA-Z]+\([^\]]*\)\]/g, "")
  .replace(/#\w+#!?/g, "").replace(/#!?/g, "")
  .replace(/\$([\w.]+)\$/g, "$1")
  .replace(/\b\w+_(?:add|mult)\b\s*[+\-]?\d*%?/g, (m) => m.includes("_") && !/[\u4e00-\u9fff]/.test(m) ? "" : m)
  .replace(/\s{2,}/g, " ")
  .trim();

function readWikiText(file) {
  const raw = fs.readFileSync(file);
  let t = (raw[0] === 0xFF && raw[1] === 0xFE) ? raw.toString("utf16le").slice(1) : raw.toString("utf8").replace(/^\uFEFF/, "");
  t = t.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  if (t.trim().startsWith("{")) { try { t = JSON.parse(t).data.text; } catch {} }
  return t;
}

// ---------- 法律数据 ----------
const laws = data.laws || [];
const groups = (data.lawGroups || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
const CAT_LABEL = { power_structure: "权力结构", economy: "经济", human_rights: "人权" };
const CAT_ORDER = ["权力结构", "经济", "人权", "其他"];
const groupById = new Map(groups.map(g => [g.key, g]));
const groupCat = (gk) => CAT_LABEL[groupById.get(gk)?.category] || "其他";
const lawName = (key) => L(`law:${key}.name`) || pretty(key);
const lawGroupZh = (k) => L(`law_group:${k}.name`) || L(`lawgroup:${k}.name`) || pretty(k);
const lawIcon = (key) => "assets/laws/" + encodeURIComponent(String(key).replace(/^law_/, "")) + ".webp";
// 意识形态图标：游戏 icon 路径 basename（如 ideology_leader 前缀的领袖意识形态也能命中镜像文件）
const IGO_ICON_MAP = {};
for (const ig of (data.ideologies || [])) {
  const base = (ig.icon || "").split("/").pop().replace(/\.dds$/, "");
  const dir = path.resolve(import.meta.dirname, "../assets/ideologies");
  const cand = [base + ".png", ig.key.replace(/^ideology_/, "") + ".png"].find(f => { try { return fs.existsSync(path.join(dir, f)); } catch { return false; } });
  if (cand) IGO_ICON_MAP[ig.key] = "assets/ideologies/" + cand;
}
const igoIconFile = (key) => IGO_ICON_MAP[key] || "";
const progLabel = (p) => p >= 50 ? "进步" : (p >= 25 ? "偏进步" : (p > -25 ? "中间" : (p > -50 ? "偏保守" : "保守")));

// can_enact + 修正案 possible：统一走 pdx-script-parse 解析器（skill 固化于 .agents/skills/pdx-script-parse/）
const PDX_CTX_BASE = {
  cultures: data.cultures || [],
  countries: (data.countries || []).filter(c => c.existsAtStart),
  laws,
  amendments: laws.flatMap(x => x.amendments || []),
};
const makePdxCtx = () => ({ ...PDX_CTX_BASE, L });
const parseCanEnact = (law) => {
  if (law.can_enact) {
    const r = parseConditions(law.can_enact.raw, makePdxCtx());
    if (!r.always && r.conds.length) return r.conds;
  }
  // can_enact 为空但 is_visible 有国家限定（如王冠领地议会仅奥地利可见）→ 显示为可见条件
  const vis = LAW_ISVISIBLE[law.key];
  if (vis) {
    const vr = parseConditions(vis, makePdxCtx());
    if (vr.conds.length) return vr.conds.map(c => "仅 " + c + " 可见可用");
  }
  return null;
};
const parseAmPossible = (am) => parseConditions(am.possible?.raw || "", makePdxCtx());

// 修正案（从法律挂载点收集）+ 维基事件类型（辩论/推进/停滞）
const IG_ZH = { armed_forces: "军队", devout: "教会", industrialists: "实业家", intelligentsia: "知识分子", landowners: "地主", rural_folk: "乡村民众", trade_unions: "工会", capitalists: "资本家", petty_bourgeoisie: "小市民", bureaucrats: "官僚", machinists: "机械师" };
// 修正案事件名（维基英文标题 → 中文；出现新英文标题时自检会报错提醒补表）
const EV_ZH = {
  "The [State] Homestead Act": "[州] 宅地法",
  "Too Much Democracy?": "民主过剩？",
  "Cultural Contributions": "文化贡献",
  "Houses of Faith": "信仰之所",
  "An Enthralling [Title]": "引人入胜的《[头衔]》",
  "Discipline and Punish": "规训与惩罚",
  "Foreign Faiths": "外来信仰",
  "Socialization": "社会化",
  "Prisons of the Poor": "穷人的监狱",
  "Colonial Outsourcing": "殖民外包",
  "School Organization": "学校组织",
  "Ragged Schools": "贫民义塾",
  "Total Top-Down Management": "彻底的科层管理",
  "[Title] of the [Demonym]": "[民族]的《[头衔]》",
  "Purchasing Emancipation": "赎买解放",
  "Boys and Girls": "男孩与女孩",
  "Follies of Youth": "青春的荒唐",
  "The Blasphemy Laws": "渎神法",
  "Red Tape": "文牍主义",
  "Anti-Anti-Clericalism": "反反教权主义",
  "People and Goods": "人与货",
  "Taxation Is Theft": "税收即盗窃",
  "Foreign Competition": "外国竞争",
  "Pen and Paper": "笔与纸",
  "Foreign Farm Acquisitions, Inc.": "外国农垦收购公司",
  "The Principle of Population": "人口原理",
  "Mutual Aid": "互助论",
  "The Nominating Bodies": "提名机构",
};
// 镜像与官方 modifiers loc 均缺失中文的键（人工补，维护于本表）
const AM_MOD_ZH = {
  country_polish_cultural_acceptance_add: "波兰文化接纳度",
  country_basque_cultural_acceptance_add: "巴斯克文化接纳度",
  country_fervor_target_basque_add: "巴斯克虔信度目标",
};
const amendmentList = [];
for (const law of laws) for (const am of (law.amendments || [])) {
  if (amendmentList.some(x => x.key === am.key)) continue;
  amendmentList.push({
    key: am.key,
    name: L(am.loc?.name) || pretty(am.key),
    desc: (cleanLoc(L(am.loc?.description)) || "").replace(/\\n/g, " ").replace(/\s{2,}/g, " "),
    parent: am.parent_law || "",
    parentName: lawName(am.parent_law),
    allowed: (am.allowed_laws || []),
    effects: (am.modifiers || []).map(m => (AM_MOD_ZH[m.key] ? `${AM_MOD_ZH[m.key]} ${m.value_raw}` : `${(modZhOf(m.key) || m.key)} ${m.value_raw}`)),
    igFlavor: [...new Set((am.modifiers || []).map(m => m.key).filter(k => k.startsWith("interest_group_ig_")).map(k => {
      const rest = k.replace("interest_group_ig_", "");
      const ig = Object.keys(IG_ZH).find(name => rest === name || rest.startsWith(name + "_") || rest.includes("_" + name + "_") || rest.endsWith("_" + name));
      return ig || rest;
    }))],
    possible: am.possible?.raw || "",
    event: null,
  });
}
amendmentList.sort((a, b) => a.parentName.localeCompare(b.parentName, "zh-Hans") || a.name.localeCompare(b.name, "zh-Hans"));
const igNames = (flavors) => flavors.map(f => IG_ZH[f] || f).join("、");
try {
  const amWikiText = readWikiText(path.join(import.meta.dirname, "wiki-amendments.en.txt"));
  const namePositions = [];
  for (const am of amendmentList) {
    const enName = (LOCEN.get(am.key) || "").trim(); // 修正案英文 loc 为游戏裸键（amendment_xxx）
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
    if (m) { entry.am.event = { type: m[2], name: EV_ZH[m[1].trim()] || m[1].trim() }; eventMapped++; }
  });
  console.log(`维基事件表: 定位 ${namePositions.length} / ${amendmentList.length}，命中事件 ${eventMapped}`);
} catch (e) { console.log("维基修正案文本缺失（事件标注跳过）"); }
const amByKey = new Map(amendmentList.map(a => [a.key, a]));

// 国家开局法律（用于「现行」高亮，模拟游戏内当前法律显示）
const countries = (data.countries || []).filter(c => c.existsAtStart);
const COUNTRY_START = {};
for (const c of countries) {
  COUNTRY_START[c.key] = [...new Set((c.startingLaws || []).map(l => l.key || l))]; // 直读层为字符串键，镜像层曾是对象
}
const countryName = (tag) => L(`country:${tag}.name`) || tag;

// 各页计数（页签栏用，口径与 index 生成器一致）
const achievementsCount = (data.achievements || []).length;
const companiesCount = (data.companies || []).length;
const techCount = (data.technologies || []).length;
const buildingsCount = (data.buildings || []).length;
const eventsCount = (() => { try { return (JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "tech-events.json"), "utf8").replace(/^\uFEFF/, "")).entries || []).length; } catch { return 0; } })();

// 法组 → 法律（按游戏内立法界面顺序：组内 sort_order）
// 专属法律组说明：只认「国家/文化限定」类可见条件（已实施 X / NOT 拥有 是互斥隐藏，不算专属）
// hierarchy 系法律组（种姓支配权/江户等级制度）不在 is_visible 里——它们靠 linked_social_hierarchy 由人口构成决定可见性：
//   british_indian_caste_system = 英属印度诸邦（开局 42 国：莫卧儿、东印度公司、迈索尔…）
//   edo_system = 日本
const HIERARCHY_GROUP_ZH = {
  lawgroup_caste_hegemony: "仅英属印度体系国家可用（开局为英属印度诸邦：莫卧儿、东印度公司、海得拉巴、迈索尔等 42 国； pops 须为印度教+南亚传承）",
  lawgroup_edo_social_system: "仅日本可用（江户体系：大和/琉球人口构成时生效）",
};
const GROUP_NOTES = (() => {
  const notes = {};
  // hierarchy 组直接注入
  for (const [gk, note] of Object.entries(HIERARCHY_GROUP_ZH)) notes[gk] = { conds: [note], laws: laws.filter(x => x.group_key === gk).map(x => x.key) };
  // is_visible 国家/文化限定（已实施 X / NOT 拥有 是互斥隐藏，不算专属）
  for (const [lk, vis] of Object.entries(LAW_ISVISIBLE)) {
    const law = laws.find(x => x.key === lk);
    if (!law) continue;
    const r = parseConditions(vis, makePdxCtx());
    const nationConds = r.conds.filter(c => /^(国家为|主流文化为|仅 国家为)/.test(c));
    if (!nationConds.length) continue;
    const gk = law.group_key;
    if (!notes[gk]) notes[gk] = { conds: [], laws: [] };
    for (const c of nationConds) if (!notes[gk].conds.includes(c)) notes[gk].conds.push(c);
    notes[gk].laws.push(lk);
  }
  return notes;
})();
const GROUP_DATA = groups.map(g => ({
  key: g.key,
  name: lawGroupZh(g.key),
  cat: groupCat(g.key),
  days: g.base_enactment_days ?? 200,
  note: (GROUP_NOTES[g.key] || null),
  laws: laws.filter(l => l.group_key === g.key)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || lawName(a.key).localeCompare(lawName(b.key), "zh-Hans"))
    .map(l => {
      const ce = parseCanEnact(l);
      // 意识形态支持四组：默认支持的常规 / 默认支持的领袖 / 可说服（反对组内其它法律更甚）/ 反对更甚的领袖意识形态
      // 领袖意识形态判定 = interest_group_leader_weight 非空（45 个：自由主义者/共和主义者/卡洛斯派…）
      const groupLaws = laws.filter(x => x.group_key === l.group_key).map(x => x.key);
      const direct = [], directChar = [], relative = [], relativeChar = [];
      const stancesByIgo = {};
      for (const ig of (data.ideologies || [])) {
        const st = {};
        for (const s of (ig.law_stances || [])) if (groupLaws.includes(s.law_key)) st[s.law_key] = s.stance;
        if (Object.keys(st).length) stancesByIgo[ig.key] = st;
        const mine = st[l.key];
        if (!mine) continue;
        const isLeader = !!ig.interest_group_leader_weight;
        const isPro = mine === "approve" || mine === "strongly_approve";
        const hasScond = Object.values(st).includes("strongly_disapprove");
        if (isPro && !isLeader) direct.push(ig.key);
        else if (isPro && isLeader) directChar.push(ig.key);
        else if (mine === "disapprove" && hasScond) (isLeader ? relativeChar : relative).push(ig.key);
      }
      return {
        key: l.key,
        name: lawName(l.key),
        icon: lawIcon(l.key),
        disallowing: (l.disallowing_laws || []).map(x => x.replace(/^law:/, "")),
        unlockTechs: (l.unlocking_technologies || []).map(x => L(x.key) || pretty(x.key || "")),
        institution: l.institution ? cleanLoc(L(l.institution.loc?.name)) : "",
        canEnact: ce,
        igoDirect: [...new Map(direct.map(k => [L(`ideology:${k}.name`) || k, k])).values()].map(k => ({ k, n: L(`ideology:${k}.name`) || k, icon: igoIconFile(k), st: stancesByIgo[k] || {} })),
        igoDirectChar: [...new Map(directChar.map(k => [L(`ideology:${k}.name`) || k, k])).values()].map(k => ({ k, n: L(`ideology:${k}.name`) || k, icon: igoIconFile(k), st: stancesByIgo[k] || {} })),
        igoRelative: [...new Map(relative.map(k => [L(`ideology:${k}.name`) || k, k])).values()].map(k => ({ k, n: L(`ideology:${k}.name`) || k, icon: igoIconFile(k), st: stancesByIgo[k] || {} })),
        igoRelativeChar: [...new Map(relativeChar.map(k => [L(`ideology:${k}.name`) || k, k])).values()].map(k => ({ k, n: L(`ideology:${k}.name`) || k, icon: igoIconFile(k), st: stancesByIgo[k] || {} })),
        mods: (l.modifiers || []).map(m => ({
          cat: m.category?.key || "",
          s: (modZhOf(m.key) || m.key) + " " + (m.value_raw ?? ""),
        })),
        ams: (l.amendments || []).map(a => a.key),
      };
    }),
}));
const LAW_BY_KEY = new Map(GROUP_DATA.flatMap(g => g.laws).map(l => [l.key, l]));
const AM_CONDS_CACHE = new Map();
const amCardData = (amKey) => {
  const a = amByKey.get(amKey);
  if (!a) return null;
  if (!AM_CONDS_CACHE.has(amKey)) {
    const r = parseConditions(a.possible || "", makePdxCtx());
    AM_CONDS_CACHE.set(amKey, r.always ? [] : r.conds);
  }
  return {
    key: a.key, name: a.name, desc: a.desc, parentName: a.parentName,
    allowedExtra: (a.allowed || []).filter(k => k !== a.parent),
    effects: a.effects, ig: igNames(a.igFlavor), event: a.event, possible: a.possible,
    conds: AM_CONDS_CACHE.get(amKey) || [],
  };
};

const html = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vicdata 法律指南 · 立法与修正案</title>
<style>
  ${SHELL_CSS}
  .wrap{max-width:1240px;margin:0 auto;padding:26px 18px 80px}
  
  .toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0}
  .toolbar input[type=search]{flex:1;min-width:220px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--parchment-2);color:var(--ink);font:inherit;font-size:14px}
  .count{font-size:13px;color:var(--ink-soft)}
  .law-layout{display:grid;grid-template-columns:290px minmax(0,1fr);gap:16px;align-items:start}
  @media (max-width:860px){.law-layout{grid-template-columns:1fr}}
  /* 左栏：法律组（游戏内法规分类列表样式） */
  #group-list{position:sticky;top:12px;display:flex;flex-direction:column;gap:4px;max-height:calc(100vh - 40px);overflow-y:auto;padding:4px 2px 12px}
  .g-cat{margin:12px 2px 4px;font-size:12.5px;color:var(--gold);letter-spacing:2px;font-weight:700}
  .g-cat:first-child{margin-top:2px}
  .g-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--parchment-2);cursor:pointer;user-select:none}
  .g-item:hover{border-color:var(--gold);background:var(--parchment-dark)}
  .g-item.is-on{border-color:var(--gold-bright);background:linear-gradient(90deg, rgba(184,147,63,.22), var(--parchment-2));box-shadow:inset 3px 0 0 var(--gold-bright)}
  .g-item .g-name{flex:1;font-size:14px;font-weight:600}
  .g-item .g-n{font-size:12px;color:var(--ink-soft);border:1px solid var(--line);border-radius:999px;padding:0 8px;background:var(--parchment)}
  .g-item.is-off{opacity:.38}
  .group-note{display:none;margin:0 0 8px;border:1px solid var(--gold);border-left:4px solid var(--gold-bright);border-radius:8px;background:rgba(200,164,91,.14);padding:8px 12px;font-size:13px;line-height:1.7;color:var(--ink)}
  /* 法律横排：游戏内立法界面的组内法律列表 */
  .spec-head{display:flex;align-items:baseline;gap:12px;margin:2px 0 6px}
  .spec-head h2{margin:0;font-size:21px;letter-spacing:1px}
  .spec-head .cat-badge{font-size:12px;border:1px solid var(--gold);color:var(--gold);border-radius:999px;padding:2px 10px;background:rgba(200,164,91,.12)}
  .spec-head .days{font-size:12.5px;color:var(--ink-soft)}
  .spectrum{position:relative;display:flex;align-items:stretch;gap:10px;overflow-x:auto;padding:14px 10px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg, var(--parchment-2), rgba(247,238,217,.4))}
  .law-node{position:relative;z-index:1;flex:0 0 auto;width:118px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 6px;border:1px solid var(--line);border-radius:10px;background:var(--parchment-2);cursor:pointer;text-align:center;transition:transform .12s ease, box-shadow .12s ease, border-color .12s}
  .law-node:hover{border-color:var(--gold);transform:translateY(-2px);box-shadow:0 4px 10px rgba(139,109,59,.25)}
  .law-node.is-on{border-color:var(--gold-bright);box-shadow:0 0 0 2px rgba(184,147,63,.45), 0 4px 12px rgba(139,109,59,.3)}
  .law-node img{width:52px;height:52px;object-fit:contain;background:var(--parchment);border:1px solid var(--line);border-radius:8px}
  .law-node .n{font-size:12.5px;font-weight:600;line-height:1.35;max-height:3.9em;overflow:hidden}
  .law-node .cur{font-size:10px;color:#fff;background:var(--red);border-radius:999px;padding:0 7px;display:none}
  .law-node.is-current .cur{display:inline-block}
  .law-node.is-dim{opacity:.3}
  .law-node .has-am{position:absolute;top:4px;right:6px;font-size:9.5px;color:var(--gold);border:1px solid var(--gold);border-radius:999px;padding:0 5px;background:rgba(200,164,91,.15)}
  /* 立法面板：游戏内「修改法律」面板布局 */
  .law-panel{margin-top:14px;border:2px solid var(--gold);border-radius:12px;background:var(--parchment-2);box-shadow:2px 4px 0 rgba(139,109,59,.18)}
  .lp-head{display:flex;gap:14px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);background:linear-gradient(90deg, rgba(184,147,63,.16), transparent)}
  .lp-head img{width:58px;height:58px;object-fit:contain;background:var(--parchment);border:1px solid var(--line);border-radius:10px}
  .lp-head .t h3{margin:0;font-size:20px}
  .lp-head .t .sub{font-size:12px;color:var(--ink-soft);font-family:Consolas,monospace;margin-top:3px}
  .lp-head .badges{margin-left:auto;display:flex;flex-direction:column;gap:6px;align-items:flex-end}
  .badge{font-size:12px;border:1px solid var(--gold);color:var(--gold);border-radius:999px;padding:2px 10px;background:rgba(200,164,91,.12)}
  .badge.cur-b{border-color:var(--red);color:var(--red);background:rgba(140,59,46,.1);display:none}
  .lp-body{padding:14px 18px 18px}
  .lp-sec{margin:0 0 14px}
  .lp-sec h4{margin:0 0 6px;font-size:14.5px;color:var(--red);letter-spacing:1px}
  .mod-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:6px}
  .mod-item{border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:6px;background:var(--parchment);padding:6px 10px;font-size:13px;line-height:1.55}
  .mod-item .mc{font-size:10.5px;color:var(--ink-soft);border:1px solid var(--line);border-radius:4px;padding:0 5px;margin-right:6px;vertical-align:1px}
  .kv{font-size:13.5px;line-height:1.9;color:var(--ink)}
  .kv b{color:var(--ink-soft);font-weight:600}
  .kv a{color:var(--gold);text-decoration:none;border-bottom:1px dotted var(--gold)}
  .none-note{font-size:13px;color:var(--ink-soft);font-style:italic}
  /* 修正案事件池 */
  .am-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}
  .am-card{border:1px dashed var(--line);border-radius:10px;background:var(--parchment);padding:10px 12px}
  .am-card .am-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .am-card h5{margin:0;font-size:14.5px}
  .ev-badge{font-size:10.5px;border-radius:999px;padding:1px 9px;border:1px solid;white-space:nowrap}
  .ev-debate{color:#2c5d8f;border-color:#2c5d8f;background:rgba(44,93,143,.08)}
  .ev-advance{color:#3d6b34;border-color:#3d6b34;background:rgba(61,107,52,.08)}
  .ev-stall{color:#8c3b2e;border-color:#8c3b2e;background:rgba(140,59,46,.08)}
  .ev-none{color:var(--ink-soft);border-color:var(--line)}
  .am-card .am-desc{margin:6px 0 0;font-size:12.8px;line-height:1.65;color:var(--ink)}
  .am-card .am-how{margin:6px 0 0;font-size:12.3px;color:var(--ink-soft);line-height:1.6}
  .am-card .am-eff{margin:6px 0 0;font-size:12.3px;line-height:1.6}
  .am-card details{margin-top:6px}
  .am-card summary{cursor:pointer;font-size:12px;color:var(--gold)}
  pre.script{white-space:pre-wrap;word-break:break-word;background:var(--parchment-2);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:12px/1.6 Consolas,monospace;color:var(--ink-soft);margin:6px 0 0}
  .lp-foot{display:flex;gap:10px;flex-wrap:wrap;align-items:center;border-top:1px dashed var(--line);margin-top:4px;padding-top:10px;font-size:12.5px;color:var(--ink-soft)}
  .lp-foot a{color:var(--gold);text-decoration:none;border:1px solid var(--line);border-radius:6px;padding:3px 10px;background:var(--parchment)}
  /* 意识形态支持 chips */
  .igo-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .igo-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;background:var(--parchment);padding:3px 12px 3px 4px;font-size:12.8px}
  .igo-chip img{width:24px;height:24px;object-fit:contain;border-radius:6px}
  .igo-chip.igo-pro{border-color:#3d6b34;background:rgba(61,107,52,.08)}
  .igo-chip.igo-rel{border-color:#8a6d3b;background:rgba(200,164,91,.1)}
  .igo-chip.igo-char{border-color:#6b5a3e;background:rgba(107,90,62,.07);border-style:dashed}
  /* 意识形态支持四组折叠清单 */
  .igo-fold{border:1px solid var(--line);border-radius:8px;background:var(--parchment);margin-bottom:8px;overflow:hidden}
  .igo-fold > summary{cursor:pointer;padding:7px 12px;font-size:13px;font-weight:600;color:var(--ink);background:var(--parchment-2);list-style:none;user-select:none}
  .igo-fold > summary::-webkit-details-marker{display:none}
  .igo-fold > summary::before{content:"▸ ";color:var(--gold)}
  .igo-fold[open] > summary::before{content:"▾ "}
  .igo-fold[open] > summary{border-bottom:1px dashed var(--line)}
  .igo-fold .igo-row{padding:10px 12px}
  /* 意识形态悬浮提示：游戏式小窗，列出对全组法律的态度 */
  .igo-chip{position:relative}
  .igo-chip .igo-tip{display:none;position:absolute;left:0;top:calc(100% + 8px);z-index:999;min-width:250px;max-width:330px;background:linear-gradient(180deg,#f7eed9,#efe0bd);border:2px solid var(--gold);border-radius:10px;box-shadow:0 6px 18px rgba(59,47,30,.35);padding:10px 12px;text-align:left;pointer-events:none}
  .igo-chip:hover .igo-tip,.igo-chip:focus .igo-tip{display:block}
  .igo-chip .igo-tip::before{content:"";position:absolute;top:-8px;left:22px;border:7px solid transparent;border-bottom-color:var(--gold)}
  .igo-tip .tip-title{display:block;font-weight:700;font-size:13px;color:var(--red);border-bottom:1px solid var(--line);padding-bottom:5px;margin-bottom:6px}
  .igo-tip .tip-row{display:flex;justify-content:space-between;align-items:center;gap:14px;font-size:12.6px;padding:2.5px 6px;border-radius:5px}
  .igo-tip .tip-row.is-cur{background:rgba(184,147,63,.28);outline:1px solid var(--gold-bright)}
  .igo-tip .tip-row.is-cur .tip-law::before{content:"▸ "}
  .igo-tip .tip-law{color:var(--ink)}
  .igo-tip .tip-stance{flex:none;font-weight:700}
  .igo-tip .st-spro{color:#1e5c1a}
  .igo-tip .st-pro{color:#3d6b34}
  .igo-tip .st-neu{color:#6b5a3e}
  .igo-tip .st-con{color:#a05a28}
  .igo-tip .st-scon{color:#8c3b2e}
  .igo-rel-note{font-size:12px;color:var(--ink-soft);border-left:3px solid var(--gold);padding-left:8px;margin-left:4px}
  .hint{font-size:13px;color:var(--ink-soft);background:var(--parchment-2);border:1px solid var(--line);border-radius:8px;padding:10px 14px;line-height:1.8;margin:12px 0}
  .hint b{color:var(--ink)}
  #country-pick{padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--parchment-2);color:var(--ink);font:inherit;font-size:13.5px;min-width:230px}
</style>
</head>
<body>
<div class="wrap">
  ${pageShell({ page: "laws", title: "Vicdata 法律指南", counts: { laws: LAW_BY_KEY.size }, lede: "按游戏内立法界面组织的法律手册：左侧选法规分类与法律组，中间点选法律，下方查看限定条件、意识形态支持、效果与修正案事件池。数据来自游戏文件（1.15.1）；事件类型（辩论/推进/停滞）与获取思路来自 Paradox 社区维基。", back: { href: "index.html", label: "← 返回目标指南" }, wide: true })}
  <a id="laws-top"></a>

  <div class="toolbar">
    <input id="q-law" type="search" placeholder="搜索法律 / 修正案 / 效果…">
    <label style="font-size:13px;color:var(--ink-soft)">对照国家开局：</label>
    <input id="country-pick" list="country-list" autocomplete="off" placeholder="输入国名（可选），高亮该国开局法律">
    <datalist id="country-list"></datalist>
    <span class="count" id="law-count"></span>
  </div>

  <div class="hint"><b>怎么读这页：</b>每个法律组内的法律按游戏内排列顺序展示，点击查看详情。改法律就是立法：基础耗时 ${GROUP_DATA[0]?.days ?? 200} 天左右，政府内利益集团的支持/反对决定成败与快慢；有限定条件的法律会写明条件。<b>修正案</b>不是单独颁布的——它在父法立法过程中由事件（<b>辩论 Debate / 推进 Advance / 停滞 Stall</b>）附加，想让某条修正案出现，就把对应的利益集团拉进政府。<b>意识形态支持</b>来自游戏内意识形态对法律的态度：绿色为本身支持，金框为反对同组其它法律更甚、可被说服转而支持本法的。</div>

  <div class="law-layout">
    <aside id="group-list"></aside>
    <main>
      <div class="spec-head">
        <h2 id="spec-title">—</h2>
        <span class="cat-badge" id="spec-cat"></span>
        <span class="days" id="spec-days"></span>
      </div>
      <div class="group-note" id="spec-note" style="display:none"></div>
      <div class="spectrum" id="spectrum"></div>
      <div class="law-panel" id="law-panel" style="display:none"></div>
      <div class="law-panel" id="law-empty"><div class="lp-body"><p class="none-note">点击上方法律查看限定条件、意识形态支持与修正案池。</p></div></div>
    </main>
  </div>
</div>
<script>
  const GROUPS = ${JSON.stringify(GROUP_DATA)};
  const AMS = ${JSON.stringify(Object.fromEntries([...amByKey.keys()].map(k => [k, amCardData(k)])))};
  const LAW_NAME = ${JSON.stringify(Object.fromEntries([...LAW_BY_KEY.keys()].map(k => [k, LAW_BY_KEY.get(k).name])))};
  const COUNTRY_START = ${JSON.stringify(COUNTRY_START)};
  const COUNTRY_NAME = ${JSON.stringify(Object.fromEntries(countries.map(c => [c.key, countryName(c.key)])))};
  const el = (id) => document.getElementById(id);
  const esc2 = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let curGroup = null, curLaw = null, curCountry = "", curCountryLabel = "", q = "";

  // ---------- 左栏法律组 ----------
  function renderGroups() {
    const box = el("group-list");
    const cats = [...new Set(GROUPS.map(g => g.cat))].sort((a, b) => {
      const order = ${JSON.stringify(CAT_ORDER)}; const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    box.innerHTML = cats.map(cat => {
      const items = GROUPS.filter(g => g.cat === cat);
      if (!items.length) return "";
      return '<div class="g-cat">' + esc2(cat) + '</div>' + items.map(g => {
        const on = curGroup === g.key ? " is-on" : "";
        const dim = q && !g._hit ? " is-off" : "";
        return '<div class="g-item' + on + dim + '" data-g="' + g.key + '"><span class="g-name">' + esc2(g.name) + '</span><span class="g-n">' + g.laws.length + '</span></div>';
      }).join("");
    }).join("");
    box.querySelectorAll(".g-item").forEach(item => item.addEventListener("click", () => selectGroup(item.dataset.g)));
  }

  // ---------- 法律横排（组内列表） ----------
  function renderSpectrum() {
    const g = GROUPS.find(x => x.key === curGroup);
    const spec = el("spectrum");
    if (!g) {
      // 空状态引导（曾完全空白，被吐槽「甲板上有什么？」）
      spec.innerHTML = '<p class="none-note" style="padding:14px 6px;margin:0">点击左侧法律组，在此横排选择具体法律。</p>';
      return;
    }
    el("spec-title").textContent = g.name;
    el("spec-cat").textContent = g.cat;
    el("spec-days").textContent = "基础立法 " + g.days + " 天 · " + g.laws.length + " 部法律";
    const noteBox = el("spec-note");
    if (g.note) {
      noteBox.style.display = "block";
      noteBox.innerHTML = "⚠ 本组仅特定国家可用：" + g.note.conds.map(c => esc2(c)).join("；") + "（涉 " + g.note.laws.length + " 部法律）。其它国家看不到这组法律。";
    } else noteBox.style.display = "none";
    const hitN = q ? g.laws.filter(l => l._hit).length : g.laws.length;
    const anyHit = GROUPS.some(x => x._hit);
    const tip = q && hitN === 0
      ? '<p class="none-note" style="padding:12px 6px;margin:0 0 8px">本组没有匹配「' + esc2(el("q-law").value.trim()) + '」的法律。' + (anyHit ? "试试左侧未变暗的其他法律组。" : "全站法律均无此关键词——试试更短的关键词（如「移民」「选举」「经济」），或清空搜索。") + '</p>'
      : "";
    spec.innerHTML = tip + g.laws.map(l => {
      const on = curLaw === l.key ? " is-on" : "";
      const cur = curCountry && (COUNTRY_START[curCountry] || []).includes(l.key) ? " is-current" : "";
      const dim = q && !l._hit ? " is-dim" : "";
      return '<div class="law-node' + on + cur + dim + '" data-law="' + l.key + '" title="' + esc2(l.key) + '">'
        + '<span class="cur">现行</span>'
        + (l.ams.length ? '<span class="has-am" title="有 ' + l.ams.length + ' 条修正案">' + l.ams.length + '</span>' : '')
        + '<img src="' + l.icon + '" alt="" loading="lazy" onerror="this.style.visibility=\\'hidden\\'">'
        + '<span class="n">' + esc2(l.name) + '</span>'
        + '</div>';
    }).join("");
    spec.querySelectorAll(".law-node").forEach(node => node.addEventListener("click", () => selectLaw(node.dataset.law)));
    const cur = spec.querySelector(".law-node.is-on");
    if (cur) cur.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }

  // ---------- 立法面板 ----------
  function evBadge(ev) {
    if (!ev) return '<span class="ev-badge ev-none">事件类型未标注</span>';
    const cls = ev.type === "Debate" ? "ev-debate" : ev.type === "Advance" ? "ev-advance" : "ev-stall";
    const zh = ev.type === "Debate" ? "辩论" : ev.type === "Advance" ? "推进" : "停滞";
    return '<span class="ev-badge ' + cls + '">' + zh + ' ' + esc2(ev.name) + '</span>';
  }
  function renderLawPanel() {
    const panel = el("law-panel");
    const l = GROUPS.flatMap(g => g.laws).find(x => x.key === curLaw);
    if (!l) { panel.style.display = "none"; el("law-empty").style.display = ""; return; }
    el("law-empty").style.display = "none";
    panel.style.display = "";
    const g = GROUPS.find(x => x.laws.some(y => y.key === l.key));
    const isCur = curCountry && (COUNTRY_START[curCountry] || []).includes(l.key);
    const isCurName = isCur ? esc2(curCountryLabel || COUNTRY_NAME[curCountry]) + " 开局现行" : "";
    const STANCE_ZH = { strongly_approve: "强烈支持", approve: "支持", neutral: "中立", disapprove: "反对", strongly_disapprove: "强烈反对" };
    const STANCE_CLS = { strongly_approve: "st-spro", approve: "st-pro", neutral: "st-neu", disapprove: "st-con", strongly_disapprove: "st-scon" };
    // 游戏式悬浮提示：该意识形态对本组全部法律的态度
    const igoTip = (x) => Object.entries(x.st || {}).sort((a, b) => {
      const order = ["strongly_approve", "approve", "neutral", "disapprove", "strongly_disapprove"];
      return order.indexOf(a[1]) - order.indexOf(b[1]);
    }).map(([lk, st]) => '<div class="tip-row' + (lk === curLaw ? " is-cur" : "") + '"><span class="tip-law">' + esc2(LAW_NAME[lk] || lk) + '</span><span class="tip-stance ' + (STANCE_CLS[st] || "st-neu") + '">' + STANCE_ZH[st] + '</span></div>').join("");
    const igoChip = (x, cls) => '<span class="igo-chip ' + cls + '" tabindex="0">'
      + (x.icon ? '<img src="' + x.icon + '" alt="" loading="lazy" onerror="this.style.display=\\'none\\'">' : "")
      + esc2(x.n)
      + '<span class="igo-tip"><span class="tip-title">' + esc2(x.n) + ' · 对本组法律的态度</span>' + igoTip(x) + '</span>'
      + '</span>';
    // 意识形态支持：四组可折叠清单（组内 0 条时整组不显示）
    const igoFold = (title, chips, cls, open) => chips.length ? '<details class="igo-fold"' + (open ? " open" : "") + '><summary>' + esc2(title) + '（' + chips.length + '）</summary><div class="igo-row">' + chips.map(x => igoChip(x, cls)).join("") + '</div></details>' : "";
    const hasAny = l.igoDirect.length || l.igoDirectChar.length || l.igoRelative.length || l.igoRelativeChar.length;
    const igoHtml = hasAny
      ? igoFold("默认支持（常规意识形态）", l.igoDirect, "igo-pro", true)
        + igoFold("默认支持（领袖意识形态：该集团领袖上台时）", l.igoDirectChar, "igo-char", false)
        + igoFold("反对同组其它法律更甚、可被说服转而支持本法", [...l.igoRelative, ...l.igoRelativeChar], "igo-rel", false)
      : '<p class="none-note">游戏内无意识形态对该法表明立场。</p>';
    const CAT_ZH = { country: "国家", state: "州", building: "建筑", port: "港口", agriculture: "农业", resource: "资源", mapi: "市场准入", infrastructure_market: "基础设施·市场", disease_colony: "疫病" };
    const modHtml = l.mods.length
      ? '<div class="mod-list">' + l.mods.map(m => '<div class="mod-item"><span class="mc">' + esc2(CAT_ZH[m.cat] || m.cat) + '</span>' + esc2(m.s) + '</div>').join("") + '</div>'
      : '<p class="none-note">（无直接加成条目）</p>';
    const amHtml = l.ams.length
      ? '<div class="am-grid">' + l.ams.map(k => {
          const a = AMS[k]; if (!a) return "";
          const how = a.ig ? '把 <b>' + esc2(a.ig) + '</b> 拉进政府，立法「' + esc2(a.parentName) + '」期间等它的事件。' : '立法「' + esc2(a.parentName) + '」期间留意事件池。';
          const extra = a.allowedExtra.length ? '<br>也可挂到：' + a.allowedExtra.map(x => esc2(LAW_NAME[x] || x)).join("、") : "";
          const condLine = a.conds && a.conds.length ? '<br><b>生效条件：</b>' + esc2(a.conds.join("；")) : "";
          return '<div class="am-card"><div class="am-top"><h5>' + esc2(a.name) + '</h5>' + evBadge(a.event) + '</div>'
            + (a.desc ? '<p class="am-desc">' + esc2(a.desc) + '</p>' : "")
            + '<p class="am-how">获取要点：' + how + extra + condLine + '</p>'
            + (a.effects.length ? '<p class="am-eff">效果：' + esc2(a.effects.join("；")) + '</p>' : "")
            + (a.possible ? '<details><summary>触发脚本（原样截取）</summary><pre class="script">' + esc2(a.possible) + '</pre></details>' : "")
            + '</div>';
        }).join("") + '</div>'
      : '<p class="none-note">该法律没有已知的修正案事件。</p>';
    panel.innerHTML =
      '<div class="lp-head"><img src="' + l.icon + '" alt="" onerror="this.style.visibility=\\'hidden\\'">'
      + '<div class="t"><h3>' + esc2(l.name) + '</h3><div class="sub">' + esc2(l.key) + ' · ' + esc2(g.name) + '</div></div>'
      + '<div class="badges"><span class="badge">' + esc2(g.cat) + '</span>' + (isCur ? '<span class="badge cur-b" style="display:inline-block">' + isCurName + '</span>' : "") + '</div></div>'
      + '<div class="lp-body">'
      + '<div class="lp-sec"><h4>立法参数</h4><div class="kv"><b>基础耗时：</b>' + g.days + ' 天（受利益集团态度影响）<br>'
      + (l.canEnact ? '<b>限定条件：</b>' + esc2(l.canEnact.join("；")) + '<br>' : "")
      + (l.institution ? '<b>挂接机构：</b>' + esc2(l.institution) + '<br>' : "")
      + (l.unlockTechs.length ? '<b>前置科技：</b>' + esc2(l.unlockTechs.join("、")) + '<br>' : "")
      + (l.disallowing.length ? '<b>互斥：</b>颁布后不可再实施 ' + l.disallowing.map(x => esc2(LAW_NAME[x] || x)).join("、") + '<br>' : "")
      + '</div></div>'
      + '<div class="lp-sec"><h4>意识形态支持</h4>' + igoHtml + '</div>'
      + '<div class="lp-sec"><h4>效果</h4>' + modHtml + '</div>'
      + '<div class="lp-sec"><h4>修正案事件池（' + l.ams.length + '）</h4>' + amHtml + '</div>'
      + '</div>';
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- 选择逻辑 ----------
  function selectGroup(gk, keepLaw) {
    curGroup = gk;
    if (!keepLaw || !GROUPS.find(x => x.key === gk).laws.some(y => y.key === curLaw)) curLaw = null;
    renderGroups(); renderSpectrum(); renderLawPanel();
    location.hash = "g_" + gk;
  }
  function selectLaw(lk) {
    curLaw = lk;
    const g = GROUPS.find(x => x.laws.some(y => y.key === lk));
    if (g && g.key !== curGroup) { curGroup = g.key; }
    renderGroups(); renderSpectrum(); renderLawPanel();
    location.hash = "law_" + lk;
  }

  // ---------- 搜索（法律名/键 + 修正案名/效果） ----------
  function applySearch() {
    q = (el("q-law").value || "").trim().toLowerCase();
    for (const g of GROUPS) {
      g._hit = false;
      for (const l of g.laws) {
        l._hit = !q || (l.name + " " + l.key).toLowerCase().includes(q)
          || l.mods.some(m => m.s.toLowerCase().includes(q))
          || l.ams.some(k => { const a = AMS[k]; return a && ((a.name + " " + a.desc + " " + a.effects.join(" ")).toLowerCase().includes(q)); });
        if (l._hit) g._hit = true;
      }
    }
    let shown = 0;
    for (const g of GROUPS) shown += g.laws.filter(l => l._hit).length;
    el("law-count").textContent = "命中 " + shown + " / " + GROUPS.reduce((s, g) => s + g.laws.length, 0) + " 部法律";
    renderGroups(); renderSpectrum();
    if (q && shown === 0) {
      el("spectrum").innerHTML = '<p class="none-note" style="padding:16px 6px;margin:0">没有法律匹配「' + esc2(el("q-law").value.trim()) + '」——试试更短的关键词（如「移民」「选举」「经济」），或清空搜索。</p>';
    }
  }

  // ---------- 国家开局高亮 ----------
  // 常用别名（官方 loc 与玩家称呼不一致，如 CHI 官方名「中国」而玩家惯称「大清」）
  const COUNTRY_ALIAS = { "大清": "CHI", "清朝": "CHI", "大清帝国": "CHI", "奥斯曼": "TUR", "奥斯曼帝国": "TUR" };
  function findCountry(v) {
    v = (v || "").trim();
    if (!v) return "";
    if (COUNTRY_ALIAS[v]) return COUNTRY_ALIAS[v];
    const exact = Object.keys(COUNTRY_NAME).find(t => COUNTRY_NAME[t] === v);
    if (exact) return exact;
    const hits = Object.keys(COUNTRY_NAME).filter(t => COUNTRY_NAME[t].startsWith(v)); // 前缀匹配（如「奥斯曼」→奥斯曼帝国），唯一命中才采用
    return hits.length === 1 ? hits[0] : "";
  }
  function applyCountry() {
    curCountry = findCountry(el("country-pick").value);
    curCountryLabel = curCountry ? (el("country-pick").value || "").trim() || COUNTRY_NAME[curCountry] : ""; // 显示玩家输入（如「大清」），回退官方名（「中国」）
    renderSpectrum(); renderLawPanel();
  }
  el("country-pick").addEventListener("change", applyCountry);
  el("country-pick").addEventListener("input", applyCountry); // datalist 选中/键入即时高亮（change 在部分浏览器输入路径不触发）

  // 国家下拉（按简中名排序；别名置顶便于「大清」直达 CHI）
  el("country-list").innerHTML = Object.keys(COUNTRY_ALIAS).map(a => '<option value="' + esc2(a) + '">').join("")
    + Object.entries(COUNTRY_NAME).sort((a, b) => a[1].localeCompare(b[1], "zh-Hans")).map(([t, n]) => '<option value="' + esc2(n) + '">').join("");

  el("q-law").addEventListener("input", applySearch);

  // ---------- 初始化（支持 #law_x / #g_x 深链） ----------
  const h = location.hash.slice(1);
  if (h.startsWith("law_") && LAW_IN(h.slice(4))) { selectLaw(h.slice(4)); }
  else if (h.startsWith("g_") && GROUPS.some(g => g.key === h.slice(2))) { selectGroup(h.slice(2)); }
  else { selectGroup(GROUPS[0] && GROUPS[0].key, false); }
  applySearch();
  window.addEventListener("hashchange", () => {
    const h2 = location.hash.slice(1);
    if (h2.startsWith("law_") && GROUPS.some(g => g.laws.some(y => y.key === h2.slice(4)))) selectLaw(h2.slice(4));
    else if (h2.startsWith("g_") && GROUPS.some(g => g.key === h2.slice(2))) selectGroup(h2.slice(2));
  });
  function LAW_IN(k) { return GROUPS.some(g => g.laws.some(y => y.key === k)); }
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html);

// 产物自检①：英文键直出为零——修正案事件名必须全部命中翻译表（维基更新出新标题时在此报错提醒补 EV_ZH）
{
  const enEvents = amendmentList.filter(a => a.event && a.event.name && /^[A-Z]/.test(a.event.name) && /[a-z]/.test(a.event.name));
  if (enEvents.length) throw new Error("修正案事件名未翻译 " + enEvents.length + " 条：" + enEvents.slice(0, 3).map(a => a.event.name).join(" / "));
  const CAT_ALL = new Set();
  for (const g of GROUP_DATA) for (const l of g.laws) for (const m of l.mods) CAT_ALL.add(m.cat);
  const CAT_ZH_KEYS = ["country", "state", "building", "port", "agriculture", "resource", "mapi", "infrastructure_market", "disease_colony"];
  const missCat = [...CAT_ALL].filter(c => c && !CAT_ZH_KEYS.includes(c)); // 空 category＝无前缀（合法）
  if (missCat.length) throw new Error("效果分类前缀未映射中文：" + missCat.join(","));
  const aliasTags = ["CHI"];
  for (const t of aliasTags) if (!countries.some(c => c.key === t)) throw new Error("国家别名目标不存在: " + t);
}
// 产物自检：内联脚本必须通过 JS 编译（模板字面量会折叠正则反斜杠，曾产出非法正则致整脚本不执行）
{
  const vm = await import("node:vm");
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (e) { throw new Error("内联脚本编译失败: " + e.message); }
  }
}
console.log(`laws.html（法律指南独立页）生成完毕: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB | 法律 ${LAW_BY_KEY.size} · 修正案 ${amendmentList.length} · 法律组 ${GROUP_DATA.length}`);
