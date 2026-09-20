/* ============================================================
 * content/map.js — 世界地图数据层 ★ v8.15（脱机挂地图视图·一期）
 *
 * 目的：把游戏世界"数据化"成一张可画的图——这是老式脱机挂的观看窗口体验。
 *   ├─ 坐标层：每个探索点有 (x, y)；手工 13 个 + 公式阶段地点按"环带 + 散列角"落位
 *   ├─ 轨迹层：S.trail 环形缓冲记录"什么时候在哪干什么"（时段切换/发现/天灾/推进）
 *   └─ 回放层：给定时间点 → 反查轨迹位置（纯表现，不改任何数值）
 *
 * 加载顺序：依赖 ITEMS/SPOTS/config（在 config.js 之后）。不依赖 loot.js。
 * ============================================================ */
"use strict";

/* v8.22 长条布局（用户："改成长条状的怎么样，这样显得好看点"）：
 *  旧版是 900×660 的同心圆，塞进扁长条面板里左右大片留白。
 *  新布局：横轴 = "从近到远"（左：避难所 + 老地点按威胁递增；右：每个阶段一列区域），
 *          纵轴 = 三道（安全点 / 富矿点 / 遗迹点），一屏铺满，"越往右越远越危险"一目了然。 */
const MAP_W = 1536, MAP_H = 1024;               /* v8.28：匹配 AI 废土地图底图尺寸 */
const MAP_CENTER = { x: 760, y: 560 };          /* 避难所：底图大陆中心 */
/* 以下常量保留声明（旧长条布局遗留），新版 spotPos 不再使用 */
const MAP_LEGACY_X0 = 128, MAP_LEGACY_X1 = 444;
const MAP_ZONE_X0 = 486, MAP_ZONE_X1 = 1004;
const MAP_LANES = [108, 215, 322];
const MAP_BASE_IMG = "assets/map/map-base.png"; /* v8.28：AI 生成的废土地图底图 */
const TRAIL_CAP = 400;                          /* 轨迹环形缓冲上限 */

/* 威胁分带（画底纹 + 图例用） */
const THREAT_BANDS = [
  { key: "safe", name: "安全区", max: 44,      ring: 1 },   /* 与文案一致：威胁 <45 为安全区 */
  { key: "risk", name: "危险区", max: 160,     ring: 2 },
  { key: "dead", name: "死域",   max: Infinity, ring: 3 }
];
function threatBand(threatT){
  for(const b of THREAT_BANDS) if(threatT <= b.max) return b;
  return THREAT_BANDS[THREAT_BANDS.length - 1];
}

/* ---------- 地点坐标（v8.28：AI 废土地图底图 + 中心放射散点） ----------
 * 底图 1536×1024：左为外海（未探索）、右为大陆；避难所固定在大陆中心 MAP_CENTER。
 * 所有地点按"中心放射"落位：阶段(tier)越大离避难所越远（半径增长），
 * 类型(safe/rich/relic)分扇区、id 散列做微抖动 → 同一地点永远同坐标（轨迹/回放一致）。
 * 旧版 SPOT_POS 手工表已弃用，统一由 spotPos() 算法生成。 */

/** 已解锁区域的大字基准位置（该区域所有地点的质心）——地图"区域大字"散落用 */
function zoneColumns(){
  const cap = (typeof AGES !== "undefined" && AGES.length) ? AGES.length : 12;
  const maxT = Math.min(cap, (typeof S !== "undefined" && S ? (S.age || 1) : 1) + 2, 12);
  const out = [];
  for(let t = 1; t <= maxT; t++){
    const m = (typeof MAP_DEFS !== "undefined") ? MAP_DEFS.find(x => x.tier === t) : null;
    if(!m) continue;
    let sx = 0, sy = 0, n = 0;
    for(const id of (m.spots || [])){ const q = spotPos(id); sx += q.x; sy += q.y; n++; }
    out.push({ tier: t, name: m.name, x: n ? Math.round(sx / n) : MAP_CENTER.x, y: n ? Math.round(sy / n) : MAP_CENTER.y });
  }
  return out;
}
/* ---------- 海岸线（v8.31：从底图自动提取，见 tools/land-mask.py） ----------
 * 用户反馈："富矿脉 / 荒原补给点 落在海里了，地图右边有大片陆地"。
 * 根因：旧版 spotPos 只用"x<330 就镜像 + 硬 clamp"，被 clamp 的点会沿着 x=330
 *       排成一列 —— 而那一条竖线正好压在左侧外海的礁石上。
 * 修法：把底图的海岸线抽成一张"每 16px 一行、陆地左边界 x"的表，
 *       落点必须先过 onLand() 检查（离海岸线内缩 LAND_PAD），过不了就换落点。 */
const LAND_COAST = [144, 144, 96, 48, 48, 48, 128, 144, 144, 160, 176, 192, 176, 176, 192, 192, 192, 224, 256, 304, 320, 352, 352, 400, 416, 400, 400, 400, 416, 448, 448, 432, 416, 416, 416, 416, 432, 592, 608, 608, 656, 624, 592, 592, 592, 592, 592, 576, 576, 640, 656, 672, 736, 848, 848, 848, 848, 864, 896, 928, 928, 896, 848, 880];
const LAND_ROW = 16;                            /* 表的一行 = 底图 16px */
const LAND_PAD = 46;                            /* 地点离海岸线的内缩（标记 + 文字不吃进海里） */
const LAND_SPAN = 48;                           /* 判定时上下各多看 48px（陡岸处不至于贴到水边） */
const LAND_EDGE = 62;                           /* 离底图四边的最小留白 */

/** 给定 y，返回该行的"陆地左边界 x"（线性插值） */
function landLeftX(y){
  const n = LAND_COAST.length;
  const f = Math.max(0, Math.min(n - 1, y / LAND_ROW));
  const i = Math.floor(f), j = Math.min(n - 1, i + 1);
  return LAND_COAST[i] + (LAND_COAST[j] - LAND_COAST[i]) * (f - i);
}
/** y±span 范围内最"靠右"的海岸线（陡岸处取最保守值，保证标记周围一圈都是陆地） */
function landLeftMax(y, span){
  span = span || LAND_SPAN;
  let m = landLeftX(y);
  for(let d = LAND_ROW; d <= span; d += LAND_ROW){
    m = Math.max(m, landLeftX(y - d), landLeftX(y + d));
  }
  return m;
}
/** 该点是否稳稳落在陆地上（pad = 需要的内缩量） */
function onLand(x, y, pad){
  pad = pad || 0;
  if(x < landLeftMax(y) + pad) return false;
  if(x > MAP_W - pad || y < pad || y > MAP_H - pad) return false;
  return true;
}

/** 海水区域的多边形路径（左侧外海遮罩跟着真实海岸线走，不再是一条 330px 的竖线） */
function seaPath(pad){
  const p = pad || 0, pts = [];
  for(let y = 0; y <= MAP_H; y += LAND_ROW) pts.push(Math.max(0, landLeftX(y) - p) + "," + y);
  return "M0,0 L" + pts.join(" L") + " L0," + MAP_H + " Z";
}

/** 公式地点的"道"：安全点 / 富矿点 / 遗迹点 */
function spotLane(id){
  if(id.slice(-4) === "Safe") return 0;
  if(id.slice(-4) === "Rich") return 1;
  return 2;
}

/** 简单字符串散列（公式地点用它决定角度，保证同一地点永远同一位置） */
function mapHash(s){
  let h = 2166136261;
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}

/** 任意地点的世界坐标（底图坐标，单位=底图像素）。中心放射 + 散列抖动 + 陆地吸附，确定性。 */
function spotPos(id){
  const sp = (typeof SPOTS !== "undefined") && SPOTS[id];
  const t = sp ? (sp.zone || sp.tier || 1) : 1;
  const C = MAP_CENTER;
  const tier = Math.max(1, Math.min(12, t));
  const ring = 120 + (tier - 1) * 44;               /* 半径：T1≈120 → T12≈620 */
  const lane = spotLane(id);                        /* 0 安全 / 1 富矿 / 2 遗迹 */
  const baseDeg = (tier * 29) % 360;                /* 阶段错位，避免总堆同一方向 */
  const laneDeg = lane * 47;                        /* 类型分扇区 */
  const jitter = (mapHash(id) % 31) - 15;           /* ±15° 抖动 */
  const deg0 = baseDeg + laneDeg + jitter;
  const at = d => {
    const rad = d * Math.PI / 180;
    return { x: C.x + Math.cos(rad) * ring, y: C.y + Math.sin(rad) * ring * 0.82 };
  };
  /* ① 原位落点（大多数地点本来就在陆地上） */
  let p = at(deg0);
  if(onLand(p.x, p.y, LAND_PAD)) return { x: Math.round(p.x), y: Math.round(p.y) };
  /* ② 原位在海上 → 向右滑到海岸线内侧（保持纬度，最符合"往右边大陆挪"的直觉）。
   *    滑过去的点同时要离避难所 ≥ring*0.85，保留"越远越危险"的视觉梯度（旧长条布局有 clamp 下限 330）。 */
  if(p.y >= LAND_EDGE && p.y <= MAP_H - LAND_EDGE){
    const sx = landLeftMax(p.y) + LAND_PAD;
    const sy = p.y;
    if(sx <= MAP_W - LAND_EDGE && Math.hypot(sx - C.x, sy - C.y) >= ring * 0.85) return { x: Math.round(sx), y: Math.round(sy) };
  }
  /* ③ 还不行 → 绕避难所小幅旋转找陆地（±12°，最多转一圈） */
  for(let k = 1; k <= 15; k++){
    for(const d of [deg0 + 12 * k, deg0 - 12 * k]){
      p = at(d);
      if(onLand(p.x, p.y, LAND_PAD)) return { x: Math.round(p.x), y: Math.round(p.y) };
    }
  }
  /* ④ 兜底：贴海岸线落位（理论上到不了这一步） */
  const y = Math.max(LAND_EDGE, Math.min(MAP_H - LAND_EDGE, C.y + ring * 0.5));
  return { x: Math.round(Math.min(MAP_W - LAND_EDGE, landLeftMax(y) + LAND_PAD)), y: Math.round(y) };
}


/* ---------- 轨迹（"脱机挂"要看的运行日志） ---------- */
/** 记一个轨迹点：kind = move/discover/dis/age/born，note 为附注 */
function trailPush(kind, spot, note){
  if(!S) return;
  S.trail = S.trail || [];
  const d = Math.floor(S.day || 0), h = Math.floor((S.day || 0) % 1 * 24);
  const last = S.trail[S.trail.length - 1];
  /* 同一时刻、同一地点、同类事件不重复记（避免每秒刷屏） */
  if(last && last.k === kind && last.s === spot && last.d === d && last.h === h && (last.n || null) === (note || null)) return;   /* null/undefined 归一比较 */
  S.trail.push({ d, h, k: kind, s: spot || null, n: note || null });
  if(S.trail.length > TRAIL_CAP) S.trail.splice(0, S.trail.length - TRAIL_CAP);
}
function trailSince(realtimeMs){
  const arr = S.trail || [];
  if(!realtimeMs) return arr;
  const from = arr.filter(x => x.t >= realtimeMs);
  return from.length ? from : arr.slice(-40);
}
/** 给轨迹点补上真实时间戳（仅内存，不入存档，回放排序用） */
function trailStamp(){ const t = S.trail && S.trail[S.trail.length - 1]; if(t && !t.t) t.t = Date.now(); }

/** 某个游戏日内的轨迹（回放用） */
function trailOfDay(day){ return (S.trail || []).filter(x => x.d === day); }
/** 最后一个"位置点"（角色当前位置） */
function lastTrailPos(){
  const arr = S.trail || [];
  for(let i = arr.length - 1; i >= 0; i--) if(arr[i].s) return arr[i];
  return null;
}

/** 角色当前该画在哪：优先"当前时段的活动地点"，否则用最后一个轨迹点 */
function heroSpotNow(){
  const seg = segOf((S.day * 24) % 24);
  const act = actOf(seg);
  if(act && SPOTS[act]) return act;
  if(act === "explore" || act === "workbench" || act === "rest") return null;   /* 在避难所 */
  const lt = lastTrailPos();
  return lt ? lt.s : null;
}

/* ---------- 地图节点（含"未发现"的虚影：只有当前阶段能看见的才显示） ---------- */
function mapNodes(){
  const out = [];
  /* v8.22：只画"已发现"与"当前体系待发现队列里的点"。
   *  老档残留的旧版地点（endless 初版 endMine/endRelic 系列）既没被发现、也不在队列里，
   *  以前因为 tier ≤ 阶段被当成虚影画出来 → 一堆重名点堆在右端（与 v8.18b 的队列清理保持一致）。 */
  const queueSet = new Set(S.queue || []);
  for(const id in SPOTS){
    const sp = SPOTS[id];
    const known = (S.found || []).includes(id);
    if(!known && !queueSet.has(id)) continue;
    out.push({
      id, name: sp.name, icon: sp.icon,
      pos: spotPos(id),
      threat: (typeof spotThreat === "function") ? spotThreat(id) : sp.threat,
      tier: sp.tier || 1,
      known
    });
  }
  return out;
}

/** 离线/挂机概览（右上角统计卡用） */
function mapSummary(){
  const arr = S.trail || [];
  const places = new Set(arr.filter(x => x.s).map(x => x.s));
  const dis = arr.filter(x => x.k === "dis");
  const born = arr.filter(x => x.k === "born");
  return {
    spots: places.size,
    disCount: dis.length,
    disWin: dis.filter(x => x.n && x.n.indexOf("win") === 0).length,
    born: born.length,
    points: arr.length,
    from: arr.length ? arr[0] : null,
    to: arr.length ? arr[arr.length - 1] : null
  };
}

/** 主角"渲染位置"：时段前 1/4 从"上一时段所在地点"平滑走向本时段地点
 *  （v8.16b 修正：起点必须取上一时段的活动地点；旧实现取轨迹最后一个地点，
 *   常常等于目标 → 原地不动，看不出在赶路。）纯表现，不影响结算。 */
function heroRenderPos(){
  const hod = (S.day * 24) % 24;
  const seg = segOf(hod);
  const act = actOf(seg);
  const cur = (act && SPOTS[act]) ? spotPos(act) : { x: MAP_CENTER.x, y: MAP_CENTER.y };
  const prevSeg = seg === "am" ? "night" : seg === "pm" ? "am" : "pm";
  const prevAct = actOf(prevSeg);
  const from = (prevAct && SPOTS[prevAct]) ? spotPos(prevAct) : { x: MAP_CENTER.x, y: MAP_CENTER.y };
  const segStart = hod < 6 ? 0 : hod < 12 ? 6 : hod < 18 ? 12 : 18;
  const p = Math.min(1, Math.max(0, (hod - segStart) / 6));
  const ease = Math.min(1, p / 0.25);                    /* 前 1.5 游戏小时 = 赶路 */
  return {
    x: Math.round(from.x + (cur.x - from.x) * ease),
    y: Math.round(from.y + (cur.y - from.y) * ease),
    moving: ease < 1,
    spot: (act && SPOTS[act]) ? act : null
  };
}
