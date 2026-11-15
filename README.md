# Vicdata — 维多利亚3攻略资料库

以目标为导向的维多利亚3（Victoria 3）攻略网站：帮助玩家做全成就、提高游戏理解和游戏水平、享受通过规划执行完成自己目标的快乐。

- **线上**：https://demo-website.948380677.workers.dev
- **本地**：`node serve.mjs` → http://127.0.0.1:8737
- **真相源**：本地游戏文件（当前 **1.15.1**，游戏更新后重跑生成器自动跟进）

## 目录结构

| 目录 | 职责 |
|---|---|
| `guides/` | **页面生成器**（`generate-*.mjs` ×6）+ 共享游戏直读层 `game-data.mjs` + 数据源文本（wiki 快照、人工校准 JSON） |
| `.agents/skills/` | 会话技能（pdx-script-parse 解析器、data-sources 数据源速查、data-pipeline 管线文档、new-page 新页 cookbook） |
| `tools/` | 守卫（check-*.mjs，挂 lefthook pre-commit + CI）+ 管线（sync-icons.py 图标同步） |
| `scripts/` | 版本对比（verify-version.mjs：游戏更新后程序化 diff 产物） |
| `assets/` | 图标与静态图片（webp，`sync-icons.py` 从游戏 dds 生成） |
| `locales/` | 术语表（terminology.md，DLC 建议译名唯一维护处） |
| `deploy/` | Cloudflare Workers 部署配置（wrangler.jsonc + sync.mjs；site/ 为生成副本不入库） |
| `.github/workflows/` | CI：push main → 三守卫 → 同步 → 部署 Cloudflare（需 Secrets） |
| 根目录 | 生成产物 `*.html` ×6 + `serve.mjs` + `AGENTS.md`（项目宪法）+ `lefthook.yml` |

## 页面清单（10 页签）

成就指南 / 法律指南 / 意识形态 / 州名（含资源分布）/ 人群政治 / 公司经营 / 科技 / 建筑（计算器）/ 事件 / 计算器

## 常用操作


# 分支开发流程（合并走 PR + merge commit）
git checkout main && git pull
git checkout -b feat/xxx     # 新分支开发
# ...修改、提交...
git push -u origin feat/xxx  # 推远端 → GitHub 开 PR → CI 通过后 merge commit 合并
```bash
# 游戏版本更新后的完整刷新
node guides/generate.mjs && node guides/generate-laws.mjs && node guides/generate-ideologies.mjs \
  && node guides/generate-states.mjs && node guides/generate-politics.mjs && node guides/generate-calculator.mjs
python -I tools/sync-icons.py          # 补新图标（游戏 dds → webp）
node scripts/verify-version.mjs HEAD   # 程序化对比新旧数据差异（勿肉眼判断）
git push                               # CI 自动：守卫 → 部署

# 本地守卫单独跑
npx -y lefthook run pre-commit
```

详细约定（真相层级、目录职责规则、新页面流程）见 [AGENTS.md](AGENTS.md)。
