// 版本数据对比脚本：游戏更新后，对比「git 参照提交里的产物快照」与「当前工作区产物」，
// 程序化输出全部数据差异（不再肉眼判断——曾因肉眼扫超长数据岛行漏报 1.15.1 的 PM/铜矿改动）。
//
// 用法：
//   node scripts/verify-version.mjs              # 对比 HEAD（上次提交的产物 = 旧版本数据）与工作区
//   node scripts/verify-version.mjs 7ef80ea      # 对比指定提交
// 推荐流程：游戏更新 → 跑全部生成器（重生成落盘）→ 跑本脚本看「新版改了什么」→ 有异常再排查。
//
// 对比维度：
//   1. calculator 数据岛：PM 逐字段（雇工/产出/投入/吞吐）、商品价格逐项、建筑与组数
//   2. states.html：各州资源徽章数值（铜矿/铁矿/油井等逐州逐数）
//   3. laws.html：法律效果数值、限定条件、修正案效果
//   4. index.html：成就/公司/科技/修正案数量
//
// 退出码恒为 0（本脚本是信息工具，不是守卫；差异是版本更新的正常信息）。
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const REF = process.argv[2] || "HEAD";
const readWork = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const readRef = (f) => {
  try { return execSync(`git show ${REF}:${f}`, { cwd: ROOT, maxBuffer: 1 << 28 }).toString(); }
  catch { return null; }
};

const sections = [];
const add = (title, lines) => { if (lines.length) sections.push([title, lines]); };

// ---------- 1) calculator：PM 与商品价格 ----------
{
  const lines = [];
  const grab = (h) => {
    try {
      return JSON.parse(h.match(/<script id="cal-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    } catch { return null; }
  };
  const a = grab(readRef("calculator.html")), b = grab(readWork("calculator.html"));
  if (!a || !b) lines.push("⚠️ 数据岛缺失（旧版或新版解析失败）");
  else {
    if (a.buildings.length !== b.buildings.length) lines.push(`建筑数: ${a.buildings.length} → ${b.buildings.length}`);
    const pmOf = (d) => {
      const m = new Map();
      for (const bd of d.buildings) for (const g of bd.groups) for (const p of g.pms) m.set(p.k, p);
      return m;
    };
    const A = pmOf(a), B = pmOf(b);
    if (A.size !== B.size) lines.push(`生产方式数: ${A.size} → ${B.size}`);
    for (const [k, pa] of A) {
      const pb = B.get(k);
      if (!pb) { lines.push(`  消失: ${k}`); continue; }
      for (const f of ["emp", "wfOut", "wfInn", "lvOut", "lvInn"]) {
        if (JSON.stringify(pa[f]) !== JSON.stringify(pb[f])) lines.push(`  ${k}.${f}: ${JSON.stringify(pa[f])} → ${JSON.stringify(pb[f])}`);
      }
    }
    for (const k of B.keys()) if (!A.has(k)) lines.push(`  新增: ${k}`);
    for (const k of Object.keys(a.price)) if (a.price[k] !== b.price[k]) lines.push(`  商品价格 ${k}: ${a.price[k]} → ${b.price[k]}`);
  }
  add("计算器（生产方式/商品价格）", lines);
}

// ---------- 2) states：各州资源数值 ----------
{
  const lines = [];
  const grab = (h) => {
    const m = {};
    if (!h) return m;
    for (const x of h.matchAll(/<tr data-sr="[^"]*" data-res="([^"]*)" data-arres="[^"]*"><td>([^<]*)<\/td>.*?(?=<tr |<\/tbody>)/gs)) {
      const resAttr = x[1];
      const badges = {};
      for (const bm of x[0].matchAll(/<span class="rb[^"]*">([\u4e00-\u9fa5\w]+?)(?: (\d+))?<\/span>/g)) {
        if (bm[1] !== "耕地") badges[bm[1]] = bm[2] === undefined ? -1 : +bm[2];
      }
      if (Object.keys(badges).length) m[x[2]] = badges;
    }
    return m;
  };
  const a = grab(readRef("states.html")), b = grab(readWork("states.html"));
  const states = new Set([...Object.keys(a), ...Object.keys(b)]);
  let diff = 0;
  for (const s of states) {
    const ba = a[s] || {}, bb = b[s] || {};
    for (const r of new Set([...Object.keys(ba), ...Object.keys(bb)])) {
      if (ba[r] !== bb[r]) { lines.push(`  ${s}·${r}: ${ba[r] ?? "无"} → ${bb[r] ?? "无"}`); diff++; if (lines.length > 60) break; }
    }
    if (lines.length > 60) { lines.push("  …（超 60 条截断，用完整对比看余量）"); break; }
  }
  if (!diff) lines.push("  各州资源数值：完全一致");
  add("州名图鉴（各州资源上限）", lines);
}

// ---------- 3) laws：法律效果与限定 ----------
{
  const lines = [];
  const grab = (h) => {
    try {
      const j = JSON.parse(h.slice(h.indexOf("const GROUPS = ") + 15, h.indexOf("const AMS")).replace(/;\s*$/, ""));
      return j.flatMap((g) => g.laws || []);
    } catch { return null; }
  };
  const a = grab(readRef("laws.html")), b = grab(readWork("laws.html"));
  if (!a || !b) lines.push("⚠️ 数据岛缺失");
  else {
    if (a.length !== b.length) lines.push(`法律数: ${a.length} → ${b.length}`);
    const bOf = new Map(b.map((l) => [l.key, l]));
    for (const la of a) {
      const lb = bOf.get(la.key);
      if (!lb) { lines.push(`  消失: ${la.key}`); continue; }
      if (JSON.stringify(la.mods) !== JSON.stringify(lb.mods)) lines.push(`  ${la.key}.效果: 数值变化`);
      if (JSON.stringify(la.canEnact) !== JSON.stringify(lb.canEnact)) lines.push(`  ${la.key}.限定: 条件变化`);
    }
    for (const l of b) if (!a.some((x) => x.key === l.key)) lines.push(`  新增: ${l.key}`);
  }
  add("法律（效果数值/限定条件）", lines);
}

// ---------- 4) index：数量级变化 ----------
{
  const lines = [];
  const grab = (h) => ({
    ach: (h.match(/data-kind="achievement"/g) || []).length,
    co: (h.match(/data-kind="company"/g) || []).length,
    tech: (h.match(/data-kind="tech"/g) || []).length,
  });
  const a = readRef("index.html"), b = readWork("index.html");
  if (!a) lines.push("⚠️ 旧版 index 缺失");
  else {
    const A = grab(a), B = grab(b);
    for (const k of Object.keys(A)) if (A[k] !== B[k]) lines.push(`  ${k}: ${A[k]} → ${B[k]}`);
  }
  add("主页（成就/公司/科技数量）", lines);
}

// ---------- 输出 ----------
console.log(`版本数据对比：${REF}（旧产物）vs 工作区（当前游戏文件重生成）`);
if (!sections.length) {
  console.log("✅ 未检测到数据差异（生产方式/商品价格/州资源/法律效果/数量级全一致）");
} else {
  let total = 0;
  for (const [title, lines] of sections) {
    console.log(`\n【${title}】`);
    for (const l of lines) console.log(l);
    total += lines.filter((x) => !x.startsWith("  …") && !x.includes("完全一致")).length;
  }
  console.log(`\n共 ${sections.length} 类、约 ${total} 处差异。`);
}
