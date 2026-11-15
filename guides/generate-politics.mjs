// Vicdata 人群政治专题页生成器（激进派 / 忠诚派 / 政治运动 / 革命内战）
// 数据源（全部只读真相层）：
//   1. game/common/defines/00_defines.txt —— 运动激进化、革命爆发等机制常量（附官方注释）
//   2. game/localization/simp_chinese/modifiers_l —— 激进派来源 modifier 官方中文名（含 [Concept]/$ 引用解引用）
//   3. game/common/laws/*.txt —— 影响激进派/运动激进度/动乱的法规数值（压制手段表）
//   4. game/common/scripted_triggers/00_civil_war_triggers.txt —— 内战关键条件
// 产物：politics.html（注册 TAB_DEFS key="politics"）
import fs from "node:fs";
import path from "node:path";
import { pageShell, SHELL_CSS } from "./shell.mjs";

const GAME = "C:/Program Files (x86)/Steam/steamapps/common/Victoria 3/game";
const ROOT = path.resolve(import.meta.dirname, "..");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- loc 加载（modifiers + concepts，两层解引用） ----------
function loadLoc(file) {
  const map = new Map();
  const p = path.join(GAME, "localization/simp_chinese", file);
  const txt = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([\w:.]+):\s*\d*\s*"([^"]*)"/);
    if (m && m[2] && !map.has(m[1])) map.set(m[1], m[2]);
  }
  return map;
}
const MOD_LOC = loadLoc("modifiers_l_simp_chinese.yml");
const CONCEPT = loadLoc("concepts_l_simp_chinese.yml");
// 官方本地化文本清理：[Concept('x','$y$')] / $y$ / [concept_x] → 概念中文名（1.15 起引用可带 |q 等参数）
function derefZh(v, guard = 0) {
  let out = String(v || "").replace(/^@\w+!/g, "");
  if (guard > 5 || (!out.includes("$") && !out.includes("["))) return out;
  out = out.replace(/\[Concept\('[\w.]+',\s*'\$?([\w.]+?)(?:\|[\w]*)?\$?'\)\]/g, (m, k) => MOD_LOC.get(k) || CONCEPT.get(k) || k);
  out = out.replace(/\[([\w.]+)\]/g, (m, k) => CONCEPT.get(k) || MOD_LOC.get(k) || m);
  out = out.replace(/\$([\w.]+?)(?:\|[\w]*)?\$/g, (m, k) => CONCEPT.get(k) || MOD_LOC.get(k) || k);
  return out === v ? out : derefZh(out, guard + 1);
}
const modZh = (key) => derefZh(MOD_LOC.get(key) || "") || EXTRA_MOD_ZH[key] || "";
// 官方 modifiers loc 缺失的键（人工补，保持全中文）
const EXTRA_MOD_ZH = { turmoil_effects_mult: "动乱的效果" };

// ---------- 1) 激进派来源（官方 modifier 定义顺序，names 来自 modifiers loc） ----------
const RADICAL_SOURCES = [
  { key: "state_radicals_and_loyalists_from_sol_change_mult", why: "生活水平下降：预期落空是激进派最大的日常来源；上升则产生忠诚派" },
  { key: "country_radicals_from_legitimacy_mult", why: "政权合法性低（如非法政府、政变后）持续产出激进派" },
  { key: "country_radicals_from_conquest_mult", why: "武力征服新州：被征服人口按比例转为激进派" },
  { key: "state_radicals_from_political_movements_mult", why: "政治运动激进化后向支持者扩散（见下表运动机制）" },
  { key: "building_nationalization_radicals_mult", why: "建筑被国有化时，原属主 pop 转为激进派" },
  { key: "country_radicalism_increases_open_prejudice_mult", why: "恶性循环反馈：激进派积累反过来推高歧视等级（公开偏见/文化抹除等），此系数控制反馈强度" },
];

// ---------- 2) 机制常量（defines，抓官方注释） ----------
function grabDefines(keys) {
  const txt = fs.readFileSync(path.join(GAME, "common/defines/00_defines.txt"), "utf8");
  const out = [];
  for (const k of keys) {
    const m = txt.match(new RegExp("^\\s*(" + k + ")\\s*=\\s*([\\-\\d.]+)\\s*(?:#\\s*(.*))?$", "m"));
    if (m) out.push({ key: m[1], val: m[2], note: (m[3] || "").replace(/^Number of weeks.*$/i, "").trim() });
  }
  return out;
}
const MOVEMENT_DEFS = grabDefines([
  "MOVEMENT_WEEKLY_RADICALISM_CHANGE", "MOVEMENT_MONTHLY_RADICALS_THRESHOLD", "MOVEMENT_MONTHLY_RADICALS_SCALING_MIN", "MOVEMENT_MONTHLY_RADICALS_SCALING_MAX",
  "MOVEMENT_LOYALISTS_ON_APPROVED_ENACTMENT", "MOVEMENT_IMMEDIATE_RADICALISM_FROM_ENACTMENT", "MOVEMENT_IMMEDIATE_RADICALISM_FROM_CANCELLATION",
  "MOVEMENT_RADICALISM_FROM_ACTIVE_LAW_STANCE", "MOVEMENT_RADICALISM_FROM_ENACTED_LAW_STANCE", "MOVEMENT_RADICALISM_FROM_RADICAL_SUPPORTERS",
  "MOVEMENT_RADICALISM_FROM_LOYALIST_SUPPORTERS", "MOVEMENT_RADICALISM_FROM_SUPPRESSION", "MOVEMENT_RADICALISM_FROM_BOLSTERING",
]);
const IG_DEFS = grabDefines(["IG_APPROVAL_FROM_LOYALISTS", "IG_APPROVAL_FROM_RADICALS"]);
const REV_DEFS = grabDefines([
  "REVOLUTION_START_REBEL_IG_RADICALS_REDUCED_PERCENTAGE", "REVOLUTION_ENDED_RADICAL_BASE_REMOVAL_PERCENTAGE",
  "REVOLUTION_LOST_REBEL_IG_RADICALS_REDUCED_PERCENTAGE",
]);
// 中文注释（defines 官方注释是英文；常量含义用中文概括）
const DEF_ZH = {
  MOVEMENT_WEEKLY_RADICALISM_CHANGE: "运动激进度每周向目标值靠拢的比例",
  MOVEMENT_MONTHLY_RADICALS_THRESHOLD: "激进度超过该值后，支持者开始按月激进化的门槛",
  MOVEMENT_MONTHLY_RADICALS_SCALING_MIN: "月度激进化比例下限（占支持者）",
  MOVEMENT_MONTHLY_RADICALS_SCALING_MAX: "月度激进化比例上限",
  MOVEMENT_LOYALISTS_ON_APPROVED_ENACTMENT: "运动支持的立法通过时，支持者转为忠诚派的比例",
  MOVEMENT_IMMEDIATE_RADICALISM_FROM_ENACTMENT: "开始立法时立即施加的激进度冲击系数",
  MOVEMENT_IMMEDIATE_RADICALISM_FROM_CANCELLATION: "取消立法时的激进度冲击系数（负=降温）",
  MOVEMENT_RADICALISM_FROM_ACTIVE_LAW_STANCE: "对现行法律持正面立场的降温系数",
  MOVEMENT_RADICALISM_FROM_ENACTED_LAW_STANCE: "对已立法的立场降温系数",
  MOVEMENT_RADICALISM_FROM_RADICAL_SUPPORTERS: "支持者中激进派占比的升温系数",
  MOVEMENT_RADICALISM_FROM_LOYALIST_SUPPORTERS: "支持者中忠诚派占比的降温系数",
  MOVEMENT_RADICALISM_FROM_SUPPRESSION: "镇压运动的激进度影响（0＝镇压不直接产生激进度）",
  MOVEMENT_RADICALISM_FROM_BOLSTERING: "扶持运动的激进度影响",
  IG_APPROVAL_FROM_LOYALISTS: "利益集团政治力量 100% 为忠诚派时的支持度加成",
  IG_APPROVAL_FROM_RADICALS: "利益集团政治力量 100% 为激进派时的支持度惩罚",
  REVOLUTION_START_REBEL_IG_RADICALS_REDUCED_PERCENTAGE: "革命爆发时叛军利益集团内激进派的转化比例（转为叛军兵力）",
  REVOLUTION_ENDED_RADICAL_BASE_REMOVAL_PERCENTAGE: "革命/内战结束后全体 pop 移除激进派的基础比例（内战疲惫）",
  REVOLUTION_LOST_REBEL_IG_RADICALS_REDUCED_PERCENTAGE: "革命被镇压时，战败利益集团额外移除激进派的比例",
};

// ---------- 3) 压制手段：法律里影响激进派/激进度/动乱的 modifier ----------
const LAWS_ZH = loadLoc("laws_l_simp_chinese.yml");
const lawZh = (k) => LAWS_ZH.get(k) || k.replace(/^law_/, "").replace(/_/g, " ");
const SUPPRESS_LINES = []; // {law, group, mod, modZh, val}
{
  const dir = path.join(GAME, "common/laws");
  const RE = /(political_movement_radicalism_add|country_radicalism_increases_\w+_mult|state_radicals_and_loyalists_from_sol_change_mult|country_radicals_from_\w+_mult|turmoil_\w*)\s*=\s*(-?[\d.]+)/g;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    const txt = fs.readFileSync(path.join(dir, f), "utf8").replace(/^\uFEFF/, "");
    let m;
    const lawRe = /^\s*(law_\w+)\s*=\s*\{/gm;
    const laws = [];
    let lm;
    while ((lm = lawRe.exec(txt))) {
      const open = txt.indexOf("{", lm.index);
      let d = 0, end = open;
      for (let i = open; i < txt.length; i++) {
        if (txt[i] === "{") d++;
        else if (txt[i] === "}") { d--; if (d === 0) { end = i; break; } }
      }
      laws.push([lm[1], txt.slice(open, end)]);
      lawRe.lastIndex = end;
    }
    for (const [lk, block] of laws) {
      RE.lastIndex = 0;
      while ((m = RE.exec(block))) {
        const z = modZh(m[1]) || m[1];
        SUPPRESS_LINES.push({ law: lk, lawZh: lawZh(lk), mod: m[1], modZh: z, val: m[2] });
      }
    }
  }
}

// ---------- 4) 内战判定脚本（公开部分仅 tag 判定，革命进度机制为引擎内置） ----------
const CW_LINES = [];
{
  const txt = fs.readFileSync(path.join(GAME, "common/scripted_triggers/00_civil_war_triggers.txt"), "utf8").replace(/^\uFEFF/, "");
  const i = txt.search(/\bis_special_civil_war_tag\s*=\s*\{/);
  if (i >= 0) {
    const open = txt.indexOf("{", i);
    let d = 0, end = open;
    for (let j = open; j < txt.length; j++) {
      if (txt[j] === "{") d++;
      else if (txt[j] === "}") { d--; if (d === 0) { end = j; break; } }
    }
    CW_LINES.push({ name: "is_special_civil_war_tag", body: txt.slice(open + 1, end).trim() });
  }
}

// ---------- 渲染 ----------
const localCss = `
  .sec{margin:26px 0}
  .hint{font-size:13.5px;color:var(--ink-soft);background:var(--parchment-2);border:1px solid var(--line);border-radius:8px;padding:12px 16px;line-height:1.8}
  table.pl-table{width:100%;border-collapse:collapse;font-size:13.5px;margin:10px 0}
  table.pl-table th,table.pl-table td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
  table.pl-table th{background:var(--parchment-dark)}
  .num{font-weight:700;color:var(--gold-bright);white-space:nowrap}
  .en-key{color:var(--ink-soft);font-size:11.5px;font-family:"Times New Roman",serif;word-break:break-all}
  .neg{color:var(--red)} .pos{color:#3d6b34}
  pre.cw{background:var(--parchment);border:1px solid var(--line);border-radius:8px;padding:12px 14px;font-size:12px;overflow-x:auto;line-height:1.6}
  details.cw-fold{border:1px solid var(--line);border-radius:10px;background:var(--parchment-2);margin:10px 0;padding:0}
  details.cw-fold>summary{cursor:pointer;font-weight:600;padding:10px 14px}
`;
const valCls = (v) => (+v < 0 ? "neg" : "pos");
const defTable = (defs) => `<table class="pl-table"><thead><tr><th>常量</th><th>值</th><th>含义</th></tr></thead><tbody>${defs.map((d) => `<tr><td><span class="en-key">${esc(d.key)}</span></td><td class="num ${valCls(d.val)}">${esc(d.val)}</td><td>${esc(DEF_ZH[d.key] || d.note || "")}</td></tr>`).join("")}</tbody></table>`;

const srcRows = RADICAL_SOURCES.map((s) => {
  const zh = modZh(s.key) || s.key;
  return `<tr><td>${esc(zh)}</td><td><span class="en-key">${esc(s.key)}</span></td><td>${esc(s.why)}</td></tr>`;
}).join("");

const supRows = SUPPRESS_LINES.sort((a, b) => a.lawZh.localeCompare(b.lawZh, "zh-Hans")).map((s) =>
  `<tr><td><a href="laws.html#${esc(s.law)}">${esc(s.lawZh)}</a></td><td>${esc(s.modZh || s.mod)}</td><td class="num ${valCls(s.val)}">${esc(s.val)}</td></tr>`
).join("");

const html = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vicdata 人群政治 · 激进派与革命</title>
<style>${SHELL_CSS}
${localCss}</style>
</head>
<body>
<div class="wrap">
  ${pageShell({
    page: "politics",
    title: "Vicdata 人群政治",
    lede: "激进派从哪来、怎么压，政治运动何时激进化，革命/内战如何爆发与避免。机制数值全部取自游戏文件（modifier 定义 / defines 常量 / 法律效果 / 内战触发脚本），官方中文名经概念引用解引用；带「经验」标记的段落是攻略性概括，其余为数据。",
    back: { href: "index.html", label: "返回总览" },
  })}
  <a id="politics-top"></a>

  <div class="sec">
    <h2>激进派从哪来</h2>
    <p class="hint">游戏内每个来源都有对应的 modifier（加成/惩罚可叠乘），官方名称如下。核心记忆法：<b>预期落空产激进，预期兑现产忠诚</b>——生活水平涨了再跌、被歧视、被征服，都算落空。</p>
    <table class="pl-table"><thead><tr><th>来源（官方中文名）</th><th>modifier 键</th><th>触发场景</th></tr></thead><tbody>${srcRows}</tbody></table>
  </div>

  <div class="sec">
    <h2>怎么压：数值手段</h2>
    <p class="hint">四条路：<b>①法律压制</b>（下表，国内安全/治安类法律直接降低运动激进度或来源产出）；<b>②拉生活水平</b>（来源机制的逆运算，涨生活水平产忠诚派）；<b>③让运动赢</b>（其支持的立法通过时 25% 支持者转忠诚派，见下表常量）；<b>④镇压/扶持</b>（不直接改变激进度，但改变运动的政治力量——镇压不产生激进度是官方设定）。表中数值为游戏 modifier 原值（加算 add 为百分点小数、乘算 mult 为比例，正负号与游戏内一致）。</p>
    <table class="pl-table"><thead><tr><th>法律（点击跳转法律页）</th><th>效果（官方中文名）</th><th>数值</th></tr></thead><tbody>${supRows || '<tr><td colspan="3">未发现直接影响激进派的法律 modifier</td></tr>'}</tbody></table>
    <p class="hint">利益集团层面：政治力量全为忠诚派时支持度 +15，全为激进派时 −15（${IG_DEFS.map((d) => `${DEF_ZH[d.key]}=<b class="num ${valCls(d.val)}">${d.val}</b>`).join("、")}）。</p>
  </div>

  <div class="sec">
    <h2>政治运动：激进化数值表</h2>
    <p class="hint">政治运动是激进派的放大器：运动激进度每周向目标值靠拢，超过 <b>0.5</b> 后支持者按月激进化（每月 0.5%～2.5%）。立法是最强的激进度操纵杆——开始立法立即施加 50% 目标冲击，取消则 −50% 降温；立法通过则四分之一支持者直接转忠诚派。</p>
    ${defTable(MOVEMENT_DEFS)}
  </div>

  <div class="sec">
    <h2>革命与内战</h2>
    <p class="hint"><b>（经验）链条</b>：激进派积累 → 加入利益集团/政治运动 → 运动激进化 → 爆发革命或内战。革命爆发时叛军集团内的激进派按 ${REV_DEFS[0]?.val ?? "1.0"} 比例转为叛军兵力；结束后全体 pop 移除 ${REV_DEFS[1] ? (+REV_DEFS[1].val * 100).toFixed(0) : "50"}% 激进派（内战疲惫）；被镇压时战败集团再额外移除 25%。<b>避免的关键</b>：在革命进度条涨满前让运动降温（通过其支持的立法/提升生活水平/降低歧视），或直接镇压运动本身（镇压不增加激进度）。革命进度的涨速公式为引擎内置，游戏文件只公开以下常量与 tag 判定。</p>
    ${defTable(REV_DEFS)}
    ${CW_LINES.map((c) => `<details class="cw-fold"><summary>公开脚本：${esc(c.name)}（原文）</summary><pre class="cw">${esc(c.body)}</pre></details>`).join("")}
  </div>

  <div class="sec">
    <h2>速查：激进派管理清单</h2>
    <p class="hint"><b>（经验）</b>开局常见的激进派爆点：①税率拉满＋消费品不足（生活水平跌）；②歧视性公民权（多民族国家尤其大清/俄罗斯/奥斯曼）；③征服后的新州未消化；④立法反复横跳（运动激进度 ±50% 冲击）。对应解法在上一节四条路里都有数值支撑。深入的法律支持度/意识形态倾向请查 <a href="laws.html">法律指南</a> 与 <a href="ideologies.html">意识形态清单</a>。</p>
  </div>
</div>
<script>
(function () {
  // 哈希直达：#law_xxx 无处理需求（本页无状态）
})();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, "politics.html"), html);

// 自检：来源 modifier 必须全部有官方中文名；法律表非空；常量表抓全
{
  const missSrc = RADICAL_SOURCES.filter((s) => !modZh(s.key));
  if (missSrc.length) throw new Error("激进派来源 modifier 缺官方中文名：" + missSrc.map((s) => s.key).join(","));
  if (MOVEMENT_DEFS.length < 10) throw new Error("运动常量抓取不足：" + MOVEMENT_DEFS.length);
  if (!SUPPRESS_LINES.length) throw new Error("未从法律文件抓到任何压制手段行");
  const missZh = SUPPRESS_LINES.filter((s) => !s.modZh);
  if (missZh.length) throw new Error("压制手段 modifier 缺中文名 " + missZh.length + " 条：" + [...new Set(missZh.map((s) => s.mod))].slice(0, 3).join(","));
  const dirtyZh = [...RADICAL_SOURCES.map((s) => modZh(s.key)), ...SUPPRESS_LINES.map((s) => s.modZh)].filter((z) => z.includes("$") || z.includes("["));
  if (dirtyZh.length) throw new Error("本地化引用未解引用：" + dirtyZh.slice(0, 3).join(" / "));
}
// 产物自检：内联脚本必须通过 JS 编译（模板字面量会折叠正则反斜杠，曾产出非法正则致整脚本不执行）
{
  const vm = await import("node:vm");
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (e) { throw new Error("内联脚本编译失败: " + e.message); }
  }
}
console.log(`politics.html（人群政治专题）生成完毕: ${(fs.statSync(path.join(ROOT, "politics.html")).size / 1024).toFixed(0)} KB | 来源 ${RADICAL_SOURCES.length} · 压制手段 ${SUPPRESS_LINES.length} 行 · 运动常量 ${MOVEMENT_DEFS.length} · 革命常量 ${REV_DEFS.length} · 内战脚本 ${CW_LINES.length}`);
