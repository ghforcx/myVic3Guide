// Vicdata 州名图鉴生成器（零依赖，Node 18+）
// 数据源（全部只读，均为真相层，见 AGENTS.md 真相层级）：
//   1. 游戏本体 loc：game/localization/{english,simp_chinese}/map/states_l_*.yml —— 州基础名（中英）
//   2. 游戏本体脚本：game/common/scripted_effects/00_dynamic_state_names*.txt —— 动态名及其生效条件
//   3. 镜像便利层：versions/<default>/locale-countries*/locale-cultures* —— 条件里的国家/文化译名
// 产物：states.html（套 guides/shell.mjs 的 pageShell 壳；注册 TAB_DEFS key="states"）
import fs from "node:fs";
import path from "node:path";
import { pageShell, SHELL_CSS } from "./shell.mjs";

const GAME = "C:/Program Files (x86)/Steam/steamapps/common/Victoria 3/game";
const ROOT = path.resolve(import.meta.dirname, "..");

// ---------- 工具 ----------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 花括号配平截取：从 str 中 startIdx 处的 '{' 起，返回配平的整个块（含首尾括号） */
function balancedBlock(str, startIdx) {
  if (str[startIdx] !== "{") return null;
  let depth = 0;
  for (let i = startIdx; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") { depth--; if (depth === 0) return str.slice(startIdx, i + 1); }
  }
  return null;
}
/** 在块内找 `key = {` 的配平内容（不含外层括号）；first=true 只取第一个 */
function innerBlocks(block, key, first = false) {
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

/** 解析游戏 loc yml 的通用器（上面 loadStates 已内联；此函数供单文件场景复用） */
function loadLocYml(file) {
  const map = new Map();
  const txt = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*(STATE_\w+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim().replace(/^\d+\s+/, "");
    const q = v.match(/^"(.*)"\s*(#.*)?$/);
    if (q) v = q[1];
    v = v.trim();
    if (v && !map.has(m[1])) map.set(m[1], v);
  }
  return map;
}

// ---------- 1) 州基础名（游戏 loc，中英；动态名在 dynamic_state_and_hub_names 文件，需合并） ----------
function loadStates(langDir, lang) {
  const map = new Map();
  for (const file of ["map/states_l_" + lang + ".yml", "dynamic_state_and_hub_names_l_" + lang + ".yml"]) {
    const p = path.join(langDir, file);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*(STATE_\w+):\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim().replace(/^\d+\s+/, "");
      const q = v.match(/^"(.*)"\s*(#.*)?$/);
      if (q) v = q[1];
      v = v.trim();
      if (v && !map.has(m[1])) map.set(m[1], v);
    }
  }
  return map;
}
const statesEn = loadStates(path.join(GAME, "localization/english"), "english");
const statesZh = loadStates(path.join(GAME, "localization/simp_chinese"), "simp_chinese");
const BASE_KEYS = [...new Set([...statesZh.keys(), ...statesEn.keys()])].filter((k) => /^STATE_[A-Z0-9]+$/.test(k));

// ---------- 2) 动态名与生效条件（游戏 scripted_effects） ----------
/** 条件 → 中文（轻量人化；未识别形态保留原文，宁缺毋假） */
const LANG = { germanophone: "德语", francophone: "法语", hispanophone: "西班牙语", lusophone: "葡萄牙语", anglophone: "英语", russian: "俄语", japanese: "日语", greek: "希腊语", arabic: "阿拉伯语", turkic: "突厥语", iranian: "伊朗语", slavic: "斯拉夫语", iberian: "伊比利亚语", chinese: "汉语", hindustani: "印度斯坦语", east_slavic: "东斯拉夫语", west_slavic: "西斯拉夫语", south_slavic: "南斯拉夫语", aragonese: "阿拉贡语", basque: "巴斯克语", finno_ugric: "芬兰-乌戈尔语", uralic: "乌拉尔语", caucasian: "高加索语", berber: "柏柏尔语", maghrebi: "马格里布语", bantu: "班图语", cushitic: "库希特语", oceanic: "大洋洲语", austronesian: "南岛语", tai: "壮侗语", tibetan: "藏语", manchu: "满语", mongolic: "蒙古语", korean: "朝鲜语", vietnamese: "越南语", thai: "泰语", burmese: "缅甸语", khmer: "高棉语", filipino: "菲律宾语", malay: "马来语", javanese: "爪哇语" };
const langName = (w) => LANG[w] || w;
const CU = "cu:(\\w+) \\?= this";
const TRAIT = "has_discrimination_trait = language_(\\w+)";
function humanize(cond, countryZh, cultureZh) {
  const c = cond.replace(/\s+/g, " ").trim();
  let m;
  if ((m = c.match(/^owner\s*=\s*\{\s*c:(\w+)\s*\??=\s*this\s*\}$/))) return `持有者为 ${countryZh(m[1])}`;
  if ((m = c.match(new RegExp("^owner = \\{ any_primary_culture = \\{ " + TRAIT + " \\} \\}$")))) return `持有者任一主流文化属${langName(m[1])}语言`;
  if ((m = c.match(new RegExp("^owner = \\{ any_primary_culture = \\{ " + CU + " \\} \\}$")))) return `持有者任一主流文化为 ${cultureZh(m[1])}`;
  if ((m = c.match(new RegExp("^owner = \\{ any_primary_culture = \\{ (" + TRAIT + "|" + CU + ") \\} NOT = \\{ c:(\\w+) \\?= this \\} \\}$")))) {
    const a = m[2] ? `属${langName(m[2])}语言` : `为 ${cultureZh(m[3])}`;
    return `持有者任一主流文化${a}，且持有者不是 ${countryZh(m[4])}`;
  }
  if ((m = c.match(new RegExp("^owner = \\{ any_primary_culture = \\{ (" + TRAIT + "|" + CU + ") \\} NOT = \\{ any_primary_culture = \\{ (" + TRAIT + "|" + CU + ") \\} \\} \\}$")))) {
    const a = m[2] ? `属${langName(m[2])}语言` : `为 ${cultureZh(m[3])}`;
    const b = m[5] ? `${langName(m[5])}语言文化` : `${cultureZh(m[6])}文化`;
    return `持有者任一主流文化${a}，且不含${b}`;
  }
  if ((m = c.match(/^owner\s*=\s*\{\s*has_primary_culture\s*=\s*cu:(\w+)\s*\}$/i))) return `持有者主流文化为 ${cultureZh(m[1])}`;
  if ((m = c.match(/^owner\s*=\s*\{\s*culture\s*=\s*cu:(\w+)\s*\}$/i))) return `持有者文化为 ${cultureZh(m[1])}`;
  if ((m = c.match(/^NOT\s*=\s*\{\s*exists\s*=\s*c:(\w+)\s*\}$/i))) return `${countryZh(m[1])} 不存在`;
  if ((m = c.match(/^exists\s*=\s*c:(\w+)$/i))) return `${countryZh(m[1])} 存在`;
  return `（脚本条件）${c}`;
}

const dynByState = new Map(); // STATE_X → [{ key, zh, en, cond }]
{
  const dir = path.join(GAME, "common/scripted_effects");
  const files = fs.readdirSync(dir).filter((f) => /^00_dynamic_state_names.*\.txt$/.test(f));
  for (const f of files) {
    const txt = fs.readFileSync(path.join(dir, f), "utf8").replace(/^\uFEFF/, "");
    const assignRe = /^\s*(STATE_\w+)_state_name_assign\s*=\s*\{/gm;
    let am;
    while ((am = assignRe.exec(txt))) {
      const block = balancedBlock(txt, assignRe.lastIndex - 1);
      if (!block) continue;
      const stateKey = am[1];
      for (const ifBody of innerBlocks(block, "if")) {
        const setName = (ifBody.match(/set_state_name\s*=\s*(STATE_\w+)/) || [])[1];
        if (!setName) continue;
        const limit = (innerBlocks(ifBody, "limit", true)[0] || "").trim();
        if (!limit) continue;
        const list = dynByState.get(stateKey) || [];
        list.push({ key: setName, zh: statesZh.get(setName) || "", en: statesEn.get(setName) || "", cond: limit });
        dynByState.set(stateKey, list);
      }
      assignRe.lastIndex += block.length - 1;
    }
  }
}

// ---------- 3) 条件译名表（游戏本地化直读：国家/文化裸键；镜像 locale-* 已停用） ----------
import { loadStateRegions, GAME as GAME_DIR, read } from "./game-data.mjs";
function locFileMap(lang, file) {
  const map = new Map();
  const p = path.join(GAME_DIR, "localization", lang, file);
  if (!fs.existsSync(p)) return map;
  for (const line of read(p).split("\n")) {
    const m = line.match(/^\s*([\w.]+):\s*\d*\s*"([^"]*)"/);
    if (m && m[2] && !map.has(m[1])) map.set(m[1], m[2]);
  }
  return map;
}
const countries = { zh: locFileMap("simp_chinese", "countries_l_simp_chinese.yml"), en: locFileMap("english", "countries_l_english.yml") };
const cultures = { zh: locFileMap("simp_chinese", "cultures_l_simp_chinese.yml"), en: locFileMap("english", "cultures_l_english.yml") };
const srLocale = { zh: locFileMap("simp_chinese", path.join("map", "strategic_regions_l_simp_chinese.yml")), en: locFileMap("english", path.join("map", "strategic_regions_l_english.yml")) };
// 游戏国家 loc 键为全大写裸 TAG
const countryZh = (tag) => countries.zh.get(String(tag).toUpperCase()) || countries.zh.get(String(tag).toLowerCase()) || countries.en.get(String(tag).toUpperCase()) || `c:${tag}`;
const cultureZh = (key) => cultures.zh.get(key) || cultures.en.get(key) || `cu:${key}`;

// ---------- 3.5) 战略区域归属 + 州资源（游戏文件直读：common/strategic_regions + map_data/state_regions） ----------
const stateRegionsAll = loadStateRegions();
const stateToSr = new Map(); // STATE_X → { key, zh }
for (const s of stateRegionsAll) {
  const srk = (s.srs || [])[0];
  if (srk) stateToSr.set(s.key, { key: srk, zh: srLocale.zh.get(srk) || srLocale.en.get(srk) || srk });
}
const srOf = (k) => stateToSr.get(k) || { key: "", zh: "" };

// ---------- 3.6) 州资源（stateRegionsAll 已由游戏文件直读；这里只补建筑中文名） ----------
const buildingsLoc = new Map();
{
  const txt = fs.readFileSync(path.join(GAME, "localization/simp_chinese/buildings_l_simp_chinese.yml"), "utf8").replace(/^\uFEFF/, "");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*(building_[a-z0-9_]+):\s*"([^"]*)"/);
    if (m && m[2] && !buildingsLoc.has(m[1])) buildingsLoc.set(m[1], m[2]);
  }
}
const resMap = new Map(); // STATE_X → { arable, caps[], discs[], arableRes[] }
{
  const zhOf = (stem) => buildingsLoc.get("building_" + stem) || stem;
  for (const s of stateRegionsAll) {
    resMap.set(s.key, {
      arable: s.arable,
      caps: s.capped.map((c) => ({ stem: c.stem, zh: zhOf(c.stem), n: c.n })),
      discs: s.disc.map((c) => ({ stem: c.stem, zh: zhOf(c.stem), n: c.n })),
      arableRes: s.arableRes.map((stem) => ({ stem, zh: zhOf(stem) })),
    });
  }
}
const resOf = (k) => resMap.get(k) || { arable: 0, caps: [], discs: [], arableRes: [] };
const rBadge = (zh, n, disc) => `<span class="rb${disc ? " disc" : ""}">${esc(zh)}${n ? " " + n : ""}</span>`;
const resCellHtml = (k) => {
  const r = resOf(k);
  const parts = [];
  if (r.arable) parts.push(rBadge("耕地", r.arable));
  for (const c of r.caps) parts.push(rBadge(c.zh, c.n));
  for (const d of r.discs) parts.push(rBadge(d.zh, d.n, true));
  return parts.join("");
};
// 资源筛选项（矿产/采集类与农业类分开；count=表格内拥有该资源的州数——镜像 781 条含非表格区域，只统计 505 州对照表）
const resOpts = new Map(); // stem → { zh, capped: n, arable: n }
const tableStateKeys = new Set(BASE_KEYS); // 与全部州名对照表同集（allRows 在本段之后才定义）
for (const [rk, r] of resMap) {
  if (!tableStateKeys.has(rk)) continue;
  const capSet = new Set([...r.caps, ...r.discs].map((x) => x.stem));
  for (const s of capSet) {
    const e = resOpts.get(s) || { zh: "", capped: 0, arable: 0 };
    e.capped++; resOpts.set(s, e);
  }
  const arSet = new Set(r.arableRes.map((x) => x.stem));
  for (const s of arSet) {
    const e = resOpts.get(s) || { zh: "", capped: 0, arable: 0 };
    e.arable++; resOpts.set(s, e);
  }
}
for (const r of resMap.values()) { // 回填中文（后写覆盖，保持最后一次见到的名字）
  for (const x of [...r.caps, ...r.discs, ...r.arableRes]) {
    const e = resOpts.get(x.stem);
    if (e) e.zh = x.zh;
  }
}
const resFilterOptions = [
  `<optgroup label="矿产 / 采集（可建级数上限）">${[...resOpts.entries()].filter(([, e]) => e.capped).sort((a, b) => a[1].zh.localeCompare(b[1].zh, "zh-Hans")).map(([stem, e]) => `<option value="${esc(stem)}">${esc(e.zh)}（${e.capped} 州）</option>`).join("")}</optgroup>`,
  `<optgroup label="农业 / 种植（可建类型）">${[...resOpts.entries()].filter(([, e]) => e.arable).sort((a, b) => a[1].zh.localeCompare(b[1].zh, "zh-Hans")).map(([stem, e]) => `<option value="${esc(stem)}">${esc(e.zh)}（${e.arable} 州）</option>`).join("")}</optgroup>`,
].join("\n      ");

// ---------- 渲染 ----------
const dynStates = [...dynByState.keys()].filter((k) => statesZh.has(k) || statesEn.has(k)).sort((a, b) => a.localeCompare(b));
const allRows = BASE_KEYS.map((k) => ({ key: k, zh: statesZh.get(k) || "", en: statesEn.get(k) || "" }))
  .filter((r) => r.zh || r.en)
  .sort((a, b) => a.en.localeCompare(b.en));

const localCss = `
  .toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:16px 0 4px;padding:10px 14px;background:var(--parchment-2);border:1px solid var(--line);border-radius:8px}
  .toolbar label{font-weight:600;font-size:14px}
  .toolbar select{font:inherit;font-size:14px;color:var(--ink);background:var(--parchment);border:1px solid var(--gold);border-radius:6px;padding:5px 10px}
  .toolbar .status{color:var(--ink-soft);font-size:12.5px}
  .st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;margin:18px 0}
  .st-card{border:1px solid var(--line);border-radius:10px;background:var(--parchment-2);padding:14px 16px}
  .st-card h3{margin:0 0 6px;font-size:17px}
  .st-card .en{color:var(--ink-soft);font-size:12.5px}
  .st-dyn{margin-top:10px;border-top:1px dashed var(--line);padding-top:8px}
  .st-dyn li{list-style:none;margin:6px 0;font-size:14px}
  .st-dyn .cond{color:var(--ink-soft);font-size:12.5px}
  .st-dyn .cond code{font-size:12px;background:var(--parchment-dark);border-radius:4px;padding:1px 5px}
  table.st-table{width:100%;border-collapse:collapse;font-size:14px}
  table.st-table th,table.st-table td{border:1px solid var(--line);padding:6px 10px;text-align:left}
  table.st-table th{background:var(--parchment-dark)}
  details.st-fold{border:1px solid var(--line);border-radius:10px;background:var(--parchment-2);margin:16px 0;padding:0}
  details.st-fold>summary{cursor:pointer;font-weight:600;padding:12px 16px}
  .rb{display:inline-block;font-size:11px;line-height:1.6;border:1px solid var(--gold);color:var(--gold);border-radius:3px;padding:0 4px;margin:1px 2px;background:var(--parchment);white-space:nowrap}
  .rb.disc{border-style:dashed;color:var(--ink-soft)}
  .st-empty{display:none;padding:22px;text-align:center;color:var(--ink-soft);font-size:14px}
`;

const dynCards = dynStates.map((k) => {
  const zh = statesZh.get(k) || statesEn.get(k) || k;
  const en = statesEn.get(k) || "";
  const sr = srOf(k);
  const dyns = (dynByState.get(k) || []).map((d) => {
    const h = humanize(d.cond, countryZh, cultureZh);
    const condHtml = h.startsWith("（脚本条件）")
      ? `<span class="cond">（脚本条件）<code>${esc(h.slice(6))}</code></span>`
      : `<span class="cond">${esc(h)}</span>`;
    return `<li><b>${esc(d.zh || d.en || d.key)}</b>${d.en && d.zh ? ` <span class="en">${esc(d.en)}</span>` : ""}<br>${condHtml}</li>`;
  }).join("\n      ");
  return `<div class="st-card" data-sr="${esc(sr.key)}"><h3>${esc(zh)}</h3><div class="en">${esc(en)} · ${esc(k)}${sr.zh ? ` · 战略区域：${esc(sr.zh)}` : ""}</div>
    <ul class="st-dyn">${dyns}</ul></div>`;
}).join("\n    ");

const tableRows = allRows.map((r) => {
  const res = resOf(r.key);
  const resAttr = [...res.caps, ...res.discs].map((x) => x.stem).join(",") + (res.arable ? (res.caps.length || res.discs.length ? "," : "") + "arable" : "");
  const arAttr = res.arableRes.map((x) => x.stem).join(",");
  return `<tr data-sr="${esc(srOf(r.key).key)}" data-res="${esc(resAttr)}" data-arres="${esc(arAttr)}"><td>${esc(r.zh)}</td><td>${esc(r.en)}</td><td class="en">${esc(r.key)}</td><td class="res-cell">${resCellHtml(r.key)}</td></tr>`;
}).join("\n    ");

// 战略区域筛选选项（按显示州计数）
const srCount = new Map();
for (const r of allRows) { const sr = srOf(r.key); if (sr.key) srCount.set(sr.key, (srCount.get(sr.key) || 0) + 1); }
const srOptions = [...srCount.entries()]
  .map(([key, n]) => ({ key, n, zh: srLocale.zh.get(key) || srLocale.en.get(key) || key }))
  .sort((a, b) => a.zh.localeCompare(b.zh, "zh-Hans"))
  .map((o) => `<option value="${esc(o.key)}">${esc(o.zh)}（${o.n}）</option>`)
  .join("\n      ");

const html = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vicdata 州名图鉴 · 全部州名与动态名</title>
<style>${SHELL_CSS}
${localCss}</style>
</head>
<body>
<div class="wrap">
  ${pageShell({
    page: "states",
    title: "Vicdata 州名图鉴",
    lede: `全部 ${allRows.length} 个州的基础名（游戏官方中英对照）、可建产业与资源上限（煤矿/铁矿/油井/种植园等 27 类，含未探明资源），以及 ${dynStates.length} 个州的动态名及生效条件。支持按战略区域与按资源双向筛选——比如「哪些州有石油」「华北有哪些州」。数据直接来自本地游戏文件与地图数据（state_regions），游戏更新后重跑生成脚本即自动跟进。`,
    counts: { states: allRows.length },
    back: { href: "index.html", label: "返回总览" },
  })}
  <a id="states-top"></a>

  <form class="toolbar" id="sr-filter">
    <label for="f-sr">战略区域</label>
    <select id="f-sr">
      <option value="all">全部（${allRows.length}）</option>
      ${srOptions}
    </select>
    <label for="f-res">资源</label>
    <select id="f-res">
      <option value="all">不限</option>
      ${resFilterOptions}
    </select>
    <span class="status" id="sr-status"></span>
  </form>

  <h2 style="margin-top:20px">动态名明细（<span id="sr-cardn">${dynStates.length}</span> 州）</h2>
  <p class="hint" style="font-size:13px;color:var(--ink-soft);background:var(--parchment-2);border:1px solid var(--line);border-radius:8px;padding:10px 14px">动态名是游戏按条件自动改换的州名（<code>set_state_name</code>）：同一州在不同持有者/文化/局势下显示不同名字。条件为「持有者为 X / 主流文化为 X」等常见形态；复杂条件以脚本原文展示。</p>
  <div class="st-grid">
    ${dynCards}
  </div>
  <div class="st-empty" id="st-empty">该战略区域没有动态名州——动态名只存在于历史沿革特殊的州（如被特定国家征服后改名）。该区域全部州、资源与可建产业见下方对照表。</div>

  <details class="st-fold" open>
    <summary>全部州名 · 资源对照表（${allRows.length}，按英文名排序）</summary>
    <p class="hint" style="font-size:13px;color:var(--ink-soft);margin:0 16px 10px">资源徽章为该州可建产业与上限级数（如「煤矿 45」＝可建 45 级煤矿）；虚线徽章为未探明资源（存在但需勘探科技发现）；「耕地 N」为可开垦农田总级数，具体可建农场/种植园类型见各州数据。可用上方「资源」下拉反查某种资源分布在哪些州。</p>
    <table class="st-table">
      <thead><tr><th>中文名</th><th>英文名</th><th>数据键</th><th>资源（可建产业×上限）</th></tr></thead>
      <tbody>
    ${tableRows}
      </tbody>
    </table>
  </details>
</div>
<script>
(function () {
  var sel = document.getElementById("f-sr"), resSel = document.getElementById("f-res"), status = document.getElementById("sr-status"), cardn = document.getElementById("sr-cardn"), stEmpty = document.getElementById("st-empty");
  var allCards = ${dynStates.length};
  function apply() {
    var v = sel.value, rv = resSel.value, cards = 0, rows = 0;
    document.querySelectorAll(".st-card").forEach(function (c) {
      var ok = v === "all" || c.getAttribute("data-sr") === v;
      c.style.display = ok ? "" : "none";
      if (ok) cards++;
    });
    stEmpty.style.display = cards === 0 ? "" : "none";
    document.querySelectorAll("table.st-table tbody tr").forEach(function (r) {
      var resList = (r.getAttribute("data-res") || "").split(",").filter(Boolean);
      var arList = (r.getAttribute("data-arres") || "").split(",").filter(Boolean);
      var okSr = v === "all" || r.getAttribute("data-sr") === v;
      var okRes = rv === "all" || resList.indexOf(rv) >= 0 || arList.indexOf(rv) >= 0;
      var ok = okSr && okRes;
      r.style.display = ok ? "" : "none";
      if (ok) rows++;
    });
    cardn.textContent = cards;
    status.textContent = rows === 0
      ? "无匹配州（当前筛选条件下为空）"
      : "当前显示 " + rows + " 州 · 动态名卡片 " + cards + (cards === 0 && allCards > 0 && v !== "all" ? "（此区域无动态名州，州名与资源见下方对照表）" : "");
  }
  sel.addEventListener("change", apply);
  resSel.addEventListener("change", apply);
  apply();
})();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, "states.html"), html);
// 产物自检：内联脚本必须通过 JS 编译（模板字面量会折叠正则反斜杠，曾产出非法正则致整脚本不执行）
{
  const vm = await import("node:vm");
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (e) { throw new Error("内联脚本编译失败: " + e.message); }
  }
}
console.log(`states.html（州名图鉴）生成完毕: ${(fs.statSync(path.join(ROOT, "states.html")).size / 1024).toFixed(0)} KB | 州 ${allRows.length} · 含动态名 ${dynStates.length} · 动态名条目 ${[...dynByState.values()].reduce((n, l) => n + l.length, 0)}`);
