/* ============================================================
 * state.js — 游戏状态、基础数值计算、生存与日志
 * ============================================================ */
"use strict";

/** 全局游戏状态（唯一数据源） */
let S = null;

function newState(){
  const res = blankItems();
  Object.assign(res, { wood:150, stone:30, metal:60, food:15, water:15, bait:4 });
  return {
    res,
    bld:    { house:1, snare:0, bench:0, fortify:0, traps:0, storage:0, collector:0, farm:0 },
    chests: { wood:0, bronze:0, silver:0, gold:0, relic:0 },
    bp:     [],                                  /* 已获得的图纸 */
    crafts: [],                                  /* 正在进行的制作线 [{id,prog}]，最多 craftSlotMax() 条 */

    age: 1,                                      /* 当前阶段（见 content/ages.js） */
    wave: 1, day: 0,
    fortune: { d:0, i:rollFortune() },           /* 今日运势：d=已抽签的天号，i=签（v7.13） */
    nextDis: FIRST_DISASTER_DAY, nextDisType: DIS_TYPES[0].name,
    warned: false, nextBeast: NEWBIE_DAYS + 1,

    sate: 80, hydro: 80, autoEat: true, hungry: false,
    autoOpen: true,                              /* 挂机自动开箱：战利品即时进日志 */
    timeMul: (typeof SPEED_DEFAULT !== "undefined" ? SPEED_DEFAULT : 2),  /* 速档 1/2/4/8× */
    stam: 100,
    wound: "none", dyingH: 0,                    /* 生死阶梯：none / light / heavy / dying */
    bagLv: 0,                                    /* 背包等级（决定一次外出能带回多少） */
    rebirth: 0,                                  /* 重生次数（每一世 +1） */
    aggressive: false,                           /* 激进模式：允许前往"送死"档地点，可能死亡 */

    found: ["junk", "forest"], queue: SPOTQUEUE_BY_AGE[1].slice(),
    disLog: [], disUnread: false,                /* 灾史与未读灾报（v7.16） */
    plan: { am:"forest", pm:"junk", night:"rest" },
    gear: [], dryH: 0,

    stats: { chestsOpened:0, daysLived:0, deaths:0, best:0, born:Date.now(), bornDay:0 },
    lastReport: null,                            /* 上一世的死亡报告 */
    lastSave: Date.now()
  };
}

/* ---------- 数值计算 ---------- */
function lv(id){ return S.bld[id] || 0; }

function atk(){
  let a = lv("house") * 2;
  for(const g of S.gear) if(g.slot === "weapon" && g.on) a += g.val;
  return Math.round(a);
}
/** ★ v8.13 火力（建筑的攻击输出）：材质链自带火力 + 攻击建筑（火力塔）。
 *  ★ v8.13b 修正（用户："火力和战力不叠加吗"）：旧版把武器重复算进火力，
 *  且天灾结算只吃火力、把战力排除在外——既不叠加、又双算武器。现在：
 *  守家总攻 = 战力（人+武器+材质档×2）+ 火力（建筑），武器只算一次。 */
function houseFire(l){ return Math.round(houseTier(l || lv("house")).def * 0.06); }
function fire(){ return Math.round(houseFire(lv("house")) + lv("turret") * 45); }
/** 守家总攻 = 战力 + 火力（天灾削弱与野兽反击都用它） */
function homeAttack(){ return atk() + fire(); }
/** 对目标强度 target 可施加的削弱（每点总攻抵 0.35，上限砍半） */
function attackCut(target){ return Math.min(Math.round(target * ATK_DIS_CAP), Math.round(homeAttack() * ATK_DIS_CUT)); }
function def(){
  /* ★ 避难所自带基础防御（v7.11 材质链）：你睡在屋里，不是露宿。
   *   茅草屋 20 保"首灾即使只来得及造一级工事也不会裸奔"，
   *   木屋40 → 石屋80 → 混凝土150 → 钢铁300，按档跳跃。 */
  let d = houseTier(lv("house")).def + lv("fortify") * 60 + lv("traps") * 15;
  for(const g of S.gear) if(g.slot === "armor" && g.on) d += g.val;
  return Math.round(d);
}
/** ★ v8.27 护符的「搜集效率 +X%」——以前这个函数定义了却没人调用（死代码），
 *  护符的数值一直是摆设。现在正式接入采集结算（engine.js 的 gatMul）：
 *  护符量纲是"百分比"，不封顶的话开箱掉出的大数值护符会把采集倍率炸掉。
 *  ★ v8.42 护符多插槽：3 个护符槽，上限从 +100% 放宽到 +300%（= 槽位数）。
 *  单件护符仍钳在 +100%（T24 满值），多插槽的意义是"3 件中低级护符也能凑出高加成"。 */
const TALISMAN_SLOTS = 3;
const TALISMAN_BONUS_CAP = TALISMAN_SLOTS * 1.0;
function prodBonus(){
  let m = 0;
  for(const g of S.gear) if(g.slot === "talisman" && g.on) m += (g.val || 0) / 100;
  return Math.min(TALISMAN_BONUS_CAP, m);
}

/* ---------- 今日运势（v7.13：每日抽签，只影响采集收成） ---------- */
function fortuneOf(){ return FORTUNES[S.fortune && S.fortune.i != null ? S.fortune.i : 3]; }
function fortuneMul(){ return fortuneOf().mul; }
/** 跨入新的一天时自动重抽，并在日志里报签（抽签的仪式感） */
function checkFortune(){
  const d = Math.floor(S.day);
  if(!S.fortune || S.fortune.d !== d){
    S.fortune = { d, i: rollFortune() };
    const f = FORTUNES[S.fortune.i];
    const mulTxt = f.mul >= 1 ? `采集收成 ×${f.mul}` : `采集收成 ×${f.mul}（不利）`;
    log(`🎲 第 ${d + 1} 天 · 今日运势【${f.name}】　${mulTxt}`, f.cls);
    log(`　${f.msg}`, f.cls);
    dailyFacilityTick(d);                        /* ★ v8.7 跨天：设施日产出/日耗料结算 */
    invalidateUI();
  }
  return S.fortune.i;
}
/** 每游戏日一次的设施结算（v8.7）：
 *  - 农田/收集器的日产出（此前只有文案、引擎从未实现——用户的"发电设备"追问牵出的补课）
 *  - 发电机日耗料：足料运转（电力加成生效），断料停转（加成失效并告警） */
function dailyFacilityTick(d){
  if(S.facDay === d) return;                     /* 幂等：一天只结算一次 */
  S.facDay = d;
  const msgs = [];
  if((S.bld.farm || 0) > 0){
    const g = 10 * S.bld.farm;
    S.res.food = (S.res.food || 0) + g;
    msgs.push(`🌾 农田收成 口粮+${g}`);
  }
  if((S.bld.collector || 0) > 0){
    const g = 5 * S.bld.collector;
    S.res.water = (S.res.water || 0) + g;
    msgs.push(`💧 雨水收集器 净水+${g}`);
  }
  const gl = S.bld.generator || 0;
  if(gl > 0){
    const t = POWER_TIERS[gl];
    let ok = true;
    for(const k in t.consume){ if((S.res[k] || 0) < t.consume[k]){ ok = false; break; } }
    const eatTxt = Object.entries(t.consume).map(([k, v]) => `${itemIcon(k)}${itemName(k)}×${v}`).join(" ");
    if(ok){
      for(const k in t.consume) S.res[k] -= t.consume[k];
      S.powerOn = true;
      msgs.push(`${t.icon} ${t.name}运转中（${eatTxt}）——采集 +${4 * gl}%、制作速度 +${8 * gl}%`);
    }else{
      S.powerOn = false;
      msgs.push(`⚠️ ${t.name}缺料停转（今日应耗 ${eatTxt}）——电力加成失效`);
    }
  }
  for(const m of msgs) log(m, msgs.some(x => x.startsWith("⚠️")) && m.startsWith("⚠️") ? "bad" : "good");
}
function disIntensity(){ return DIS_INTENSITY(S.wave); }
function beastStrength(){ return BEAST_STRENGTH(S.wave); }
function encounterStrength(){ return ENCOUNTER_STRENGTH(S.wave); }
function lossMul(){
  let red = 0.08 * lv("storage");
  if(lv("storage") >= 5) red += 0.2;          /* 地下仓库：受灾损失再降 20% */
  return Math.max(0.1, 1 - red);
}

/* ---------- 仓储容量 ---------- */
function storageCapNow(){
  const boost = Math.min(100, tagSum("storeBoost"));          /* v8.6 收纳词条：仓储容量 +X%（封顶 +100%） */
  /* v8.18：容量只由「储物箱档位」决定（每阶段一档新存储设备，要图纸 + 材料）——
   * 不再乘材质档倍率（旧做法让容量白涨到 3.5 亿，仓储建设失去意义）。 */
  return Math.round(storageCap(lv("storage")) * (1 + boost / 100));
}
function storageFree(){ return Math.max(0, storageCapNow() - storageUsed()); }
function isOverflow(){ return storageUsed() > storageCapNow(); }

function cost(id){
  if(id === "house"){                 /* 避难所：花费 = 下一档材质的材料，不走 COST_K 通式 */
    const nx = houseTier(lv("house") + 1);   /* v8.15 公式兜底：超出预生成档位也能升级 */
    return nx ? Object.assign({}, nx.cost) : {};
  }
  if(id === "generator"){             /* 发电机：花费 = 下一档机型的材料（v8.7） */
    const nx = POWER_TIERS[lv(id) + 1];
    return nx ? Object.assign({}, nx.cost) : {};
  }
  if(id === "storage"){               /* 储物箱：花费 = 下一档存储设备的材料（v8.18，逐档定义而非通式） */
    const nx = STORAGE_TIERS.find(t => t.lv === lv(id) + 1);
    return (nx && nx.cost) ? Object.assign({}, nx.cost) : {};
  }
  const cfg = BLDCFG.find(b => b.id === id);
  const k = Math.pow(COST_K, lv(id));
  const o = {};
  for(const key in cfg.base) o[key] = Math.ceil(cfg.base[key] * k);
  return o;
}
function canPay(c){ for(const k in c) if((S.res[k] || 0) < c[k]) return false; return true; }
function pay(c){ for(const k in c) S.res[k] -= c[k]; }
function fmt(n){ return n >= 10000 ? (n/1000).toFixed(1) + "k" : Math.floor(n) + ""; }

/* ---------- 日志 ---------- */
function log(msg, cls){
  const el = document.getElementById("log");
  if(!el) return;
  const p = document.createElement("p");
  if(cls) p.className = cls;
  p.textContent = "[" + new Date().toLocaleTimeString("zh-CN",{hour12:false}) + "] " + msg;
  el.prepend(p);
  while(el.children.length > 200) el.lastChild.remove();
  /* v8.30 浮动按钮的"避难所日志"摘要 = 最近一条，收起时也知道刚刚发生了什么 */
  if(typeof setFabSum === "function") setFabSum("log", msg);
}

/* ---------- 生死阶梯 ---------- */
/** 设置伤势等级 */
function woundSet(name, silent){
  const before = woundLevel();
  if(WOUND_ORDER.indexOf(name) < 0) name = "none";
  S.wound = name;
  if(name === "dying" && before !== "dying") S.dyingH = DYING_HOURS;
  if(name !== "dying") S.dyingH = 0;
  if(!silent && name !== before){
    const w = WOUND[name];
    if(name === "none") log("💚 伤好了，主角状态恢复。", "good");
    else log(`${w.icon} 主角 ${w.name}了——${w.desc}`, "bad");
  }
}
/** 降 n 级（休息 / 用绷带） */
function woundHeal(n, reason){
  const idx = woundIdx();
  if(idx <= 0) return false;
  const target = WOUND_ORDER[Math.max(0, idx - n)];
  const was = woundLevel();
  S.wound = target;
  if(target !== "dying") S.dyingH = 0;
  if(was !== target){
    if(target === "none") log(`💚 ${reason || "休息"}——伤好了，主角状态恢复。`, "good");
    else log(`🩹 ${reason || "休息"}——伤势减轻为「${WOUND[target].name}」。`, "good");
  }
  return true;
}
/** 加重一级（遭遇 / 事故） */
function woundWorsen(reason){
  const idx = woundIdx();
  if(idx >= WOUND_ORDER.length - 1){
    /* 已经是濒死 → 直接进入死亡流程（由引擎处理） */
    return "dying";
  }
  const target = WOUND_ORDER[idx + 1];
  S.wound = target;
  if(target === "dying") S.dyingH = DYING_HOURS;
  const w = WOUND[target];
  log(`${w.icon} ${reason || "出事了"}——主角 ${w.name}了。${w.desc}`, "bad");
  return target;
}
/** 用一份绷带：降两级 */
function useMedkit(){
  if((S.res.medkit || 0) < 1){ log("🩹 没有绷带了（布料 + 水 可以在工作台做）。", "bad"); return false; }
  if(woundIdx() === 0){ log("🩹 主角没受伤，用不上绷带。"); return false; }
  S.res.medkit -= 1;
  woundHeal(MEDKIT_HEAL, "用了一份绷带");
  return true;
}

/* ---------- 吃喝生存 ---------- */
function eatFood(manual){
  if(S.res.food < 1){ if(manual) log("🥫 口粮不够了，只能去废墟里翻箱子。","bad"); return false; }
  if(!manual && S.sate >= 70) return false;
  S.res.food -= 1;
  S.sate = Math.min(100, S.sate + BITE_RESTORE);
  if(manual) log("🍚 热了一顿口粮，饱食度 +" + BITE_RESTORE + "。","good");
  return true;
}
function drinkWater(manual){
  if(S.res.water < 1){ if(manual) log("💧 水见底了，得想办法找水。","bad"); return false; }
  if(!manual && S.hydro >= 70) return false;
  S.res.water -= 1;
  S.hydro = Math.min(100, S.hydro + BITE_RESTORE);
  if(manual) log("🚰 喝了净水，水分 +" + BITE_RESTORE + "。","good");
  return true;
}
/** 生存推进：hours 为小时数；自动进食会把状态维持在 70 以上 */
function survivalTick(hours){
  const satSave = Math.min(50, tagSum("satSave"));            /* v8.6 省粮词条：饱食消耗 -X%（封顶 50%） */
  S.sate  = Math.max(0, S.sate  - SATE_DECAY  * (1 - satSave / 100) * hours / 24);
  S.hydro = Math.max(0, S.hydro - HYDRO_DECAY * hours / 24);
  if(S.autoEat){
    if(S.sate < 70)  while(S.sate < 70  && eatFood(false));
    if(S.hydro < 70) while(S.hydro < 70 && drinkWater(false));
  }
  S.hungry = (S.sate <= 5 || S.hydro <= 5);
}

/* ---------- 时段 ---------- */
function segOf(h){ return h < 6 ? "night" : h < 12 ? "am" : h < 18 ? "pm" : "night"; }
function segName(seg){ return { am:"上午出工中", pm:"下午出工中", night:"夜间（睡觉回体力）" }[seg]; }

/* ---------- 游戏时钟（精确到分钟） ---------- */
/** 当前游戏内的小时（含小数） */
function gameHour(){ return (S.day * 24) % 24; }
/** "14:32" */
function clockText(h){
  if(h === undefined) h = gameHour();
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}
/** 第几天 + 时刻，如 "第 3 天 14:32" */
function fullClockText(){
  return "第 " + (Math.floor(S.day) + 1) + " 天 " + clockText();
}
/** 把"天/小时"的小数时长写成人类可读：2 天 3 小时 20 分 */
function durText(days){
  if(days === Infinity) return "很久";
  const d = Math.floor(days);
  const restH = (days - d) * 24;
  const h = Math.floor(restH);
  const m = Math.round((restH - h) * 60);
  if(m === 60) return (d ? d + " 天 " : "") + (h + 1) + " 小时";
  if(d > 0) return d + " 天 " + h + " 小时" + (m ? " " + m + " 分" : "");
  if(h > 0) return h + " 小时" + (m ? " " + m + " 分" : "");
  return Math.max(1, m) + " 分";
}
/** 把游戏小时数写成可读：0.5h → "30 分" */
function hourText(h){
  if(h >= 1){
    const hh = Math.floor(h), mm = Math.round((h % 1) * 60);
    if(mm === 60) return (hh + 1) + " 小时";
    return hh + " 小时" + (mm ? " " + mm + " 分" : "");
  }
  const mm = Math.round(h * 60);
  return Math.max(1, mm) + " 分";
}
/** 游戏时长 → 现实时长（按 TIME_SCALE 换算），给玩家一个"还要等多久"的直觉 */
function realText(gameHours){
  const realMin = gameHours / TIME_SCALE * 60;
  if(realMin < 1) return "不到 1 分钟";
  if(realMin < 60) return Math.round(realMin) + " 分钟";
  const hh = Math.floor(realMin / 60), mm = Math.round(realMin % 60);
  return hh + " 小时" + (mm ? " " + mm + " 分" : "");
}
function planLabel(a){
  if(a === "explore")   return "🗺️ 探索周边";
  if(a === "workbench") return "🛠️ 留守制作（加速）";
  if(a === "rest")      return "😴 休息";
  const sp = SPOTS[a];
  return sp ? sp.icon + " " + sp.name : "😴 休息";
}

/* ---------- 开箱彩蛋（配置在 config.js，行为在这里实现） ---------- */
function randRange(r){ return r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1)); }
const SURPRISES = SURPRISE_CFG.map(c => ({
  p: c.p,
  msg: c.msg,
  fn: () => {
    if(c.gain){
      for(const k in c.gain) S.res[k] += randRange(c.gain[k]);
      return;
    }
    if(c.id === "blueprint"){
      /* ★ v8.11：彩蛋升级必须尊重设施上限——旧写法硬 +1，会把储物箱顶到 6 档，
       *   而 storageTier(6) 找不到档位会回退到最低档（容量 2500），看起来像"储物箱掉回 1 级"。
       *   满级设施改为给建材奖励，彩蛋不落空。 */
      const pool = BLDCFG.filter(b => lv(b.id) < ((b.max || 99)));
      if(pool.length){
        const b = pool[Math.floor(Math.random() * pool.length)];
        S.bld[b.id] = lv(b.id) + 1;
        log(`← ${b.icon} ${b.name} 升到 Lv.${lv(b.id)}`);
      }else{
        const w = 80 + S.wave * 20, st = 60 + S.wave * 15, m = 40 + S.wave * 10;
        S.res.wood += w; S.res.stone += st; S.res.metal += m;
        log(`← 所有设施都已满级，翻出一批建材代替：木材+${w} 石料+${st} 金属+${m}`);
      }
      return;
    }
    /* ★ v8.1：走 addChest——旧写法直接 S.chests.relic+=1 绕过自动开箱（偶发堆积真凶）。
     *   且遗迹箱按设计"仅探索遗迹专属"（唯一允许越级产出），彩蛋不该给遗迹箱，
     *   否则阶段 1 自动开出 T2 造成泄漏。改为按阶段给当前可用的好箱子。 */
    if(c.id === "rustykey"){
      const ct = effChestTier(S.age >= 2 ? "silver" : "bronze");
      addChest(ct, null);
    }
  }
}));

/* ---------- 旧存档迁移（字段兼容） ---------- */
function migrateSave(){
  S.gear = S.gear || [];

  /* ★ v8.41 遗留护符迁移：v8.27 前护符走战力量纲（×1.8/代际），掉出过 val 上千的
   *  天价护符；改版后护符是「搜集效率 %」量纲（T24 封顶 +100%，结算也封顶 +100%）。
   *  老量纲护符一件就顶满上限，导致之后制作任何护符都"看不到提升"。
   *  这里把 val>100 的遗留护符按稀有度归一到新量纲——原来实际收益同为封顶 +100%，玩家无损失。 */
  for(const g of S.gear){
    if(g.slot === "talisman" && (g.val || 0) > 100){
      g.val = g.rar >= 4 ? 100 : g.rar === 3 ? 88 : g.rar === 2 ? 72 : 55;
    }
  }

  /* 资源字典：补齐后来新增的物品键 */
  const blank = blankItems();
  S.res = S.res || {};
  for(const k in blank) if(S.res[k] === undefined) S.res[k] = blank[k];

  /* 设施 */
  const bldBlank = { house:0, snare:0, bench:0, fortify:0, traps:0, storage:0, collector:0, farm:0, coat:0, insulation:0, drain:0, basement:0, seal:0, forge:0, generator:0, turret:0 };
  S.bld = S.bld || {};
  for(const k in bldBlank) if(S.bld[k] === undefined) S.bld[k] = bldBlank[k];
  if(!S.bld.house) S.bld.house = 1;
  S.bld.house = Math.min(30, S.bld.house);        /* 老档 Lv1-10 → 材质链 1-6 档（v7.11，v8.5 扩合金） */
  /* ★ v8.11：所有设施等级按各自上限夹回——彩蛋升级曾把储物箱顶到 6 档、
   *   防灾设施顶到 2+ 档，超限后档位查询会回退到最低档（"储物箱掉回 1 级"假象）。 */
  for(const b of BLDCFG){
    if(!b.max) continue;
    const v = S.bld[b.id];
    if(typeof v === "number" && v > b.max) S.bld[b.id] = b.max;
  }

  /* 箱子：iron → bronze，code → relic */
  S.chests = S.chests || {};
  if(S.chests.iron !== undefined && S.chests.bronze === undefined){
    S.chests.bronze = S.chests.iron;
    delete S.chests.iron;
  }
  if(S.chests.code !== undefined && S.chests.relic === undefined){
    S.chests.relic = S.chests.code;
    delete S.chests.code;
  }
  for(const k of ["wood","bronze","silver","gold","relic"]) if(S.chests[k] === undefined) S.chests[k] = 0;

  S.bp = (S.bp || []).filter(b => typeof b === "string" && b);   /* 清洗历史脏数据（曾可能混入 undefined） */
  /* 老存档的单个制作项 → 制作线数组 */
  if(!Array.isArray(S.crafts)){
    S.crafts = (S.craft && S.craft.id) ? [{ id:S.craft.id, prog:S.craft.prog || 0 }] : [];
    delete S.craft;
  }
  S.crafts = S.crafts.filter(c => c && typeof c.id === "string" && c.id)
    .map(c => ({ id:c.id, prog:c.prog || 0, qty:Math.max(1, Math.floor(c.qty || 1)) }));   /* v7.12 补制作数量 */

  /* 阶段与生死 */
  if(!S.age) S.age = 1;
  if(!S.fortune || typeof S.fortune.i !== "number")                 /* v7.13 补今日运势 */
    S.fortune = { d: Math.floor(S.day || 0), i: rollFortune() };
  /* ★ 灾史回填（v7.16）：灾报上线前已渡过的天灾，补占位记录——至少能查"经历过哪几场" */
  if(!Array.isArray(S.disLog)) S.disLog = [];
  if(S.wave > 1 && S.disLog.length === 0){
    for(let i = 1; i < S.wave; i++){
      S.disLog.push({
        wave: i, name: (typeof disTypeAtWave === "function" ? disTypeAtWave(i) : DIS_TYPES[(i - 1) % DIS_TYPES.length]).name,
        day: null, legacy: true, win: true,
        have: null, need: null,
        rewards: "（改版前渡过，明细未记录）"
      });
    }
    S.disUnread = false;
  }
  /* ★ 图纸更名迁移（v8.1）：图纸名统一为"配方名+图纸"——用户质疑"解锁绷带的图纸凭什么叫急救图纸"
   *   注意：必须在补发之前执行，否则库里旧名转新名后与补发的新名重复 */
  const BP_RENAME = {
    "急救图纸":"绷带图纸", "偏方图纸":"兴奋剂图纸",
    "冶金图纸":"铁块图纸", "鞣皮图纸":"皮革图纸", "拉丝图纸":"铜线图纸",
    "箱柜图纸":"木箱柜图纸", "货架图纸":"分类货架图纸", "储藏室图纸":"干燥储藏室图纸",
    "冷库图纸":"冷藏库图纸", "仓库图纸":"地下仓库图纸",
    "铁器图纸（武器）":"铁管长矛图纸", "铁器图纸（护甲）":"铆钉皮甲图纸", "铁器图纸（精铁镐）":"精铁镐图纸",
    "机械图纸（连发弩）":"连发弩图纸", "机械图纸（提灯）":"提灯图纸", "火器图纸（冲锋枪）":"冲锋枪图纸",
    "特化图纸（防毒面具）":"防毒面具图纸", "特化图纸（保温服）":"保温服图纸", "特化图纸（防水装备）":"防水装备图纸",
    "特化图纸（隔热壳）":"隔热壳图纸", "特化图纸（防酸披风）":"防酸披风图纸"
  };
  S.bp = Array.from(new Set((S.bp || []).map(b => BP_RENAME[b] || b)));   /* Set 去重兜底 */
  /* ★ 阶段 1 图纸补发（v8.1）：图纸分层规则上线，给所有有进度的老档补齐阶段 1 功能图纸
   *   （急救绷带是生死阶梯刚需，没图纸造不出来会很难受）。新档（day=0）不补，保留掉落惊喜。 */
  if((S.day || 0) > 0){
    for(const b of ["绷带图纸", "兴奋剂图纸", "并行作业手册"]){
      if(!S.bp.includes(b)) S.bp.push(b);
    }
  }
  /* ★ 主干图纸兜底（v8.3）：进过工业期（age≥2）的档保底有「铁块图纸」——
   *   它是整个铁器线的入口，不该被随机掉落卡死。炼钢/皮革等仍靠掉落。 */
  if((S.age || 1) >= 2 && !S.bp.includes("铁块图纸")) S.bp.push("铁块图纸");
  if(S.injured !== undefined){                     /* 旧字段 injured(天) → wound 等级 */
    if(S.injured > 0 && !S.wound) S.wound = "light";
    delete S.injured;
  }
  if(!S.wound) S.wound = "none";
  if(S.dyingH === undefined) S.dyingH = 0;
  if(S.bagLv === undefined) S.bagLv = 0;
  if(S.rebirth === undefined) S.rebirth = 0;
  if(S.aggressive === undefined) S.aggressive = false;
  if(!S.stats) S.stats = { chestsOpened:0, daysLived:0, deaths:0, best:0, born:Date.now(), bornDay:0 };
  if(S.stats.chestsOpened === undefined) S.stats.chestsOpened = 0;
  if(S.stats.best === undefined) S.stats.best = 0;
  if(S.lastReport === undefined) S.lastReport = null;

  if(S.sate === undefined){ S.sate = 80; S.hydro = 80; S.autoEat = true; }
  if(S.autoOpen === undefined) S.autoOpen = true;
  if(S.timeMul === undefined) S.timeMul = (typeof SPEED_DEFAULT !== "undefined" ? SPEED_DEFAULT : 2);
  if(!S.plan) S.plan = { am:"forest", pm:"junk", night:"rest" };
  if(S.plan.night === undefined) S.plan.night = "rest";

  /* 世界地图轨迹（v8.15）：老档补空数组；再用真实的天灾记录回填一条脉络（不编造路线） */
  if(!Array.isArray(S.trail)) S.trail = [];
  if(!S.trail.length && Array.isArray(S.disLog) && S.disLog.length && typeof trailPush === "function"){
    for(const r of S.disLog.slice(-60)){
      S.trail.push({ d: Math.max(0, (r.day || 1) - 1), h: 6, k: "dis", s: null, n: (r.win ? "win:" : "lose:") + (r.name || "") });
    }
  }

  /* 资源点：老档只发现了 T1 的，按阶段补齐待发现池 */
  if(!S.found){ S.found = ["junk","forest"]; }
  const ageQueue = [];
  for(let a = 1; a <= S.age; a++){
    for(const id of (SPOTQUEUE_BY_AGE[a] || [])) ageQueue.push(id);
  }
  if(!S.queue || !Array.isArray(S.queue)){
    S.queue = ageQueue.filter(id => !S.found.includes(id));
  }else{
    /* 补上因新阶段而新增、且还没发现也没在队列里的地点 */
    for(const id of ageQueue){
      if(!S.found.includes(id) && !S.queue.includes(id)) S.queue.push(id);
    }
    /* 清掉不属于本阶段及以前的（防止老档残留） */
    S.queue = S.queue.filter(id => (SPOTS[id] ? SPOTS[id].tier <= S.age : false));
    /* ★ v8.18b：队列只保留"当前体系的点"——老档残留的旧版地点（如 endless 初版的
     *   endMine5/endRelic6，已被区域地图 z4Safe 等取代）会堵在队首，玩家以为探索停滞。
     *   已发现的旧点仍留在 SPOTS 里可继续采集，只是不再占探索队列。 */
    const curSet = new Set(ageQueue);
    S.queue = S.queue.filter(id => curSet.has(id));
  }

  if(S.stam === undefined) S.stam = 100;
  if(S.dryH === undefined) S.dryH = 0;
  if(S.curSeg === undefined) S.curSeg = segOf((S.day * 24) % 24);
  if(S.nextBeast === undefined) S.nextBeast = Math.max(S.day + 1, NEWBIE_DAYS + 1);
  if(S.nextDisType === undefined) S.nextDisType = (typeof disTypeAtWave === "function" ? disTypeAtWave(Math.max(1, S.wave)) : DIS_TYPES[(Math.max(1, S.wave) - 1) % DIS_TYPES.length]).name;
}

/* ---------- 新手期 ---------- */
function inNewbie(){ return S.day < NEWBIE_DAYS; }
/** 新手期剩余天数（小数，供精确到分钟的倒计时使用） */
function newbieLeftDays(){ return Math.max(0, NEWBIE_DAYS - S.day); }
function disType(){ return DIS_TYPES[(Math.max(1, S.wave) - 1) % DIS_TYPES.length]; }
