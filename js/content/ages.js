/* ============================================================
 * content/ages.js — 阶段（时代）表
 *
 * 这是整个游戏的"进度骨架"：物资、箱子、装备、资源点、配方
 * 全部挂在这张表上，按阶段逐步解锁。
 *
 * 设计规则（重要）：
 *   1. 阶段推进 = 双轨：渡过 N 场天灾（主）+ 建成关键建筑（辅）
 *      —— 天灾是可预告的节奏（"再过 2 场灾就能进工业期"），
 *         建筑是目标（避免"躺赢解锁"）
 *   2. 高阶段物品在前阶段"绝对不出现"（不是概率低，是没进池子）
 *   3. 低阶段物品永不淘汰（木石永远是建材，废金属是铁块的保底通道）
 *
 * 新增阶段：往 AGES 里加一项，并在 items.js 给新物品标 tier
 * ============================================================ */
"use strict";

/* 物品阶层的显示名 */
const TIER_NAME = { 1: "T1 基础", 2: "T2 工业", 3: "T3 能源" };

/* ------------------------------------------------------------
 * 三个阶段
 *   tier    本阶段允许出现的最高物品阶层
 *   chest   本阶段"主力箱子"（低级箱仍会产出，见 chests.js）
 *   req     进入本阶段的条件：wave = 已渡过的天灾场数，bld = 建筑等级
 *   spots   本阶段解锁的资源点（探索池里才会出现）
 *   unlock  进入时给玩家看的"解锁清单"
 *   enter   阶段推进时的全屏文本（仪式感）
 * ------------------------------------------------------------ */
const AGES = [
  {
    id: 1,
    name: "求生期",
    era: "木器时代",
    icon: "🪵",
    tier: 1,
    chest: "wood",
    tagline: "只有一双手，先活过这场雨。",
    req: null,
    spots: [],
    unlock: ["木箱", "基础采集与探索", "捕猎陷阱", "工作台（基础配方）"],
    enter: [
      "你睁开眼。世界只剩下风声、灰尘，和远处偶尔塌下来的什么东西。",
      "避难所是一间破茅草屋。手里没有工具，身上没有存粮。",
      "这一世，先活过第一场雨。"
    ]
  },
  {
    id: 2,
    name: "工业期",
    era: "铁器时代",
    icon: "🔩",
    tier: 2,
    chest: "bronze",
    tagline: "废铁不再是废铁——我有炉子了。",
    req: { wave: 3, bld: { bench: 2 } },
    spots: ["ironMine", "copperMine", "coalSeam"],
    unlock: ["铁矿点 / 铜矿点 / 煤层", "铁块、铜块、钢", "青铜箱", "铁器配方与装备"],
    enter: [
      "锤子敲下去的第一声，比天灾的雷声还响。",
      "有了像样的工作台，那些捡回来的破铜烂铁，终于能变成真正有用的东西。",
      "从今天起，你不再只是活着——你开始重建。"
    ]
  },
  {
    id: 3,
    name: "能源期",
    era: "机械电气时代",
    icon: "⚙️",
    tier: 3,
    chest: "silver",
    tagline: "天灾开始不讲道理了，我需要电，也需要密封。",
    req: { wave: 5, bld: { fortify: 5 } },
    spots: ["sulfurPit", "niterBed", "oilField"],
    unlock: ["硫磺 / 硝石 / 油田", "火药、电池、燃料", "白银箱", "机械与火器配方"],
    enter: [
      "第一台发电机转起来的时候，灯泡亮了一下，又灭了。",
      "但你听见了那个声音——那是旧世界的心跳。",
      "接下来的天灾不会给你喘息的机会。你要比它更快。"
    ]
  }
];

/* ---------- 阶段查询 ---------- */

/** 当前阶段对象 */
function curAge(){
  const id = (typeof S !== "undefined" && S && S.age) ? S.age : 1;
  return AGES.find(a => a.id === id) || AGES[0];
}

/** 下一阶段对象（已是最后阶段则返回 null） */
function nextAgeObj(){
  const c = curAge();
  return AGES.find(a => a.id === c.id + 1) || null;
}

/** 当前阶段允许出现的最高物品阶层 */
function ageMaxTier(){ return curAge().tier; }

/* 装备代际与阶段的映射（装备代际：1石制 2铁器 3机械 4火器 5特化）
 *   阶段1 求生期  → 只能石制（1）
 *   阶段2 工业期  → 铁器与机械（≤3）
 *   阶段3 能源期  → 火器与特化（≤5）
 */
function ageGearTier(){ return curAge().tier * 2 - 1; }

/** 物品是否允许在当前阶段出现（箱子/采集掉落过滤用） */
function itemAllowed(key){
  if(typeof ITEMS === "undefined" || !ITEMS[key]) return false;
  const t = ITEMS[key].tier || 1;
  return t <= ageMaxTier();
}

/** 箱子等级是否已解锁（箱子等级 ≤ 当前阶段 → 已解锁） */
const CHEST_AGE = { wood: 1, bronze: 2, silver: 3, gold: 3, relic: 3 };
function chestUnlocked(tier){
  return (CHEST_AGE[tier] || 1) <= ageMaxTier();
}

/** 已渡过的天灾场数 = S.wave - 1（S.wave 是"即将到来的那一场"） */
function wavesPassed(){ return Math.max(0, (S.wave || 1) - 1); }

/** 距离进入下一阶段还差什么（返回 {ok, parts:[...]}） */
function ageProgress(){
  const nx = nextAgeObj();
  if(!nx || !nx.req) return { ok: false, parts: [], final: true };
  const parts = [];
  let ok = true;

  const needW = nx.req.wave;
  const haveW = wavesPassed();
  if(needW){
    const done = haveW >= needW;
    if(!done) ok = false;
    parts.push({ txt: `渡过 ${needW} 场天灾（${Math.min(haveW, needW)}/${needW}）`, done });
  }
  if(nx.req.bld){
    for(const id in nx.req.bld){
      const need = nx.req.bld[id];
      const have = lv(id);
      const done = have >= need;
      if(!done) ok = false;
      const b = BLDCFG.find(x => x.id === id);
      parts.push({ txt: `${b ? b.name : id}升到 Lv.${need}（${have}/${need}）`, done });
    }
  }
  return { ok, parts, final: false, next: nx };
}

/** 阶段进度的一句话描述（顶栏/面板用） */
function ageProgressText(){
  const p = ageProgress();
  if(p.final) return "已是当前最终阶段";
  const remain = p.parts.filter(x => !x.done).map(x => x.txt).join(" + ");
  return remain ? "还需：" + remain : "条件已满足";
}
