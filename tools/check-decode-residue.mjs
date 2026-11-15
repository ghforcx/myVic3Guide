// 解码残留守卫：检查生成的页面里没有维基模板解码残渣。
// 拦截模式（均为 wikiToHtml 清理不彻底的已知形态）：
//   - collapse list 参数残留：行首/行内的 type=、body=（如 "type=✓ …:body="）
//   - 文件图标链接残段：pxlink=（如 "*24pxlink=Rank Rank is Great Power"）
//   - 未闭合模板/链接残留：{{ }} [[ ]] 成对符号本体
// 用法：node tools/check-decode-residue.mjs    退出码 0=通过，1=有违规
// 挂载：lefthook.yml pre-commit
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PATTERNS = [
  { re: /(^|>)\s*type=[^\n<]{0,40}/, desc: "collapse list 的 type= 参数残留" },
  { re: /body=/, desc: "collapse list 的 body= 参数残留" },
  { re: /\d+pxlink=/, desc: "[[File:…]] 图标链接残段（pxlink=）" },
  { re: /\{\{|\[\[/, desc: "未清理的维基模板/链接符号" },
];
// 注：不检 }} —— laws 等页的 meta 段展示原始 PDX 脚本，嵌套闭括号是合法内容

const violations = [];
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith(".html")) continue;
  const html = fs.readFileSync(path.join(ROOT, f), "utf8");
  // 解码文本住在 meta 段落里；只扫这些段落，避免误伤 <script>/样式/原始脚本展示区；
  // 无 meta 段落的页面（如计算器的 JSON 数据）不含维基解码文本，跳过
  const paras = html.match(/<p class="meta">[\s\S]*?<\/p>/g);
  if (!paras) continue;
  for (const { re, desc } of PATTERNS) {
    const hits = [];
    for (const p of paras) hits.push(...(p.match(new RegExp(re.source, "g")) || []));
    if (hits.length) {
      violations.push(`${f}：${desc}（${hits.length} 处，如 ${JSON.stringify(hits[0].slice(0, 60))}）`);
    }
  }
}

if (violations.length) {
  console.error("解码残留守卫未通过：");
  for (const v of violations) console.error("  - " + v);
  process.exit(1);
}
console.log("解码残留守卫通过：全部页面无维基模板解码残渣。");
