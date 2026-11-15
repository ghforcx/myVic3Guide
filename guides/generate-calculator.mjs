// Vicdata 计算器页生成器（第一阶段：建筑产值计算器）
// 功能：每建筑 × 各 PM 组可切换生产方式，实时计算雇工构成/产出/投入/每级净产值/每工净产值（原价口径）
// 数据：全部直读游戏文件（goods 原价 + production_methods + production_method_groups + buildings + 本地化中文名）
// 单位：每工每周产出 = value × price / 250（官方注释实证，见 .agents/skills/data-sources）
// 产物：calculator.html（注册 TAB_DEFS key="calculator"）
import fs from "node:fs";
import path from "node:path";
import { pageShell, SHELL_CSS } from "./shell.mjs";

const GAME = "C:/Program Files (x86)/Steam/steamapps/common/Victoria 3/game";
const ROOT = path.resolve(import.meta.dirname, "..");
const K = 250;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function balancedBlock(str, s) {
  if (str[s] !== "{") return null;
  let d = 0;
  for (let i = s; i < str.length; i++) {
    if (str[i] === "{") d++;
    else if (str[i] === "}") { d--; if (d === 0) return str.slice(s, i + 1); }
  }
  return null;
}
function topBlocks(txt) {
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
const read = (p) => fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");

// ---------- 游戏本地化（中文名查表） ----------
// 注意：不少条目的值是 $key$ 模板引用（职业 "laborers"→"@laborers!$laborers_no_icon$"、组名
// "pmg_base_building_glassworks"→"$pm_base$"），须解一层引用才是玩家可见文本
function locMap(files) {
  const map = new Map();
  for (const f of files) {
    const p = path.join(GAME, "localization/simp_chinese", f);
    if (!fs.existsSync(p)) continue;
    for (const line of read(p).split("\n")) {
      const m = line.match(/^\s*([\w:.]+):\s*\d*\s*"([^"]*)"/);
      if (m && m[2] && !map.has(m[1])) map.set(m[1], m[2]);
    }
  }
  for (const [k, v] of map) {
    let cur = v;
    for (let i = 0; i < 3; i++) { // 纯引用链最多解三层，防循环
      const ref = cur.replace(/^@\w+!/, "").replace(/\[Nbsp\]/g, "").match(/^\$([\w:.]+)\$$/); // 1.15 起 loc 值带 [Nbsp] 占位标记
      if (!ref) break;
      const next = map.get(ref[1]);
      if (!next) break;
      cur = next;
    }
    map.set(k, cur);
  }
  return map;
}
const LOC = locMap([
  "buildings_l_simp_chinese.yml",
  "goods_l_simp_chinese.yml",
  "production_methods_l_simp_chinese.yml",
  "inventions_l_simp_chinese.yml", // 科技名；个别商品名（telephones→电话机）也只在此文件
  "pop_types_l_simp_chinese.yml",  // 职业名（值是 $xxx_no_icon$ 引用）
]);
const zh = (key) => {
  const v = LOC.get(key);
  return v && !v.includes("$") ? v : ""; // 解引用后仍含 $ 的是运行时参数模板，视为无本地化
};

// ---------- 商品原价 ----------
const PRICE = {}, GOODS_ZH = {}, GOODS_NOLOC = [];
for (const [k, b] of topBlocks(read(path.join(GAME, "common/goods/00_goods.txt")))) {
  const c = (b.match(/cost\s*=\s*([\d.]+)/) || [])[1];
  if (c) {
    PRICE[k] = +c;
    const z = zh(k) || zh(`goods:${k}.name`);
    if (z) GOODS_ZH[k] = z; else { GOODS_ZH[k] = k; GOODS_NOLOC.push(k); } // 缺失键留给自检断言
  }
}

// ---------- 生产方式 ----------
// 作用域语义（游戏文件实证，见 .agents/skills/data-sources）：
//   workforce_scaled：每 250 名建筑雇工的商品流（正负皆可，如硬木组 -25 木材 +10 硬木）
//   level_scaled：每级绝对量——雇工调整（可为负，自动化组每级 -2500 劳工等）与每级商品流
//   building_modifiers 之外的 state_modifiers 等是州级修饰，与产值无关，必须切块隔离
//   吞吐 throughput_add：产出与投入商品流整体放大，雇工不变
// 曾因数值正则 [\d.]+ 不认负号，把全部自动化/运输/硬木类 PM 当成空数据丢弃（整组从页面消失）
function scopedNums(block, re) {
  const o = {};
  if (!block) return o;
  for (const m of block.matchAll(re)) o[m[1]] = (o[m[1]] || 0) + +m[2];
  return o;
}
function subBlock(block, name) { // 提取块内 name = { … } 子块（平衡花括号）
  if (!block) return "";
  const i = block.search(new RegExp(`\\b${name}\\s*=\\s*\\{`));
  if (i < 0) return "";
  return balancedBlock(block, block.indexOf("{", i)) || "";
}
const PMS = new Map();
for (const f of fs.readdirSync(path.join(GAME, "common/production_methods")).filter((x) => x.endsWith(".txt"))) {
  for (const [k, b] of topBlocks(read(path.join(GAME, "common/production_methods", f)))) {
    const zhv = zh(k); // 无本地化时置空并打标，供自检断言
    const bm = subBlock(b, "building_modifiers");
    const wf = subBlock(bm, "workforce_scaled");
    const lv = subBlock(bm, "level_scaled");
    const wfOut = scopedNums(wf, /goods_output_(\w+)_add\s*=\s*(-?[\d.]+)/g);
    const wfInn = scopedNums(wf, /goods_input_(\w+)_add\s*=\s*(-?[\d.]+)/g);
    const lvEmp = scopedNums(lv, /building_employment_(\w+)_add\s*=\s*(-?[\d.]+)/g);
    const lvOut = scopedNums(lv, /goods_output_(\w+)_add\s*=\s*(-?[\d.]+)/g);
    const lvInn = scopedNums(lv, /goods_input_(\w+)_add\s*=\s*(-?[\d.]+)/g);
    const thp = bm ? +((bm.match(/\bthroughput_add\s*=\s*(-?[\d.]+)/) || [])[1] || 0) : 0;
    const hasEffect = [wfOut, wfInn, lvEmp, lvOut, lvInn].some((o) => Object.keys(o).length) || thp !== 0;
    const ut = subBlock(b, "unlocking_technologies").replace(/[{}]/g, "").trim();
    const techs = ut ? ut.split(/\s+/) : []; // PM 解锁科技（如 pm_rayon「尼龙」需 art_silk「人造丝绸」）
    const dl = subBlock(b, "disallowing_laws").replace(/[{}]/g, "").trim();
    const disLaws = dl ? dl.split(/\s+/) : []; // 法律前提（如种植园「暴力对待」在废奴类法律下不可用）
    PMS.set(k, { key: k, zh: zhv, zhFallback: !zhv, wfOut, wfInn, lvEmp, lvOut, lvInn, thp, hasEffect, techs, disLaws });
  }
}

// ---------- PM 组定义（pmg → [pm keys]；通用名组不带建筑后缀，归属由建筑定义声明） ----------
const PMG = new Map();
for (const f of fs.readdirSync(path.join(GAME, "common/production_method_groups")).filter((x) => x.endsWith(".txt"))) {
  for (const [k, b] of topBlocks(read(path.join(GAME, "common/production_method_groups", f)))) {
    // 从 production_methods 子块内提取（键形有两种前缀：pm_xxx 与种植园类的 default_xxx——曾只认 pm_ 前缀导致全部种植园整栋丢失）
    const inner = (b.match(/production_methods\s*=\s*\{([^}]*)\}/) || [])[1];
    const pms = inner ? [...new Set([...inner.matchAll(/\b([a-z][a-z0-9_]+)\b/g)].map((m) => m[1]))].filter((x) => x !== "production_methods") : [];
    if (pms.length && !PMG.has(k)) PMG.set(k, pms);
  }
}

// ---------- 科技表（名称 + 类别 + 时代；文件名即类别：生产/军事/社会） ----------
const TECH = new Map(); // techKey → { zh, cat, era }
for (const f of ["10_production.txt", "20_military.txt", "30_society.txt"]) {
  for (const [k, b] of topBlocks(read(path.join(GAME, "common/technology/technologies", f)))) {
    const era = +((b.match(/era\s*=\s*era_(\d)/) || [])[1] || 0);
    TECH.set(k, { zh: zh(k) || k, cat: f.startsWith("10_") ? "生产" : f.startsWith("20_") ? "军事" : "社会", era });
  }
}

// ---------- 建筑定义：声明式 pmg 列表 + 类型 + 解锁科技（权威映射） ----------
const GROUPS = new Map(); // stem → { g: Map(groupKey → [pm keys]), bg, techs }
for (const f of fs.readdirSync(path.join(GAME, "common/buildings")).filter((x) => x.endsWith(".txt"))) {
  for (const [k, b] of topBlocks(read(path.join(GAME, "common/buildings", f)))) {
    const pmgBlock = (b.match(/production_method_groups\s*=\s*\{([^}]*)\}/) || [])[1];
    if (!pmgBlock) continue;
    const stem = k.replace(/^building_/, "");
    const g = new Map();
    for (const m of pmgBlock.matchAll(/(pmg_[a-z0-9_]+)/g)) {
      const pms = PMG.get(m[1]);
      if (pms) g.set(m[1], pms);
    }
    if (!g.size) continue;
    const bg = (b.match(/building_group\s*=\s*(bg_[a-z0-9_]+)/) || [])[1] || "";
    const ub = (b.match(/unlocking_technologies\s*=\s*\{([^}]*)\}/) || [])[1] || "";
    // 自给农场/城市中心等不可建造建筑不入产值册（buildable = no）
    const buildable = !/buildable\s*=\s*no/.test(b);
    GROUPS.set(stem, { g, bg, techs: ub.trim() ? ub.trim().split(/\s+/) : [], buildable });
  }
}

// ---------- 资源建筑集合（游戏文件直读：map_data/state_regions） ----------
import { loadStateRegions } from "./game-data.mjs";
const RESOURCE_STEMS = new Set();
for (const st of loadStateRegions()) {
  for (const r of [...st.arableRes, ...st.capped.map((c) => c.stem), ...st.disc.map((c) => c.stem)]) {
    RESOURCE_STEMS.add(r);
  }
}

// ---------- 建筑组层级 → 一级分类（参考游戏建造菜单：城市/乡村/开发） ----------
const BG_PARENT = new Map();
{
  const gt = read(path.join(GAME, "common/building_groups/00_building_groups.txt"));
  for (const m of gt.matchAll(/^(bg_\w+) = \{([^}]*)\}/gm)) {
    const p = (m[2].match(/parent_group\s*=\s*(bg_\w+)/) || [])[1] || "";
    BG_PARENT.set(m[1], p);
  }
}
const KIND_ROOT = { bg_manufacturing: "urban", bg_service: "urban", bg_urban_facilities: "urban", bg_power: "urban", bg_agriculture: "rural", bg_ranching: "rural", bg_plantations: "rural", bg_extraction: "rural", bg_infrastructure: "dev" };
function kindOf(bg) {
  let g = bg, hops = 0;
  while (g && hops++ < 6) { if (KIND_ROOT[g]) return KIND_ROOT[g]; g = BG_PARENT.get(g) || ""; }
  return "other";
}

// ---------- 组合合成（生成期与页面同构）：全局雇工 → 双作用域商品流 → 吞吐 ----------
function compose(b, sel) {
  let E = 0, thp = 1;
  const chosen = [];
  for (const g of b.groups) {
    const p = g.pms.find((x) => x.k === sel[g.g]) || g.pms[0];
    chosen.push(p);
    for (const e of p.emp) E += e[1];
    thp += p.thp || 0;
  }
  const out = {}, inn = {}, outG = [], innG = [];
  b.groups.forEach((g, i) => {
    const p = chosen[i];
    const go = {}, gi = {};
    for (const e of p.wfOut) { out[e[0]] = (out[e[0]] || 0) + e[1] * E / K; go[e[0]] = (go[e[0]] || 0) + e[1] * E / K; }
    for (const e of p.wfInn) { inn[e[0]] = (inn[e[0]] || 0) + e[1] * E / K; gi[e[0]] = (gi[e[0]] || 0) + e[1] * E / K; }
    for (const e of p.lvOut) { out[e[0]] = (out[e[0]] || 0) + e[1]; go[e[0]] = (go[e[0]] || 0) + e[1]; }
    for (const e of p.lvInn) { inn[e[0]] = (inn[e[0]] || 0) + e[1]; gi[e[0]] = (gi[e[0]] || 0) + e[1]; }
    if (Object.keys(go).length) outG.push({ g: b.groups[i].gzh, items: Object.entries(go) }); // 按组拆开的商品流（轮作替代的负产出也如实显示）
    if (Object.keys(gi).length) innG.push({ g: b.groups[i].gzh, items: Object.entries(gi) });
  });
  for (const k in out) out[k] *= thp;
  for (const k in inn) inn[k] *= thp;
  for (const og of outG) for (const e of og.items) e[1] *= thp;
  for (const ig of innG) for (const e of ig.items) e[1] *= thp;
  let net = 0, outVal = 0, innVal = 0;
  for (const k in out) { net += out[k] * PRICE[k]; outVal += out[k] * PRICE[k] / 100; }
  for (const k in inn) { net -= inn[k] * PRICE[k]; innVal += inn[k] * PRICE[k] / 100; }
  return { E, thp, out, inn, outG, innG, net, outVal, innVal, pw: E > 0 ? net / E : 0 };
}
function greedySel(b) { // 各组迭代取最优（雇工为正约束下净产值最大）；需科技解锁的 PM 不参与默认组合，组内全部需科技时取游戏默认（第一个，通常为最低时代）
  const cands = (g) => { const free = g.pms.filter((p) => !p.techs.length); return free.length ? free : [g.pms[0]]; };
  const sel = {};
  for (const g of b.groups) sel[g.g] = cands(g)[0].k;
  let changed = true, guard = 0;
  while (changed && guard++ < 8) {
    changed = false;
    for (const g of b.groups) {
      let bestK = sel[g.g], best = compose(b, sel).net;
      for (const p of cands(g)) {
        if (p.k === bestK) continue;
        sel[g.g] = p.k;
        const c = compose(b, sel);
        if (c.E > 0 && c.net > best) { best = c.net; bestK = p.k; }
      }
      if (bestK !== sel[g.g]) { sel[g.g] = bestK; changed = true; }
    }
  }
  return sel;
}

// ---------- 组装数据 ----------
const ser = (p) => ({ // PM 序列化为页面形态（生成期 compose 与页面 JS 同构共用）
  k: p.key, zh: p.zh,
  emp: Object.entries(p.lvEmp), wfOut: Object.entries(p.wfOut), wfInn: Object.entries(p.wfInn),
  lvOut: Object.entries(p.lvOut), lvInn: Object.entries(p.lvInn), thp: p.thp,
  techs: p.techs, th: p.techs.map((k) => { const t = TECH.get(k); return t ? `${t.zh}（${t.cat}·第${t.era}时代）` : k; }).join("、"),
  law: p.disLaws.every((k) => k.includes("slave")) && p.disLaws.length ? "需蓄奴类法律" : p.disLaws.join("、"),
});
const buildings = [];
for (const [stem, { g: groups, bg, techs, buildable }] of GROUPS) {
  if (!buildable) continue;
  const garr = [];
  for (const [g, keys] of groups) {
    // 装饰性 PM（无任何修饰数据，如「人工吹制」「道路推车」）保留为合法选项（=基线）
    const pms = keys.map((k) => PMS.get(k)).filter(Boolean);
    if (!pms.length) continue;
    if (pms.every((p) => !p.hasEffect)) continue; // 整组无实际效果的修饰组（神职类）剔除
    garr.push({ g, gzh: zh(g) || g.g, pms: pms.map(ser) });
  }
  if (!garr.length) continue;
  const cand = { stem, zh: zh("building_" + stem) || stem, res: RESOURCE_STEMS.has(stem), groups: garr, bg, techs, kind: kindOf(bg) };
  const best = compose(cand, greedySel(cand));
  if (best.net <= 0) continue; // 最优组合仍无商品产出的建筑（公司总部/运河等）不入产值册
  buildings.push(cand);
}
buildings.sort((a, b) => a.zh.localeCompare(b.zh, "zh-Hans"));

// 职业中文名总表（页面 emp 行渲染用）
const EMP_ZH = {};
for (const b of buildings) for (const g of b.groups) for (const p of g.pms) for (const e of p.emp) EMP_ZH[e[0]] = EMP_ZH[e[0]] || zh(e[0]);

const DATA = {
  price: PRICE,
  goodsZh: GOODS_ZH,
  empZh: EMP_ZH,
  K,
  buildings: buildings.map((b) => ({
    stem: b.stem, zh: b.zh, res: b.res, bg: b.bg, kind: b.kind,
    tag: zh(b.bg) || (b.res ? "资源" : "工业/城市"), // 右上角类型标签（建筑组中文）
    icon: fs.existsSync(path.join(ROOT, "assets/buildings/building_" + b.stem + ".webp")),
    techs: b.techs.map((k) => TECH.get(k) || { zh: k, cat: "?", era: 0 }),
    groups: b.groups,
  })),
};

// 筛选下拉（一级=参考游戏建造菜单：城市/乡村/开发；二级=建筑组）
const KIND_LABEL = { urban: "城市", rural: "乡村", dev: "开发", other: "其他" };
const kindOptions = ["urban", "rural", "dev", "other"].map((kind) => {
  const bgs = [...new Set(buildings.filter((b) => b.kind === kind).map((b) => b.bg))];
  if (!bgs.length) return "";
  const opts = bgs.map((bg) => {
    const z = zh(bg) || bg;
    const n = buildings.filter((b) => b.bg === bg).length;
    return `<option value="${bg}">${z}（${n}）</option>`;
  }).join("");
  return `<optgroup label="${KIND_LABEL[kind]}">${opts}</optgroup>`;
}).join("");

// ---------- 页面 ----------
const localCss = `
  .cal-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:16px 0;padding:10px 14px;background:var(--parchment-2);border:1px solid var(--line);border-radius:8px}
  .cal-toolbar input{font:inherit;flex:1;min-width:160px;padding:5px 10px;border:1px solid var(--gold);border-radius:6px;background:var(--parchment)}
  .cal-toolbar select{font:inherit;padding:5px 8px;border:1px solid var(--gold);border-radius:6px;background:var(--parchment)}
  .cal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px}
  .cal-card{position:relative;border:1px solid var(--line);border-radius:10px;background:var(--parchment-2);padding:12px 14px}
  .cal-head{display:flex;gap:10px;align-items:center;padding-right:64px}
  .cal-head .icon{width:44px;height:44px;border:1px solid var(--line);border-radius:6px;background:var(--parchment);object-fit:contain;flex:none}
  .cal-card h3{margin:0 0 2px;font-size:16px}
  .cal-card .en{color:var(--ink-soft);font-size:12px;word-break:break-all}
  .cal-card .tag{position:absolute;top:10px;right:12px;font-size:11px;border:1px solid var(--line);border-radius:4px;padding:0 5px;color:var(--gold);background:var(--parchment)}
  .cal-tech{font-size:12.5px;color:var(--ink-soft);margin-top:7px}
  .cal-pms{margin:8px 0;border-top:1px dashed var(--line);padding-top:8px}
  .cal-pms label{display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:6px}
  .cal-pms .gname{color:var(--ink-soft);flex:none}
  .cal-pms select{flex:1;min-width:0;font:inherit;font-size:13px;padding:3px 6px;border:1px solid var(--gold);border-radius:6px;background:var(--parchment)}
  .cal-out{margin-top:8px;font-size:13.5px;line-height:1.9}
  .cal-out .gicon{width:17px;height:17px;vertical-align:-3px;margin-right:3px;object-fit:contain;border-radius:3px}
  .cal-out .gsrc{display:inline-block;font-size:10.5px;color:var(--gold);border:1px solid var(--line);border-radius:3px;padding:0 4px;margin:0 4px 0 6px;vertical-align:1px;background:var(--parchment)}
  .cal-out b.v{color:var(--gold-bright)}
  .cal-out .sub{color:var(--ink-soft);font-size:12.5px}
  .cal-empty{padding:24px;text-align:center;color:var(--ink-soft)}
`;

const html = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vicdata 计算器 · 建筑产值（第一阶段）</title>
<style>${SHELL_CSS}
${localCss}</style>
</head>
<body>
<div class="wrap">
  ${pageShell({
    page: "calculator",
    title: "Vicdata 计算器",
    lede: "建筑产值计算器（第一阶段）：为每栋建筑切换各生产方式组，实时计算雇工构成、产出与投入（按商品原价折算）以及每级产值（营收）、毛利润与每工毛利润。单位：每工每周产出 = 数值 × 原价 ÷ 250（游戏文件实证）。数据直读本地游戏文件（1.15.1），游戏更新后重跑生成脚本自动跟进。默认组合不选需科技解锁的生产方式（下拉中以「需 XX科技」标注），理论极值可自行切换。",
    back: { href: "index.html", label: "返回总览" },
  })}
  <a id="calculator-top"></a>

  <div class="cal-toolbar">
    <input id="q" type="search" placeholder="搜索建筑（中文 / 英文键名）…" autocomplete="off">
    <select id="f-kind"><option value="all">全部建筑</option>${kindOptions}</select>
    <select id="f-era"><option value="all">任意时代</option><option value="0">无需科技</option><option value="1">第1时代</option><option value="2">第2时代</option><option value="3">第3时代</option><option value="4">第4时代</option><option value="5">第5时代</option></select>
    <select id="f-sort"><option value="pw">按每工毛利润排序</option><option value="name">按名称排序</option></select>
    <span class="sub" id="count" style="color:var(--ink-soft);font-size:12.5px"></span>
  </div>

  <div class="cal-grid" id="grid"></div>
  <div class="cal-empty" id="empty" style="display:none">无匹配建筑</div>
</div>
<script id="cal-data" type="application/json">${JSON.stringify(DATA)}</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById("cal-data").textContent);
  var P = DATA.price, GZH = DATA.goodsZh, EZH = DATA.empZh, K = DATA.K;
  var state = {}; // stem -> {sel: {group: pmKey}}
  // 组合合成（与生成器同构）：全局雇工 E → workforce_scaled×E/250 + level_scaled → 吞吐放大
  function compose(b, sel) {
    var E = 0, thp = 1, chosen = [];
    b.groups.forEach(function (g) {
      var p = g.pms.find(function (x) { return x.k === sel[g.g]; }) || g.pms[0];
      chosen.push(p);
      p.emp.forEach(function (e) { E += e[1]; });
      thp += p.thp || 0;
    });
    var out = {}, inn = {}, outG = [], innG = [];
    b.groups.forEach(function (g, i) {
      var p = chosen[i], go = {}, gi = {};
      p.wfOut.forEach(function (e) { out[e[0]] = (out[e[0]] || 0) + e[1] * E / K; go[e[0]] = (go[e[0]] || 0) + e[1] * E / K; });
      p.wfInn.forEach(function (e) { inn[e[0]] = (inn[e[0]] || 0) + e[1] * E / K; gi[e[0]] = (gi[e[0]] || 0) + e[1] * E / K; });
      p.lvOut.forEach(function (e) { out[e[0]] = (out[e[0]] || 0) + e[1]; go[e[0]] = (go[e[0]] || 0) + e[1]; });
      p.lvInn.forEach(function (e) { inn[e[0]] = (inn[e[0]] || 0) + e[1]; gi[e[0]] = (gi[e[0]] || 0) + e[1]; });
      if (Object.keys(go).length) outG.push({ g: b.groups[i].gzh, items: Object.entries(go) });
      if (Object.keys(gi).length) innG.push({ g: b.groups[i].gzh, items: Object.entries(gi) });
    });
    for (var ko in out) out[ko] *= thp;
    for (var ki in inn) inn[ki] *= thp;
    outG.forEach(function (og) { og.items.forEach(function (e) { e[1] *= thp; }); });
    innG.forEach(function (ig) { ig.items.forEach(function (e) { e[1] *= thp; }); });
    var net = 0, outVal = 0, innVal = 0;
    for (var k1 in out) { net += out[k1] * P[k1]; outVal += out[k1] * P[k1] / 100; }
    for (var k2 in inn) { net -= inn[k2] * P[k2]; innVal += inn[k2] * P[k2] / 100; }
    var emp = {};
    b.groups.forEach(function (g, i) { chosen[i].emp.forEach(function (e) { emp[e[0]] = (emp[e[0]] || 0) + e[1]; }); });
    return { E: E, thp: thp, out: out, inn: inn, outG: outG, innG: innG, emp: emp, net: net, outVal: outVal, innVal: innVal, pw: E > 0 ? net / E : 0 };
  }
  function compute(b) { return compose(b, state[b.stem].sel); }
  function greedySel(b) { // 默认组合：需科技解锁的 PM 不参与默认（组内全部需科技时除外），与生成器同构
    function cands(g) { var free = g.pms.filter(function (p) { return !p.techs.length; }); return free.length ? free : [g.pms[0]]; }
    var sel = {};
    b.groups.forEach(function (g) { sel[g.g] = cands(g)[0].k; });
    var changed = true, guard = 0;
    while (changed && guard++ < 8) {
      changed = false;
      b.groups.forEach(function (g) {
        var bestK = sel[g.g], best = compose(b, sel).net;
        cands(g).forEach(function (p) {
          if (p.k === bestK) return;
          sel[g.g] = p.k;
          var c = compose(b, sel);
          if (c.E > 0 && c.net > best) { best = c.net; bestK = p.k; }
        });
        if (bestK !== sel[g.g]) { sel[g.g] = bestK; changed = true; }
      });
    }
    return sel;
  }
  function fmtQty(v) { return (Math.round(v * 100) / 100).toString(); }
  function fm(v) { return (v < 0 ? "-£" : "£") + Math.abs(v).toFixed(2); }
  function gicon(k) { return '<img class="gicon" src="assets/goods/' + k + '.webp" alt="" loading="lazy" onerror="this.remove()">'; }
  function card(b) {
    var st = state[b.stem];
    var icon = b.icon
      ? '<img class="icon" src="assets/buildings/building_' + b.stem + '.webp" alt="" loading="lazy">'
      : '<div class="icon"></div>';
    var tech = b.techs.length
      ? '<div class="cal-tech">解锁科技：' + b.techs.map(function (t) { return t.zh + "（" + t.cat + "·第" + t.era + "时代）"; }).join("、") + "</div>"
      : "";
    var pms = b.groups.map(function (g) {
      var opts = g.pms.map(function (p) {
        return '<option value="' + p.k + '"' + (st.sel[g.g] === p.k ? " selected" : "") + ">" + p.zh + (p.th ? "（需 " + p.th + "）" : "") + (p.law ? "（" + p.law + "）" : "") + "</option>";
      }).join("");
      return '<label><span class="gname">' + g.gzh + "</span>" + '<select data-b="' + b.stem + '" data-g="' + g.g + '">' + opts + "</select></label>";
    }).join("");
    return '<div class="cal-card" data-stem="' + b.stem + '" data-pw="0"><span class="tag">' + b.tag + "</span>" +
      '<div class="cal-head">' + icon + '<div class="tt"><h3>' + b.zh + '</h3><div class="en">' + b.stem + "</div></div></div>" +
      tech +
      '<div class="cal-pms">' + pms + "</div>" +
      '<div class="cal-out"></div></div>';
  }
  function renderCard(b) {
    var el = document.querySelector('.cal-card[data-stem="' + b.stem + '"]');
    if (!el) return;
    var c = compute(b);
    el.dataset.pw = c.pw;
    var out = [];
    out.push('每级雇工 <b class="v">' + c.E.toLocaleString() + "</b>" + (c.thp !== 1 ? ' <span class="sub">吞吐×' + c.thp.toFixed(2) + "</span>" : "") + " <span class='sub'>" + Object.entries(c.emp).map(function (e) { return EZH[e[0]] + "×" + e[1]; }).join("、") + "</span>");
    var os = c.outG.map(function (gi) {
      return '<span class="gsrc">' + gi.g + "</span>" + gi.items.map(function (e) { return gicon(e[0]) + GZH[e[0]] + "×" + fmtQty(e[1]) + "(" + fm(e[1] * P[e[0]] / 100) + ")"; }).join("、");
    }).join(" ");
    var is = c.innG.map(function (gi) {
      return '<span class="gsrc">' + gi.g + "</span>" + gi.items.map(function (e) { return gicon(e[0]) + GZH[e[0]] + "×" + fmtQty(e[1]) + "(" + fm(e[1] * P[e[0]] / 100) + ")"; }).join("、");
    }).join(" ");
    out.push("产出：" + (os || "无") + ' <span class="sub">合计 ' + fm(c.outVal) + "/级</span>");
    if (is.length) out.push("投入：" + is + ' <span class="sub">合计 ' + fm(c.innVal) + "/级</span>");
    out.push('每级产值（营收）<b class="v">' + fm(c.outVal) + '</b>/周　毛利润 <b class="v">' + fm(c.net / 100) + '</b>/周　每工毛利润 <b class="v">' + (c.pw < 0 ? "-" : "") + "£" + Math.abs(c.pw / 100).toFixed(3) + "</b>/周");
    el.querySelector(".cal-out").innerHTML = out.join("<br>");
  }
  var grid = document.getElementById("grid");
  DATA.buildings.forEach(function (b) { state[b.stem] = { sel: greedySel(b) }; });
  function relist() {
    var q = document.getElementById("q").value.trim().toLowerCase();
    var kind = document.getElementById("f-kind").value;
    var era = document.getElementById("f-era").value;
    var sort = document.getElementById("f-sort").value;
    var list = DATA.buildings.filter(function (b) {
      if (kind !== "all" && b.bg !== kind) return false;
      if (era !== "all") {
        var maxEra = b.techs.length ? Math.max.apply(null, b.techs.map(function (t) { return t.era; })) : 0;
        if (String(maxEra) !== era) return false;
      }
      if (q && !(b.zh.toLowerCase().includes(q) || b.stem.includes(q))) return false;
      return true;
    });
    if (sort === "pw") {
      list = list.map(function (b) { return b; }).sort(function (a, b2) { return compute(b2).pw - compute(a).pw; });
    }
    grid.innerHTML = list.map(card).join("");
    list.forEach(renderCard);
    document.getElementById("empty").style.display = list.length ? "none" : "";
    document.getElementById("count").textContent = list.length + " 栋建筑";
  }
  grid.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.tagName !== "SELECT") return;
    state[t.dataset.b].sel[t.dataset.g] = t.value;
    var b = DATA.buildings.find(function (x) { return x.stem === t.dataset.b; });
    renderCard(b);
    if (document.getElementById("f-sort").value === "pw") relist();
  });
  document.getElementById("q").addEventListener("input", relist);
  document.getElementById("f-kind").addEventListener("change", relist);
  document.getElementById("f-era").addEventListener("change", relist);
  document.getElementById("f-sort").addEventListener("change", relist);
  relist();
})();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, "calculator.html"), html);

// 产物自检①：内联应用脚本必须能通过 JS 编译（曾因模板转义产出非法引号致脚本整体不执行）
{
  const appJs = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
  if (!appJs) throw new Error("calculator.html 未找到应用脚本");
  const vm = await import("node:vm");
  new vm.Script(appJs); // 语法错误直接抛出，生成失败
}
// 产物自检②：英文变量必须本地化——建筑/生产方式/商品/职业/组名/科技出现英文键直出即生成失败（键名小字 .en 展示除外）
{
  const missB = DATA.buildings.filter((b) => b.zh === b.stem);
  if (missB.length) throw new Error("建筑中文名缺失 " + missB.length + " 栋：" + missB.slice(0, 5).map((b) => b.stem).join(","));
  const missPm = [], dirty = [], missG = [], missT = [], noIcon = [];
  for (const b of DATA.buildings) {
    if (!b.icon) noIcon.push(b.stem);
    const badT = b.techs.find((t) => t.cat === "?" || !t.era);
    if (badT) missT.push(b.stem + "/" + badT.zh);
    for (const g of b.groups) {
      if (g.gzh === g.g || !g.gzh) missG.push(b.stem + "/" + g.g);
      for (const p of g.pms) {
        if (!p.zh) missPm.push(b.stem + "/" + p.k);
        if (p.zh.includes("$")) dirty.push(b.stem + "/" + p.k);
      }
    }
  }
  if (missPm.length) throw new Error("生产方式中文名缺失 " + missPm.length + " 处：" + missPm.slice(0, 3).join(","));
  if (dirty.length) throw new Error("PM 名含 $占位符 " + dirty.length + " 处：" + dirty.slice(0, 3).join(","));
  if (missG.length) throw new Error("PM 组名未本地化 " + missG.length + " 处：" + missG.slice(0, 3).join(","));
  if (missT.length) throw new Error("解锁科技未解析 " + missT.length + " 处：" + missT.slice(0, 3).join(","));
  if (GOODS_NOLOC.length) throw new Error("商品中文名缺失：" + GOODS_NOLOC.join(","));
  const missEmp = Object.entries(EMP_ZH).filter(([, v]) => !v);
  if (missEmp.length) throw new Error("职业中文名缺失：" + missEmp.map(([k]) => k).join(","));
  if (noIcon.length) throw new Error("建筑图标缺失（assets/buildings/building_*.webp）：" + noIcon.join(","));
}
// 产物自检③：运行时冒烟——贪心默认组合全建筑跑生成期同构 compose，禁止抛错/零雇工/非正净值
{
  for (const b of DATA.buildings) {
    const c = compose(b, greedySel(b));
    if (!(c.E > 0)) throw new Error(`冒烟失败 ${b.stem}: 每级雇工=${c.E}`);
    if (!(c.net > 0)) throw new Error(`冒烟失败 ${b.stem}: 净产值=${c.net}`);
  }
}
// 产物自检④：键名一致性——renderCard 引用的 c.* 必须都在 compute 返回对象里（曾 outs/out 错配致全页 TypeError）
{
  const js = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
  const ret = (js.match(/return \{([^}]*)\}/) || [])[1] || "";
  const keys = new Set([...ret.matchAll(/(\w+):/g)].map((m) => m[1]));
  const used = new Set([...js.matchAll(/\bc\.(\w+)/g)].map((m) => m[1]));
  const bad = [...used].filter((k) => !keys.has(k) && !["stem", "g"].includes(k));
  if (bad.length) throw new Error("renderCard 引用了 compute 未返回的键: " + bad.join(","));
}
// 产物自检⑤：PM 解锁科技键必须在科技表中；商品图标资产必须存在；默认组合不得选中需科技 PM（组内全需科技除外）
{
  const missT = [], noG = [], badSel = [];
  const goods = new Set();
  for (const b of DATA.buildings) {
    const sel = greedySel(b);
    for (const g of b.groups) {
      const p = g.pms.find((x) => x.k === sel[g.g]);
      if (p.techs.length && !g.pms.every((q) => q.techs.length)) badSel.push(b.stem + "/" + g.g);
      for (const q of g.pms) {
        if (q.techs.some((k) => !TECH.has(k))) missT.push(b.stem + "/" + q.k);
        [...q.wfOut, ...q.wfInn, ...q.lvOut, ...q.lvInn].forEach((e) => goods.add(e[0]));
      }
    }
  }
  for (const gk of goods) if (!fs.existsSync(path.join(ROOT, "assets/goods/" + gk + ".webp"))) noG.push(gk);
  if (missT.length) throw new Error("PM 解锁科技键未在科技表 " + missT.length + " 处：" + missT.slice(0, 3).join(","));
  if (noG.length) throw new Error("商品图标缺失（assets/goods/*.webp）：" + noG.join(","));
  if (badSel.length) throw new Error("默认组合选中了需科技解锁的 PM：" + badSel.slice(0, 3).join(","));
}
const resN = DATA.buildings.filter((b) => b.res).length;
console.log(`calculator.html（计算器·第一阶段建筑产值）生成完毕: ${(fs.statSync(path.join(ROOT, "calculator.html")).size / 1024).toFixed(0)} KB | 建筑 ${DATA.buildings.length}（资源 ${resN} / 工业城市 ${DATA.buildings.length - resN}）· PM 组 ${DATA.buildings.reduce((s, b) => s + b.groups.length, 0)} · 生产方式 ${DATA.buildings.reduce((s, b) => s + b.groups.reduce((x, g) => x + g.pms.length, 0), 0)}`);
