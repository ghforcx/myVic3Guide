# 图标同步管线：游戏版本更新后，从游戏 dds 图标批量转换缺失的 webp 资产。
# 覆盖三类：建筑（building_*）、商品（goods/*）、科技（technologies/*）。
# 用法：python -I tools/sync-icons.py          （幂等：已存在的跳过；游戏里找不到的列出）
# 资产命名约定与各生成器一致：assets/buildings/building_<stem>.webp、assets/goods/<key>.webp、assets/technologies/<key>.webp
import sys
from pathlib import Path
from PIL import Image

GAME = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Victoria 3\game")
ROOT = Path(__file__).resolve().parent.parent
COMMON = GAME / "common"

def top_block_keys(txt, prefix):
    """提取顶格 `xxx = {` 的键（前缀过滤）"""
    keys = []
    for line in txt.splitlines():
        s = line.strip()
        if not s.startswith(prefix):
            continue
        i = s.find(" = {")
        if i == len(prefix.rstrip("*")) and False:
            pass
        # 形如 key = { —— 取等号左部
        if "=" in s and s.split("=")[1].strip().startswith("{"):
            k = s.split("=")[0].strip()
            if k.startswith(prefix) and " " not in k:
                keys.append(k)
    return keys

def read(p):
    return p.read_text(encoding="utf-8-sig", errors="replace")

def convert(dss: Path, out: Path):
    img = Image.open(dss).convert("RGBA")
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "WEBP", quality=90)

def main():
    icon_dirs = {
        "buildings": [GAME / "gfx/interface/icons/building_icons"],
        "goods": [GAME / "gfx/interface/icons/goods_icons"],
        "technologies": [GAME / "gfx/interface/icons/invention_icons"],
        "laws": [],  # 法律按 law 块的 icon 字段定位（大量法律共享/别名图标，同名猜不准）
    }
    # 需求键集：建筑（common/buildings）、商品（common/goods/00）、科技（common/technology/technologies）
    wanted = {"buildings": set(), "goods": set(), "technologies": set()}
    for f in (COMMON / "buildings").glob("*.txt"):
        for k in top_block_keys(read(f), "building_"):
            wanted["buildings"].add(k)
    goods_txt = (COMMON / "goods" / "00_goods.txt")
    if goods_txt.exists():
        for k in top_block_keys(read(goods_txt), ""):
            if k and not k.startswith("#"):
                wanted["goods"].add(k)
    for f in (COMMON / "technology" / "technologies").glob("*.txt"):
        for k in top_block_keys(read(f), ""):
            if k and not k.startswith("#"):
                wanted["technologies"].add(k)

    # laws：解析每个 law 块的 icon 字段（行扫描状态机）
    import re as _re
    law_icon = {}
    for f in (COMMON / "laws").glob("*.txt"):
        cur = None
        for line in read(f).splitlines():
            m = _re.match(r"^(law_[\w]+) = \{", line)
            if m:
                cur = m.group(1)
                continue
            if cur:
                im = _re.search(r"icon\s*=\s*\"([^\"]+)\"", line)
                if im and cur not in law_icon:
                    law_icon[cur] = im.group(1)
    wanted["laws"] = set(law_icon)

    made, missing = [], []
    for kind, keys in wanted.items():
        if kind == "laws":
            out_dir = ROOT / "assets" / kind
            for full_key, rel in sorted(law_icon.items()):
                out = out_dir / (full_key[4:] + ".webp")
                if out.exists():
                    continue
                src = GAME / rel
                if src.exists():
                    convert(src, out)
                    made.append(f"laws/{out.name}")
                else:
                    missing.append(f"laws/{full_key}(icon指向不存在)")
            continue
        out_dir = ROOT / "assets" / kind
        for key in sorted(keys):
            if not key:
                continue
            out = out_dir / (f"{key}.webp" if kind == "buildings" else f"{key}.webp")
            if out.exists():
                continue
            # 在对应图标目录里找同名 dds
            stem = key[len("building_"):] if kind == "buildings" else key
            found = None
            for d in icon_dirs[kind]:
                cand = d / f"{stem}.dds"
                if cand.exists():
                    found = cand
                    break
            if found:
                convert(found, out)
                made.append(f"{kind}/{out.name}")
            else:
                missing.append(f"{kind}/{key}")
    print(f"转换 {len(made)} 个：", *made[:20], sep="\n  " if made else " ")
    if missing:
        print(f"未找到游戏图标 {len(missing)} 个（多为无图标条目，忽略）：", *missing[:20], sep="\n  ")

if __name__ == "__main__":
    sys.exit(main())
