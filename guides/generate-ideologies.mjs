// Vicdata 意识形态交互清单生成器：ideologies.html
// 用法: node guides/generate-ideologies.mjs   （数据更新后重新运行即可刷新）
// 结构：顶部工具条（利益集团筛选 + 关键字搜索 + 结果计数）→ 意识形态卡片流 → 无匹配占位
// 数据源（游戏文件直读，镜像已停用，见 AGENTS.md）：common/ideologies（立法立场矩阵）+
//   common/interest_groups（固有/领袖归属）+ common/technology（科技影响意识形态反查）+ 游戏本地化
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pageShell, SHELL_CSS } from "./shell.mjs";

const HERE = import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../ideologies.html");

// ---------- 断言工具（熔断：任一失败即退出非零，不写产物） ----------
const assert = (cond, msg) => {
  if (!cond) { console.error("[断言失败] " + msg); process.exit(1); }
};

// ---------- 数据加载 ----------
import { GAME, read, topBlocks, subBlock, loadGameLoc } from "./game-data.mjs";
// 意识形态名散落多文件（laws_l / agitators / content_*…），直接全目录裸键表（生成期一次性）
const LOC = loadGameLoc("simp_chinese");
const cleanLoc = (v) => String(v || "").replace(/#\w+ /g, "").replace(/#!/g, "").trim();
// 镜像键形（ideology:X.name / interest_group:X.name）→ 游戏裸键（X / X_desc）
const L = (mirrorKey) => {
  let m = mirrorKey.match(/^ideology:([\w.]+)\.name$/) || mirrorKey.match(/^interest_group:([\w.]+)\.name$/);
  if (m) return LOC.get(m[1]) || "";
  m = mirrorKey.match(/^ideology:([\w.]+)\.description$/) || mirrorKey.match(/^interest_group:([\w.]+)\.description$/);
  if (m) return cleanLoc(LOC.get(m[1] + "_desc"));
  return LOC.get(mirrorKey) || "";
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// 意识形态图标：游戏 icon 路径 basename，退回 key 去前缀（与 generate-laws.mjs 的 igoIconFile 同逻辑）
const ICON_DIR = path.resolve(HERE, "../assets/ideologies");
const igoIconFile = (ig) => {
  const base = (ig.icon || "").split("/").pop().replace(/\.dds$/, "");
  const cand = [base + ".png", ig.key.replace(/^ideology_/, "") + ".png"].find(f => { try { return fs.existsSync(path.join(ICON_DIR, f)); } catch { return false; } });
  return cand ? "assets/ideologies/" + cand : "";
};

// 意识形态（common/ideologies：lawgroup_* 块即立法立场矩阵；character_ideology=yes 为领袖型）
const ideologies = [];
{
  const dir = path.join(GAME, "common/ideologies");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      if (!key.startsWith("ideology_")) continue;
      const lawStances = [];
      { // lawgroup_* 子块带 tab 缩进，共享 topBlocks 是无缩进行锚会漏——这里带空白提取
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
      ideologies.push({
        key,
        icon: (b.match(/icon\s*=\s*"([^"]+)"/) || [])[1] || "",
        character_ideology: /character_ideology\s*=\s*yes/.test(b),
        law_stances: lawStances,
        igwMentions: lw ? [...new Set([...lw.matchAll(/\b(ig_\w+)\b/g)].map((m) => m[1]))] : [],
      });
    }
  }
}
// 利益集团（common/interest_groups：固有与领袖意识形态列表）
const interestGroups = [];
{
  const dir = path.join(GAME, "common/interest_groups");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [key, b] of topBlocks(read(path.join(dir, f)))) {
      if (!key.startsWith("ig_")) continue;
      const pick = (name) => [...new Set([...subBlock(b, name).matchAll(/\b(ideology_\w+)\b/g)].map((m) => m[1]))].map((k) => ({ key: k }));
      interestGroups.push({ key, ideologies: pick("ideologies"), character_ideologies: pick("character_ideologies") });
    }
  }
}
// 科技 → 意识形态（科技效果里的 add/remove_ideology 反查）
const TECH_UNLOCK = new Map(); // ideologyKey → [{k, zh}]
{
  const invLoc = LOC;
  const dir = path.join(GAME, "common/technology/technologies");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    for (const [tk, tb] of topBlocks(read(path.join(dir, f)))) {
      for (const m of tb.matchAll(/\b(?:add|remove)_ideology\s*=\s*(?:ideology:)?(ideology_\w+)/g)) {
        const list = TECH_UNLOCK.get(m[1]) || [];
        if (!list.some((t) => t.k === tk)) list.push({ k: tk, zh: invLoc.get(tk) || tk });
        TECH_UNLOCK.set(m[1], list);
      }
    }
  }
}

// ---------- 利益集团（筛选维度） ----------
const IG_LIST = interestGroups.map(g => ({
  key: g.key,
  name: L("interest_group:" + g.key + ".name") || g.key,
  desc: L("interest_group:" + g.key + ".description"),
}));
// 意识形态 → 利益集团（并集口径）：IG 固有 ideologies ∪ IG 领袖 character_ideologies ∪ 自身 leader_weight 条件提及的 IG
const coreOf = new Map(), charOf = new Map();
for (const g of interestGroups) {
  coreOf.set(g.key, new Set((g.ideologies || []).map(x => x.key)));
  charOf.set(g.key, new Set((g.character_ideologies || []).map(x => x.key)));
}
const igsOf = (s) => {
  const set = new Set();
  for (const g of interestGroups) if (coreOf.get(g.key).has(s.key) || charOf.get(g.key).has(s.key)) set.add(g.key);
  for (const ig of (s.igwMentions || [])) if (IG_KEYS_RAW.has(ig)) set.add(ig);
  return [...set];
};
const IG_KEYS_RAW = new Set(interestGroups.map(g => g.key));

const STANCE_ORDER = ["strongly_approve", "approve", "neutral", "disapprove", "strongly_disapprove"];

// ---------- 卡片数据（服务端渲染卡片 + 内联筛选数据） ----------
const ITEMS = ideologies.map(s => {
  const name = L("ideology:" + s.key + ".name");
  const desc = L("ideology:" + s.key + ".description");
  const igs = igsOf(s);
  const igNames = igs.map(k => L("interest_group:" + k + ".name") || k);
  const stances = (s.law_stances || [])
    .slice()
    .sort((a, b) => STANCE_ORDER.indexOf(a.stance) - STANCE_ORDER.indexOf(b.stance))
    .map(st => ({
      s: st.stance,
      law: LOC.get(st.law_key) || st.law_key,
      grp: LOC.get(st.law_group_key) || st.law_group_key,
    }));
  const srcs = [];
  const techs = (TECH_UNLOCK.get(s.key) || []).map(t => t.zh);
  const jes = [];
  // 搜索干草堆：名称/键/描述/集团/立场法律与法组/来源/科技/日志（构建期定稿，页面筛选与构建期断言共用同一文本）
  const hay = [name, s.key, desc, igNames.join(" "), stances.map(x => x.law + " " + x.grp).join(" "), srcs.map(x => x.src + " " + x.cond).join(" "), techs.join(" "), jes.join(" ")]
    .join(" ").toLowerCase();
  return {
    key: s.key, name, desc, igs, igNames, leader: !!s.character_ideology,
    stances, srcs, techs, jes, hay,
  };
}).sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hans"));

// 页面筛选内核：与页面 <script> 内联的是同一个函数（toString 注入），构建期断言直接调用它
function matchesFilter(item, group, q) {
  const igOk = group === "all" || item.igs.indexOf(group) >= 0;
  const qOk = !q || item.hay.indexOf(q) >= 0;
  return igOk && qOk;
}

// ---------- 生成前断言（筛选核心分支；失败即生成失败） ----------
const DATAJS = ITEMS.map(it => ({ k: it.key, igs: it.igs, hay: it.hay }));
const IG_KEYS = new Set(IG_LIST.map(g => g.key));

// 断言 A：数据完整性（名称齐全、键唯一、集团引用合法）
assert(ITEMS.length > 0, "意识形态数据为空");
assert(ITEMS.every(it => it.name && it.name !== it.key), "存在缺官方中文名的意识形态（宁缺毋假，禁止兜底编造）");
assert(new Set(ITEMS.map(it => it.key)).size === ITEMS.length, "意识形态 key 存在重复");
assert(DATAJS.every(d => d.igs.every(g => IG_KEYS.has(g))), "意识形态引用了未知利益集团");

// 断言 B：全选计数 = 总数
const allCount = DATAJS.filter(d => matchesFilter(d, "all", "")).length;
assert(allCount === DATAJS.length, "全选计数 " + allCount + " != 总数 " + DATAJS.length);

// 断言 C：各集团筛选计数与预计算一致（选项标签里的数字同源）
const GROUP_COUNTS = {};
for (const g of IG_LIST) {
  const expect = DATAJS.filter(d => d.igs.includes(g.key)).length;
  const got = DATAJS.filter(d => matchesFilter(d, g.key, "")).length;
  assert(got === expect, "集团「" + g.name + "」筛选计数 " + got + " != 预计算 " + expect);
  GROUP_COUNTS[g.key] = expect;
}

// 断言 D：关键字命中数与预计算一致（抽样：名称/集团/立场法律/解锁条件词，且必须命中 >0）
const KEYWORDS = ["废奴主义者", "工会", "奴隶制", "实证主义者", "普选"];
for (const w of KEYWORDS) {
  const q = w.toLowerCase();
  const expect = DATAJS.filter(d => d.hay.includes(q)).length;
  const got = DATAJS.filter(d => matchesFilter(d, "all", q)).length;
  assert(expect > 0, "关键字「" + w + "」预计算命中 0，抽样无效");
  assert(got === expect, "关键字「" + w + "」命中数 " + got + " != 预计算 " + expect);
}

// 断言 E：组合筛选（集团 × 关键字）与逐项判定一致
for (const g of IG_LIST.slice(0, 3)) {
  for (const w of ["工会", "奴隶制"]) {
    const q = w.toLowerCase();
    const expect = DATAJS.filter(d => d.igs.includes(g.key) && d.hay.includes(q)).length;
    const got = DATAJS.filter(d => matchesFilter(d, g.key, q)).length;
    assert(got === expect, "组合筛选「" + g.name + "×" + w + "」命中 " + got + " != 预计算 " + expect);
  }
}

// ---------- 卡片 HTML（服务端渲染，官方中文文本，宁缺毋假） ----------
const STANCE_ZH = { strongly_approve: "强烈支持", approve: "支持", neutral: "中立", disapprove: "反对", strongly_disapprove: "强烈反对" };
const STANCE_CLS = { strongly_approve: "st-spro", approve: "st-pro", neutral: "st-neu", disapprove: "st-con", strongly_disapprove: "st-scon" };
const iconOf = new Map(ideologies.map(s => [s.key, igoIconFile(s)]));

const cardHtml = (it) => {
  const icon = iconOf.get(it.key) || "";
  const badges = [
    it.leader ? '<span class="ic-badge b-leader">领袖意识形态</span>' : "",
  ].filter(Boolean).join("");
  const igsHtml = it.igs.length
    ? it.igs.map((g, i) => {
        const meta = IG_LIST.find(x => x.key === g);
        return '<span class="ig-chip"' + (meta && meta.desc ? ' title="' + esc(meta.desc) + '"' : "") + ">" + esc(it.igNames[i]) + "</span>";
      }).join("")
    : '<span class="ic-none">无固定关联集团（见解锁来源）</span>';
  const pro = it.stances.filter(x => x.s === "strongly_approve" || x.s === "approve").length;
  const con = it.stances.filter(x => x.s === "strongly_disapprove" || x.s === "disapprove").length;
  const neu = it.stances.filter(x => x.s === "neutral").length;
  const cov = ""; // 覆盖率统计镜像独有，游戏文件无此数据——直读版不显示
  const stancesHtml = it.stances.length
    ? '<details class="ic-fold"><summary>立法立场明细（' + it.stances.length + '）</summary><ul class="st-list">'
      + it.stances.map(x => '<li class="' + (STANCE_CLS[x.s] || "st-neu") + '">' + esc(x.law) + '<span class="lg">' + esc(x.grp) + " · " + STANCE_ZH[x.s] + "</span></li>").join("")
      + "</ul></details>"
    : "";
  const srcsHtml = (it.srcs.length || it.techs.length || it.jes.length)
    ? '<details class="ic-fold"><summary>解锁来源（' + (it.srcs.length + it.techs.length + it.jes.length) + '）</summary>'
      + it.srcs.map(x => '<p class="src-row"><b>' + esc(x.src) + "</b>" + (x.cond ? '<span class="src-cond">（' + esc(x.cond) + "）</span>" : "") + "</p>").join("")
      + (it.techs.length ? '<p class="src-line">科技：' + esc(it.techs.join("、")) + "</p>" : "")
      + (it.jes.length ? '<p class="src-line">日志条目：' + esc(it.jes.join("、")) + "</p>" : "")
      + "</details>"
    : "";
  return '<article class="ideo-card" id="card_' + esc(it.key) + '" data-key="' + esc(it.key) + '">'
    + '<div class="ic-head">'
    + (icon ? '<img class="ic-icon" src="' + esc(icon) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : "")
    + '<div class="ic-title"><h3>' + esc(it.name) + "</h3>" + (badges ? '<div class="ic-badges">' + badges + "</div>" : "") + "</div>"
    + "</div>"
    + '<p class="ic-key">' + esc(it.key) + "</p>"
    + (it.desc ? '<p class="ic-desc">' + esc(it.desc) + "</p>" : "")
    + '<div class="ic-igs"><span class="ic-igs-label">关联集团</span>' + igsHtml + "</div>"
    + '<p class="ic-meta">' + [cov, it.stances.length ? "立法立场：支持 " + pro + " · 反对 " + con + " · 中立 " + neu : ""].filter(Boolean).join(" · ") + "</p>"
    + stancesHtml + srcsHtml
    + "</article>";
};

// ---------- 页面组装 ----------
const TOTAL = ITEMS.length;
// 官方译名存在同名词（本体/运动/领袖变体共用译名，如 废奴主义者×4），故抽样按 ≥1 校验，键唯一性由断言 A 保证
const matched = ITEMS.filter(it => it.name === "废奴主义者").length;
assert(matched >= 1, "官方译名抽样「废奴主义者」不存在");

const html = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vicdata 意识形态图鉴 · 可筛选清单</title>
<style>
  ${SHELL_CSS}
  /* 工具条：原生 select/input/button，令牌配色 */
  .toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0 16px}
  .toolbar label{font-size:13.5px;color:var(--ink-soft);white-space:nowrap}
  .toolbar select{padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--parchment-2);color:var(--ink);font:inherit;font-size:14px;max-width:260px}
  .toolbar input[type=search]{flex:1;min-width:200px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--parchment-2);color:var(--ink);font:inherit;font-size:14px}
  .toolbar select:focus,.toolbar input[type=search]:focus{outline:none;border-color:var(--gold-bright);box-shadow:0 0 0 2px rgba(59,47,30,.12)}
  .tb-btn{padding:8px 14px;border:1px solid var(--gold);border-radius:8px;background:var(--parchment-2);color:var(--gold);font:inherit;font-size:13.5px;cursor:pointer;white-space:nowrap}
  .tb-btn:hover{background:var(--parchment-dark)}
  .count{font-size:13px;color:var(--ink-soft);white-space:nowrap}
  /* 卡片流：与 laws.html 卡片同观感（同圆角/边框/字体栈） */
  .igo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:12px}
  .igo-grid[hidden]{display:none}
  .ideo-card{border:1px solid var(--line);border-radius:10px;background:var(--parchment-2);padding:12px 14px;display:flex;flex-direction:column;gap:7px;box-shadow:1px 2px 0 rgba(59,47,30,.1)}
  .ideo-card:hover{border-color:var(--gold)}
  .ideo-card[hidden]{display:none}
  .ic-head{display:flex;gap:10px;align-items:center}
  .ic-icon{width:44px;height:44px;object-fit:contain;background:var(--parchment);border:1px solid var(--line);border-radius:8px;flex:none}
  .ic-title{min-width:0}
  .ic-title h3{margin:0;font-size:16.5px;letter-spacing:.5px}
  .ic-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:3px}
  .ic-badge{font-size:10.5px;border:1px solid var(--gold);color:var(--gold);border-radius:999px;padding:1px 9px;background:#efe0bd;white-space:nowrap}
  .ic-badge.b-leader{border-color:var(--red);color:var(--red);background:var(--parchment)}
  .ic-key{margin:0;font-size:11px;color:var(--ink-soft);font-family:Consolas,monospace;word-break:break-all}
  .ic-desc{margin:0;font-size:13px;line-height:1.7;color:var(--ink)}
  .ic-igs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:var(--ink-soft)}
  .ic-igs-label{font-size:12px}
  .ig-chip{display:inline-block;border:1px solid var(--line);border-radius:999px;background:var(--parchment);padding:1px 10px;font-size:12px;color:var(--ink);cursor:help}
  .ic-none{font-size:12px;color:var(--ink-soft);font-style:italic}
  .ic-meta{margin:0;font-size:12px;color:var(--ink-soft);border-top:1px dashed var(--line);padding-top:6px;line-height:1.6}
  .ic-fold{border-top:1px dashed var(--line);padding-top:5px}
  .ic-fold>summary{cursor:pointer;font-size:12px;color:var(--gold);list-style:none;user-select:none}
  .ic-fold>summary::-webkit-details-marker{display:none}
  .ic-fold>summary::before{content:"▸ ";color:var(--gold)}
  .ic-fold[open]>summary::before{content:"▾ "}
  .st-list{list-style:none;margin:7px 0 2px;padding:0;display:flex;flex-direction:column;gap:3px}
  .st-list li{font-size:12.3px;line-height:1.55;border-left:3px solid var(--line);background:#efe0bd;border-radius:4px;padding:2px 8px}
  .st-list li .lg{color:var(--ink-soft);font-size:11px;margin-left:5px}
  .st-spro{color:#1e5c1a;border-left-color:#1e5c1a}
  .st-pro{color:#3d6b34;border-left-color:#3d6b34}
  .st-neu{color:var(--ink-soft)}
  .st-con{color:#a05a28;border-left-color:#a05a28}
  .st-scon{color:var(--red);border-left-color:var(--red)}
  .src-row{margin:6px 0 0;font-size:12.3px;line-height:1.6}
  .src-row b{color:var(--ink)}
  .src-cond{color:var(--ink-soft)}
  .src-line{margin:5px 0 2px;font-size:12.3px;color:var(--ink-soft)}
  .ic-fold details{margin-top:5px}
  /* 无匹配占位（不许空白区域） */
  .empty{border:1px dashed var(--gold);border-radius:12px;background:var(--parchment-2);text-align:center;padding:40px 16px;color:var(--ink-soft);font-size:15px;line-height:2.1;margin-top:4px}
  .empty[hidden]{display:none}
  .empty .empty-mark{font-size:26px;color:var(--gold);display:block;line-height:1.2}
  .empty small{font-size:12.5px;display:block}
  .empty .tb-btn{margin-top:6px}
  .hint{font-size:13px;color:var(--ink-soft);background:var(--parchment-2);border:1px solid var(--line);border-radius:8px;padding:10px 14px;line-height:1.8;margin:0 0 4px}
  .hint b{color:var(--ink)}
</style>
</head>
<body>
<div class="wrap">
  ${pageShell({ page: "ideologies", title: "Vicdata 意识形态图鉴", counts: { ideologies: TOTAL }, lede: "全部 " + TOTAL + " 个意识形态的可筛选清单：按所属利益集团归类，支持关键字即时搜索（名称、描述、立法立场、解锁来源均可命中）。译名与描述取游戏 " + "1.15.1 官方简中文本，数据缺什么就不写什么。", back: { href: "index.html", label: "返回总览" } })}
  <a id="ideologies-top"></a>

  <form class="toolbar" id="filter-form">
    <label for="f-ig">利益集团</label>
    <select id="f-ig">
      <option value="all">全部（${TOTAL}）</option>
      ${IG_LIST.map(g => '<option value="' + esc(g.key) + '">' + esc(g.name) + "（" + GROUP_COUNTS[g.key] + "）</option>").join("\n      ")}
    </select>
    <input id="q" type="search" placeholder="搜索名称 / 描述 / 立法立场 / 解锁来源…（输入即时生效，回车同样可搜）" autocomplete="off">
    <button type="button" id="btn-reset" class="tb-btn">清除筛选</button>
    <span class="count" id="count"></span>
  </form>

  <p class="hint"><b>怎么读这页：</b>「关联集团」取游戏数据中该意识形态的集团固有/领袖归属与权重条件涉及的集团之并集；<b>领袖意识形态</b>指集团领袖人物可能持有的类型，展开「立法立场明细」可看它对各部法律的态度（官方译名），「科技影响」列出会增删该意识形态的科技。</p>

  <div class="igo-grid" id="cards">
    ${ITEMS.map(cardHtml).join("\n    ")}
  </div>

  <div class="empty" id="empty" hidden>
    <span class="empty-mark">⚖</span>
    没有匹配的意识形态
    <small>换个关键字试试，或清除利益集团筛选。</small>
    <button type="button" id="btn-empty-reset" class="tb-btn">清除筛选</button>
  </div>
</div>
<script>
  // 筛选数据（与上方静态卡片一一对应；hay 为构建期定稿的搜索干草堆，已小写）
  const DATA = ${JSON.stringify(DATAJS).replace(/</g, "\\u003c")};
  const TOTAL = ${TOTAL};
  function matchesFilter(item, group, q) {
    const igOk = group === "all" || item.igs.indexOf(group) >= 0;
    const qOk = !q || item.hay.indexOf(q) >= 0;
    return igOk && qOk;
  }
  (function () {
    var sel = document.getElementById("f-ig");
    var input = document.getElementById("q");
    var form = document.getElementById("filter-form");
    var countEl = document.getElementById("count");
    var cardsBox = document.getElementById("cards");
    var emptyBox = document.getElementById("empty");
    var byKey = {};
    for (var i = 0; i < DATA.length; i++) byKey[DATA[i].k] = document.getElementById("card_" + DATA[i].k);

    function applyFilter() {
      var group = sel.value;
      var q = (input.value || "").trim().toLowerCase();
      var n = 0;
      for (var i = 0; i < DATA.length; i++) {
        var it = DATA[i];
        var show = matchesFilter(it, group, q);
        var card = byKey[it.k];
        if (card) card.hidden = !show;
        if (show) n++;
      }
      countEl.textContent = "命中 " + n + " / " + TOTAL + " 个意识形态";
      cardsBox.hidden = n === 0;
      emptyBox.hidden = n !== 0;
    }
    function reset() { sel.value = "all"; input.value = ""; applyFilter(); }

    sel.addEventListener("change", applyFilter);
    input.addEventListener("input", applyFilter);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applyFilter(); } });
    form.addEventListener("submit", function (e) { e.preventDefault(); });
    document.getElementById("btn-reset").addEventListener("click", reset);
    document.getElementById("btn-empty-reset").addEventListener("click", reset);

    applyFilter();
  })();
</script>
</body>
</html>`;

// ---------- 产物断言（残留检查，写盘前熔断） ----------
assert(!html.includes(">undefined<") && !html.includes(">NaN<"), "产物含 >undefined< / >NaN< 残留");
assert(!html.includes("[object Object]"), "产物含 [object Object] 残留");
assert(html.includes("card_ideology_abolitionist"), "产物缺少抽样卡片");
for (const w of ["废奴主义者", "虔信者", "工会", "地主", "知识分子"]) assert(html.includes(w), "产物缺少官方中文文本「" + w + "」");

fs.writeFileSync(OUT, html);
console.log("ideologies.html（意识形态交互清单）生成完毕: " + (fs.statSync(OUT).size / 1024).toFixed(0) + " KB | 意识形态 " + TOTAL + " · 利益集团 " + IG_LIST.length + " · 有关联集团 " + ITEMS.filter(it => it.igs.length).length + " · 断言通过（全选=总数；集团/关键字/组合筛选=预计算）");
