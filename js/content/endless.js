/* ============================================================
 * content/endless.js — 无限阶段（阶段 4+ 公式化）★ v8.14
 *
 * 为什么需要：阶段表原本只有 3 项，玩家挂到 day 260 时阶段推进停滞——
 * 连带冻结"探索池/图纸池/灾种池"，只剩材质档还能升（内容天花板）。
 *
 * 本模块把"阶段"变成公式：阶段 n（4~12）自动生成
 *   ├─ 新物品阶层 T4~T6（幽能结晶 / 星尘 / 虚空合金）——真正的门控（itemAllowed 按 tier）
 *   ├─ 新探索点 ×2（矿点 + 遗迹点）：产出高阶材料，威胁按"上一代武器 ×1.2"锚定
 *   ├─ 新灾种 ×4（按天灾场次解锁，wave 确定 → 离线重放可复现）
 *   └─ 阶段条目（名称/图标/推进条件/解锁清单/入幕文案）
 *
 * 加载顺序：本文件必须在 loot.js **之后**（EQUIP_VAL / SPOTS / AGES / ITEMS 都就绪），
 * 且会自行调用 buildEndlessContent() 完成注册。
 * ============================================================ */
"use strict";

/* ---------- 高阶材料（T4~T6）：阶段 4/5/6 起各解锁一种 ---------- */
const ENDLESS_MATS = [
  { key: "prism",     name: "幽能结晶", icon: "🔆", tier: 4, vol: 0.8, from: 4 },
  { key: "stardust",  name: "星尘",     icon: "✨", tier: 5, vol: 0.6, from: 5 },
  { key: "voidAlloy", name: "虚空合金", icon: "🌌", tier: 6, vol: 1.0, from: 6 }
];

/* ---------- 阶段命名池（每 6 个循环一轮，加罗马数字后缀） ---------- */
const AGE_NAME_POOL = ["幽能纪元", "星尘纪元", "虚空纪元", "奇点纪元", "彼岸纪元", "终焉纪元"];
const AGE_ERA_POOL  = ["幽能时代", "星际时代", "虚空时代", "奇点时代", "彼岸时代", "终焉时代"];
const AGE_ICON_POOL = ["🔆", "✨", "🌌", "🌀", "🕯️", "♾️"];
const AGE_ROMAN = ["", "·Ⅱ", "·Ⅲ", "·Ⅳ", "·Ⅴ", "·Ⅵ", "·Ⅶ", "·Ⅷ", "·Ⅸ", "·Ⅹ"];

/* ---------- 探索点命名池 ---------- */
const ENDLESS_SPOT_NAMES = [
  ["幽能井", "星尘陨坑", "虚空裂隙", "奇点熔炉", "彼岸花园", "终焉矿脉"],
  ["上古遗迹", "先驱者基地", "轨道残骸", "时间褶皱", "静默方尖碑", "尽头观测站"]
];

/* ---------- 新灾种（按天灾场次解锁：wave 确定 → 离线重放可复现） ---------- */
const ENDLESS_DIS = [
  { name: "幽能风暴", mult: 1.30, tag: "hazard:radiation", unlockWave: 30, tip: "幽能脉冲灼烧建筑——密封与地下空间是唯一答案" },
  { name: "虚空潮汐", mult: 1.35, tag: "hazard:acid",      unlockWave: 38, tip: "空间被撕开一道口子——防酸涂层与结构强度都要顶住" },
  { name: "星尘雨",   mult: 1.40, tag: "hazard:cold",      unlockWave: 46, tip: "天上下的是冰与星尘——保温夹层决定谁能睡到天亮" },
  { name: "熵增",     mult: 1.50, tag: "hazard:heat",      unlockWave: 54, tip: "热力学第二定律成了武器——地下室和隔热层是最后的体面" }
];

/** 已解锁的灾种池（按天灾场次，确定性） */
function disPoolAtWave(w){
  const passed = Math.max(0, (w || 1) - 1);
  const pool = DIS_TYPES.filter(t => t.unlockWave === undefined || t.unlockWave <= passed);
  return pool.length ? pool : [DIS_TYPES[0]];
}
/** 第 w 场天灾的类型（替换原先的 DIS_TYPES[(w-1) % len]） */
function disTypeAtWave(w){
  const pool = disPoolAtWave(w);
  return pool[(Math.max(1, w) - 1) % pool.length];
}

/** 第 n 阶段探索点的威胁：以"上一代武器（中值）×1.2"锚定 ——
 *  新阶段初期用旧装备吃力，造出新时代装备后轻松（与装备代际 ×1.8 同源）。 */
function endlessSpotThreat(n){
  const t = Math.min(24, Math.max(1, 2 * n - 3));
  const v = (EQUIP_VAL[t].weapon[0] + EQUIP_VAL[t].weapon[1]) / 2;
  return Math.max(20, Math.round(v * 1.2));
}

/** 阶段 n 解锁的高阶材料（T4~T6；阶段 7+ 仍产这三种，量更大） */
function endlessMatOf(n){ return ENDLESS_MATS[Math.min(ENDLESS_MATS.length - 1, n - 4)]; }

/* ============================================================
 * 构建：把上面的一切注册进现有系统
 * ============================================================ */
function buildEndlessContent(){
  if(typeof AGES === "undefined" || AGES.length > 3) return;   /* 幂等 */
  const LAST_AGE = 12;

  /* 1) 高阶材料物品 */
  const matGroup = (typeof INV_GROUPS !== "undefined") && INV_GROUPS.find(g => g.id === "mat");
  for(const m of ENDLESS_MATS){
    ITEMS[m.key] = { name: m.name, icon: m.icon, cat: "mat", tier: m.tier, vol: m.vol };
    if(matGroup && !matGroup.keys.includes(m.key)) matGroup.keys.push(m.key);
  }
  /* 阶层显示名 */
  for(let t = 4; t <= 12; t++) TIER_NAME[t] = "T" + t + " 超越";

  /* 2) 阶段 4~12 + 探索点 */
  for(let n = 4; n <= LAST_AGE; n++){
    const round = Math.floor((n - 4) / AGE_NAME_POOL.length);
    const suf = round > 0 ? (AGE_ROMAN[round] || ("+" + round)) : "";   /* 空串是假值：round=0 时不能走 || 分支 */
    const name = AGE_NAME_POOL[(n - 4) % AGE_NAME_POOL.length] + suf;
    const spotNames = ENDLESS_SPOT_NAMES[0], relicNames = ENDLESS_SPOT_NAMES[1];
    const idx = (n - 4) % spotNames.length;
    const mat = endlessMatOf(n);
    const threat = endlessSpotThreat(n);

    /* 矿点：主产该阶段材料 */
    const mineId = "endMine" + n;
    SPOTS[mineId] = {
      tier: n, threat, name: spotNames[idx], icon: "🌠",
      y: { [mat.key]: 1.2, coal: 4, metal: 6, stone: 6 },
      danger: 0.4, chest: 0.7, ct: "relic",
      desc: `第 ${n} 阶段的资源点——${mat.name}就埋在下面，威胁 ${threat}。`
    };
    /* 遗迹点：材料较少但箱子概率高（越级特权） */
    const relicId = "endRelic" + n;
    SPOTS[relicId] = {
      tier: n, threat: Math.round(threat * 1.25), name: relicNames[idx], icon: "🗿",
      y: { [mat.key]: 0.8, oil: 3, sulfur: 3, niter: 3 },
      danger: 0.5, chest: 0.9, ct: "relic",
      desc: `第 ${n} 阶段的遗迹——旧文明的残骸，箱子多，守卫也更凶（威胁 ${Math.round(threat * 1.25)}）。`
    };

    AGES.push({
      id: n,
      name,
      era: AGE_ERA_POOL[(n - 4) % AGE_ERA_POOL.length] + suf,
      icon: AGE_ICON_POOL[(n - 4) % AGE_ICON_POOL.length],
      tier: n,
      chest: "relic",
      tagline: `天灾开始改写规则，而你已经学会改写天灾。`,
      req: { wave: 5 + (n - 3) * 6, bld: { house: Math.min(30, n + 2) } },
      spots: [mineId, relicId],
      unlock: [`${mat.name}（T${mat.tier}）`, `${spotNames[idx]} / ${relicNames[idx]}`, "高阶装备代际", "遗物箱（越级掉落）"],
      enter: [
        `第 ${n} 阶段的空气里有种说不出的味道——那是旧世界彻底死透之后，新东西开始生长的味道。`,
        `你在${relicNames[idx]}里翻出了不属于这个时代的东西：${mat.name}。`,
        `避难所又长高了一层。可天灾也在长——它从来不等你。`
      ]
    });
    /* 探索发现顺序：引擎真正读的是 SPOTQUEUE_BY_AGE（AGES[].spots 只是文案字段） */
    SPOTQUEUE_BY_AGE[n] = [mineId, relicId];
  }

  /* 3) 灾种：注册 + 替换选择逻辑去用 disTypeAtWave */
  for(const d of ENDLESS_DIS) DIS_TYPES.push(d);
}

buildEndlessContent();
