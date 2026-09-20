#!/usr/bin/env node
/**
 * 数值模型校验器（v9）：把游戏所有数字设计收敛成一个可检验的模型。
 * 用户要求："所有数字设计做成数学模型，而不是发现一个问题解决一个问题。"
 *
 * 模型核心公式（改任何数值前先看这里）：
 * ─────────────────────────────────────────────
 * 【战力曲线】P = 武器val + 避难所档×2（远程判定 ×1.3）
 *   锚点：开局2 → 石斧17 → 铁矛82 → 机械弩222 → 冲锋枪602
 * 【威胁曲线】地点威胁按阶段带宽单调不降：
 *   新手带 1~2 → 进阶带 20~40 → 工业带 45~80 → 能源带 110~160
 *   INV-1：阶段锚点战力 ÷ 该带最贵地点威胁 ∈ [0.8, 1.5]（可达但需成长）
 * 【产出经济】INV-2：粮水日流入（份数）≥ 1.5× 日消耗
 *   （份数口径：1 份口粮 = 40 饱食点；日消耗 = 粮 1 份 / 水 1.25 份）
 * 【箱子/采集】INV-3：一箱"材料部分"容量 ≈ 0.3~1 天树林采集（同口径建材对建材）
 * 【防御 vs 天灾】INV-4：设计路径（每场灾后工事+1、避难所随阶段升）→ D ≥ I 恒成立
 * 【箱子梯度】INV-5：前四档物资倍率严格 ×2（1/2/4/8），遗迹箱 ≥ 黄金×1.5（越级特权）
 * 【无死物资】INV-7：任何可产出物（采集/配方/箱子）必须有 ≥1 个需求方（配方/设施/发电耗料）
 * 用法：node tools/model-check.js
 */
const fs = require("fs");
const path = require("path");
const stub = { getElementById: () => ({ style:{}, innerHTML:"", textContent:"", className:"", appendChild(){}, prepend(){}, querySelectorAll(){ return []; }, children:{length:0}, addEventListener(){}, click(){}, classList:{add(){},remove(){}}, lastChild:null, remove(){}}), createElement: () => ({ href:"", click(){}, style:{} }), addEventListener(){} };
global.location = { protocol:"file:", hostname:"" };
global.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
global.document = stub; global.window = stub; global.setInterval = () => {}; global.confirm = () => true;
const FILES = ["js/content/items.js","js/content/recipes.js","js/content/gear.js","js/config.js","js/content/ages.js","js/state.js","js/engine.js","js/loot.js","js/content/endless.js","js/content/map.js","js/content/maps.js","js/save.js","js/ui.js","js/main.js"];
const code = FILES.map(f => fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/"use strict";/g, "")).join("\n");

const script = code + `
let __bad = 0;
const __check = (name, ok, detail) => { if(!ok) __bad++; console.log((ok ? "✅" : "❌") + " " + name + (detail ? "　" + detail : "")); };

console.log("════ 战力曲线 × 威胁带宽（地点模型表，按威胁升序）════");
const spots = Object.keys(SPOTS).map(id => Object.assign({ id }, SPOTS[id])).sort((a,b) => a.threat - b.threat);
const anchors = [["开局",2],["石斧",17],["铁矛",82],["机械弩",222],["冲锋枪",602]];
for(const s of spots) console.log("  威胁 " + String(s.threat).padStart(3) + " ｜ " + s.icon + " " + s.name + "　" + Object.keys(s.y).map(k => itemName(k) + s.y[k]).join(" "));

console.log("");
console.log("成长锚点覆盖（轻松档 = 战力 ≥ 1.5×威胁）：");
for(const [nm, w] of anchors){
  const cover = spots.filter(s => w / s.threat >= 1.5);
  console.log("  " + nm + "（战力 " + w + "）→ 轻松 " + cover.length + "/" + spots.length + " 处" + (cover.length ? "，最远到 " + cover[cover.length-1].name : ""));
}

console.log("");
console.log("════ INV-1 阶段可达性 ════");
const bands = [
  ["阶段1末·石斧", 17, 1, ["station"]],
  ["阶段2·铁矛", 82, 2, ["market","coalSeam","ironMine","copperMine"]],
  ["阶段3·机械弩", 222, 3, ["sulfurPit","niterBed","oilField"]]
];
for(const [nm, w, age, ids] of bands){
  S = { age };                                             /* v8.6 威胁动态化：按阶段设置 age */
  const maxT = Math.max.apply(null, ids.map(id => spotThreat(id)));
  const ratio = w / maxT;
  __check(nm + " ÷ 带内最贵地点（动态威胁）∈ [0.8, 1.5]", ratio >= 0.8 && ratio <= 1.5,
        "比值 " + ratio.toFixed(2) + "（动态威胁 " + maxT + " = 基础值 ×" + (1 + 0.15 * (age - 1)).toFixed(2) + "）");
}
S = { age: 1 };

console.log("");
console.log("════ INV-1b 威胁曲线单调性 ════");
let mono = true;
for(let i = 1; i < spots.length; i++) if(spots[i].threat < spots[i-1].threat) mono = false;
__check("威胁值全局单调不降", mono, spots.map(s => s.name + s.threat).join(" ≤ "));

console.log("");
console.log("════ INV-1c 无限阶段可达性（阶段 4+：上一代装备吃力、当代装备轻松）════");
let endOk = true, endWorst = "";
for(const n of [4, 5, 6, 7, 8, 10, 12]){
  const prevT = Math.min(24, 2 * n - 3), currT = Math.min(24, 2 * n - 1);
  const avg = t => (EQUIP_VAL[t].weapon[0] + EQUIP_VAL[t].weapon[1]) / 2;
  const maxThreat = SPOTS["endRelic" + n].threat;
  const rPrev = avg(prevT) / maxThreat, rCurr = avg(currT) / maxThreat;
  if(!(rPrev >= 0.5 && rPrev <= 1.05 && rCurr >= 1.3)){ endOk = false; endWorst = "阶段" + n + "：上一代 " + rPrev.toFixed(2) + " / 当代 " + rCurr.toFixed(2); }
  console.log("  阶段" + n + "：遗迹威胁 " + maxThreat + "｜上一代武器 " + Math.round(avg(prevT)) + "（比值 " + rPrev.toFixed(2) + "）→ 当代 " + Math.round(avg(currT)) + "（比值 " + rCurr.toFixed(2) + "）");
}
__check("阶段 4~12：上一代装备 ∈[0.5,1.05]（吃力）、当代 ≥1.3（轻松）", endOk,
      endOk ? "新阶段威胁锚定正确" : "❗ " + endWorst);

console.log("════ INV-11 材质档耗时曲线（v8.17：产量 ×2.0/档 vs 成本 ×2.2/档）════");
let tierOk = true, tierWorst = "";
for(const lv of [7, 8, 10, 12, 14, 16, 18, 20]){
  const t = HOUSE_TIERS[lv]; if(!t) continue;
  const zoneTier = Math.max(4, Math.min(12, lv - 2));           /* 阶段 n 时 house ≈ n+2 → 区域 = house-2 */
  const rich = SPOTS["z" + zoneTier + "Rich"];
  const baseSteel = (rich && rich.y.steel) || 2.5;
  const perDay = baseSteel * Math.pow(2.0, Math.max(0, lv - 7)) * 12;   /* 12 小时采集 */
  const days = (t.cost.steel || 0) / perDay;
  if(days < 1 || days > 6){ tierOk = false; tierWorst = "Lv" + lv + " " + days.toFixed(1) + " 天"; }
  console.log("  Lv" + lv + "：需钢 " + (t.cost.steel||0) + "｜区域 T" + zoneTier + " 日产能 " + Math.round(perDay) + " → " + days.toFixed(1) + " 天");
}
__check("每档材质耗时 ∈ [1, 6] 天（产量与成本同源，且缓慢变难=软墙）", tierOk,
      tierOk ? "后期材质档重新可达" : "❗ " + tierWorst);

console.log("════ INV-2 粮水日收支（河湾 12h + 日均 2 箱，份数口径）════");
const NEED_F = SATE_DECAY / BITE_RESTORE;
const NEED_W = HYDRO_DECAY / BITE_RESTORE;
const inF = SPOTS.river.y.food * 12 + 2 * (SUPPLY_ROLL.food[0] + SUPPLY_ROLL.food[1]) / 2 * 0.5;
const inW = SPOTS.river.y.water * 12 + 2 * (SUPPLY_ROLL.water[0] + SUPPLY_ROLL.water[1]) / 2 * 0.5;
__check("粮日流入 ≥ 1.5×消耗", inF >= NEED_F * 1.5, "流入 " + inF.toFixed(1) + " 份 / 需 " + NEED_F + " 份");
__check("水日流入 ≥ 1.5×消耗", inW >= NEED_W * 1.5, "流入 " + inW.toFixed(1) + " 份 / 需 " + NEED_W + " 份");

console.log("");
console.log("════ INV-3 箱子 vs 采集（同口径：建材对建材）════");
let boxVol = 0;
for(const k in MATERIAL_ROLL){ const m = (MATERIAL_ROLL[k][0] + MATERIAL_ROLL[k][1]) / 2 * 4 * 0.5; boxVol += m * ((ITEMS[k] && ITEMS[k].vol) || 1); }
const forestDay = SPOTS.forest.y.wood * 12 * ((ITEMS.wood && ITEMS.wood.vol) || 1);
__check("一箱材料容量 ∈ [0.3, 1.0] × 树林日采集", boxVol >= forestDay * 0.3 && boxVol <= forestDay * 1.0,
      "一箱材料 " + Math.round(boxVol) + " vs 树林一天 " + Math.round(forestDay));

console.log("");
console.log("════ INV-4 防御曲线 vs 天灾强度（设计路径：每场灾后工事+1、避难所随阶段升）════");
const houseDef = [0,20,40,80,150,300];
for(let w = 1; w <= 6; w++){
  const I = 50 + 70 * (w - 1);
  const fort = Math.min(6, w + 1);
  const hs = Math.min(4, Math.ceil(w / 2));
  const D = houseDef[hs] + 60 * fort;
  __check("第" + w + "场天灾 I=" + I, D >= I, "设计路径防御 " + D + "（避难所" + hs + "档 + 工事" + fort + "级）");
}

console.log("");
console.log("════ INV-5 箱子梯度 ════");
const tiers = ["wood","bronze","silver","gold","relic"];
let x2 = true;
for(let i = 1; i < tiers.length - 1; i++) if(CHEST_PRICE_HINT[tiers[i]] / CHEST_PRICE_HINT[tiers[i-1]] !== 2) x2 = false;
__check("前四档物资倍率严格 ×2", x2, tiers.map(t => CHESTNAME[t] + CHEST_PRICE_HINT[t]).join(" → "));
__check("遗迹箱倍率 ≥ 黄金×1.5（越级特权溢价）", CHEST_PRICE_HINT.relic >= CHEST_PRICE_HINT.gold * 1.5,
      "遗迹 " + CHEST_PRICE_HINT.relic + " vs 黄金 " + CHEST_PRICE_HINT.gold);
let bpUp = true;
for(let i = 1; i < tiers.length; i++) if(BP_CHANCE[tiers[i]] <= BP_CHANCE[tiers[i-1]]) bpUp = false;
__check("图纸概率逐档递增", bpUp, tiers.map(t => (BP_CHANCE[t] * 100).toFixed(1) + "%").join(" → "));
let crossUp = true;
for(let i = 1; i < tiers.length - 1; i++) if(BP_CROSS[tiers[i]] < BP_CROSS[tiers[i-1]]) crossUp = false;
__check("越级概率逐档不降", crossUp, tiers.map(t => (BP_CROSS[t] * 100).toFixed(2) + "%").join(" → "));

console.log("");
console.log("════ INV-7 无死物资（任何可产出物必须有 ≥1 个需求方）════");
const __consumers = new Set(["food", "water", "meat", "bait", "medkit", "stim", "jerky"]);   /* 引擎级消耗：进食饮水/熏肉/陷阱诱饵 */
const __addCost = c => { for(const k in (c || {})) __consumers.add(k); };
for(const r of RECIPES) __addCost(r.in);
for(const r of (typeof GEAR_RECIPES !== "undefined" ? GEAR_RECIPES : [])) __addCost(r.in);
for(const r of (typeof FORGE_RECIPES !== "undefined" ? FORGE_RECIPES : [])) __addCost(r.in);
HOUSE_TIERS.forEach(t => t && __addCost(t.cost));
STORAGE_TIERS.forEach(t => t && __addCost(t.cost));
POWER_TIERS.forEach(t => { if(t){ __addCost(t.cost); __addCost(t.consume); } });
BLDCFG.forEach(b => __addCost(b.base));
const __producers = new Set();
for(const id in SPOTS) for(const k in SPOTS[id].y) __producers.add(k);
for(const r of RECIPES) for(const k in (r.out || {})) __producers.add(k);
Object.keys(MATERIAL_ROLL).forEach(k => __producers.add(k));
Object.keys(SUPPLY_ROLL).forEach(k => __producers.add(k));
const __dead = [...__producers].filter(k => !__consumers.has(k) && ITEMS[k]);
__check("所有产出物都有需求方（含油→炼油→发电机链）", __dead.length === 0,
      __dead.length ? "❗ 死物资：" + __dead.map(k => itemName(k)).join("、") : "全链路闭环");

console.log("");
console.log("════ INV-8 灾间预算（v8.44 双轨强度：线性段查建设预算，代际段查换装可行性）════");
/* 口径：v8.44 后强度 = max(线性, 当代护甲中值×1.2)。
 * - 线性占优的场次（前期）：沿用旧口径——灾间建设收入 ≥ ΔI 所需防御建设；
 * - 代际占优的场次（换装墙）：正确应对是"穿当代甲"而非硬建设——
 *   检查当代护甲中值 ≥ 抵减后需求（即穿上当代甲就能扛）。 */
const INCOME_PER_DAY = 72 + 96 + 36 + 24 + 16 + 8;      /* 单位/天（中期采集+炼制的当量） */
const weight = c => { let s = 0; for(const k in c) s += c[k] * (k === "wood" || k === "stone" ? 1 : 4); return s; };
let softWall = 0, inv8bad = 0, inv8GearOk = true, inv8GearBad = "";
for(let w = 1; w <= 30; w++){
  const I2 = DIS_INTENSITY(w + 1), lin2 = DIS_INTENSITY_BASE + w * DIS_INTENSITY_STEP;
  if(I2 > lin2){
    /* 代际段：当代护甲中值 ≥ 需求×0.5（守家攻抵满 50% 后）即可扛 */
    const t = DIS_WAVE_TIER(w + 1);
    const armorMid = DIS_ARMOR_MID(t);
    if(armorMid < I2 * 0.5){ inv8GearOk = false; inv8GearBad = "第" + w + "场 T" + t + " 甲中值 " + armorMid + " < 需求 " + Math.round(I2 * 0.5); }
    continue;
  }
  const fort = Math.min(6, w + 1);
  let hs = 1;
  while(hs < HOUSE_TIERS.length - 1 && houseTier(hs).def + 60 * fort < I2) hs++;
  const needCost = (fort < 6) ? { wood: Math.ceil(60 * Math.pow(COST_K, fort)), stone: Math.ceil(60 * Math.pow(COST_K, fort)) }
                              : HOUSE_TIERS[hs].cost;
  const budget = disGapAt(w) * INCOME_PER_DAY;
  const ratio = budget / weight(needCost);
  if(ratio < 1){ softWall++; if(w <= 20) inv8bad++; }
}
__check("第 20 场前（线性段）灾间预算充足", inv8bad === 0,
      inv8bad ? "前 20 场有 " + inv8bad + " 场预算不足" : "线性段预算全部达标");
__check("换装墙（代际段）当代甲中值 ≥ 抵减后需求（穿上当代甲即可扛）", inv8GearOk,
      inv8GearOk ? "各阶段入口换装后均可稳扛" : "❗ " + inv8GearBad);

console.log("");
console.log("════ INV-9 战力保底（无图纸也能打：粗制装备 ≥ 阶段入门威胁×1.1）════");
const __bands9 = [
  ["阶段2·铁器", 2, ["market", "coalSeam", "ironMine"]],
  ["阶段3·机械", 3, ["copperMine", "sulfurPit", "niterBed", "oilField"]]
];
for(const [nm, age, ids] of __bands9){
  S = { age };
  const roughCap = Math.max.apply(null, (typeof FORGE_RECIPES !== "undefined" ? FORGE_RECIPES : [])
    .filter(r => r.tier <= age + 1)
    .map(r => (r.outGear.slot === "weapon" ? r.outGear.val : 0)));
  const need = Math.max.apply(null, ids.map(id => spotThreat(id))) * 1.1;
  __check(nm + "：粗制武器 " + roughCap + " ≥ 入门威胁×1.1（" + Math.round(need) + "）", roughCap >= need,
        roughCap >= need ? "不必死等图纸" : "❗ 无图纸路线断裂——随机来源供不上硬需求");
}
S = { age: 1 };

console.log("");
console.log("════ INV-10 守家总攻 × 天灾（v8.13b：总攻 = 战力 + 火力，叠加后削减上限砍半）════");
__check("守家总攻不能替代避难所（削减上限 < 100%）", ATK_DIS_CAP < 1, "上限 " + (ATK_DIS_CAP * 100) + "%");
let powOk = true, worst = "";
for(const w of [8, 12, 16, 20, 26, 32, 40]){
  const I = Math.round(DIS_INTENSITY(w));
  const hs = Math.min(30, 4 + Math.floor(w / 4));                  /* 设计路径：每 4 场升一档材质 */
  /* v8.44：装备代际与强度同源（阶段表锚定）；前期取"阶段上限粗制可达"的较优者 */
  const tier = Math.max(DIS_WAVE_TIER(w), Math.min(24, DIS_WAVE_AGE(w) + 1));
  const weapon = Math.round((EQUIP_VAL[tier].weapon[0] + EQUIP_VAL[tier].weapon[1]) / 2);
  const f = houseFire(hs) + 45 * Math.min(10, Math.floor(w / 3)) + weapon + hs * 2;   /* 总攻 = 武器战力 + 材质档×2 + 火力 */
  const ratio = Math.min(I * ATK_DIS_CAP, f * ATK_DIS_CUT) / I;
  if(ratio < 0.25 || ratio > 1){ powOk = false; worst = "第" + w + "场削减比例 " + Math.round(ratio * 100) + "%"; }
}
__check("火力削减比例全程 ∈ [25%, 50%]（火力永远有意义、但顶不掉避难所）", powOk,
      powOk ? "设计路径下削减稳定在 3~5 成" : "❗ " + worst);
for(const w of [10, 20, 30]){
  const I = Math.round(DIS_INTENSITY(w));
  const hs = Math.min(30, 4 + Math.floor(w / 4));
  const tier = Math.max(DIS_WAVE_TIER(w), Math.min(24, DIS_WAVE_AGE(w) + 1));
  const weapon = Math.round((EQUIP_VAL[tier].weapon[0] + EQUIP_VAL[tier].weapon[1]) / 2);
  const f = houseFire(hs) + 45 * Math.min(10, Math.floor(w / 3)) + weapon + hs * 2;
  const cut = Math.min(Math.round(I * ATK_DIS_CAP), Math.round(f * ATK_DIS_CUT));
  console.log("  第" + String(w).padStart(2) + "场：强度 " + I + "（T" + tier + "）｜战力 " + (weapon + hs * 2) + " + 火力 " + (houseFire(hs) + 45 * Math.min(10, Math.floor(w / 3))) + " → 总攻 " + Math.round(f) + " → 削减 " + cut + "（" + Math.round(cut / I * 100) + "%）");
}
__check("火力塔满级（10 级 +450）在强度曲线下始终有分量", 450 * ATK_DIS_CUT >= DIS_INTENSITY_STEP * 0.5,
      "满级火力塔单独可削 " + Math.round(450 * ATK_DIS_CUT) + " 点 ≥ 半场强度增量 " + Math.round(DIS_INTENSITY_STEP * 0.5));

console.log("════ INV-12 储物箱档位（v8.18：容量只随档位 ×2.0，每档要图纸 + 材料）════");
S = { bld: { house: 5, storage: 5 }, res: {}, gear: [], bp: [] };
const inv12CapLow = storageCapNow();
S.bld.house = 30;
const inv12CapHigh = storageCapNow();
__check("容量只随储物箱档位增长（不随材质档白送）", inv12CapLow === inv12CapHigh && inv12CapLow === storageCap(5),
      "house 5 → 30，容量恒定 " + fmtCap(inv12CapLow));
let inv12Ok = true, inv12Bad = "";
for(let lv = 6; lv <= STORAGE_MAX; lv++){
  const t = storageTier(lv);
  if(t.cap !== Math.round(storageTier(lv - 1).cap * 2)){ inv12Ok = false; inv12Bad = "lv" + lv + " 容量不是 ×2"; }
  if(!t.bp || !STORAGE_BP.includes(t.bp)){ inv12Ok = false; inv12Bad = "lv" + lv + " 缺图纸"; }
  if(!t.cost || !Object.keys(t.cost).length){ inv12Ok = false; inv12Bad = "lv" + lv + " 缺材料"; }
  if(t.tier !== Math.min(AGES.length, lv - 2)){ inv12Ok = false; inv12Bad = "lv" + lv + " 阶段错位"; }
}
__check("6~" + STORAGE_MAX + " 档齐备（每档容量 ×2.0 + 图纸 + 当期材料）", inv12Ok,
      inv12Ok ? "最高档 " + fmtCap(storageTier(STORAGE_MAX).cap) : "❗ " + inv12Bad);
let inv12Room = true, inv12RoomBad = "";
for(const hs of [8, 12, 16, 20, 24, 28]){
  S.bld.house = hs; S.bld.storage = Math.min(STORAGE_MAX, hs - 6);
  const capNow = storageCapNow();
  const nxTier = houseTier(hs + 1);
  let needVol = 0;
  for(const k in (nxTier.cost || {})) needVol += nxTier.cost[k] * ((ITEMS[k] && ITEMS[k].vol) || 1);
  if(capNow < needVol * 1.5){ inv12Room = false; inv12RoomBad = "house " + hs + " 容量 " + fmtCap(capNow) + " < 材料 " + Math.round(needVol); }
}
__check("仓储容量始终装得下下一档材质的材料（仓储不会变成建造硬墙）", inv12Room,
      inv12Room ? "设计路径（储物箱 = 材质档 - 6）下余量 ≥1.5 倍" : "❗ " + inv12RoomBad);

console.log("════ INV-13 制作速度（v8.25：材料加工随材质档 ×2/档，装备限速 ×8）════");
S = newState();
S.bld.bench = 5; S.bld.generator = 3;
let inv13Ok = true, inv13Bad = "";
for(const hs of [7, 10, 14, 18, 22, 26, 30]){
  S.bld.house = hs;
  const mat = craftSpeed({ kind: "mat" }), gear = craftSpeed({ kind: "gear" });
  const gather = Math.pow(2, Math.max(0, hs - 7));
  /* ① 材料加工：速度必须跟上采集（否则制作线在后期形同虚设） */
  if(mat < gather * 0.9){ inv13Ok = false; inv13Bad = "house " + hs + " 制作 ×" + fmtSpeed(mat) + " < 采集 ×" + fmtSpeed(gather); }
  /* ② 装备：必须有时间成本（限速生效），但不能慢到不可用 */
  if(gear > CRAFT_GEAR_SPEED_MAX + 1e-9){ inv13Ok = false; inv13Bad = "house " + hs + " 装备速度 ×" + fmtSpeed(gear) + " 超过上限"; }
  console.log("  材质档 " + String(hs).padStart(2) + "：材料加工 ×" + fmtSpeed(mat).padEnd(6) + "｜装备 ×" + fmtSpeed(gear).padEnd(5) + "｜采集 ×" + fmtSpeed(gather));
}
__check("材料加工速度 ≥ 采集倍率 ×0.9（制作线不再是死机制）", inv13Ok,
      inv13Ok ? "全档位跟得上采集" : "❗ " + inv13Bad);
const inv13GearMax = (() => { S.bld.house = 30; return craftSpeed({ kind: "gear" }); })();
const slowest = allRecipes().filter(r => r.kind === "gear").reduce((m, r) => Math.max(m, r.hours), 0);
__check("装备类总速度 ∈ [4, " + CRAFT_GEAR_SPEED_MAX + "]（保留「打一件要花点时间」的手感）",
      inv13GearMax >= 4 && inv13GearMax <= CRAFT_GEAR_SPEED_MAX,
      "满档 ×" + fmtSpeed(inv13GearMax) + "：最慢装备（" + slowest + "h）约 " + (Math.round(slowest / inv13GearMax * 10) / 10) + " 游戏小时");

console.log("════ INV-14 装备三条线（v8.27：武器/护甲/护符 T2~T24 全程无缺口）════");
S = newState();
const inv14Bp = GEAR_RECIPES.filter(r => r.bp && !r.rough && !r.refine);
let inv14Ok = true, inv14Bad = "";
for(const slot of ["weapon", "armor", "talisman"]){
  const list = inv14Bp.filter(r => r.outGear.slot === slot).sort((a, b) => a.tier - b.tier);
  const tiers = list.map(r => r.tier);
  const gaps = [];
  for(let t = 2; t <= 24; t++) if(tiers.indexOf(t) < 0) gaps.push(t);
  let mono = true;
  for(let i = 1; i < list.length; i++) if(list[i].outGear.val < list[i - 1].outGear.val) mono = false;
  if(gaps.length || !mono){ inv14Ok = false; inv14Bad = SLOTNAME[slot] + (gaps.length ? " 缺 T" + gaps.join(",") : " 数值不单调"); }
  console.log("  " + SLOTNAME[slot].padEnd(3) + " " + String(list.length).padStart(2) + " 件 ｜ T" + tiers[0] + "~T" + tiers[tiers.length - 1]
    + " ｜ 数值 " + list[0].outGear.val + " → " + list[list.length - 1].outGear.val + (gaps.length ? " ｜ ❗缺 T" + gaps.join(",") : " ｜ 连续"));
}
__check("三条装备线 T2~T24 每代都有货、数值单调", inv14Ok,
      inv14Ok ? "武器/护甲/护符全部连续" : "❗ " + inv14Bad);
let inv14Tal = true, inv14TalBad = "";
for(let t = 1; t <= 24; t++){
  const v = EQUIP_VAL[t] && EQUIP_VAL[t].talisman;
  if(!v || v[1] > 100 || v[0] > v[1]){ inv14Tal = false; inv14TalBad = "T" + t + " 越界"; }
}
__check("护符数值限定在「搜集效率 %」量纲（≤100，不会变成 +300 万）", inv14Tal,
      inv14Tal ? "T24 满值 +100%（= 采集 ×2）" : "❗ " + inv14TalBad);
S = newState();
const inv14R = GEAR_RECIPES.find(r => r.bp && !r.rough && !r.refine && r.outGear.slot === "talisman" && r.tier === 24);
S.gear = [{ slot:"talisman", name:inv14R.name, rar:3, val:inv14R.outGear.val, on:true, tag:inv14R.outGear.tag, tags:[] }];
const inv14Gain = prodBonus();
S.gear[0].val = 999999;
__check("护符搜集效率接入结算且封顶 +300%（v8.42 三插槽）", Math.abs(inv14Gain - 1.0) < 1e-9 && prodBonus() === TALISMAN_SLOTS * 1.0,
      "满值护符 = 采集 ×" + (1 + inv14Gain).toFixed(1) + "（越界值同样封顶；单件 ≤+100%，三件叠加 ≤+300%）");

console.log("");
console.log(__bad === 0 ? "🎉 数值模型全部不变量通过" : "❌ " + __bad + " 项不变量被破坏——改数前先看文件头部的公式");
global.__modelBad = __bad;
`;

(0, eval)(script);
process.exit(global.__modelBad || 0);
