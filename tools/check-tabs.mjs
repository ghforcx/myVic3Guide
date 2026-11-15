// 页签注册守卫（借鉴 deepseek-harness 的样式契约测试模式）：
//   规则1：TAB_DEFS 里声明的跨页目标（xxx.html）必须存在，或在豁免清单里说明原因
//   规则2：根目录的页面 html 必须已注册进 TAB_DEFS（index.html 除外），或在豁免清单里说明原因
// 用法：node tools/check-tabs.mjs    退出码 0=通过，1=有违规
// 新增页面流程：guides/shell.mjs 的 TAB_DEFS 加条目 → 页面套 pageShell() → 跑本守卫 → 提交
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const shellSrc = fs.readFileSync(path.join(ROOT, "guides/shell.mjs"), "utf8");
const exempt = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/tab-exceptions.json"), "utf8"));
const exemptMissing = exempt.missingTargets || {};
const exemptUnregistered = exempt.unregisteredPages || {};

// 只取 TAB_DEFS 数组字面量区间，避免误抓文件里其它 .html 字符串
const start = shellSrc.indexOf("const TAB_DEFS");
const end = shellSrc.indexOf("];", start);
const block = shellSrc.slice(start, end);
const keys = [...block.matchAll(/key: "([a-z-]+)"/g)].map((m) => m[1]);
const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
// 跨页目标：形如 "xxx.html" 的完整字符串（带 # 锚点的 index.html#xxx 不算独立目标）
const targets = [...new Set([...block.matchAll(/"([a-z][a-z0-9-]*)\.html"/g)].map((m) => m[1] + ".html"))];
const registered = new Set([...targets, "index.html"]);

const violations = [];
for (const t of targets) {
  if (!fs.existsSync(path.join(ROOT, t)) && !(t in exemptMissing)) {
    violations.push(`页签目标 ${t} 不存在（TAB_DEFS 声明了它，但文件缺失；若属有意等待，请在 tools/tab-exceptions.json 的 missingTargets 里注明原因）`);
  }
}
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith(".html") || f in exemptUnregistered) continue;
  if (!registered.has(f)) {
    violations.push(`页面 ${f} 未注册进 TAB_DEFS（新页面应加入 guides/shell.mjs 页签；若确属页签体系之外，请在 tools/tab-exceptions.json 的 unregisteredPages 里注明原因）`);
  }
}

const exemptStale = Object.keys(exemptMissing).filter((f) => fs.existsSync(path.join(ROOT, f)));
for (const f of exemptStale) {
  violations.push(`豁免过期：missingTargets 里的 ${f} 已经存在，请删除该豁免`);
}

// 页签完整性：凡渲染 nav.tabs 的页面必须包含全部 TAB_DEFS 标签（计数后缀忽略）；缺口需在 navGaps 豁免并注明
const navGaps = exempt.navGaps || {};
const bare = (label) => label.replace(/（[^）]*）$/, "");
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith(".html")) continue;
  const html = fs.readFileSync(path.join(ROOT, f), "utf8");
  const nav = (html.match(/<nav class="tabs">[\s\S]*?<\/nav>/) || [])[0];
  if (!nav) continue;
  const allowed = new Set(navGaps[f] || []);
  for (const label of labels) {
    if (allowed.has(label)) continue;
    if (!nav.includes(bare(label))) {
      violations.push(`${f}：tabs 导航缺少「${label}」页签（在 shell.mjs TAB_DEFS 注册后，页面生成源需同步渲染；确属暂缓接入的在 tab-exceptions.json navGaps 注明）`);
    }
  }
  // 页签锚点有效性：nav.tabs 里的纯锚点必须指向本页存在的 id（曾因 laws 页签在跨页输出纯锚点，意识形态页点击无跳转）
  for (const m of nav.matchAll(/<a href="#([^"]+)"[^>]*>/g)) {
    if (!html.includes(`id="${m[1]}"`)) {
      violations.push(`${f}：页签锚点 #${m[1]} 在本页无对应目标（跨页跳转应写 xxx.html 或 xxx.html#xxx，纯锚点只用于本页定位）`);
    }
  }
}

if (violations.length) {
  console.error("页签注册守卫未通过：");
  for (const v of violations) console.error("  - " + v);
  process.exit(1);
}
console.log(`页签注册守卫通过：${keys.length} 个页签（${keys.join("、")}），${targets.length} 个跨页目标，豁免 ${Object.keys(exemptMissing).length + Object.keys(exemptUnregistered).length} 项均有效。`);
