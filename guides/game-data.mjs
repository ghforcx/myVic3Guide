// 游戏文件直读共享层 —— 全站唯一真相源是本地游戏目录（AGENTS.md 真相层级）。
// versions/ 镜像停用后，各生成器从这里取「文件解析 + 本地化查询」公共设施。
// 单位/键形实证记录见 .agents/skills/data-sources。
import fs from "node:fs";
import path from "node:path";

// 站点数据对应的游戏版本（人工维护：游戏更新后改此处 + 重跑全部生成器）
export const GAME_VERSION = "1.15.1";

export const GAME = "C:/Program Files (x86)/Steam/steamapps/common/Victoria 3/game";
export const read = (p) => fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");

// ---------- Paradox 脚本块解析 ----------
export function balancedBlock(str, s) {
  if (str[s] !== "{") return null;
  let d = 0;
  for (let i = s; i < str.length; i++) {
    if (str[i] === "{") d++;
    else if (str[i] === "}") { d--; if (d === 0) return str.slice(s, i + 1); }
  }
  return null;
}
export function topBlocks(txt) {
  const out = [];
  const re = /(?:^|\n)([a-z0-9_]+)\s*=\s*\{/g;
  let m, cur = 0;
  while ((m = re.exec(txt))) {
    if (m.index < cur) continue;
    const open = txt.indexOf("{", m.index);
    const b = balancedBlock(txt, open);
    if (!b) continue;
    out.push([m[1], b]);
    cur = m.index + (open - m.index) + b.length;
  }
  return out;
}
/** 块内提取 `name = { ... }` 配平子块（不含外层括号）；first=true 只取第一个 */
export function innerBlocks(block, key, first = false) {
  const out = [];
  const re = new RegExp("\\b" + key + "\\s*=\\s*\\{", "g");
  let m;
  while ((m = re.exec(block))) {
    const body = balancedBlock(block, m.index + m[0].length - 1);
    if (body) { out.push(body.slice(1, -1)); re.lastIndex = m.index + m[0].length + body.length; }
    if (first && out.length) break;
  }
  return out;
}
export function subBlock(block, name) {
  if (!block) return "";
  const i = block.search(new RegExp("\\b" + name + "\\s*=\\s*\\{"));
  if (i < 0) return "";
  return balancedBlock(block, block.indexOf("{", i)) || "";
}
export function scopedNums(block, re) {
  const o = {};
  if (!block) return o;
  for (const m of block.matchAll(re)) o[m[1]] = (o[m[1]] || 0) + +m[2];
  return o;
}

// ---------- 本地化 ----------
/** 读 localization/<lang>[/<subdir>] 下（递归）全部 yml → Map（裸键；先到先得） */
export function loadGameLoc(lang = "simp_chinese", subdir = "") {
  const map = new Map();
  const dir = path.join(GAME, "localization", lang, subdir);
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (!f.name.endsWith(".yml")) continue;
      for (const line of read(p).split("\n")) {
        const m = line.match(/^\s*([\w:.]+):\s*\d*\s*"([^"]*)"/);
        if (m && m[2] && !map.has(m[1])) map.set(m[1], m[2]);
      }
    }
  };
  walk(dir);
  return map;
}
/** $key$ 引用解引用（最多 3 层；@icon! 前缀剥离）；解不完仍含 $ 的返回 ""（视为运行时模板） */
export function derefLoc(loc, key) {
  let cur = loc.get(key) || "";
  for (let i = 0; i < 3 && cur; i++) {
    const m = cur.replace(/^@\w+!/, "").replace(/\[Nbsp\]/g, "").match(/^\$([\w:.]+)\$$/); // 1.15 起 loc 值带 [Nbsp] 占位标记
    if (!m) break;
    cur = loc.get(m[1]) || "";
  }
  return cur && !cur.includes("$") ? cur : "";
}

// ---------- 意识形态（common/ideologies：立法立场矩阵；laws 与 ideologies 两页共用） ----------
export function loadIdeologies() {
  const out = [];
  const dir = path.join(GAME, "common/ideologies");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      if (!key.startsWith("ideology_")) continue;
      const lawStances = [];
      { // lawgroup_* 子块带 tab 缩进，需允许行首空白
        const gre = /(?:^|\n)\s*(lawgroup_\w+)\s*=\s*\{/g;
        let gm;
        while ((gm = gre.exec(b))) {
          const open = b.indexOf("{", gm.index);
          let d = 0, end = open;
          for (let i = open; i < b.length; i++) {
            if (b[i] === "{") d++;
            else if (b[i] === "}") { d--; if (d === 0) { end = i; break; } }
          }
          const gbody = b.slice(open, end + 1);
          for (const m of gbody.matchAll(/^\s*(law_\w+)\s*=\s*(strongly_approve|approve|neutral|disapprove|strongly_disapprove)\s*$/gm)) {
            lawStances.push({ law_group_key: gm[1], law_key: m[1], stance: m[2] });
          }
          gre.lastIndex = end;
        }
      }
      const lw = subBlock(b, "interest_group_leader_weight");
      out.push({
        key,
        icon: (b.match(/icon\s*=\s*"([^"]+)"/) || [])[1] || "",
        character_ideology: /character_ideology\s*=\s*yes/.test(b),
        law_stances: lawStances,
        igwMentions: lw ? [...new Set([...lw.matchAll(/\b(ig_\w+)\b/g)].map((m) => m[1]))] : [],
      });
    }
  }
  return out;
}

// ---------- modifier 中文化（modifiers loc + concepts 引用解引用，惰性全目录） ----------
let _MOD_LOC = null;
/** modifier 键 → 官方中文名（[Concept('$x$')]/$x$/[x] 全解引用；查不到返回 ""） */
export function modZh(key) {
  if (!_MOD_LOC) _MOD_LOC = loadGameLoc("simp_chinese");
  const v = _MOD_LOC.get(key) || "";
  if (!v) return modZhTemplate(key);
  let out = v.replace(/^@\w+!/g, "");
  for (let i = 0; i < 5 && (out.includes("$") || out.includes("[")); i++) {
    const before = out;
    out = out.replace(/\[Concept\('[\w.]+',\s*'\$?([\w.]+?)(?:\|[\w]*)?\$?'\)\]/g, (m, k) => _MOD_LOC.get(k) || m);
    out = out.replace(/\[([\w.]+)\]/g, (m, k) => _MOD_LOC.get(k) || m);
    out = out.replace(/\$([\w.]+)\$/g, (m, k) => _MOD_LOC.get(k) || m);
    if (out === before) break;
  }
  return out.includes("$") || out.includes("[") ? modZhTemplate(key) : out;
}

/** 官方无 loc 的参数化 modifier 键 → 官方成分组合（per-IG 键是逐集团定义但官方只译通用键） */
function modZhTemplate(key) {
  if (!_MOD_LOC) _MOD_LOC = loadGameLoc("simp_chinese");
  let m = key.match(/^interest_group_ig_(\w+?)(?:_pol_str_(?:mult|add)|_approval_add)$/);
  if (m) {
    const ig = _MOD_LOC.get("ig_" + m[1]) || m[1];
    const suffix = key.endsWith("_pol_str_mult") || key.endsWith("_pol_str_add")
      ? modZh("interest_group_pol_str_mult") || "利益集团政治力量"
      : modZh("interest_group_approval_add") || "利益集团支持度";
    return ig + suffix;
  }
  return "";
}

// ---------- 州与区域（map_data + common/strategic_regions） ----------
/**
 * 州资源全集。每州：
 *   arable（可开垦总级数）、arableRes[]（可建农业类型 stem）、
 *   capped[]（有限资源 {stem,n} 上限级数）、disc[]（未探明资源 {stem,n}，`resource` 单数块）
 *   srs[]（所属战略区域键，可能多个）
 */
export function loadStateRegions() {
  const dir = path.join(GAME, "map_data/state_regions");
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    const txt = read(path.join(dir, f));
    const re = /^(STATE_[A-Z0-9_]+)\s*=\s*\{/gm; // STATE 键全大写，共享 topBlocks 只认小写
    let m, cur = 0;
    while ((m = re.exec(txt))) {
      if (m.index < cur) continue;
      const open = txt.indexOf("{", m.index);
      const b = balancedBlock(txt, open);
      if (!b) continue;
      cur = m.index + (open - m.index) + b.length;
      const key = m[1];
      const arable = +((b.match(/arable_land\s*=\s*(\d+)/) || [])[1] || 0);
      const arBlock = (b.match(/arable_resources\s*=\s*\{([^}]*)\}/) || [])[1] || "";
      const arableRes = [...arBlock.matchAll(/(building_[a-z0-9_]+)/g)].map((m2) => m2[1].replace(/^building_/, ""));
      const capBlock = subBlock(b, "capped_resources");
      const capped = capBlock ? Object.entries(scopedNums(capBlock, /(building_[a-z0-9_]+)\s*=\s*(-?[\d.]+)/g)).map(([k, n]) => ({ stem: k.replace(/^building_/, ""), n })) : [];
      const disc = [];
      for (const r of innerBlocks(b, "resource")) {
        const t = (r.match(/type\s*=\s*"?(building_[a-z0-9_]+)"?/) || [])[1];
        const n = +((r.match(/undiscovered_amount\s*=\s*(\d+)/) || [])[1] || 0);
        if (t) disc.push({ stem: t.replace(/^building_/, ""), n });
      }
      out.push({ key, arable, arableRes, capped, disc, srs: [] });
    }
  }
  // 战略区域归属（common/strategic_regions：region_X 的 states 列表 → 州反查）
  const srDir = path.join(GAME, "common/strategic_regions");
  const byState = new Map();
  for (const f of fs.readdirSync(srDir).filter((x) => x.endsWith(".txt"))) {
    for (const [rk, b] of topBlocks(read(path.join(srDir, f)))) {
      if (!/^region_/.test(rk)) continue;
      const stBlock = (b.match(/states\s*=\s*\{([^}]*)\}/) || [])[1] || "";
      for (const m of stBlock.matchAll(/(STATE_[A-Z0-9_]+)/g)) {
        const list = byState.get(m[1]) || [];
        list.push(rk);
        byState.set(m[1], list);
      }
    }
  }
  for (const s of out) s.srs = byState.get(s.key) || [];
  return out;
}
/** 战略区域中文名（map/strategic_regions loc，裸键） */
export function loadStrategicRegionZh() {
  return loadGameLoc("simp_chinese", "map");
}

// ---------- 法律 / 法组 / 国家（laws 与 index 两页共用；对象形态兼容旧镜像字段名） ----------
export function loadLawGroups() {
  const lgs = [];
  const dir = path.join(GAME, "common/law_groups");
  let order = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      if (!key.startsWith("lawgroup_")) continue;
      lgs.push({
        key,
        category: (b.match(/law_group_category\s*=\s*(\w+)/) || [])[1] || "",
        base_enactment_days: +((b.match(/base_enactment_days\s*=\s*(\d+)/) || [])[1] || 200),
        sort_order: order++,
      });
    }
  }
  return lgs;
}
/** modifier 键 → 效果分类前缀（按键名前缀推断，等价旧镜像 category） */
export function catOfModKey(k) {
  if (k.startsWith("state_")) return "state";
  if (k.startsWith("building_")) return "building";
  if (k.startsWith("port_")) return "port";
  if (k.startsWith("agriculture_")) return "agriculture";
  if (k.startsWith("mapi") || k.includes("_mapi_")) return "mapi";
  if (k.startsWith("infrastructure_market")) return "infrastructure_market";
  if (k.startsWith("country_")) return "country";
  if (k.startsWith("disease_")) return "disease_colony";
  if (k.startsWith("resource_")) return "resource";
  return "";
}
export function loadLaws() {
  const laws = [];
  const dir = path.join(GAME, "common/laws");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      if (!key.startsWith("law_")) continue;
      const inst = (b.match(/institution\s*=\s*institution:([\w]+)/) || [])[1];
      const mods = [];
      for (const m of subBlock(b, "modifier").matchAll(/^\s*([a-z][a-z0-9_]+)\s*=\s*(-?[\d.]+)/gm)) {
        mods.push({ key: m[1], value_raw: m[2], category: { key: catOfModKey(m[1]) } });
      }
      laws.push({
        key,
        group_key: (b.match(/\bgroup\s*=\s*(lawgroup_\w+)/) || [])[1] || "",
        icon: (b.match(/icon\s*=\s*"([^"]+)"/) || [])[1] || "",
        progressiveness: +((b.match(/progressiveness\s*=\s*(-?\d+)/) || [])[1] || 0),
        disallowing_laws: [...subBlock(b, "disallowing_laws").matchAll(/\b(law_\w+)\b/g)].map((m) => m[1]),
        unlocking_technologies: [...subBlock(b, "unlocking_technologies").matchAll(/^\s*([\w]+)\s*$/gm)].map((m) => ({ key: m[1] })),
        institution: inst ? { key: inst, loc: { name: "institution:" + inst + ".name" } } : null,
        modifiers: mods,
        can_enact: { raw: subBlock(b, "can_enact") },
        is_visible_raw: subBlock(b, "is_visible"),
        loc: { name: key, description: key + "_desc" },
        amendments: [],
      });
    }
  }
  // 修正案（common/amendments：allowed_laws 反向挂载）
  const amDir = path.join(GAME, "common/amendments");
  for (const f of fs.readdirSync(amDir).filter((x) => x.endsWith(".txt"))) {
    for (const [key, b] of topBlocks(read(path.join(amDir, f)))) {
      if (!key.startsWith("amendment_")) continue;
      const allowed = [...subBlock(b, "allowed_laws").matchAll(/\b(law_\w+)\b/g)].map((m) => m[1]);
      const parent = (b.match(/parent\s*=\s*(law_\w+)/) || [])[1] || "";
      const amMods = [];
      for (const mbName of ["modifier", "sponsor_modifier"]) {
        for (const m of subBlock(b, mbName).matchAll(/^\s*([a-z][a-z0-9_]+)\s*=\s*(-?[\d.]+)/gm)) {
          amMods.push({ key: m[1], value_raw: m[2], category: { key: catOfModKey(m[1]) } });
        }
      }
      const am = {
        key, parent_law: parent, allowed_laws: allowed, modifiers: amMods,
        possible: { raw: subBlock(b, "possible") },
        loc: { name: key, description: key + "_desc" },
      };
      for (const lk of (allowed.length ? allowed : [parent])) {
        const law = laws.find((x) => x.key === lk);
        if (law) law.amendments.push(am);
      }
    }
  }
  return laws;
}
export function loadCountries() {
  const dir = path.join(GAME, "common/history/countries");
  const startingLaws = loadCountryStartingLaws();
  const zh = loadGameLoc("simp_chinese");
  const list = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    const tag = ((f.match(/^([a-z]{3})/i) || [])[1] || "").toUpperCase(); // 文件名形如 "chi - china.txt"/"agc -angoche.txt"，统一取前三字母 TAG
    list.push({ key: tag, existsAtStart: true, startingLaws: startingLaws.get(tag) || [], name: zh.get(tag) || tag, loc: { name: tag } });
  }
  return list;
}


// ---------- 国家开局国教（近似推导：history/pops 的 create_pop 宗教加权，pop 未声明宗教时取文化默认） ----------
export function loadCountryReligions() {
  // 文化默认宗教（common/cultures）
  const culRel = new Map();
  {
    const dir = path.join(GAME, "common/cultures");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
      const txt = read(path.join(dir, f));
      for (const m of txt.matchAll(/(?:^|\n)([a-z][a-z0-9_]*)\s*=\s*\{/g)) {
        const b = balancedBlock(txt, txt.indexOf("{", m.index));
        const r = (b.match(/religion\s*=\s*(\w+)/) || [])[1];
        if (r) culRel.set(m[1], r);
      }
    }
  }
  const relByTag = new Map(); // TAG -> { religion: pop数 }
  const dir = path.join(GAME, "common/history/pops");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    const txt = read(path.join(dir, f));
    for (const m of txt.matchAll(/region_state:([A-Z]{3})[\s\S]{0,3000}?(?=region_state:|$)/g)) {
      const tag = m[1];
      for (const p of m[0].matchAll(/create_pop = \{([^}]*)\}/g)) {
        const body = p[1];
        const c = (body.match(/culture = (\w+)/) || [])[1];
        const r0 = (body.match(/religion = (\w+)/) || [])[1];
        const r = r0 || (c && culRel.get(c));
        const s = +((body.match(/size = (\d+)/) || [])[1] || 0);
        if (r) {
          const o = relByTag.get(tag) || {};
          o[r] = (o[r] || 0) + s;
          relByTag.set(tag, o);
        }
      }
    }
  }
  const out = new Map(); // TAG -> 开局国教（人口最多宗教）
  for (const [tag, o] of relByTag) {
    const top = Object.entries(o).sort((a, b) => b[1] - a[1])[0];
    if (top) out.set(tag, top[0]);
  }
  return out;
}

// ---------- 成就开局国限定（common/history/global/00_global.txt 的 setter） ----------
// 形态：every_country = { limit = { c:XXX ?= THIS ... } set_variable = <ach>_ach_possible }
// 只有 limit 含「c:X ?= THIS」（该国即 X）才是「以 X 开局」限定；exists = c:X 等存在性条件不算。
export function loadAchievementPossibleNations() {
  const map = new Map(); // achKey → { countries: [...] }（空 countries = setter 存在但无国家锁）
  const txt = read(path.join(GAME, "common/history/global/00_global.txt"));
  const re = /every_country\s*=\s*\{/g;
  let m;
  while ((m = re.exec(txt))) {
    const block = balancedBlock(txt, txt.indexOf("{", m.index));
    if (!block) continue;
    const vm = block.match(/set_variable\s*=\s*([\w]+)_ach_possible/);
    if (!vm) { re.lastIndex = txt.indexOf("{", m.index) + block.length; continue; }
    const lim = subBlock(block, "limit") || "";
    const tags = [...new Set([...lim.matchAll(/c:([A-Z]{3})\s*\?=\s*[Tt][Hh][Ii][Ss]/g)].map((x) => x[1]))];
    map.set(vm[1], { countries: tags });
    re.lastIndex = txt.indexOf("{", m.index) + block.length;
  }
  return map;
}

// ---------- 国家主流文化（common/country_definitions：TAG -> cultures[]，首项为主流） ----------
export function loadCountryCultures() {
  const map = new Map(); // TAG -> [culture keys]
  const dir = path.join(GAME, "common/country_definitions");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    const txt = read(path.join(dir, f));
    const re = /^([A-Z]{3})\s*=\s*\{/gm; // TAG 键全大写，共享 topBlocks 只认小写
    let m, cur = 0;
    while ((m = re.exec(txt))) {
      if (m.index < cur) continue;
      const open = txt.indexOf("{", m.index);
      const b = balancedBlock(txt, open);
      if (!b) continue;
      cur = m.index + (open - m.index) + b.length;
      const cul = (b.match(/cultures\s*=\s*\{([^}]*)\}/) || [])[1] || "";
      const list = [...cul.matchAll(/([a-z][a-z0-9_]*)/g)].map((x) => x[1]);
      if (list.length) map.set(m[1], list);
    }
  }
  return map;
}

// ---------- 科技（technologies：era/category/前置；era_cost 查 eras 成本表；解锁 PM 由 PM 反查） ----------
export function loadTechnologies() {
  const t = [];
  const dir = path.join(GAME, "common/technology/technologies");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    const cat = f.startsWith("10_") ? "production" : f.startsWith("20_") ? "military" : "society";
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      t.push({
        key,
        era: (b.match(/\bera\s*=\s*(era_\d)/) || [])[1] || "",
        category: (b.match(/category\s*=\s*(\w+)/) || [])[1] || cat,
        prerequisites: [...subBlock(b, "unlocking_technologies").matchAll(/^\s*([\w]+)\s*$/gm)].map((m) => ({ key: m[1] })),
        modifiers: [],
        loc: { name: key, description: key + "_desc" },
        source_file: f,
      });
    }
  }
  // 时代成本（common/technology/eras）
  const erasTxt = read(path.join(GAME, "common/technology/eras/00_eras.txt"));
  const eraCost = {};
  for (const m of erasTxt.matchAll(/(era_\d)\s*=\s*\{[^}]*?technology_cost\s*=\s*(\d+)/gs)) eraCost[m[1]] = +m[2];
  for (const x of t) x.era_cost = eraCost[x.era] || 0;
  // 解锁 PM（PM 的 unlocking_technologies 反查 → t.references.production_methods）
  const pmDir = path.join(GAME, "common/production_methods");
  const pmRefs = new Map(); // techKey → [pmKey]
  for (const f of fs.readdirSync(pmDir).filter((x) => x.endsWith(".txt"))) {
    for (const [pk, pb] of topBlocks(read(path.join(pmDir, f)))) {
      for (const m of subBlock(pb, "unlocking_technologies").matchAll(/^\s*([\w]+)\s*$/gm)) {
        const list = pmRefs.get(m[1]) || [];
        list.push(pk);
        pmRefs.set(m[1], list);
      }
    }
  }
  for (const x of t) x.references = { production_methods: (pmRefs.get(x.key) || []).map((k) => ({ key: k })) };
  return t;
}

// ---------- 成就（common/achievements：裸键；group 按文件名） ----------
export function loadAchievements() {
  const out = [];
  const dir = path.join(GAME, "common/achievements");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    const groupKey = f.replace(/_achievements\.txt$/, "");
    let order = 0;
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      const script = {
        possible: subBlock(b, "possible"),
        happened: subBlock(b, "happened"),
      };
      // 相关国家：只认「以 X 开局」语义（c:X ?= this）；c:X ?= { 比较 } 是竞争对手/比较对象，不算可完成国
      const tags = [...new Set([...(script.possible + script.happened).matchAll(/c:([A-Z]{3})\s*\?=\s*(this|THIS)/g)].map((m) => m[1]))];
      out.push({
        key,
        group_key: groupKey,
        group_order: order++,
        script,
        related_countries: tags.map((t2) => ({ key: t2 })),
        loc: { name: "ACHIEVEMENT_" + key, description: "ACHIEVEMENT_DESC_" + key },
        source_file: f,
      });
    }
  }
  return out;
}

// ---------- 商品 / 名贵商品 / 文化 ----------
export function loadGoods() {
  const out = [];
  for (const [k, b] of topBlocks(read(path.join(GAME, "common/goods/00_goods.txt"))) || []) {
    out.push({ key: k, cost: +((b.match(/cost\s*=\s*([\d.]+)/) || [])[1] || 0), category: (b.match(/category\s*=\s*(\w+)/) || [])[1] || "" });
  }
  return out;
}
export function loadPrestigeGoods() {
  const out = [];
  const dir = path.join(GAME, "common/prestige_goods");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [k, b] of topBlocks(read(path.join(dir, f)))) {
      out.push({ key: k, base_good_key: (b.match(/base_good\s*=\s*(\w+)/) || [])[1] || "" });
    }
  }
  return out;
}
export function loadCultures() {
  const out = [];
  const dir = path.join(GAME, "common/cultures");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [k] of topBlocks(read(path.join(dir, f)))) out.push({ key: k, loc: { name: k } });
  }
  return out;
}

// ---------- 公司（common/company_types：脚本引用从 potential/possible 提取） ----------
export function loadCompanies() {
  const out = [];
  const dir = path.join(GAME, "common/company_types");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      if (!key.startsWith("company_")) continue;
      const potential = subBlock(b, "potential");
      const possible = subBlock(b, "possible");
      const allRaw = potential + "\n" + possible;
      const pickList = (re) => [...new Set([...allRaw.matchAll(re)].map((m) => m[1]))];
      out.push({
        key,
        icon: (b.match(/icon\s*=\s*"([^"]+)"/) || [])[1] || "",
        building_types: [...subBlock(b, "building_types").matchAll(/\b(building_\w+)\b/g)].map((m) => ({ key: m[1] })),
        extension_building_types: [...subBlock(b, "extension_building_types").matchAll(/\b(building_\w+)\b/g)].map((m) => ({ key: m[1] })),
        possible_prestige_goods: [...subBlock(b, "possible_prestige_goods").matchAll(/\b(prestige_good_\w+)\b/g)].map((m) => ({ key: m[1] })),
        prosperity_modifiers: [...subBlock(b, "prosperity_modifiers").matchAll(/^\s*([a-z][a-z0-9_]+)\s*=\s*(-?[\d.]+)/gm)].map((m) => ({ key: m[1], value_raw: m[2] })),
        potential_raw: potential,
        possible_raw: possible,
        referenced_state_regions: pickList(/\b(STATE_[A-Z0-9_]+)\b/g).map((k) => ({ key: k })),
        referenced_countries: pickList(/\bc:([A-Z]{3})\b/g).map((k) => ({ key: k })),
        referenced_cultures: pickList(/\bcu:([\w]+)\b/g).map((k) => ({ key: k })),
        referenced_strategic_regions: pickList(/\bsr:(region_\w+)\b/g).map((k) => ({ key: k })),
        referenced_geographic_regions: pickList(/\b(gr_\w+)\b/g).map((k) => ({ key: k })),
        required_technologies: [...subBlock(b, "unlocking_technologies").matchAll(/^\s*([\w]+)\s*$/gm)].map((k) => ({ key: k[1] })),
        loc: { name: key, description: key + "_desc" },
      });
    }
  }
  return out;
}

// ---------- 建筑 / PM / PM 组（index 建筑区与计算器同源数据，含效果摘要所需形态） ----------
export function loadBuildings() {
  const out = [];
  const dir = path.join(GAME, "common/buildings");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      if (!key.startsWith("building_")) continue;
      out.push({
        key,
        production_method_group_keys: [...((b.match(/production_method_groups\s*=\s*\{([^}]*)\}/) || [])[1] || "").matchAll(/(pmg_[a-z0-9_]+)/g)].map((m) => m[1]),
        board_group: (b.match(/building_group\s*=\s*(bg_\w+)/) || [])[1] || "",
        loc: { name: key },
        source_file: f,
      });
    }
  }
  return out;
}
export function loadPMGroups() {
  const out = [];
  const dir = path.join(GAME, "common/production_method_groups");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      const inner = (b.match(/production_methods\s*=\s*\{([^}]*)\}/) || [])[1] || "";
      out.push({ key, production_method_keys: [...inner.matchAll(/\b([a-z][a-z0-9_]{3,})\b/g)].map((m) => m[1]).filter((k) => k !== "production_methods"), loc: { name: key } });
    }
  }
  return out;
}
export function loadPMs() {
  const out = [];
  const dir = path.join(GAME, "common/production_methods");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      const effects = [];
      const bm = subBlock(b, "building_modifiers");
      for (const scope of ["workforce_scaled", "level_scaled"]) {
        for (const m of subBlock(bm, scope).matchAll(/^\s*([a-z][a-z0-9_]+)\s*=\s*(-?[\d.]+)\s*$/gm)) {
          effects.push({ key: m[1], value: +m[2], scaling: scope === "workforce_scaled" ? "workforce" : "level" });
        }
      }
      out.push({
        key,
        vc_change_kind: /vc_change_kind/.test(b) ? "yes" : null,
        unlocking_technologies: [...subBlock(b, "unlocking_technologies").matchAll(/^\s*([\w]+)\s*$/gm)].map((m) => ({ key: m[1] })),
        effects,
        loc: { name: key },
      });
    }
  }
  return out;
}

/** 各国开局法律集合（history/countries/*.txt 的 law 赋予行；1.15 起为 activate_law = law_type:law_X，旧版 set_law = law:X） */
export function loadCountryStartingLaws() {
  const dir = path.join(GAME, "common/history/countries");
  const map = new Map(); // TAG → [law keys]
  try {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
      const tag = ((f.match(/^([a-z]{3})/i) || [])[1] || "").toUpperCase(); // 文件名形如 "chi - china.txt"/"agc -angoche.txt"，统一取前三字母 TAG
      const txt = read(path.join(dir, f));
      const laws = [...txt.matchAll(/(?:set|add|activate)_law(?:_type)?\s*=\s*(?:law:|law_type:)?(law_)?([\w]+)/g)]
        .filter((m) => m[2] !== "type")
        .map((m) => (m[1] ? m[1] + m[2] : "law_" + m[2]));
      if (laws.length) map.set(tag, laws);
    }
  } catch { /* 目录不存在时返回空表 */ }
  return map;
}
