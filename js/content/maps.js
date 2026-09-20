/* ============================================================
 * content/maps.js — 区域地图体系 ★ v8.17
 *
 * 设计目标（用户："玩游戏的都知道换高级地图出高级材料"）：
 *   1) 每个阶段解锁一张**专属区域**，区域产该时代的新材料
 *   2) 新区域**直接产出当代加工品**（钢/铜线/电池/合金锭…）——
 *      绕开"原料→炼→再炼"的长链条，换图即有跨越式收益
 *   3) 新材料必须接进**建造链**（材质档 Lv10+ 起吃新材料），否则只是摆设
 *   4) 采集产量随材质档缩放：yieldScale = 2.2^(house-7)，与材质成本同源
 *      → 每升一档材质的耗时恒定（2~4 天），后期不再"数学上不可达"
 *
 * 加载顺序：必须在 endless.js 之后（覆盖其生成的阶段地点队列）。
 * ============================================================ */
"use strict";

/* ---------- 新增高阶加工品（T5/T6） ---------- */
const HIGH_GOODS = [
  { key: "alloyIngot",  name: "合金锭",   icon: "🔩", tier: 5, vol: 1.2 },
  { key: "quantumCoil", name: "量子线圈", icon: "🧬", tier: 6, vol: 1.5 }
];

/* ---------- 区域定义：T1~T3 用现有地点，T4+ 公式生成 ---------- */
const MAP_DEFS = [
  { tier: 1, name: "家园废墟", icon: "🏚️", spots: ["junk", "forest", "quarry", "river"], mat: null, goods: [] },
  { tier: 2, name: "旧工业带", icon: "🏭", spots: ["ironMine", "copperMine", "coalSeam"], mat: null, goods: [] },
  { tier: 3, name: "能源走廊", icon: "🛢️", spots: ["station", "market", "trail", "sulfurPit", "niterBed", "oilField"], mat: null, goods: [] }
];

const ZONE_NAMES = [
  ["幽能禁区", "星尘荒原", "虚空裂界", "奇点深渊", "彼岸平原", "终焉冻原"],
  ["寂静回廊", "坍缩盆地", "逆流峡谷", "白夜高地", "深红海沟", "最后灯塔"]
];
const ZONE_ICONS = ["🔆", "✨", "🌌", "🌀", "🕯️", "♾️"];
const ZONE_SPOT_NAMES = {
  safe:  ["废弃观测站", "荒原补给点", "裂界入口", "静默哨所", "干涸绿洲", "残骸营地"],
  rich:  ["富矿脉", "深层矿洞", "坍缩矿井", "逆流矿带", "白夜矿田", "终焉矿脉"],
  relic: ["上古遗迹", "先驱者基地", "轨道残骸", "时间褶皱", "静默方尖碑", "尽头观测站"]
};
const ZONE_ROMAN = ["", "·Ⅱ", "·Ⅲ", "·Ⅳ", "·Ⅴ", "·Ⅵ", "·Ⅶ", "·Ⅷ", "·Ⅸ", "·Ⅹ"];
/** 材料阶梯：每张区域产主导材料 + 下方各一档（递减），保证任何档位的建造材料都有来源 */
const MAT_LADDER = ["prism", "stardust", "voidAlloy", "quantumCoil"];
function ladderFill(t, top){
  const o = {}; const dom = Math.min(MAT_LADDER.length - 1, Math.max(0, t - 4));
  for(let k = 0; k < MAT_LADDER.length; k++){
    const idx = dom - k; if(idx < 0) break;
    o[MAT_LADDER[idx]] = k === 0 ? top : (k === 1 ? Math.max(0.2, top * 0.6) : Math.max(0.1, top * 0.35));
  }
  return o;
}

/* 区域主导材料：T4 幽能结晶 → T5 星尘 → T6 虚空合金 → T7+ 量子线圈 */
function zoneMatKey(tier){
  if(tier <= 4) return "prism";
  if(tier === 5) return "stardust";
  if(tier === 6) return "voidAlloy";
  return "quantumCoil";
}
/** 该区域直产的加工品（绕开制作线瓶颈的"换图红利"） */
function zoneGoodKeys(tier){
  const g = ["steel", "copperWire"];
  /* v8.21：电池是 T3 加工品、Lv10+ 材质档全都要用——不能只在 z6+ 区域才有
   *  （旧值 tier>=6 → 玩家在阶段 6 打不过 z6/威胁 9019，就只能靠制作线 134/天做电池，
   *    53469 个要 398 天 = 数值断档）。提前到 T4 区域。 */
  if(tier >= 4) g.push("battery");
  if(tier >= 6) g.push("alloyIngot");
  if(tier >= 7) g.push("quantumCoil");
  return g;
}

/* ---------- 产量倍率（与材质成本同源） ---------- */
/** 采集产量倍率：house 7 级为 1，每档 ×2.0（成本每档 ×2.2 → 每档耗时从 1.2 天缓慢升到 3.8 天 = 软墙） */
const YIELD_SCALE_K = 2.0;
function yieldScaleMul(){
  const lv = (typeof S !== "undefined" && S && S.bld) ? (S.bld.house || 1) : 1;
  return Math.pow(YIELD_SCALE_K, Math.max(0, lv - 7));
}
/* 注：v8.18 起**不再**用全局倍率放大仓储容量（旧做法让容量直接变 3.5 亿，把"仓储建设"整条消掉了）。
 * 容量只来自「储物箱档位」——每阶段放出一档新的存储设备，必须拿到图纸 + 花材料才建得起来。 */
/** 某地点的产量倍率 = 全局倍率（与材质成本同源）。
 *  区域的价值体现在"产什么"（新材料 + 直产加工品），而不是再叠一层数量倍率——
 *  否则每档耗时反而递减（越后期越快），后期就没有推进节奏了。 */
function spotYieldMul(sp){
  return yieldScaleMul();
}

/* ---------- 生成 T4~T12 区域与地点 ---------- */
function buildZones(){
  if(typeof SPOTS === "undefined" || typeof ITEMS === "undefined") return;
  const matGroup = (typeof INV_GROUPS !== "undefined") && INV_GROUPS.find(g => g.id === "mat");
  for(const g of HIGH_GOODS){
    if(ITEMS[g.key]) continue;
    ITEMS[g.key] = { name: g.name, icon: g.icon, cat: "mat", tier: g.tier, vol: g.vol };
    if(matGroup && !matGroup.keys.includes(g.key)) matGroup.keys.push(g.key);
    if(typeof TIER_NAME !== "undefined" && !TIER_NAME[g.tier]) TIER_NAME[g.tier] = "T" + g.tier + " 超越";
  }

  for(let t = 4; t <= 12; t++){
    const round = Math.floor((t - 4) / ZONE_NAMES[0].length);
    const idx = (t - 4) % ZONE_NAMES[0].length;
    const suf = round > 0 ? (ZONE_ROMAN[round] || ("+" + round)) : "";
    const zoneName = ZONE_NAMES[0][idx] + suf;
    const mat = zoneMatKey(t);
    const goods = zoneGoodKeys(t);
    const threatBase = (typeof endlessSpotThreat === "function") ? endlessSpotThreat(t) : Math.round(600 * Math.pow(3.24, t - 4));
    const ids = [];

    const safeY = ladderFill(t, 1.0); safeY[goods[0]] = 1.5; safeY.coal = 3; safeY.stone = 4;
    if(goods[2]) safeY[goods[2]] = 0.3;      /* v8.21 安全点也少量产当期加工品（稳妥的落脚点也有基本盘） */
    const safeId = "z" + t + "Safe";
    SPOTS[safeId] = { tier: t, zone: t, threat: threatBase, name: ZONE_SPOT_NAMES.safe[idx] + suf, icon: ZONE_ICONS[idx],
      y: safeY, danger: 0.35, chest: 0.6, ct: "relic",
      desc: zoneName + "的边缘据点——威胁最低，刚进这片区域时先来这里落脚。" };

    const richY = ladderFill(t, 1.6); richY[goods[0]] = 2.5; richY[goods[1]] = 1.2; richY.metal = 5;
    if(goods[2]) richY[goods[2]] = 0.6;      /* 电池（T4 起） */
    if(goods[3]) richY[goods[3]] = 0.8;      /* 高阶区域额外直产合金锭 */
    if(goods[4]) richY[goods[4]] = 0.5;      /* v8.21：量子线圈（T7 起）——旧值遗漏，T7+ 富矿点其实不产它 */
    const richId = "z" + t + "Rich";
    SPOTS[richId] = { tier: t, zone: t, threat: Math.round(threatBase * 1.3), name: ZONE_SPOT_NAMES.rich[idx] + suf, icon: "⛏️",
      y: richY, danger: 0.45, chest: 0.55, ct: "relic",
      desc: zoneName + "的富矿脉——产量最高，守卫也最凶。" };

    const relicY = ladderFill(t, 0.6); relicY[goods[goods.length - 1]] = 1.0; relicY.oil = 2;
    const relicId = "z" + t + "Relic";
    SPOTS[relicId] = { tier: t, zone: t, threat: Math.round(threatBase * 1.5), name: ZONE_SPOT_NAMES.relic[idx] + suf, icon: "🗿",
      y: relicY, danger: 0.5, chest: 0.95, ct: "relic",
      desc: zoneName + "的遗迹——箱子最多（图纸的主要来源），材料少、守卫凶。" };

    ids.push(safeId, richId, relicId);
    MAP_DEFS.push({ tier: t, name: zoneName, icon: ZONE_ICONS[idx], spots: ids, mat, goods });

    /* 区域解锁由阶段推进驱动：queue 表按阶段覆盖（endless.js 生成的旧点不再入队，数据保留兼容老档） */
    if(typeof SPOTQUEUE_BY_AGE !== "undefined") SPOTQUEUE_BY_AGE[t] = ids.slice();
  }

  /* 新材料接进建造链：材质档 Lv10+ 起吃区域材料（否则新地图材料对建造毫无用处） */
  const HOUSE_MAT_GATE = { 10: "prism", 13: "stardust", 16: "voidAlloy", 19: "alloyIngot" };
  for(const lvS in HOUSE_MAT_GATE){
    const lv = Number(lvS), t = HOUSE_TIERS[lv];
    if(!t || !t.cost) continue;
    const key = HOUSE_MAT_GATE[lvS];
    if(!t.cost[key]) t.cost[key] = Math.max(3, Math.round((t.cost.steel || 10) * 0.08));
  }
  /* 预生成段之后的档位按 ×2.2 重推，让新材料数量继续增长 */
  for(let lv = 20; lv < HOUSE_TIERS.length; lv++){
    const prev = HOUSE_TIERS[lv - 1], cur = HOUSE_TIERS[lv];
    if(!prev || !cur || !prev.cost) continue;
    const c = {};
    for(const k in prev.cost) c[k] = Math.ceil(prev.cost[k] * 2.2);
    cur.cost = c;
  }
}

/* ---------- 查询 ---------- */
function mapOfSpot(id){
  const sp = (typeof SPOTS !== "undefined") && SPOTS[id];
  if(!sp) return null;
  if(sp.zone){
    for(const m of MAP_DEFS) if(m.tier === sp.zone) return m;
  }
  for(const m of MAP_DEFS) if(m.spots.includes(id)) return m;
  return null;
}
function mapNameOfSpot(id){ const m = mapOfSpot(id); return m ? m.name : "未知区域"; }
function currentZoneName(spotId){ return spotId ? mapNameOfSpot(spotId) : "避难所"; }
/** 已解锁的区域列表（阶段 ≤ 当前阶段） */
function unlockedZones(){ return MAP_DEFS.filter(m => m.tier <= (S.age || 1)); }

/* ============================================================
 * 储物箱档位（v8.18，用户："不能白送容量，每个阶段放出新的存储设备，
 * 得制作出来才能用，也要有相应的图纸"）
 *
 *   lv6 起每档对应一个阶段（lv6 → 阶段 4），容量 ×2.0（与采集产量同源，
 *   保证"容量 ≈ 固定天数缓冲"恒定）；材料 = 当代加工品 + 该阶段主导材料；
 *   图纸只在对应阶段掉落（bpTierOf 走 tier 字段）。
 * ============================================================ */
const STORE_NAMES = ["合金仓库", "星尘库房", "虚空仓库", "奇点库房", "彼岸库房", "终焉库房"];
const STORE_NOTES = [
  "钢梁骨架，压得住整层货架",
  "星尘镀膜——潮气进不来",
  "空间锚定：装进去的东西不会颠出来",
  "重力置物架，东西自己归位",
  "折叠货架，一格子装一天的量",
  "尽头的库房——世界塌了它还在"
];
function buildStorageTiers(){
  if(typeof STORAGE_TIERS === "undefined") return;
  const MAX = (typeof STORAGE_MAX !== "undefined") ? STORAGE_MAX : 20;
  const ROMAN = ["", "·Ⅱ", "·Ⅲ", "·Ⅳ", "·Ⅴ", "·Ⅵ", "·Ⅶ", "·Ⅷ", "·Ⅸ", "·Ⅹ"];
  let prev = STORAGE_TIERS[STORAGE_TIERS.length - 1];
  for(let lv = 6; lv <= MAX; lv++){
    if(STORAGE_TIERS.some(t => t.lv === lv)) continue;
    const idx = (lv - 6) % STORE_NAMES.length;
    const round = Math.floor((lv - 6) / STORE_NAMES.length);
    const suf = round > 0 ? (ROMAN[round] || ("+" + round)) : "";   /* 空串是假值，别用 || 兜底 */
    const stage = lv - 2;                                           /* 对应阶段：lv6 → 阶段 4 */
    /* 图纸分层封顶在"最高阶段"（否则 lv15+ 的 tier 超出阶段表，图纸永远掉不出来 = 死档） */
    const maxStage = (typeof AGES !== "undefined" && AGES.length) ? AGES.length : 12;
    const tier = Math.min(stage, maxStage);
    const k = Math.pow(1.9, lv - 6);
    /* v8.23：储物箱只用加工品（钢/铜线/电池）——不用区域材料。
       它是要玩家频繁升的基础设施，而区域材料（虚空合金/量子线圈）卡在 z6+ 的高威胁区，
       战力没跟上就会陷入今天这种爆仓（容量升不动、产量天天涨）。 */
    const cost = { steel: Math.ceil(60 * k), copperWire: Math.ceil(30 * k), battery: Math.ceil(12 * k) };
    const nm = STORE_NAMES[idx] + suf;
    const t = { lv, name: nm, cap: Math.round(prev.cap * 2.0), note: STORE_NOTES[idx],
                bp: nm + "图纸", tier, stage, cost };
    STORAGE_TIERS.push(t);
    if(typeof STORAGE_BP !== "undefined" && !STORAGE_BP.includes(t.bp)) STORAGE_BP.push(t.bp);
    prev = t;
  }
}
/** 某个储物档位需要的阶段（0/1 档无门槛） */
function storageStageOf(n){
  const t = storageTier(n);
  return t.stage || Math.min(3, Math.max(1, t.tier || 1));
}

buildZones();
buildStorageTiers();
