/* ============================================================
 * content/gear.js — 装备图纸（"时代跃迁"的真正来源）
 *
 * 设计原则（重要）：
 *   普通箱子给的装备 = 同一时代的量变（石矛 +15 / +18 / +22）
 *   图纸给的装备     = 换一个时代 + 一条【词条】，改变玩法规则
 *
 * tag（词条）——这才是惊喜的核心：
 *   melee            近战，无特殊
 *   ranged           远程压制：野外遭遇野兽时 50% 概率不受伤害
 *   tool             精良工具：采集产量 +25%
 *   light            照明：夜间也能出工（时间直接翻倍）
 *   hazard:<灾种>    对应天灾抗性：该灾种强度视为 -30%
 *
 * mystery：图纸未到手时只显示传闻，保留开箱时的"哇"感
 * ============================================================ */
"use strict";

const TAG_INFO = {
  melee:   { name: "近战",   desc: "基础战斗方式" },
  /* v8.6 数值词条（格式 "key:值"，值 = 百分比）：暗黑式词缀池 */
  gatherBoost: { name: "搜集", desc: "采集产量 +X%" },
  satSave:     { name: "省粮", desc: "饱食消耗 -X%" },
  storeBoost:  { name: "收纳", desc: "仓储容量 +X%" },
  chestBonus:  { name: "寻宝", desc: "开箱物资 +X%" },
  ranged:  { name: "远程压制", desc: "野外遭遇野兽时，50% 概率全身而退（不受伤害、不掉收获）" },
  tool:    { name: "精良工具", desc: "采集产量 +25%" },
  light:   { name: "照明",    desc: "夜间也能出工——一天可用的时段从 2 段变成 3 段" },
  "hazard:cold":      { name: "保温",   desc: "对抗寒潮：该场天灾的强度视为 -30%" },
  "hazard:flood":     { name: "防水",   desc: "对抗洪水：该场天灾的强度视为 -30%" },
  "hazard:radiation": { name: "防辐射", desc: "对抗辐射尘：该场天灾的强度视为 -30%" },
  "hazard:heat":      { name: "隔热",   desc: "对抗高温：该场天灾的强度视为 -30%" },
  "hazard:acid":      { name: "防酸",   desc: "对抗酸雨：该场天灾的强度视为 -30%" }
};

/** 装备代际（越往后，跨越越大） */
const GEAR_TIER = { 1:"石制", 2:"铁器", 3:"机械", 4:"火器", 5:"特化" };

/* 装备图纸：kind:"gear" 表示产出装备而不是材料 */
let GEAR_RECIPES = [
  /* ---------- 铁器时代 ---------- */
  { id:"g_ironSpear", kind:"gear", tier:2, name:"铁管长矛", icon:"🔱", hours:1,
    in:{ plank:2, ironChunk:3, rope:1 },
    outGear:{ slot:"weapon", val:80, tag:"melee" },
    bp:"铁管长矛图纸",
    mystery:"传闻：有幸存者把钢管磨出了刃，比木头硬得多。",
    desc:"废钢管加木柄，扎得比石矛深得多。" },

  { id:"g_ironArmor", kind:"gear", tier:2, name:"铆钉皮甲", icon:"🦺", hours:2,
    in:{ leather:3, ironChunk:2, rope:1 },
    outGear:{ slot:"armor", val:70, tag:"melee" },
    bp:"铆钉皮甲图纸",
    mystery:"传闻：有人往皮甲上钉铁钉，野兽咬不动。",
    desc:"皮革衬铁钉，能扛住一次扑咬。" },

  /* v8.27 补护甲缺口：原先 T2 之后直接跳到 T5（功能护甲），T3/T4 没有护甲可造
   *  val 取自 EQUIP_VAL[3]/[4].armor 的中值（185 / 333），与 loot.js 的代际表对齐 */
  { id:"g_armor3", kind:"gear", tier:3, name:"旧军防弹衣", icon:"🦺", hours:3,
    in:{ plank:4, ironChunk:8, cloth:6 },
    outGear:{ slot:"armor", val:185, tag:null },
    bp:"旧军防弹衣图纸",
    mystery:"传闻：军械库里还留着一批没人带走的防弹衣。",
    desc:"捡来的军品护甲，比铆钉皮甲结实得多。" },
  { id:"g_armor4", kind:"gear", tier:4, name:"战术背心", icon:"🎽", hours:4,
    in:{ steel:6, cloth:10, ironChunk:12 },
    outGear:{ slot:"armor", val:333, tag:null },
    bp:"战术背心图纸",
    mystery:"传闻：旧世界的特警装备，插板还能用。",
    desc:"插板 + 织带，重量换防护的经典做法。" },

  { id:"g_pickaxe", kind:"gear", tier:2, name:"精铁镐", icon:"⛏️", hours:1.5,
    in:{ plank:2, ironChunk:4 },
    outGear:{ slot:"talisman", val:14, tag:"tool" },   /* v8.27 护符 val = 搜集效率 %，按新曲线对齐 */
    bp:"精铁镐图纸",
    mystery:"传闻：有了趁手的家伙，一个人能顶两个使。",
    desc:"效率就是命——同样一趟活，能多背回去不少。" },

  /* ---------- 机械时代 ---------- */
  { id:"g_crossbow", kind:"gear", tier:3, name:"连发弩", icon:"🏹", hours:3,
    in:{ plank:4, ironChunk:5, rope:3 },
    outGear:{ slot:"weapon", val:220, tag:"ranged" },
    bp:"连发弩图纸",
    mystery:"传闻：有人把弩改成了能连发的，隔着林子就能放倒猎物。",
    desc:"不用贴身了——远远地，一个照面。" },

  { id:"g_lamp", kind:"gear", tier:3, name:"提灯", icon:"🏮", hours:1.5,
    in:{ ironChunk:2, cloth:3, rope:1 },
    outGear:{ slot:"talisman", val:18, tag:"light" },   /* v8.27 按护符新曲线对齐 */
    bp:"提灯图纸",
    mystery:"传闻：有人在废城的地下车库住了半个月，白天黑夜对他没区别。",
    desc:"天黑不等于停工——光在手里，一天能当两天用。" },

  /* ---------- 火器时代 ---------- */
  { id:"g_smg", kind:"gear", tier:4, name:"冲锋枪", icon:"🔫", hours:6,
    in:{ ironChunk:8, copper:4, gunpowder:4, cloth:2, plank:2 },
    outGear:{ slot:"weapon", val:600, tag:"ranged" },
    bp:"冲锋枪图纸",
    mystery:"传闻：末日前那把能扫射的家伙还在，零件埋在某个地下室里。",
    desc:"石矛和它的区别，是一个时代和一个时代。" },

  /* v8.27 补武器缺口：原先 T4 之后直接跳 T6，T5 没有武器可造
   *  val 取自 EQUIP_VAL[5].weapon 的中值（551），与代际表对齐 */
  { id:"g_railSpear", kind:"gear", tier:5, name:"电磁矛", icon:"⚡", hours:7,
    in:{ steel:8, copperWire:6, battery:3, gunpowder:2 },
    outGear:{ slot:"weapon", val:700, tag:"ranged" },   /* v8.27 须高于 T4 冲锋枪(600)：手写 T4 件比代际表(T4 中值 306)偏强，T5 取 700 */
    bp:"电磁矛图纸",
    mystery:"传闻：有人把变电所的线圈拆下来，做成了一支会响的矛。",
    desc:"线圈加速的铁矛，出手比子弹还快。" },

  { id:"g_gasMask", kind:"gear", tier:4, name:"防毒面具", icon:"😷", hours:4,
    in:{ cloth:4, leather:2, ironChunk:2 },
    outGear:{ slot:"talisman", val:22, tag:"hazard:radiation" },   /* v8.27 按护符新曲线对齐 */
    bp:"防毒面具图纸",
    mystery:"传闻：辐射尘来的那天，戴上面具的人活了下来。",
    desc:"过滤罐里是最后的干净空气。" },

  /* ---------- 特化 ---------- */
  { id:"g_coldSuit", kind:"gear", tier:5, name:"保温服", icon:"🥼", hours:4,
    in:{ leather:5, cloth:4, rope:2 },
    outGear:{ slot:"armor", val:380, tag:"hazard:cold" },   /* v8.27 原 120：比同代公式护甲(600)低 4 倍，提到 380：须高于 T4 的 333，才能保持整条护甲线单调 */
    bp:"保温服图纸",
    mystery:"传闻：寒潮那年，有人穿着塞满毛皮的衣服在外面走了一圈。",
    desc:"风雪里能站得住的，才有资格说活下去。" },

  { id:"g_drySuit", kind:"gear", tier:5, name:"防水装备", icon:"🦺", hours:3,
    in:{ leather:4, rope:3, ironChunk:2 },
    outGear:{ slot:"armor", val:380, tag:"hazard:flood" },  /* v8.27 原 130 */
    bp:"防水装备图纸",
    mystery:"传闻：水位涨起来的时候，有人把整栋楼当船用。",
    desc:"水到了膝盖，日子照样过。" },

  { id:"g_heatShell", kind:"gear", tier:5, name:"隔热壳", icon:"🥽", hours:4,
    in:{ ironChunk:6, copper:3, cloth:3 },
    outGear:{ slot:"armor", val:380, tag:"hazard:heat" },   /* v8.27 原 140 */
    bp:"隔热壳图纸",
    mystery:"传闻：地表烫得能煎蛋的时候，还有人在地面上走动。",
    desc:"外面五六十度，壳里面还是人待的温度。" },

  { id:"g_acidCloak", kind:"gear", tier:5, name:"防酸披风", icon:"🧥", hours:3,
    in:{ leather:4, cloth:4 },
    outGear:{ slot:"armor", val:380, tag:"hazard:acid" },   /* v8.27 原 110 */
    bp:"防酸披风图纸",
    mystery:"传闻：酸雨把铁皮都化了，有人披着一层怪东西走了出去。",
    desc:"雨点砸在披风上，滋滋地滑开。" }
];

/** 装备图纸名列表（供掉落抽取）——必须过滤掉没有 bp 的配方，否则会往图纸列表塞进 undefined */
const GEAR_BLUEPRINTS = GEAR_RECIPES.filter(r => r.bp).map(r => r.bp);

/** 某种词条的说明 */
function tagInfo(tag){
  if(!tag) return { name: "", desc: "" };
  if(TAG_INFO[tag]) return TAG_INFO[tag];
  const i = tag.indexOf(":");
  if(i > 0){
    const base = TAG_INFO[tag.slice(0, i)];
    const v = tag.slice(i + 1);
    if(base && v !== "") return { name: base.name + " +" + v + "%", desc: base.desc.replace("X", v) };
  }
  return { name: tag, desc: "" };
}

/** 已装备的词条集合 */
function equippedTags(){
  const set = new Set();
  for(const g of S.gear) if(g.on && g.tag) set.add(g.tag);
  return set;
}
function hasTag(tag){ return equippedTags().has(tag); }

/* ============================================================
 * v8.6 暗黑式词缀（最小版）
 *  - 词条数量按品质分层：普通0 / 精良1 / 稀有1~2 / 传说2~3
 *  - 词缀值 roll [50%, 100%]：同一词缀有高低之分
 *  - 数值词条（key:值）由 tagSum 求和接入引擎；功能词条走 hasTag
 * ============================================================ */
const AFFIX_POOL = [
  { tag:"gatherBoost:25", w:20 }, { tag:"satSave:20", w:20 },
  { tag:"storeBoost:20", w:20 }, { tag:"chestBonus:25", w:20 },
  { tag:"tool", w:6 }, { tag:"light", w:4 },
  { tag:"hazard:cold", w:2 }, { tag:"hazard:flood", w:2 }, { tag:"hazard:radiation", w:2 },
  { tag:"hazard:heat", w:2 }, { tag:"hazard:acid", w:2 }
];
const AFFIX_TOTAL_W = AFFIX_POOL.reduce((a, x) => a + x.w, 0);

/** 按品质 roll 词条数组。capRar = 词条品质上限（粗制装备 2，普通生成 4） */
function rollAffixes(rar, capRar){
  const eff = Math.min(rar, capRar || 4);
  const cnt = eff >= 4 ? 2 + (Math.random() < 0.5 ? 1 : 0)
            : eff === 3 ? (Math.random() < 0.5 ? 2 : 1)
            : eff === 2 ? 1 : 0;
  const tags = [];
  let guard = 0;
  while(tags.length < cnt && guard++ < 30){
    let r = Math.random() * AFFIX_TOTAL_W, pick = AFFIX_POOL[AFFIX_POOL.length - 1];
    for(const a of AFFIX_POOL){ if(r < a.w){ pick = a; break; } r -= a.w; }
    let tag = pick.tag;
    const ci = tag.indexOf(":");
    if(ci > 0 && !isNaN(parseFloat(tag.slice(ci + 1)))){
      const full = parseFloat(tag.slice(ci + 1));
      tag = tag.slice(0, ci + 1) + Math.max(1, Math.round(full * (0.5 + Math.random() * 0.5)));
    }
    if(!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

/** 数值词条求和（百分比）：如 tagSum("gatherBoost") 返回采集加成总和 */
function tagSum(key){
  let sum = 0;
  for(const g of S.gear){
    if(!g.on) continue;
    for(const t of (g.tags || [])) if(t.startsWith(key + ":")) sum += parseFloat(t.split(":")[1]) || 0;
  }
  return sum;
}

/* ============================================================
 * v8.6 装备双轨制（最小版）：装备加工台的粗制配方
 *  - 无需图纸：任何玩家都能自制过渡装备（val ×0.6，材料 ×1.2）
 *  - 词条上限精良（rar2）——保底路线不出神装，满性能仍走图纸
 * ============================================================ */
const FORGE_RECIPES = GEAR_RECIPES.filter(r => r.bp).map(r => {
  const cost = {};
  for(const k in r.in) cost[k] = Math.ceil(r.in[k] * 1.2);
  return {
    id: "c_" + r.id, kind: "gear", rough: true, tier: r.tier,
    name: "粗制·" + r.name, icon: "🔨", hours: Math.max(0.5, Math.round(r.hours * 0.8 * 10) / 10),
    in: cost,
    outGear: { slot: r.outGear.slot, val: Math.round(r.outGear.val * 0.6), tag: null },
    desc: "粗制过渡装备——没有图纸也能打，但差点意思。拿到图纸后可做完全体。"
  };
});
/* ============================================================
 * v8.9 精修（双轨制的桥接）：高级装备加工台把粗制装精修为满性能
 *  - 不消耗底子：库存/身上有「粗制·XX」即可当底子（对应"补差价材料"的设定）
 *  - 材料 = 原配方 ×0.8；持有对应图纸再减半（→ ×0.4）——图纸永远有用
 *  - 解锁：装备加工台升到 Lv.2（需钛合金堡垒级别的材质工艺）
 * ============================================================ */
const REFINE_RECIPES = GEAR_RECIPES.filter(r => r.bp).map(r => {
  const cost = {};
  for(const k in r.in) cost[k] = Math.max(1, Math.ceil(r.in[k] * 0.8));
  return {
    id: "r_" + r.id, kind: "gear", refine: true, refineOf: r.id, tier: r.tier,
    name: "精修·" + r.name, icon: "✨", hours: Math.max(1, Math.round(r.hours * 0.6 * 10) / 10),
    in: cost,
    needRough: "粗制·" + r.name, needForge: 2,
    outGear: { slot: r.outGear.slot, val: r.outGear.val, tag: r.outGear.tag },
    desc: "用「粗制·" + r.name + "」当底子精修为完全体（底子不消耗）；持有「" + r.bp + "」时材料减半。"
  };
});

/** 底子是否在手（身上或库存里有该粗制装备） */
function hasRoughGear(name){ return (S.gear || []).some(g => g.name === name); }

/** 精修的实际材料：基准（原配方 ×0.8），持对应图纸再减半（→ ×0.4） */
function craftCostOf(rec){
  if(!rec || !rec.refine) return (rec && rec.in) || {};
  const half = hasBlueprint(recipeById(rec.refineOf));
  const o = {};
  for(const k in rec.in) o[k] = Math.max(1, Math.ceil(rec.in[k] * (half ? 0.5 : 1)));
  return o;
}

/* ============================================================
 * v8.12 公式化装备代际（T6~T12）：给战力一条没有终点的成长线
 *  - 每代 2 件：1 武器 + 1 护甲，val 与开箱装备同源（EQUIP_VAL 中值）
 *  - 材料 = 上一代 ×1.9（吃 T3 加工品：钢/铜线/电池/火药）
 *  - 门槛：材质档 ≥ tier + 1（needHouse）+ 图纸（进 T3 掉落池）
 *  - ★ 延迟构建：本文件先于 loot.js 加载，EQUIP_VAL 由 loot.js 提供，
 *    因此由 loot.js 在末尾调用 buildFormulaGear()（否则触发 TDZ 报错）。
 * ============================================================ */
const FORMULA_GEAR = [];

/* ---------- v8.27 护符公式线（T5~T24） ----------
 * 用户："这个装备没有对应的升级，护符和护甲都没有对应提升。"
 * 实情：护符全游戏只有 3 张手写件（T2/T3/T4，+15~25% 采集），T5 之后 20 个代际全空；
 *       而且护符的 val（搜集效率）压根没有被结算调用（prodBonus 定义了却无人使用）。
 * 这里补两条：① T5~T24 每代一件护符；② 每代换一个功能词条（护符的核心价值是"选功能"）。 */
const TALISMAN_TAGS = ["light", "tool", "hazard:cold", "hazard:flood", "hazard:radiation", "hazard:heat", "hazard:acid", "ranged"];
const TALISMAN_NAMES = ["军用电台", "战术AI芯片", "相位锚", "纳米核心", "数据圣物", "量子罗盘",
                        "幽能纹章", "星尘挂坠", "虚空之眼", "奇点指环", "彼岸符印", "终焉回响"];

function buildFormulaGear(){
  if(typeof EQUIP_VAL === "undefined" || FORMULA_GEAR.length) return;

  /* 注：T5 功能护甲（保温服/防水装备/隔热壳/防酸披风）的数值已直接写在配方里（250），
     不要在这里运行期改值——粗制/精修版本在模块加载时就算好了，运行期改母配方会导致两边不一致。 */

  for(let n = 6; n <= 24; n++){   /* v8.14：配合无限阶段扩到 T24 */
    const wv = Math.round((EQUIP_VAL[n].weapon[0] + EQUIP_VAL[n].weapon[1]) / 2);
    const av = Math.round((EQUIP_VAL[n].armor[0] + EQUIP_VAL[n].armor[1]) / 2);
    const k = Math.pow(1.9, n - 6);
    const wName = EQUIP_BASES[n].weapon[0], aName = EQUIP_BASES[n].armor[0];
    const wCost = { steel: Math.ceil(30 * k), copperWire: Math.ceil(12 * k), gunpowder: Math.ceil(10 * k) };
    const aCost = { steel: Math.ceil(40 * k), copperWire: Math.ceil(10 * k), battery: Math.ceil(6 * k) };
    /* v8.14：T7+ 吃高阶材料（幽能结晶 T4 / 星尘 T5 / 虚空合金 T6） */
    /* v8.17：高阶代际逐段吃区域材料（保证新地图材料有需求端，不留死物资） */
    const matKey = n >= 23 ? "quantumCoil" : n >= 19 ? "alloyIngot" : n >= 15 ? "voidAlloy" : n >= 11 ? "stardust" : n >= 7 ? "prism" : null;
    if(matKey){ wCost[matKey] = Math.ceil((n - 5) * Math.pow(1.5, n - 7)); aCost[matKey] = Math.ceil((n - 4) * Math.pow(1.5, n - 7)); }
    FORMULA_GEAR.push({
      id: "f_w" + n, kind: "gear", tier: n, needHouse: n + 1, name: wName, icon: "⚔️",
      hours: Math.round(4 * Math.pow(1.2, n - 6) * 10) / 10, in: wCost,
      outGear: { slot: "weapon", val: wv, tag: "ranged" },
      bp: wName + "图纸",
      desc: "材质档 " + (n + 1) + " 级工艺 + 本代图纸才能开工；战力 " + wv + "（上一代 ×1.8）。"
    });
    FORMULA_GEAR.push({
      id: "f_a" + n, kind: "gear", tier: n, needHouse: n + 1, name: aName, icon: "🛡️",
      hours: Math.round(4 * Math.pow(1.2, n - 6) * 10) / 10, in: aCost,
      outGear: { slot: "armor", val: av, tag: null },
      bp: aName + "图纸",
      desc: "材质档 " + (n + 1) + " 级工艺 + 本代图纸才能开工；防御 " + av + "。"
    });
  }

  /* ③ v8.27 护符公式线：T5~T24 每代一件（val = 搜集效率 %，独立小曲线；词条按代际轮换） */
  for(let n = 5; n <= 24; n++){
    const tv = Math.round((EQUIP_VAL[n].talisman[0] + EQUIP_VAL[n].talisman[1]) / 2);
    const k = Math.pow(1.9, n - 6);
    const idx = (n - 5) % TALISMAN_NAMES.length;
    const round = Math.floor((n - 5) / TALISMAN_NAMES.length);
    const tName = TALISMAN_NAMES[idx] + (round > 0 ? "·" + (ROMAN[round] || ("+" + round)) : "");
    const tag = TALISMAN_TAGS[(n - 5) % TALISMAN_TAGS.length];
    const tCost = { copperWire: Math.ceil(8 * k), battery: Math.ceil(4 * k), prism: Math.ceil(2 * k) };
    const matKey = n >= 23 ? "quantumCoil" : n >= 19 ? "alloyIngot" : n >= 15 ? "voidAlloy" : n >= 11 ? "stardust" : n >= 7 ? "prism" : null;
    if(matKey) tCost[matKey] = Math.ceil((n - 3) * Math.pow(1.5, n - 7));
    FORMULA_GEAR.push({
      id: "f_t" + n, kind: "gear", tier: n, needHouse: n + 1, name: tName, icon: "🧿",
      hours: Math.max(1, Math.round(3 * Math.pow(1.15, n - 5) * 10) / 10), in: tCost,
      outGear: { slot: "talisman", val: tv, tag },
      bp: tName + "图纸",
      desc: "材质档 " + (n + 1) + " 级工艺 + 本代图纸才能开工；搜集效率 +" + tv + "%，词条见上。"
    });
  }
  GEAR_RECIPES = GEAR_RECIPES.concat(FORMULA_GEAR);
  /* 粗制（装备加工台）与精修（高级加工台）同步生成：双轨制对高代际同样成立 */
  for(const r of FORMULA_GEAR){
    const rcost = {};
    for(const k in r.in) rcost[k] = Math.ceil(r.in[k] * 1.2);
    FORGE_RECIPES.push({
      id: "c_" + r.id, kind: "gear", rough: true, tier: r.tier, needHouse: r.needHouse,
      name: "粗制·" + r.name, icon: "🔨", hours: Math.max(0.5, Math.round(r.hours * 0.8 * 10) / 10),
      in: rcost, outGear: { slot: r.outGear.slot, val: Math.round(r.outGear.val * 0.6), tag: null },
      desc: "粗制过渡装备——没有图纸也能打，但差点意思。"
    });
    const fcost = {};
    for(const k in r.in) fcost[k] = Math.max(1, Math.ceil(r.in[k] * 0.8));
    REFINE_RECIPES.push({
      id: "r_" + r.id, kind: "gear", refine: true, refineOf: r.id, tier: r.tier, needHouse: r.needHouse,
      name: "精修·" + r.name, icon: "✨", hours: Math.max(1, Math.round(r.hours * 0.6 * 10) / 10),
      in: fcost, needRough: "粗制·" + r.name, needForge: 2,
      outGear: { slot: r.outGear.slot, val: r.outGear.val, tag: r.outGear.tag },
      desc: "用「粗制·" + r.name + "」当底子精修为完全体（底子不消耗）；持有「" + r.bp + "」时材料减半。"
    });
  }
}
