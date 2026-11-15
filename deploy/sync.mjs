// 同步 vic3db → Cloudflare 部署目录（wrangler assets 的 site 目录）
// 用法: node deploy/sync.mjs <目标目录>   （默认 ../site）
// 排除规则：本地专用文件（启动脚本/说明/工具/更新脚本）、超大备份 PNG（>25MiB）、旧版本数据、git 文件。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEST = path.resolve(process.argv[2] || path.join(import.meta.dirname, "../../site"));

const EXCLUDE_FILES = new Set([
  "assets/map/flatmap__2.original.png", // 40.7MB 本地备份，超 CF 25MiB 单文件上限
  "assets/map/flatmap__2.png",          // 39.8MB 遗留文件，未引用
  "serve.mjs",                          // 本地服务器
  "update.mjs",                         // 本地更新脚本
  "启动本地资料库.bat",
  "使用说明.html",
  ".gitignore",
]);
const EXCLUDE_DIRS = new Set(["tools", "deploy", ".git", ".github", "skills"]);

function excluded(rel) {
  const norm = rel.split(path.sep).join("/");
  if (EXCLUDE_FILES.has(norm)) return true;
  for (const d of EXCLUDE_DIRS) if (norm === d || norm.startsWith(d + "/")) return true;
  return false;
}

fs.mkdirSync(DEST, { recursive: true });
let copied = 0, skipped = 0;
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const relPath = rel ? rel + "/" + e.name : e.name;
    if (excluded(relPath)) { skipped++; continue; }
    const destAbs = path.join(DEST, relPath);
    if (e.isDirectory()) { fs.mkdirSync(destAbs, { recursive: true }); walk(abs, relPath); }
    else { fs.copyFileSync(abs, destAbs); copied++; }
  }
})(ROOT, "");

console.log(`同步完成: 复制 ${copied} 个文件, 跳过 ${skipped} 个排除项 → ${DEST}`);
