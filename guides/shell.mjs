// Vicdata 指南站共享页面壳：头部（标题+参考资料导航）+ 页签栏 + 公共样式
// 用法：pageShell({ title, lede, active, counts, extraCss, backLink })
// 保证 index / laws / 未来新增页面 UI 一致；页签栏与计数由这里统一维护。
const REFS = `<nav class="refs"><span class="refs-label">参考资料：</span><a href="https://vic3.paradoxwikis.com/Victoria_3_Wiki" target="_blank" rel="noopener">Victoria 3 Wiki</a><a href="https://vic3.parawikis.com/wiki/%E9%A6%96%E9%A1%B5" target="_blank" rel="noopener">Parawikis</a><a href="https://forum.paradoxplaza.com/forum/forums/victoria-3.1095/" target="_blank" rel="noopener">官方论坛</a><a href="https://space.bilibili.com/3546875974126422" target="_blank" rel="noopener">B站官方账号</a></nav>`;

// 页签定义：key / 标签 / 链接（同页锚点 #xxx 或跨页 xxx.html）/ 计数取值函数
const TAB_DEFS = [
  { key: "achievements", label: "成就指南", href: (c) => (c.page === "index" ? "#achievements" : "index.html#achievements") },
  { key: "laws", label: "法律指南", href: (c) => (c.page === "laws" ? "#laws-top" : "laws.html") },
  { key: "ideologies", label: "意识形态", href: (c) => (String(c.page).startsWith("ideologies") ? "#ideologies-top" : "ideologies.html") },
  { key: "states", label: "州名", href: (c) => (String(c.page).startsWith("states") ? "#states-top" : "states.html") },
  { key: "politics", label: "人群政治", href: (c) => (String(c.page).startsWith("politics") ? "#politics-top" : "politics.html") },
  { key: "companies", label: "公司经营", href: (c) => (c.page === "index" ? "#companies" : "index.html#companies") },
  { key: "tech", label: "科技", href: (c) => (c.page === "index" ? "#tech" : "index.html#tech") },
  { key: "buildings", label: "建筑", href: (c) => (c.page === "calculator" ? "#calculator-top" : "calculator.html") },
  { key: "events", label: "事件", href: (c) => (c.page === "index" ? "#events" : "index.html#events") },
  { key: "calculator", label: "计算器", href: (c) => (String(c.page).startsWith("calculator") ? "#calculator-top" : "calculator.html") },
];

const SHELL_CSS = `
  :root{--parchment:#f0e4c8;--parchment-2:#f7eed9;--parchment-dark:#e6d5ae;--ink:#3b2f1e;--ink-soft:#6b5a3e;--gold:#8a6d3b;--gold-bright:#b8933f;--red:#8c3b2e;--line:#c9b48a;}
  *{box-sizing:border-box}
  body{margin:0;color:var(--ink);font-family:"Times New Roman","Source Han Serif SC","Noto Serif CJK SC","思源宋体","Songti SC",serif;
    background:radial-gradient(ellipse 120% 90% at 50% 0%, rgba(255,250,235,.75), rgba(240,228,200,0) 60%),
      repeating-linear-gradient(0deg, rgba(160,130,90,.045) 0 2px, rgba(160,130,90,0) 2px 4px), var(--parchment);}
  .wrap{max-width:1080px;margin:0 auto;padding:26px 18px 80px}
  .wrap-wide{max-width:1240px}
  header.top{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;border-bottom:3px double var(--gold);padding-bottom:14px;margin-bottom:8px}
  header.top h1{margin:0;font-size:30px;letter-spacing:2px}
  .top-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;flex:1}
  .refs{font-size:12px;color:var(--ink-soft);display:flex;gap:8px;flex-wrap:wrap;align-items:center;max-width:460px;justify-content:flex-end}
  .refs a{color:var(--gold);text-decoration:none;border-bottom:1px dashed var(--line);white-space:nowrap}
  .refs .refs-label{white-space:nowrap}
  header.top .back{margin-left:auto;font-size:14px;color:var(--gold);text-decoration:none;border:1px solid var(--line);border-radius:6px;padding:5px 12px;background:var(--parchment-2);align-self:center}
  header.top .back:hover{background:var(--parchment-dark)}
  .lede{color:var(--ink-soft);margin:10px 0 0;font-size:14.5px}
  nav.tabs{position:sticky;top:0;z-index:9;display:flex;gap:10px;flex-wrap:wrap;padding:10px 2px;background:linear-gradient(var(--parchment) 82%, rgba(240,228,200,0));}
  nav.tabs a{color:var(--ink);text-decoration:none;border:1px solid var(--gold);border-radius:999px;padding:6px 18px;background:var(--parchment-2);font-weight:600}
  nav.tabs a:hover{background:var(--parchment-dark)}
  nav.tabs a.is-active{background:var(--gold);color:#fff;border-color:var(--gold)}
  nav.tabs a.is-here{background:linear-gradient(90deg, var(--gold), var(--gold-bright));color:#fff;border-color:var(--gold)}
`;

/**
 * 生成页面头部 + 页签栏 HTML
 * @param {object} opts
 *  - page: "index" | "laws" | 其它新页面 key
 *  - title: h1 文本
 *  - lede: 页面简介（可空字符串）
 *  - counts: { achievements, laws, ideologies, companies, tech, buildings, events } 页签计数
 *  - back: { href, label } 返回按钮（可空）
 *  - wide: true 时 wrap 用 1240px 宽版（laws 布局需要）
 */
export function pageShell(opts) {
  const { page, title, lede = "", counts = {}, back = null, wide = false } = opts;
  const tabs = TAB_DEFS.map(t => {
    const n = counts[t.key];
    const label = t.label + (n === undefined ? "" : "（" + n + "）");
    const href = t.href({ page });
    const here = t.key === page || (t.key === "ideologies" && String(page).startsWith("ideologies"));
    const cls = here ? (page === "index" ? "tablink is-active" : "tablink-ext is-here") : "tablink-ext";
    return `<a href="${href}" class="${cls}"${here && page !== "index" ? ' aria-current="page"' : ""}>${label}</a>`;
  }).join("\n    ");
  return `<header class="top">
    <div class="top-row">
      <h1>${title}</h1>
      ${REFS}
    </div>
    ${back ? `<a class="back" href="${back.href}">${back.label}</a>` : ""}
    ${lede ? `<p class="lede">${lede}</p>` : ""}
  </header>
  <nav class="tabs">
    ${tabs}
  </nav>`;
}

export { SHELL_CSS };
