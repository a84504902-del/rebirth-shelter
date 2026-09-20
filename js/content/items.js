/* ============================================================
 * content/items.js — 物品定义表
 *
 * 每个物品登记：名字、图标、分类、阶层、容量占用
 *   cat : mat = 材料，use = 消耗品
 *   tier: 1 = 基础（开局可用）  2 = 工业（第 3 灾后解锁）  3 = 能源（第 5 灾后解锁）
 *         ★ 高阶层物品在低阶段【绝对不出现】——不是概率低，是没进池子
 *   vol : 每单位占用的仓储容量（木材 = 1 为基准）
 *
 * 新增物品：在这里加一行，配好 tier 与 vol，箱子/配方里就能直接引用
 * ============================================================ */
"use strict";

const ITEM_CAT = { mat: "材料", use: "消耗品", made: "加工品" };

/* ------------------------------------------------------------
 * 物品总表
 * ------------------------------------------------------------ */
const ITEMS = {
  /* ---------- T1 基础材料 ---------- */
  wood:      { name: "木材",     icon: "🪵", cat: "mat", tier: 1, vol: 1 },
  stone:     { name: "石料",     icon: "🪨", cat: "mat", tier: 1, vol: 1 },
  metal:     { name: "废金属",   icon: "⚙️", cat: "mat", tier: 1, vol: 1 },
  cloth:     { name: "布料",     icon: "🧵", cat: "mat", tier: 1, vol: 0.5 },
  pelt:      { name: "兽皮",     icon: "🟤", cat: "mat", tier: 1, vol: 0.5 },
  bone:      { name: "骨头",     icon: "🦴", cat: "mat", tier: 1, vol: 0.5 },
  scale:     { name: "鳞片",     icon: "🐊", cat: "mat", tier: 1, vol: 0.4 },

  /* ---------- T1 加工材料 ---------- */
  plank:     { name: "木板",     icon: "🪚", cat: "made", tier: 1, vol: 1.5, made: true },
  rope:      { name: "绳索",     icon: "🪢", cat: "made", tier: 1, vol: 0.6, made: true },

  /* ---------- T1 消耗品 ---------- */
  food:      { name: "口粮",     icon: "🥫", cat: "use", tier: 1, vol: 0.4 },
  water:     { name: "水",       icon: "💧", cat: "use", tier: 1, vol: 0.4 },
  meat:      { name: "生肉",     icon: "🥩", cat: "use", tier: 1, vol: 0.4 },
  jerky:     { name: "熏肉",     icon: "🍖", cat: "use", tier: 1, vol: 0.3, made: true },
  bait:      { name: "诱饵",     icon: "🪱", cat: "use", tier: 1, vol: 0.2, made: true },
  medkit:    { name: "绷带",     icon: "🩹", cat: "use", tier: 1, vol: 0.2, made: true },
  stim:      { name: "兴奋剂",   icon: "💉", cat: "use", tier: 1, vol: 0.2, made: true },

  /* ---------- T2 工业材料（第 3 灾后解锁） ---------- */
  ironOre:   { name: "铁矿石",   icon: "⛰️", cat: "mat", tier: 2, vol: 1.2 },
  copperOre: { name: "铜矿石",   icon: "🟧", cat: "mat", tier: 2, vol: 1.2 },
  coal:      { name: "煤",       icon: "⬛", cat: "mat", tier: 2, vol: 0.8 },
  ironChunk: { name: "铁块",     icon: "🔩", cat: "made", tier: 2, vol: 2, made: true },
  copper:    { name: "铜块",     icon: "🟠", cat: "made", tier: 2, vol: 2, made: true },
  steel:     { name: "钢",       icon: "🔗", cat: "made", tier: 2, vol: 2.5, made: true },
  leather:   { name: "皮革",     icon: "🟫", cat: "made", tier: 2, vol: 1, made: true },

  /* ---------- T3 能源与化工材料（第 5 灾后解锁） ---------- */
  sulfur:    { name: "硫磺",     icon: "🟡", cat: "mat", tier: 3, vol: 0.8 },
  niter:     { name: "硝石",     icon: "⚪", cat: "mat", tier: 3, vol: 0.8 },
  oil:       { name: "石油",     icon: "🛢️", cat: "mat", tier: 3, vol: 1 },
  copperWire:{ name: "铜线",     icon: "〰️", cat: "made", tier: 3, vol: 0.3, made: true },
  gunpowder: { name: "火药",     icon: "💥", cat: "made", tier: 3, vol: 0.3, made: true },
  battery:   { name: "电池",     icon: "🔋", cat: "made", tier: 3, vol: 0.6, made: true },
  fuel:      { name: "燃料",     icon: "⛽", cat: "made", tier: 3, vol: 0.8, made: true }
};

/** 显示名（找不到就回退到 key，方便调试） */
function itemName(k){ return ITEMS[k] ? ITEMS[k].name : k; }
function itemIcon(k){ return ITEMS[k] ? ITEMS[k].icon : "❔"; }
/** 物品阶层 */
function itemTier(k){ return ITEMS[k] ? (ITEMS[k].tier || 1) : 1; }
/** 容量占用（每单位） */
function itemVol(k){ return ITEMS[k] ? (ITEMS[k].vol === undefined ? 1 : ITEMS[k].vol) : 1; }

/** 顶栏固定展示的核心资源 */
const HUD_RES = ["wood", "stone", "metal", "food", "water"];

/** 库存面板的分组（顺序即显示顺序，组内顺序即显示顺序） */
const INV_GROUPS = [
  { id: "mat",  name: "材料",   keys: ["wood","stone","metal","ironOre","copperOre","coal","sulfur","niter","oil","cloth","pelt","bone","scale"] },
  { id: "made", name: "加工品", keys: ["plank","rope","leather","ironChunk","copper","steel","copperWire","gunpowder","battery","fuel"] },
  { id: "use",  name: "消耗品", keys: ["food","water","meat","jerky","bait","medkit","stim"] }
];

/** 构造物品字典（用于 newState 初始化 / 存档迁移） */
function blankItems(){
  const o = {};
  for(const k in ITEMS) o[k] = 0;
  return o;
}

/** 当前仓储已占用的容量 */
function storageUsed(){
  let n = 0;
  for(const k in ITEMS){
    const v = S.res[k];
    if(v) n += v * itemVol(k);
  }
  return n;
}
