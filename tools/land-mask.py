# -*- coding: utf-8 -*-
"""从 assets/map/map-base.png 提取"外海 / 陆地"信息，供 map.js 坐标吸附使用。

产出：
  1) 控制台打印 ASCII 缩略图（人工核对海岸线走向）
  2) tools/land-mask.json —— 去噪后的陆地占用网格（96x64，16px/格）
  3) const LAND_COAST = [...] —— 每 16px 一行扫描线的"陆地左边界"

思路（踩过的坑都在这儿）：
  · 单纯按颜色判"是不是水"会在暗角/暗橄榄色地貌上误判（边缘渐晕几乎全黑，
    暗绿陆地 (46,58,50) 用松阈值 g>r+4 会被当成海）。
  · 所以先按青蓝色调判水，再只保留"最大连通水体"= 左侧外海，
    其余一律算陆地 —— 噪点/内陆水塘自然被吃掉。
  · 海岸线取"该行外海最右侧格 + 1 格"，这样恒有 **x >= coast ⇒ 该点必为陆地**。

用法：
  python tools/land-mask.py            # 分析 + 打印
  python tools/land-mask.py --dump     # 额外导出 land-mask.json
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IMG = os.path.join(ROOT, "assets", "map", "map-base.png")

CELL = 16          # 网格粒度（像素）
SAMPLE = 16        # 海岸线表采样步长（像素）


def is_water(r, g, b):
    """外海是青蓝色调：蓝>=绿>=红。陆地是棕/橄榄：红>=绿>=蓝。"""
    return (b > g + 2) or (g > r + 8 and b > r + 4)


def is_dark(r, g, b):
    """边缘渐晕/深阴影：亮度极低，颜色信息不可靠 → 记为"未知"，稍后并入邻接水体。"""
    return max(r, g, b) < 26


def main():
    im = Image.open(IMG).convert("RGB")
    W, H = im.size
    gw, gh = W // CELL, H // CELL
    px = im.load()

    state = []   # 1=水 0=陆 2=未知
    for gy in range(gh):
        row = []
        for gx in range(gw):
            dw = dl = n = 0
            for y in range(gy * CELL, gy * CELL + CELL, 4):
                for x in range(gx * CELL, gx * CELL + CELL, 4):
                    r, g, b = px[x, y]
                    n += 1
                    if is_water(r, g, b):
                        dw += 1
                    elif is_dark(r, g, b):
                        dl += 1
                    else:
                        pass
            if dw > dl and dw > n * 0.4:
                row.append(1)
            elif dl > dw and dl > n * 0.4:
                row.append(2)
            else:
                row.append(0)
        state.append(row)

    # ---- 最大连通水体 = 左侧外海 ----
    seen = [[False] * gw for _ in range(gh)]
    best = []
    for sy in range(gh):
        for sx in range(gw):
            if state[sy][sx] != 1 or seen[sy][sx]:
                continue
            stack = [(sx, sy)]
            seen[sy][sx] = True
            comp = []
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < gw and 0 <= ny < gh and state[ny][nx] == 1 and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    sea = set(best)

    # ---- 未知（暗角）向邻接水体生长，直到不再变化 ----
    changed = True
    while changed:
        changed = False
        add = []
        for gy in range(gh):
            for gx in range(gw):
                if state[gy][gx] != 2 or (gx, gy) in sea:
                    continue
                nb = 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = gx + dx, gy + dy
                    if (nx, ny) in sea:
                        nb += 1
                if nb >= 1:            # 贴着海就吸收（暗角整片都是海，靠迭代生长吃干净）
                    add.append((gx, gy))
        for c in add:
            sea.add(c)
        changed = bool(add)

    land = [[0 if (gx, gy) in sea else 1 for gx in range(gw)] for gy in range(gh)]


    print("image: %dx%d  grid: %dx%d  cell=%d" % (W, H, gw, gh, CELL))
    print("sea cells: %d / %d  (%.0f%% land)" % (len(sea), gw * gh, 100.0 * (gw * gh - len(sea)) / (gw * gh)))
    for gy in range(gh):
        line = ""
        for gx in range(0, gw, 2):
            v = land[gy][gx] + (land[gy][gx + 1] if gx + 1 < gw else land[gy][gx])
            line += "#" if v == 2 else ("+" if v == 1 else ".")
        print("%4d %s" % (gy * CELL, line))

    # ---- 海岸线表 ----
    rows = H // SAMPLE
    coast = []
    for i in range(rows):
        gy = min(gh - 1, int(i * SAMPLE / CELL))
        xs = [gx for gx in range(gw) if not land[gy][gx]]
        coast.append((max(xs) + 1) * CELL if xs else 0)
    print("\n--- COAST (陆地左边界 x，每 %dpx 一行) ---" % SAMPLE)
    for i in range(0, rows, 8):
        print("  y=%4d  x=%4d" % (i * SAMPLE, coast[i]))
    print("\nconst LAND_COAST = [%s];" % ", ".join(str(v) for v in coast))
    print("// 相邻差最大值 %d px" % max(abs(coast[i + 1] - coast[i]) for i in range(rows - 1)))

    if "--dump" in sys.argv:
        with open(os.path.join(HERE, "land-mask.json"), "w", encoding="utf-8") as f:
            json.dump({"imgW": W, "imgH": H, "cell": CELL, "gw": gw, "gh": gh,
                       "coast": coast, "rowPx": SAMPLE, "mask": land},
                      f, separators=(",", ":"))
        print("-> tools/land-mask.json written")


if __name__ == "__main__":
    main()
