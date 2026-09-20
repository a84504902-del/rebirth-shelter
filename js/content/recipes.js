/* ============================================================
 * content/recipes.js — 工作台配方表
 *
 * 规则：
 *   - in / out 里的资源 key 都来自 content/items.js
 *   - hours  = 需要多少"工时"（制作与外出并行推进，6 工时 ≈ 主角一个白天的副业量）
 *   - bp     = 需要的图纸名；没有图纸时配方显示为锁定
 *   - noBench = 徒手可做（不需要工作台）；其余配方在工作台做好后解锁
 *
 * ★ 制作与外出完全并行：主角出门采集/探索时，制作照常推进，互不耽误。
 *   限制来自「同时能开几条制作线」（制作槽位），开局 2 条，靠图纸解锁更多。
 * ============================================================ */
"use strict";

const RECIPES = [
  { id:"plank",   name:"木板",   icon:"🪚", hours:0.5, tier:1,
    in:{ wood:6 },              out:{ plank:2 },
    desc:"把木材劈成木料，建造和加固的通用基材。" },

  /* ★ noBench：徒手就能做。
   *   修掉一个真实死锁——工作台建造需要绳索，而绳索原本又需要工作台。
   *   现在绳索可以徒手做，玩家永远能靠自己起步。 */
  { id:"rope",    name:"绳索",   icon:"🪢", hours:0.25, tier:1, noBench:true,
    in:{ pelt:2 },              out:{ rope:1 },
    desc:"兽皮搓成绳。不用工作台，徒手就能搓——这是造出工作台的第一步。" },

  { id:"jerky",   name:"熏肉",   icon:"🍖", hours:2, tier:1, noBench:true,
    in:{ meat:4 },              out:{ jerky:3 },
    desc:"把生肉用火熏制保存——生肉会坏，熏肉不会。有个火堆就行。" },

  { id:"bait",    name:"诱饵",   icon:"🪱", hours:0.25, tier:1, noBench:true,
    in:{ meat:2 },              out:{ bait:4 },
    desc:"用生肉做饵，陷阱的必需品。" },

  { id:"medkit",  name:"绷带",   icon:"🩹", hours:0.25, tier:1,
    in:{ cloth:2, water:1 },    out:{ medkit:1 },
    desc:"干净的布加净水。受伤时用一份，伤势直接降两级——濒死时的救命稻草。", bp:"绷带图纸" },

  { id:"stim",    name:"兴奋剂", icon:"💉", hours:1, tier:1,
    in:{ bone:3, jerky:1 },     out:{ stim:1 },
    desc:"用骨粉和熏肉熬出来的东西，能强行提起精神。", bp:"兴奋剂图纸" },

  /* ---------- T2 工业期配方 ---------- */
  { id:"ironChunk", name:"铁块提炼", icon:"🔩", hours:2, tier:2,
    in:{ metal:5 },             out:{ ironChunk:2 },
    desc:"把废金属熔炼成可用的铁块。工业期的入口。", bp:"铁块图纸",
    mystery:"传闻：那些锈铁疙瘩迟迟没用上，是因为还没人找到把它们烧成真正铁块的法子——找「铁块图纸」。" },

  /* ★ 矿石熔炼（v8.3）：基础工艺，无需图纸——进工业期自动可用。
   *   修复"铁矿洞/铜矿脉采回的矿石是无用物资"的死物问题；矿点从此是铁/铜的量产通道。 */
  { id:"smeltIron",   name:"矿石炼铁", icon:"⚒️", hours:2, tier:2,
    in:{ ironOre:4, coal:1 },   out:{ ironChunk:2 },
    desc:"铁矿石加煤烧出铁水——矿点采回的石头终于有用了。" },

  { id:"smeltCopper", name:"矿石炼铜", icon:"🟠", hours:1.5, tier:2,
    in:{ copperOre:4, coal:1 }, out:{ copper:2 },
    desc:"绿锈矿石烧出铜水，铸成铜块。" },

  { id:"steel",   name:"炼钢",   icon:"🔗", hours:4, tier:2,
    in:{ ironChunk:4, coal:4 }, out:{ steel:2 },
    desc:"铁加煤，烧到发白——钢比铁硬得多。", bp:"炼钢图纸" },

  { id:"leather", name:"皮革鞣制", icon:"🟫", hours:3, tier:2,
    in:{ pelt:3 },              out:{ leather:1 },
    desc:"鞣制兽皮，做护甲和高级工具的材料。", bp:"皮革图纸" },

  { id:"copperWire", name:"拉制铜线", icon:"〰️", hours:1, tier:3,
    in:{ copper:3 },            out:{ copperWire:3 },
    desc:"铜拉成细线，电路的基础。", bp:"铜线图纸" },

  { id:"gunpowder", name:"配火药", icon:"💥", hours:1, tier:3,
    in:{ sulfur:3, niter:2 },   out:{ gunpowder:3 },
    desc:"硫磺加硝石——旧世界的暴力配方。", bp:"火药图纸" },

  /* ---------- v8.7 能源链：石油终于有去处，发电机有口粮 ---------- */
  { id:"refineFuel", name:"炼油", icon:"⛽", hours:1.5, tier:3,
    in:{ oil:2 },               out:{ fuel:2 },
    desc:"把原油蒸馏成燃料——柴油发电机的口粮。基础工艺，无需图纸。" },

  { id:"battery", name:"组装电池", icon:"🔋", hours:2, tier:3,
    in:{ copper:2, sulfur:1, copperWire:1 }, out:{ battery:1 },
    desc:"铜片加硫磺电解质——储存电力的旧世界手艺。", bp:"电池图纸" }
];

/** 图纸列表（从箱子里开出来的稀有物品） */
const BLUEPRINTS = RECIPES.filter(r => r.bp).map(r => r.bp);

/** 图纸列表（从箱子里开出来的稀有物品）：材料类 + 装备类 */
function allBlueprints(){
  return BLUEPRINTS.concat(typeof GEAR_BLUEPRINTS !== "undefined" ? GEAR_BLUEPRINTS : []);
}

/** 全部配方（材料加工 + 装备制造 + 粗制装备[装备加工台] + 精修[高级加工台]） */
function allRecipes(){
  return RECIPES
    .concat(typeof GEAR_RECIPES !== "undefined" ? GEAR_RECIPES : [])
    .concat(typeof FORGE_RECIPES !== "undefined" ? FORGE_RECIPES : [])
    .concat(typeof REFINE_RECIPES !== "undefined" ? REFINE_RECIPES : []);   /* v8.9 精修 */
}

function recipeById(id){
  return allRecipes().find(r => r.id === id) || null;
}

/** 材料是否充足 */
function canCraft(rec){
  for(const k in rec.in) if((S.res[k] || 0) < rec.in[k]) return false;
  return true;
}
function hasBlueprint(rec){ return !rec.bp || (S.bp || []).includes(rec.bp); }
