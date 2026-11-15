// PDX 脚本条件解析器（Victoria 3 条件块 → 中文）v2
// 被 guides/generate*.mjs 引用；规则详见同目录 SKILL.md
// parseConditions(raw, ctx) → { conds: string[], always: bool, raw }

const CONCEPT_ZH = { ruler: "统治者", party: "政党", interest_group: "利益集团", law: "法律", overlord: "宗主", state: "州", country: "国家" };

// custom_tooltip text 键清理（官方人话里残留的富文本标记）
const cleanTooltip = (t) => {
  let s = String(t || "")
    .replace(/\[Concept\('(?:[^']+)',\s*'([^']+)'\)\]/g, "$1")
    .replace(/\[concept_(\w+)\]/g, (m, k) => (CONCEPT_ZH[k] ? CONCEPT_ZH[k] : ""))
    .replace(/\[\/concept_\w+\]/g, "")
    .replace(/\[Get[a-zA-Z]+\([^)]*\)[^\]]*\]?/g, "")
    .replace(/#(?:bold|italic|tooltippable|tooltip:[\w.$]+|b|!\w*)/g, "")
    .replace(/#!/g, "");
  // 仍有动态调用碎片（如 BIC 禁改句的 [ROOT.GetCountry.GetName]、修饰器整句动态描述）→ 整句不可用
  if (/\[(?:Get|ROOT|scope)|GetName\]|\.GetName/.test(s)) return "";
  return s.replace(/\s{2,}/g, " ").trim();
};

// 提取平衡花括号块：src 中 find 开头（已替换为标记+{），返回剥离后的文本与块列表
function extractBlocks(src, marker) {
  const blocks = [];
  let out = "", i = 0;
  while (i < src.length) {
    if (src.startsWith(marker + "{", i)) {
      let depth = 1, j = i + marker.length + 1;
      while (j < src.length && depth > 0) { if (src[j] === "{") depth++; else if (src[j] === "}") depth--; j++; }
      blocks.push(src.slice(i + marker.length + 1, j - 1));
      out += " ";
      i = j;
    } else { out += src[i]; i++; }
  }
  return { text: out, blocks };
}

// 常见谓词速查（正则 → 生成函数）
const PREDICATES = [
  [/is_subject\s*=\s*no/, () => "不是附属国"],
  [/is_revolutionary\s*=\s*yes/, () => "处于革命中"],
  [/country_is_colonial_or_company\s*=\s*yes/, () => "是殖民政府或特许公司"],
  [/is_country_type\s*=\s*decentralized/, () => "是松散部族"],
  [/is_country_type\s*=\s*colonial/, () => "是殖民政府"],
  [/is_country_type\s*=\s*company/, () => "是特许公司"],
  [/any_scope_state\s*=\s*\{\s*is_incorporated\s*=\s*no\s*\}/, () => "拥有未合宪州"],
  [/is_homeland_of_country_cultures\s*=\s*ROOT/, () => "拥有本国文化的祖传州"],
  [/any_decentralized_country\s*=\s*\{[^}]*is_adjacent_to_country\s*=\s*root[^}]*\}/, () => "与松散部族接壤"],
  [/literacy_rate\s*<=\s*([\d.]+)/, (m) => "识字率 ≤ " + Math.round(parseFloat(m[1]) * 100) + "%"],
  [/country_rank\s*>=\s*rank_value:(\w+)/, (m) => "国家等级至少 " + ({ great_power: "列强", major_power: "主要强权", minor_power: "次要强权" }[m[1]] || m[1])],
  [/is_power_bloc_leader\s*=\s*no/, () => "不是国家集团领袖"],
  [/is_power_bloc_leader\s*=\s*yes/, () => "是国家集团领袖"],
];

export function parseConditions(raw, ctx = {}) {
  const out = { conds: [], always: false, raw: raw || "" };
  if (!raw || !raw.trim()) return out;
  let text = raw.replace(/\r\n/g, "\n");
  if (/^\s*\{\s*always\s*=\s*yes\s*\}\s*$/.test(text)) { out.always = true; return out; }

  const L = ctx.L || ((k) => k);
  const GAME_ZH = ctx.GAME_ZH || {};
  const push = (s) => { if (s && !out.conds.includes(s) && out.conds.length < 12) out.conds.push(s); };

  // ---- 块剥离（顺序：custom_tooltip 先于 trigger_if，嵌套时各自捕获） ----
  // 1) custom_tooltip 块：人话即代表整块；变量行补充
  const ct = extractBlocks(text.replace(/custom_tooltip\s*=\s*\{/g, "CTTIP{"), "CTTIP");
  text = ct.text;
  for (const block of ct.blocks) {
    let got = false;
    for (const m of block.matchAll(/text\s*=\s*(\w+)/g)) {
      const zh = GAME_ZH[m[1]] || GAME_ZH[m[1].replace(/_tt$/, "")];
      if (zh) { const c = cleanTooltip(zh); if (c && c.length > 1 && /[\u4e00-\u9fff]/.test(c)) { push(c.slice(0, 60)); got = true; } }
    }
    if (!got) {
      for (const m of block.matchAll(/modifier:(\w+_bool)\s*=\s*no/g)) {
        const lawMatch = m[1].match(/^country_disallow_law_(\w+)_bool$/);
        if (lawMatch) {
          const l2 = (ctx.laws || []).find(x => x.key === "law_" + lawMatch[1]);
          if (l2) { push("未受「禁止 " + (L(l2.loc?.name) || lawMatch[1]) + "」修正（该修正来自其它已实施法律或事件）"); got = true; }
        }
      }
    }
    for (const m of block.matchAll(/has_variable\s*=\s*(\w+)/g)) {
      if (m[1] === "britain_granted_dop_permission") { push("需要变量 " + m[1] + "（如英国授予的改革许可）"); got = true; }
    }
  }
  // 2) trigger_if / trigger_else_if 块：限定了"哪些国家受约束"。
  //    块内人话 tooltip 优先；无人话时 limit 条件并入，但剔除受限者描述（c:XXX ?= ROOT / is_subject = yes）。
  const tf = extractBlocks(text.replace(/trigger_(?:if|else_if)\s*=\s*\{/g, "TRIGIF{"), "TRIGIF");
  text = tf.text;
  for (const block of tf.blocks) {
    let got = false;
    for (const m of block.matchAll(/text\s*=\s*(\w+)/g)) {
      const zh = GAME_ZH[m[1]] || GAME_ZH[m[1].replace(/_tt$/, "")];
      if (zh) { const c = cleanTooltip(zh); if (c && c.length > 1 && /[\u4e00-\u9fff]/.test(c)) { push(c.slice(0, 60)); got = true; } }
    }
    if (got) continue;
    for (const m of block.matchAll(/has_variable\s*=\s*(\w+)/g)) {
      if (m[1] === "britain_granted_dop_permission") { push("需要变量 " + m[1] + "（如英国授予的改革许可）"); got = true; }
    }
    if (got) continue;
    const lim = block
      .replace(/\bc:[A-Z]{3}\s*\??=\s*(?:this|ROOT|scope:\w+)/g, " ")
      .replace(/\bis_subject\s*=\s*yes/g, " ");
    const sub = parseConditions(lim, ctx);
    for (const c of sub.conds) if (c !== "是附属国") push(c);
  }

  // ---- 主句解析 ----
  // 1) 变量
  for (const m of text.matchAll(/has_(?:global_)?variable\s*=\s*(\w+)/g)) push("需要变量 " + m[1]);
  // 2) 文化（cu:xxx → cultures 查中文名）
  const cultureNames = [];
  for (const m of text.matchAll(/country_has_primary_culture\s*=\s*cu:(\w+)/g)) {
    const c = (ctx.cultures || []).find(x => x.key === m[1]);
    cultureNames.push(c ? (L(c.loc?.name) || m[1]) : m[1]);
  }
  if (cultureNames.length) push("主流文化为 " + [...new Set(cultureNames)].join("/") + (cultureNames.length > 1 ? " 之一" : ""));
  // 3) 国家 tag（c:XXX ?= this / = this）
  const tagNames = [];
  for (const m of text.matchAll(/c:([A-Z]{3})\s*\??=\s*this/g)) {
    const c = (ctx.countries || []).find(x => x.key === m[1]);
    tagNames.push(c ? (L(c.loc?.name) || m[1]) : m[1]);
  }
  if (tagNames.length) push("国家为 " + [...new Set(tagNames)].join("/"));
  // 4) 常见谓词
  for (const [re, fn] of PREDICATES) {
    const m = text.match(re);
    if (m) push(fn(m, ctx));
  }
  // 5) 已实施某法律
  for (const m of text.matchAll(/(?<!or_variant\s)has_law(?:_or_variant)?\s*=\s*law_type:(\w+)/g)) {
    const l = (ctx.laws || []).find(x => x.key === m[1]);
    push("已实施 " + (l ? (L(l.loc?.name) || m[1]) : m[1]));
  }
  // 6) 互斥修正案
  for (const m of text.matchAll(/has_amendment\s*=\s*amendment_type:(\w+)/g)) {
    const a = (ctx.amendments || []).find(x => x.key === m[1]);
    push("同法未挂修正案「" + (a ? (L(a.loc?.name) || m[1]) : m[1]) + "」");
  }
  // 7) 修正类 bool（主句残留时兜底；通常已被 custom_tooltip 块捕获）
  for (const m of text.matchAll(/modifier:(\w+_bool)\s*=\s*no/g)) {
    const lawMatch = m[1].match(/^country_disallow_law_(\w+)_bool$/);
    if (lawMatch) {
      const l2 = (ctx.laws || []).find(x => x.key === "law_" + lawMatch[1]);
      if (l2) { push("未受「禁止 " + (L(l2.loc?.name) || lawMatch[1]) + "」修正"); continue; }
    }
    const zhKey = GAME_ZH[m[1]] || GAME_ZH[m[1].replace(/_bool$/, "")];
    if (zhKey) { const c = cleanTooltip(zhKey); if (c) { push(c.slice(0, 60)); continue; } }
    push("未受「" + m[1].replace(/^country_/, "").replace(/_bool$/, "").replace(/_/g, " ") + "」修正");
  }
  // 8) NOT 块
  for (const m of text.matchAll(/NOT\s*=\s*\{[^{}]*?c:([A-Z]{3})\s*\??=\s*this[^{}]*?\}/gs)) {
    const c = (ctx.countries || []).find(x => x.key === m[1]);
    push("不是" + (c ? (L(c.loc?.name) || m[1]) : m[1]));
  }
  for (const m of text.matchAll(/NOT\s*=\s*\{[^{}]*?has_government_type\s*=\s*(\w+)[^{}]*?\}/gs)) {
    const zh = { gov_chartered_company: "特许公司" }[m[1]] || m[1];
    const yes = "政府类型是" + zh, no = "政府类型不是" + zh;
    const yi = out.conds.indexOf(yes);
    if (yi >= 0) out.conds.splice(yi, 1);
    push(no);
  }

  // ---- 收尾：冲突消解 + 碎片过滤 ----
  for (const c of [...out.conds]) {
    if (/^政府类型不是/.test(c)) {
      const yes = c.replace("不是", "是");
      const yi = out.conds.indexOf(yes);
      if (yi >= 0) out.conds.splice(yi, 1);
    }
  }
  out.conds = out.conds.filter(c => {
    const core = c.replace(/[，；、「」（）/\w\s]/g, "");
    return core.length >= 3 || (core.length >= 2 && /[是未]/.test(core[0]));
  });
  // is_subject = yes 仅作受限者描述（无 is_subject = no 时整条丢弃）
  if (out.conds.includes("是附属国") && /is_subject\s*=\s*yes/.test(raw) && !/is_subject\s*=\s*no/.test(raw)) {
    const yi = out.conds.indexOf("是附属国");
    if (yi >= 0) out.conds.splice(yi, 1);
  }
  return out;
}
