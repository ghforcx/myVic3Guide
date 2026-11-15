// 地区列表排版守卫：条件清单里的地区名必须行内「、」排列，禁止逐行竖排换行填充。
// 词表来自游戏本地化直读（map/states_l + dynamic_state 名 + geographic_regions_l + map/strategic_regions_l，
// 中英并收）；镜像 locale-regions 已停用——真相源=本地游戏文件，见 AGENTS.md。
// 只认 ≥3 个连续地区名分段才算竖排清单。
// 用法：node tools/check-region-lists.mjs    退出码 0=通过，1=有违规
// 挂载：lefthook.yml pre-commit
import fs from "node:fs";
import path from "node:path";
import { GAME, read } from "../guides/game-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

// CI 环境无本地游戏文件：词表无法构建，此守卫优雅跳过（本地 pre-commit 仍全量执行）
if (!fs.existsSync(path.join(GAME, "localization"))) {
  console.log("地区列表排版守卫：本机无游戏文件（CI 环境），跳过——词表校验依赖本地游戏目录，见 AGENTS.md 真相层级");
  process.exit(0);
}

function locFileMap(lang, file) {
  const map = new Map();
  const p = path.join(GAME, "localization", lang, file);
  if (!fs.existsSync(p)) return map;
  for (const line of read(p).split("\n")) {
    const m = line.match(/^\s*([\w.]+):\s*\d*\s*"([^"]*)"/);
    if (m && m[2] && !map.has(m[1])) map.set(m[1], m[2]);
  }
  return map;
}
const names = new Set();
for (const lang of ["simp_chinese", "english"]) {
  for (const file of [
    path.join("map", `states_l_${lang}.yml`),
    `dynamic_state_and_hub_names_l_${lang}.yml`,
    `geographic_regions_l_${lang}.yml`,
    path.join("map", `strategic_regions_l_${lang}.yml`),
  ]) {
    for (const v of locFileMap(lang, file).values()) names.add(String(v).trim());
  }
}
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();
const NAMES = new Set([...names].map(norm));
if (NAMES.size < 100) {
  console.error(`地区列表守卫：词表异常（仅 ${NAMES.size} 个），疑似游戏本地化读取失败`);
  process.exit(1);
}

const strip = (seg) => norm(seg.replace(/<[^>]+>/g, "").replace(/\*/g, "").replace(/\{\{|\}\}/g, "").replace(/\|/g, ""));

const violations = [];
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith(".html")) continue;
  const html = fs.readFileSync(path.join(ROOT, f), "utf8");
  const paras = html.match(/<p class="meta">[\s\S]*?<\/p>/g) || [];
  for (const p of paras) {
    const segs = p.split(/<br\s*\/?>/i);
    let run = [];
    const flush = () => {
      if (run.length >= 3) {
        violations.push(`${f}：meta 段中 ${run.length} 个地区名逐行竖排（${run.slice(0, 3).join("、")}…），应合并为「、」行内排列`);
      }
      run = [];
    };
    for (const seg of segs) {
      const s = strip(seg);
      if (s && NAMES.has(s)) run.push(s);
      else flush();
    }
    flush();
  }
}

if (violations.length) {
  console.error("地区列表排版守卫未通过：");
  for (const v of violations) console.error("  - " + v);
  process.exit(1);
}
console.log(`地区列表排版守卫通过：词表 ${NAMES.size} 个地区名（游戏文件直读），全部页面无竖排地区清单。`);
