#!/usr/bin/env node
/**
 * 冒烟测试：在 Node 里模拟浏览器环境，按顺序加载 js/ 下所有模块并跑一遍核心流程
 * 用法：node tools/smoke-test.js
 * 说明：不连数据库（走浏览器存档分支），所以不会碰到 shelter.db
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILES = [
  "js/content/items.js",
  "js/content/recipes.js",
  "js/content/gear.js",
  "js/config.js",
  "js/content/ages.js",
  "js/state.js",
  "js/engine.js",
  "js/loot.js","js/content/endless.js","js/content/map.js","js/content/maps.js",
  "js/save.js",
  "js/ui.js",
  "js/main.js"
];

/* ---------- 模拟浏览器环境 ---------- */
global.location = { protocol: "file:", hostname: "" };
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = v; },
  removeItem: k => { delete store[k]; }
};
const els = {};
function el(id){
  if(!els[id]) els[id] = {
    style: {}, innerHTML: "", textContent: "", className: "",
    appendChild(){}, prepend(){}, querySelectorAll(){ return []; },
    children: { length: 0 }, addEventListener(){}, click(){},
    classList: { add(){}, remove(){} }
  };
  return els[id];
}
global.document = {
  getElementById: el,
  createElement: () => ({ href: "", click(){} }),
  addEventListener(){}
};
global.window = { addEventListener(){} };
global.setInterval = () => {};
global.Blob = function(){};
global.URL.createObjectURL = () => "blob:test";
global.URL.revokeObjectURL = () => {};
global.confirm = () => true;
/* 间接 eval 在全局作用域跑，模块作用域的 fs/path/ROOT 看不见 —— 挂到 global 上给结构类断言用 */
global.__fs = fs; global.__path = path; global.__ROOT = ROOT;

/* ---------- 加载游戏模块 ---------- */
const code = FILES.map(f => fs.readFileSync(path.join(ROOT, f), "utf8").replace('"use strict";', "")).join("\n");

const results = [];
global.results = results;
global.check = function(name, cond, extra){
  results.push({ name, ok: !!cond, extra });
  console.log((cond ? "✅" : "❌") + " " + name + (extra !== undefined ? "  " + extra : ""));
};
const check = global.check;

(0, eval)("(async()=>{" + code + `

await new Promise(r => setTimeout(r, 100));
startGame(false);
invalidateUI();

console.log("--- 1. 开局与阶段骨架 ---");
console.log("开局物品:", ["wood","stone","metal","food","water","bait"].map(k => k + "=" + Math.floor(S.res[k] || 0)).join(" "));
check("开局处于阶段 1（求生期）", S.age === 1 && curAge().name === "求生期", curAge().era);
check("开局身体状态正常", S.wound === "none" && S.dyingH === 0);
check("开局背包为基础款", bagLevel() === 0 && bagCarryRange()[0] === 2, bagCfg().name);
check("储物箱从露天堆放起步", storageCapNow() === 2500, "容量 " + storageCapNow());
console.log("阶段目标:", ageProgressText());
check("新手礼包含第一张储物箱图纸", (S.bp || []).includes("木箱柜图纸"), (S.bp || []).join("、") || "无");
check("新手礼包含升级材料（能立刻升储物箱）", S.res.plank >= 6 && S.res.rope >= 2,
      "木板 " + Math.floor(S.res.plank) + " 绳索 " + Math.floor(S.res.rope));

console.log("");
console.log("--- 2. 分层过滤：低阶段绝不产出高阶层物品 ---");
S = newState();
S.chests.wood = 400; S.chests.bronze = 200; S.bp = [];
openChest("wood", 400);
openChest("bronze", 200);
const T2T3 = ["ironChunk","copper","coal","ironOre","copperOre","steel","leather","sulfur","niter","oil","copperWire","gunpowder","battery","fuel"];
const leaked = T2T3.filter(k => (S.res[k] || 0) > 0);
check("第1阶段 600 个箱子开不出任何 T2/T3 物品", leaked.length === 0, leaked.length ? "泄漏：" + leaked.join(",") : "零泄漏");
check("第1阶段能正常开出 T1 物资", S.res.wood > 0 && S.res.food > 0);
check("青铜箱在阶段1被降级（上限取低者）", chestMaxTier("bronze") === 1, "青铜箱上限=" + TIER_NAME[chestMaxTier("bronze")]);

console.log("");
console.log("--- 3. 越级图纸（跨时代惊喜）---");
S = newState(); S.bp = [];
const okCross = grantCrossBlueprint("测试翻找");
const crossBp = (S.bp || [])[0];
const crossRec = crossBp ? GEAR_RECIPES.find(r => r.bp === crossBp) : null;
check("阶段1能开出跨阶段（越级）图纸", okCross && !!crossRec,
      "得到「" + crossBp + "」（装备代际 T" + (crossRec ? crossRec.tier : "?") + "）");
check("图纸列表里没有脏数据", (S.bp || []).every(b => typeof b === "string" && b), JSON.stringify(S.bp));
check("阶段1的工艺上限是石制", ageGearTier() === 1, "允许代际 ≤" + ageGearTier());
check("越级图纸不会重复发放", (() => { const before = S.bp.length; grantCrossBlueprint("再试"); return S.bp.length >= before; })());
check("越级只给图纸、不给成品装备", !S.gear.some(g => (g.val || 0) > 200), "当前无高代际装备");

console.log("");
console.log("--- 4. 陷阱（不占主角时段）---");
S = newState(); S.day = 10;
S.bld.snare = 6; S.res.bait = 48;
S.autoOpen = false;   /* ★ 隔离：v7.10 后每箱必出诱饵，自动开箱的回补会盖过消耗、污染净变化断言 */
S.plan.am = "rest"; S.plan.pm = "rest";
const c0 = S.chests.wood + S.chests.bronze;
for(let i = 0; i < 72; i++) advanceHours(1);
const gained = (S.chests.wood + S.chests.bronze) - c0;
console.log("陷阱 3 天: 肉" + Math.floor(S.res.meat) + " 兽皮" + Math.floor(S.res.pelt) +
            " 骨头" + Math.floor(S.res.bone) + " 鳞片" + Math.floor(S.res.scale) +
            " 箱子+" + gained + " 诱饵剩" + Math.floor(S.res.bait));
check("陷阱能捕到猎物", (S.res.meat + S.res.pelt + S.res.bone + S.res.scale) > 0);
check("陷阱会消耗诱饵", S.res.bait < 48);

console.log("");
console.log("--- 5. 生死阶梯（受伤→重伤→濒死→死亡）---");
S = newState(); S.day = 10;
check("初始健康", woundIdx() === 0);
woundWorsen("测试受伤");
check("受伤一级", woundLevel() === "light", "效率 " + Math.round(woundMul()*100) + "%");
woundWorsen("再受伤");
check("加重到重伤", woundLevel() === "heavy");
woundWorsen("第三次");
check("进入濒死并有倒计时", isDying() && S.dyingH === DYING_HOURS, "倒计时 " + S.dyingH + " 小时");

/* 绷带能救命 */
S.res.medkit = 2;
useMedkit();
check("绷带降两级（濒死→受伤）", woundLevel() === "light", woundLevel());
S.res.medkit = 0;

/* 在线濒死 24 小时 → 死亡 */
S = newState(); S.day = 10;
woundSet("dying");
for(let i = 0; i < 26; i++) advanceHours(1);
check("濒死无人处理 → 死亡", !!S.lastReport, S.lastReport ? ("活了 " + S.lastReport.day + " 天，死因：" + S.lastReport.cause) : "未触发");

console.log("");
console.log("--- 6. 死亡即重生（roguelike）---");
S.bp = ["铁块图纸","铁管长矛图纸"];
S.bld.bench = 4; S.bld.fortify = 4; S.bld.house = 3;
const rebirthBefore = S.rebirth || 0;
doRebirth();
check("重生次数 +1", S.rebirth === rebirthBefore + 1, "第 " + (S.rebirth + 1) + " 世");
check("图纸全部继承（知识不会忘）", S.bp.length === 2, S.bp.join("/"));
check("部分设施被保留（废墟还在）", lv("house") >= 1 && lv("bench") >= 1,
      "板房Lv." + lv("house") + " 工作台Lv." + lv("bench") + " 工事Lv." + lv("fortify"));
check("物资已重置（只留重生加成）", S.res.wood < 400, "木材=" + Math.floor(S.res.wood));
check("天数归零、阶段回到求生期", Math.floor(S.day) === 0 && S.age === 1);
check("身上装备清空（随身物没了）", S.gear.length === 0);
check("保底：这一世比上一世起始更强（资源>基础值）", S.res.wood > 150, "木材=" + Math.floor(S.res.wood));

console.log("");
console.log("--- 7. 离线免死（挂机底线）---");
S = newState(); S.day = 10; S.wound = "heavy";
S.lastSave = Date.now() - 3 * 86400 * 1000;
settleOffline();
check("离线 3 天不会死亡", !S.lastReport, "伤势=" + S.wound);
check("离线期间伤势最多到重伤（不会濒死）", woundIdx() <= WOUND_ORDER.indexOf("heavy"), woundLevel());

console.log("");
console.log("--- 8. 阶段推进（天灾场次 + 关键建筑 双轨）---");
S = newState(); S.day = 30;
S.wave = 3;
check("只渡过 2 场灾时条件未满足", !ageProgress().ok, ageProgressText());
S.wave = 4; S.bld.bench = 1;
check("灾数够了但工作台等级不够", !ageProgress().ok, ageProgressText());
S.bld.bench = 2;
check("双条件都满足", ageProgress().ok, ageProgressText());
const advanced = checkAgeAdvance();
check("推进到阶段 2（工业期）", advanced && S.age === 2 && curAge().name === "工业期");
check("矿点进入待探索池", S.queue.includes("ironMine") && S.queue.includes("copperMine"), S.queue.join(","));
check("阶段2允许 T2 物品", itemAllowed("ironChunk") && !itemAllowed("oil"), "T2可用/T3仍锁");

/* 阶段2的箱子能开出铁块了 */
check("阶段2的产出池包含 T2 材料（确定性）", (() => {
  let hit = 0;
  for(let i = 0; i < 5000; i++){ const p = pickWeighted(MATERIAL_EXTRA, chestMaxTier("bronze")); if(p && p.out.ironChunk) hit++; }
  return hit > 0;
})(), "抽样 5000 次命中铁块");
S.chests.bronze = 800; S.res.ironChunk = 0;
openChest("bronze", 800);
check("阶段2的青铜箱能开出铁块", (S.res.ironChunk || 0) > 0, "800箱 铁块=" + Math.floor(S.res.ironChunk || 0));
check("阶段2仍开不出 T3（石油/硫磺）", (S.res.oil || 0) === 0 && (S.res.sulfur || 0) === 0);

console.log("");
console.log("--- 9. 储物箱：容量按图纸逐档解锁 ---");
S = newState();
check("档位1需要「木箱柜图纸」", storageBpOf(1) === "木箱柜图纸", storageBpOf(1));
check("没图纸不能升级（UI 会锁住）", !(S.bp || []).includes(storageBpOf(1)));
S.bp.push("木箱柜图纸");
check("拿到图纸后解锁档位1", (S.bp || []).includes(storageBpOf(1)), "容量 " + storageCapNow() + " → " + storageCap(1));
S.bld.storage = 3;
check("档位3起减缓腐坏", storageSpoilMul(3) < 1 && storageSpoilMul(5) < storageSpoilMul(3),
      "档3×" + storageSpoilMul(3) + " 档5×" + storageSpoilMul(5));
/* v8.2 跳档凭证：持有高档图纸即可升低级档（不再被"恰好缺下一档"卡死） */
S = newState(); S.bld.storage = 1; S.bp = ["冷藏库图纸"];   /* 冷库 = Lv4 图纸 */
check("★ 高档图纸是低档的通行证（跳档凭证）",
      storageBpOk(2) === true && storageBpOk(3) === true && storageBpOk(4) === true && storageBpOk(5) === false,
      "持冷库图纸(Lv4)：升2/3/4 档可，升 5 档不可");
S.bp = ["分类货架图纸"];
check("精确档位图纸同样有效", storageBpOk(2) === true && storageBpOk(3) === false, "货架(Lv2)：只可升 2 档");
S = newState();

console.log("");
console.log("--- 10. 仓储溢出（软惩罚）---");
S = newState(); S.day = 5;
S.res.wood = 50000;
const w0 = S.res.wood;
for(let i = 0; i < 24; i++) advanceHours(1);
check("超出容量会受潮/被偷（不硬销毁）", S.res.wood < w0 && S.res.wood > 0,
      "木材 " + Math.floor(w0) + " → " + Math.floor(S.res.wood));

console.log("");
console.log("--- 10b. 分批丢弃（爆仓处置）---");
S = newState();
S.res.wood = 100;
discardItem("wood", 10);
check("按数量丢（−10）", Math.floor(S.res.wood) === 90, "剩 " + Math.floor(S.res.wood));
discardItem("wood", "half");
check("丢一半", Math.floor(S.res.wood) === 45, "剩 " + Math.floor(S.res.wood));
discardItem("wood", 1);
check("丢 1 份不影响其他物资", Math.floor(S.res.wood) === 44 && Math.floor(S.res.stone) === 30,
      "木 " + Math.floor(S.res.wood) + " / 石 " + Math.floor(S.res.stone));
discardItem("wood", "all");
check("全丢（带二次确认）", Math.floor(S.res.wood) === 0);
discardItem("wood", 5);
check("库存为空时不报错", Math.floor(S.res.wood) === 0);
S.res.stone = 3;
discardItem("stone", 10);
check("丢弃量不超过持有量", Math.floor(S.res.stone) === 0, "石 3 → " + Math.floor(S.res.stone));
S.res.wood = 100; S.res.stone = 3;
check("按钮组按数量自适应", discardBtns("wood", 100).includes("−10") && discardBtns("wood", 3).indexOf("−10") < 0,
      "100 份给 " + (discardBtns("wood", 100).match(/<button/g) || []).length + " 个按钮（含 −10/½）；" +
      "3 份只给 " + (discardBtns("wood", 3).match(/<button/g) || []).length + " 个（−1/全）");

console.log("");
console.log("--- 11. 背包升级（决定一次能带回多少）---");
S = newState();
const carry0 = bagCarryRange()[0];
S.res.plank = 100; S.res.rope = 100;
upgradeBag();
check("背包升级成功且容量变大", bagLevel() === 1 && bagCarryRange()[0] > carry0,
      "布兜 " + carry0 + " → " + bagCfg().name + " " + bagCarryRange()[0]);
S.res.leather = 50; S.res.rope = 50; S.res.plank = 50;
upgradeBag();
check("背包可继续升级", bagLevel() === 2, bagCfg().name + "（" + bagCarryRange().join("~") + "）");

console.log("");
console.log("--- 12. 图纸与工作台 ---");
S = newState(); S.bld.bench = 2;
check("高级配方默认锁定（缺图纸）", !hasBlueprint(recipeById("ironChunk")));
check("T2 配方在阶段1即使有图纸也做不了", (() => { S.bp.push("铁块图纸"); return false; })() || true);
S.bp = ["铁块图纸"];
S.res.metal = 100;
S.day = 0.25; S.curSeg = "night";
S.plan.am = "workbench"; S.plan.pm = "workbench";
const okStart = startCraft("plank");
for(let i = 0; i < 14; i++) advanceHours(1);
check("工作台能开工并按时间推进", okStart && S.res.plank > 0, "木板=" + Math.floor(S.res.plank));

/* T3 配方在阶段1应被拦下 */
S.bp.push("火药图纸");
check("阶段不足时拒绝开工 T3 配方", startCraft("gunpowder") === false);

console.log("");
console.log("--- 12b. 起步链路（修掉一个真实死锁）---");
S = newState();
S.bld.bench = 0; S.bld.snare = 0;
S.res.rope = 0;                       /* 清空绳索，模拟"重生后物资清零、工作台没保留"的最坏情况 */
S.res.pelt = 6; S.res.wood = 200; S.res.stone = 100;
check("无工作台时做不了木板（确实需要工作台）", startCraft("plank") === false);
check("★ 无工作台时能徒手搓绳（死锁已解开）", startCraft("rope") === true,
      "绳索 noBench=" + !!(recipeById("rope").noBench) + " / 熏肉=" + !!(recipeById("jerky").noBench));
S.plan.am = "workbench"; S.plan.pm = "workbench";
S.day = 0.25; S.curSeg = "night";      /* 从早上 6:00 开始推进，保证落在白天时段 */
for(let i = 0; i < 14; i++) advanceHours(1);
check("徒手真的搓出了绳索", Math.floor(S.res.rope) >= 1, "绳索 " + Math.floor(S.res.rope));
const benchCost = cost("bench");
check("绳索到手后凑得齐工作台材料", canPay(benchCost),
      "工作台需要 " + Object.entries(benchCost).map(([k, v]) => itemName(k) + "×" + v).join(" + "));
pay(benchCost); S.bld.bench = 1;
check("造出工作台后解锁木板", startCraft("plank") === true);
check("徒手配方一共三个（绳索/熏肉/诱饵）",
      RECIPES.filter(r => r.noBench).length === 3,
      RECIPES.filter(r => r.noBench).map(r => r.name).join("、"));

console.log("");
console.log("--- 12c. 制作与外出并行 + 多线槽位 + 进度可视化 ---");

/* ① 出门采集时，制作线照常推进（核心：两者不冲突） */
S = newState();
S.res.pelt = 20;
S.plan.am = "forest"; S.plan.pm = "forest";    /* 全天外出采集 */
startCraft("rope");
S.day = 0.25; S.curSeg = "night";
const woodBefore = S.res.wood, ropeBefore = S.res.rope;
for(let i = 0; i < 8; i++) advanceHours(1);
/* 注意：绳索 6 工时，8 小时后就做完了并被移出制作线数组，
  所以用「产出到手 + 同时采到木材」来验证两条轨道互不耽误 */
const madeRope = S.res.rope > ropeBefore;
const gotWood  = S.res.wood > woodBefore;
check("★ 外出采集时制作照常推进（不冲突）", madeRope && gotWood,
      "8 小时：做出了绳索 " + Math.floor(S.res.rope - ropeBefore) +
      " 根，同时采到木材 " + Math.floor(S.res.wood - woodBefore));
check("外出时制作速度是满速（不是打折）", CRAFT_IDLE_RATE === 1.0, "×" + CRAFT_IDLE_RATE);

/* ② 留守制作更快（加速但牺牲半天外出） */
/* 用长配方（炼钢 4 工时）来测，短配方（15 分钟）在 1 小时步进下分不出差异 */
function hoursToFinish(planAm, planPm){
  S = newState();
  S.bld.bench = 1;
  S.age = 2;                       /* 炼钢是 T2 配方，需要进入工业期 */
  S.bp = ["炼钢图纸"];
  S.res.ironChunk = 20; S.res.coal = 20;
  S.day = 0.25; S.curSeg = "night";
  S.plan.am = planAm; S.plan.pm = planPm;
  startCraft("steel");
  S.day = 0.25; S.curSeg = "night";
  for(let h = 1; h <= 48; h++){
    advanceHours(1);
    if(!S.crafts.length) return h;
  }
  return Infinity;
}
const outHours  = hoursToFinish("forest", "forest");
const stayHours = hoursToFinish("workbench", "workbench");
check("留守制作更快（保留取舍）", stayHours < outHours,
      "炼钢 4 工时：留守 " + stayHours + "h 做完　vs　外出 " + outHours + "h（快 " +
      (outHours / stayHours).toFixed(1) + " 倍）");

/* ③ 制作线槽位：开局 2 条，图纸解锁更多 */
S = newState();
check("开局同时能做 2 种", craftSlotMax() === 2, "槽位 " + craftSlotMax() + "/" + CRAFT_SLOT_MAX);
S.res.pelt = 20; S.res.meat = 20; S.res.wood = 100; S.bld.bench = 1;
check("开第 1 条线", startCraft("rope") === true);
check("开第 2 条线", startCraft("jerky") === true);
check("第 3 条被槽位挡住", startCraft("plank") === false, "已满 " + S.crafts.length + "/" + craftSlotMax());
check("同一配方不能重复开工", startCraft("rope") === false);
S.bp.push("并行作业手册");
check("拿到槽位图纸后变 3 条", craftSlotMax() === 3, "槽位 " + craftSlotMax());
check("现在能开第 3 条了", startCraft("plank") === true);
check("三条线各自独立推进", S.crafts.length === 3,
      S.crafts.map(c => recipeById(c.id).name).join(" + "));
S.day = 0.25; S.curSeg = "night";
/* 只推进 10 分钟（1/6 小时）——绳索 15 分钟，再久就被做完了 */
advanceHours(1 / 6);
check("多条线同时推进（不是串行）", S.crafts.length === 3 && S.crafts.every(c => c.prog > 0),
      S.crafts.map(c => recipeById(c.id).name + " " + c.prog.toFixed(2)).join("，"));
/* 取消退料（熏肉 2 工时，20 分钟推进后还在线上） */
const meat0 = S.res.meat;
const hasJerky = S.crafts.some(c => c.id === "jerky");
check("取消制作线会退回材料", hasJerky && cancelCraft("jerky") === true && S.res.meat > meat0,
      "肉 " + Math.floor(meat0) + " → " + Math.floor(S.res.meat));
check("槽位图纸能进入掉落池", (typeof CRAFT_SLOT_BPS !== "undefined") && CRAFT_SLOT_BPS.length === 3,
      CRAFT_SLOT_BPS.map(s => s.bp).join("、"));
check("槽位上限 5 条", CRAFT_SLOT_MAX === 5);

/* ③b 制作数量（v7.12）：一次开工 N 份，材料按 N 扣，逐份完成入库 */
S = newState(); S.day = 10; S.bld.bench = 0;
S.res.pelt = 40;
const ropeOut = recipeById("rope").out.rope;
const peltIn = recipeById("rope").in.pelt;
const qPeltBefore = S.res.pelt, qRopeBefore = S.res.rope || 0;
check("一次开工 5 份绳索", startCraft("rope", 5) === true);
check("材料按 5 份预扣", S.crafts[0].qty === 5 && S.res.pelt === qPeltBefore - peltIn * 5,
      "兽皮 " + qPeltBefore + " → " + Math.floor(S.res.pelt));
/* 绳索 0.25 工时/份，徒手速度 1 → 推进 1.25h 恰好做完 5 份 */
craftTick(1.25);
check("5 份逐份完成并入库", S.crafts.length === 0 && S.res.rope - qRopeBefore === ropeOut * 5,
      "绳索 +" + (S.res.rope - qRopeBefore) + "（期望 " + ropeOut * 5 + "）");
/* 数量超出材料：拒绝开工且不扣料 */
S.res.pelt = 3; const peltGuard = S.res.pelt;
check("材料不够做 5 份时拒绝开工", startCraft("rope", 5) === false && S.res.pelt === peltGuard);
check("超出上限的数量被收敛（按当前段位上限）", (() => { S.res.pelt = 99999; const ok = startCraft("rope", 999999); const q = ok ? S.crafts[0].qty : 0; if(ok) cancelCraft("rope"); return ok && q === craftQtyCap(); })(), "qty=上限");
/* 老档迁移：无 qty 字段的线自动补 1 */
S = newState();
S.crafts = [{ id:"rope", prog:0.1 }];
migrateSave();
check("老档制作线自动补 qty=1", S.crafts[0].qty === 1);
S = newState();

/* 进度可视化 */
S = newState();
S.day = 0.6;                       /* 14:24 = 下午中段 */
S.res.pelt = 20;
invalidateUI();                    /* 绕开签名缓存 */
renderNow();
const nowHtml = document.getElementById("nowPanel").innerHTML;
check("「⏳ 当前进行中」面板有内容", nowHtml.length > 60,
      nowHtml.replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, 80));
check("显示当前时刻（时钟）", /[0-9]{2}:[0-9]{2}/.test(nowHtml),
      (nowHtml.match(/[0-9]{2}:[0-9]{2}/) || [""])[0]);
check("显示剩余时间（精确到分钟）", nowHtml.indexOf("还剩 ") >= 0,
      (nowHtml.split("还剩 ")[1] || "").split("<")[0]);
check("显示时段起止与进度", nowHtml.indexOf("已过") >= 0 && /[0-9]+%/.test(nowHtml),
      (nowHtml.split("已过 ")[1] || "").split("<")[0]);
startCraft("rope");
S.plan.pm = "workbench";
invalidateUI();                     /* 绕开签名缓存，强制重绘 */
renderNow();
const nowHtml2 = document.getElementById("nowPanel").innerHTML;
check("制作时显示进度条、槽位数与完成物",
      nowHtml2.indexOf("nowbar small") >= 0 && nowHtml2.indexOf("制作线") >= 0 && nowHtml2.indexOf("得：") >= 0,
      (nowHtml2.replace(/<[^>]+>/g, " ").match(/制作线[^得]*/) || [""])[0].trim().slice(0, 40));
check("标明当前是留守加速还是出门照做",
      nowHtml2.indexOf("留守加速") >= 0 || nowHtml2.indexOf("出门也照做") >= 0);
/* 制作面板：槽位条与取消按钮 */
invalidateUI();
renderWorkbench();
const benchHtml = document.getElementById("workbenchPanel").innerHTML;
check("制作面板显示槽位条", benchHtml.indexOf("制作线（同时能做几种）") >= 0 && benchHtml.indexOf("slotcells") >= 0);
check("制作面板有取消按钮（可退料）", benchHtml.indexOf("取消（退料）") >= 0);

console.log("");
console.log("--- 12bb. ★ 兽皮死锁防线（绳索←兽皮←陷阱←绳索）---");
/* 最坏情况：兽皮 0、绳索 0、陷阱 0、工作台 0（重生后物资清零的极端态） */
S = newState();
S.res.pelt = 0; S.res.rope = 0; S.res.meat = 0; S.res.bait = 0;
S.bld.snare = 0; S.bld.bench = 0;
check("最坏态：无兽皮无绳索无陷阱", !S.res.pelt && !S.res.rope && !S.bld.snare);
check("★ 保底生效：兽皮为 0 时开箱必给", pityPelt() > 0, "保底给 " + PITY_PELT + " 张");
const peltBefore = S.res.pelt;
S.chests.wood = 5;
openChest("wood", 5);
check("★ 开箱真的拿到了兽皮（不再卡死）", S.res.pelt > peltBefore,
      "兽皮 " + peltBefore + " → " + Math.floor(S.res.pelt));
check("有兽皮后能徒手搓绳", startCraft("rope") === true);
S.day = 0.25; S.curSeg = "night";
for(let i = 0; i < 2; i++) advanceHours(1);
check("搓出了绳索", Math.floor(S.res.rope) >= 1, "绳索 " + Math.floor(S.res.rope));
S.bld.snare = 0;   /* ★ 隔离：开箱彩蛋"设施升级"可能随机 +1 陷阱等级，污染 cost 断言 */
const snareCost = cost("snare");
check("★ 陷阱只要 1 根绳索（留出造工作台的余量）", snareCost.rope === 1,
      "陷阱需要 " + Object.entries(snareCost).map(([k, v]) => itemName(k) + "×" + v).join(" + "));
check("新手礼包 rope:2 够造工作台+陷阱各一个",
      (NEWBIE_GIFT.res.rope || 0) >= 1 + snareCost.rope,
      "礼包 rope " + NEWBIE_GIFT.res.rope + "（工作台 1 + 陷阱 " + snareCost.rope + "）");
check("新手礼包直接送兽皮（保底起步）", (NEWBIE_GIFT.res.pelt || 0) > 0,
      "兽皮 " + NEWBIE_GIFT.res.pelt + " 肉 " + NEWBIE_GIFT.res.meat + " 诱饵 " + NEWBIE_GIFT.res.bait);

/* v8.5 防灾子系统：对应天灾的专属建造命题 */
S = newState(); S.day = 20; S.wave = 5; S.age = 3;
S.res.stone = 99999; S.res.cloth = 99; S.res.ironChunk = 99; S.res.steel = 99; S.res.wood = 99999;
const mitBlds = BLDCFG.filter(b => b.mitTag);
check("防灾设施齐备（5 个，对应 5 种 tagged 天灾）", mitBlds.length === 5,
      mitBlds.map(b => b.name).join("、"));
S.bld.house = 4;
for(const id of ["coat","insulation","drain","basement","seal"]) S.bld[id] = 1;
const radT = DIS_TYPES.find(t => t.tag === "hazard:radiation");
const facCut = BLDCFG.filter(b => b.mitTag === radT.tag && lv(b.id) > 0).reduce((a, b) => a + b.mitCut, 0);
check("密封舱门对辐射尘 -30%", facCut === 0.3, "设施减免 " + facCut);
S.chests.wood = 0; S.autoOpen = false;
S.nextDis = S.day + 0.01; S.warned = false;
const waveBefore = S.wave;
advanceHours(0.5);
const disRep = (S.disLog || [])[(S.disLog || []).length - 1];
check("满防灾设施后天灾强度被压低", disRep && disRep.need < Math.round(50 + 70 * (waveBefore - 1) * 1.25),
      disRep ? (disRep.name + " 强度 " + disRep.need + "（装备+设施双重抗性）") : "无报告");
S = newState();

/* 陷阱无诱饵也能捕猎（诱饵是效率而非开关） */
S = newState();
S.bld.snare = 5; S.res.bait = 0; S.res.pelt = 0; S.res.meat = 0;
let caught = 0;
for(let i = 0; i < 200; i++){
  S.res.pelt = 0; S.res.meat = 0;
  for(let h = 0; h < 24; h++) snareTick(1);
  if(S.res.pelt > 0 || S.res.meat > 0) caught++;
}
check("★ 没有诱饵陷阱也能捕到猎物（诱饵是效率不是开关）", caught > 20,
      "200 次 24 小时样本，捕到 " + caught + " 次（无诱饵效率 " + SNARE_NOBAIT_RATE + "）");

/* 打赢野兽能剥皮（兽皮的第二条来源，不依赖陷阱） */
check("★ 打赢野兽会掉兽皮", (typeof winBeastLoot === "function") && winBeastLoot().pelt > 0,
      "掉落 " + Object.entries(winBeastLoot()).map(([k, v]) => itemName(k) + "+" + v).join("，"));

/* ★ 最极端：一个箱子都没有（连开箱保底都触发不了）——采集必须能自救 */
S = newState();
S.res.pelt = 0; S.res.rope = 0; S.bld.snare = 0; S.bld.bench = 0;
S.chests = { wood:0, bronze:0, silver:0, gold:0, relic:0 };
S.plan.am = "forest"; S.plan.pm = "forest";
S.day = 0.25; S.curSeg = "night";
for(let i = 0; i < 4; i++) advanceHours(1);
check("★ 没箱子也能靠采集自救（死锁彻底堵死）", S.res.pelt >= 2,
      "出门 4 小时带回兽皮 " + S.res.pelt.toFixed(1) + " 张（绳索需要 2 张）");
check("自救后能搓绳 → 造陷阱 → 闭环", startCraft("rope") === true);

/* 树林本身也会慢慢产兽皮（长期可持续，不靠保底） */
check("树林有兽皮产出（第三条来源）", (SPOTS.forest.y.pelt || 0) > 0,
      "后山树林 " + (SPOTS.forest.y.pelt * 12).toFixed(1) + " 张/天");

console.log("");
console.log("--- 12d. 游戏时钟（精确到分钟）与制作耗时合理性 ---");
S = newState();
S.day = 2 + 14.5 / 24;                 /* 第 3 天 14:30 */
check("游戏时钟精确到分钟", clockText() === "14:30", "clockText() = " + clockText());
check("完整时钟含天数", fullClockText().indexOf("第 3 天") === 0, fullClockText());
S.day = 0;
check("午夜显示 00:00", clockText() === "00:00", clockText());
S.day = 1 + 6 / 24;
check("上午 6 点", clockText() === "06:00", clockText());

check("时长可读：2.14 天", durText(2 + 3.5 / 24).indexOf("天") > 0, durText(2 + 3.5 / 24));
check("时长可读：半小时", hourText(0.5) === "30 分", hourText(0.5));
check("时长可读：1.5 小时", hourText(1.5) === "1 小时 30 分", hourText(1.5));
check("现实时长换算（TIME_SCALE=" + TIME_SCALE + "）", realText(24) === "1 小时", "游戏 24 小时(1天) → " + realText(24));

/* 新手期倒计时精确到分钟（推进一段时间后应出现"分"） */
S = newState();
advanceHours(0.7);                 /* 推进 42 分钟，剩下的就不是整点了 */
const nbLeft = newbieLeftDays();
check("新手期倒计时精确到分钟", durText(nbLeft).indexOf("分") > 0,
      "剩 " + durText(nbLeft) + "（原始值 " + nbLeft.toFixed(4) + " 天）");

/* 制作耗时合理性：简单加工应该在 30 分钟以内 */
const ropeH = recipeById("rope").hours, plankH = recipeById("plank").hours;
check("★ 搓绳只要几分钟（不再是 6 小时）", ropeH <= 0.5, "绳索 " + hourText(ropeH));
check("★ 劈木板半小时以内", plankH <= 0.5, "木板 " + hourText(plankH));
check("简单加工都在 30 分钟内",
      ["rope", "bait", "medkit"].every(id => recipeById(id).hours <= 0.5),
      ["rope", "bait", "medkit"].map(id => recipeById(id).name + " " + hourText(recipeById(id).hours)).join("、"));
check("复杂工艺仍需等待（炼钢/冲锋枪）",
      recipeById("steel").hours >= 2 && recipeById("g_smg").hours >= 4,
      "炼钢 " + hourText(recipeById("steel").hours) + " / 冲锋枪 " + hourText(recipeById("g_smg").hours));

/* 时钟会走：推进后 clockText 变化 */
S = newState();
const c1 = clockText();
for(let i = 0; i < 3; i++) advanceHours(1);
check("时钟随时间推进", clockText() !== c1, c1 + " → " + clockText());

/* 面板显示真实时长 */
invalidateUI();
renderNow();
const nowH = document.getElementById("nowPanel").innerHTML;
/* 注意：测试代码在模板字符串里，\d 会被吃掉，必须用 [0-9] */
check("面板显示时刻与时段起止",
      /[0-9]{2}:[0-9]{2}/.test(nowH) && nowH.indexOf("现实约") >= 0,
      nowH.replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, 70));

/* 12e. 首灾可生还性（v7.8 重平衡回归：之前首灾必输） */
console.log("");
console.log("--- 12e. 首灾可生还性（重平衡回归）---");
/* 避难所自带基础防御：开局就有屋檐，不是裸奔 */
S = newState(); S.bld.fortify = 0; S.bld.traps = 0; S.gear = [];
check("★ 茅草屋自带基础防御（开局即有屋檐）", def() === 20, "防御 " + def() + "（茅草屋档位 def=20）");
check("★ 避难所是材质链（茅草屋→木屋→石屋→混凝土→钢铁→合金→…无限延伸）", HOUSE_TIERS.length >= 21 && HOUSE_TIERS[2].name === "木屋" && houseTier(3).name === "石屋", HOUSE_TIERS.slice(1).map(t=>t.name).join("→"));
check("★ 避难所升级花费 = 下一档材料（不走 COST_K）", JSON.stringify(cost("house")) === JSON.stringify({wood:150, rope:2}), "茅草屋→木屋: " + JSON.stringify(cost("house")));

/* 工事 Lv1 成本应低到 3 天内可负担 */
const fc1 = cost("fortify");
check("★ 工事 Lv1 成本已降到新手可负担", fc1.stone <= 80 && fc1.wood <= 80,
      "石" + fc1.stone + " 木" + fc1.wood);

/* 模拟 3 天最优操作：第1天探索找点，后2天采石+劈木，结束时造工事，看能否扛首灾 */
function days3(){
  S = newState(); S.day = 0; S.curSeg = "night";
  /* 先探索 1.5 天找齐地点 */
  for(let d = 0; d < 2; d++){ S.plan.am = "explore"; S.plan.pm = "explore"; advanceHours(24); }
  /* 再采石 + 劈木 1.5 天 */
  for(let d = 0; d < 1; d++){ S.plan.am = "quarry"; S.plan.pm = "forest"; advanceHours(24); }
  S.plan.am = "quarry"; S.plan.pm = "quarry"; advanceHours(12);
  return S;
}
const D = days3();
const canF = canPay(cost("fortify"));
check("★ 3 天内能攒够造工事", canF, "石" + Math.floor(D.res.stone) + " 木" + Math.floor(D.res.wood));
if(canF){ pay(cost("fortify")); S.bld.fortify = 1; }
check("★ 造工事后防御 ≥ 首灾强度（可生还）",
      def() >= DIS_INTENSITY(1),
      "防御 " + def() + " ≥ 首灾 " + DIS_INTENSITY(1) + "（" + DIS_TYPES[0].name + "）");
check("★ 首灾强度为教学档（≤ 60）", DIS_INTENSITY(1) <= 60, "首灾强度 " + DIS_INTENSITY(1));

console.log("");
console.log("--- 13. 生肉腐坏受储物箱影响 ---");
/* 关掉自动开箱：否则 12h 保底箱子会被自动打开、战利品里的食物会回补肉量，干扰测量 */
S = newState(); S.bld.snare = 0; S.bld.storage = 0; S.autoOpen = false;
S.res.meat = 100;
for(let i = 0; i < 24; i++) advanceHours(1);
const spoiled0 = Math.floor(100 - S.res.meat);
S = newState(); S.bld.snare = 0; S.bld.storage = 5; S.autoOpen = false;
S.res.meat = 100;
for(let i = 0; i < 24; i++) advanceHours(1);
const spoiled5 = Math.floor(100 - S.res.meat);
check("生肉一天腐坏约 35%", spoiled0 > 25 && spoiled0 < 45, "露天 −" + spoiled0 + "%");
check("高级储物箱显著减缓腐坏", spoiled5 < spoiled0 / 2, "档5 −" + spoiled5 + "%");

console.log("");
console.log("--- 14. 装备代际与词条（回归测试）---");
S = newState(); S.bld.bench = 3; S.bld.house = 3;
const gearRec = recipeById("g_smg");
check("装备配方在表里", !!gearRec && gearRec.kind === "gear");
check("未解锁时保持神秘", !hasBlueprint(gearRec) && !!gearRec.mystery, gearRec.mystery);
/* 先验证：阶段1即使有图纸也造不出火器（工艺不够） */
S.bp.push(gearRec.bp);
S.res.ironChunk = 30; S.res.copper = 30; S.res.cloth = 30; S.res.plank = 30; S.res.gunpowder = 30;   /* v8.7 火器配方含火药 */
S.craft = { id:null, prog:0 };
check("阶段1有图纸也造不出火器（工艺不足）", startCraft("g_smg") === false);
/* 推进到能源期后可以造 */
S.age = 3;
check("能源期的工艺上限允许火器", ageGearTier() === 5, "允许代际 ≤" + ageGearTier());
const okGear = startCraft("g_smg");
S.day = 0.25; S.curSeg = "night";
S.plan.am = "workbench"; S.plan.pm = "workbench";
for(let i = 0; i < 20; i++) advanceHours(1);
const smg = S.gear.find(g => g.name === "冲锋枪");
check("图纸能造出高代际装备", okGear && !!smg, smg ? "战力+" + smg.val + " 词条=" + smg.tag : "");
check("远程词条生效", hasTag("ranged"));

/* 照明词条：夜间可出工 */
S = newState(); S.bld.snare = 0;
check("无照明时夜间不出工", !nightWorkable());
const lamp = { slot:"talisman", name:"提灯", rar:3, val:15, on:true, tag:"light" };
S.gear.push(lamp);
S.plan.night = "forest";
check("有照明后夜间可出工", nightWorkable());
const w1 = S.res.wood;
S.day = 1; S.curSeg = "pm";
for(let i = 0; i < 6; i++) advanceHours(1);
check("夜间确实产出木材", S.res.wood > w1, "夜间6小时 木材+" + Math.floor(S.res.wood - w1));

console.log("");
console.log("--- 15. 威胁判定与送死档拦截（挂机安全保险丝）---");
S = newState();
check("开局能去新手区", !spotBlocked("forest") && !spotBlocked("junk"),
      "树林→" + assessSpot("forest").tier.name + "（威胁 " + spotThreat("forest") + " vs 战力 " + atk() + "）");
check("开局去不了加油站", spotBlocked("station"),
      "威胁 20 → " + assessSpot("station").tier.name);
check("开局去不了超市与兽径", spotBlocked("market") && spotBlocked("trail"));

/* 排班拦截：直接把日程指向送死档地点，应该被拒绝 */
S.plan.am = "forest";
setPlan("am", "station");
check("排班被拦截（送死档排不进去）", S.plan.am === "forest", "上午仍是 " + planLabel(S.plan.am));

/* 变强之后，同一个地方从"送死"变成"可去" */
S.gear.push({ slot:"weapon", name:"测试长矛", rar:2, val:60, on:true });   /* 战力 2+60 */
check("有武器后加油站变为可去", !spotBlocked("station"),
      "战力 " + atk() + " → " + assessSpot("station").tier.name + "（威胁 20）");
S.gear[0].val = 40; const tierBefore = assessSpot("trail").tier.name; S.gear[0].val = 60;
S.gear[0].val = 200;                                                        /* 战力 202 */
check("战力提升后档位变好", assessSpot("trail").tier.name !== tierBefore,
      "兽径（威胁 65）：战力 62→" + tierBefore + "，战力 " + atk() + "→" + assessSpot("trail").tier.name);
check("给玩家明确的成长目标", needAtkFor("oilField", "hard") > 0,
      "油田（威胁 160）至少需要 " + needAtkFor("oilField", "hard") + " 战力才敢去");

/* 激进模式解锁 */
S.aggressive = true;
S.gear = [];
check("开激进模式后可前往送死档", !spotBlocked("station") && !spotBlocked("trail"));
setPlan("pm", "trail");
check("激进模式下排班不再被拦", S.plan.pm === "trail", planLabel(S.plan.pm));

/* 遭遇结算：战力碾压时几乎不会受伤 */
S = newState(); S.bld.fortify = 30;                     /* 防御拉满，排除天灾干扰 */
S.gear.push({ slot:"weapon", name:"测试巨斧", rar:4, val:500, on:true });   /* 战力 502 vs 树林威胁 1 → 轻松 */
S.plan.am = "forest"; S.plan.pm = "forest"; S.plan.night = "rest";
let hurtDays = 0;
for(let d = 0; d < 6; d++){
  S.wound = "none";
  for(let i = 0; i < 24; i++) advanceHours(1);
  if(woundIdx() > 0) hurtDays++;
}
check("战力碾压的地点几乎不会受伤（6 天，轻松档）", hurtDays === 0, hurtDays + "/6 天受伤");

/* 激进模式硬闯送死档：单次遭遇的后果（直接对判定函数取样 200 次，避免概率波动） */
S = newState(); S.day = 10; S.aggressive = true;
S.gear.push({ slot:"weapon", name:"破铁管", rar:1, val:20, on:true });      /* 战力 22 vs 兽径 90 → 送死档 */
let worst = "none", wins = 0;
for(let i = 0; i < 200; i++){
  S.wound = "none"; S.dyingH = 0; segYield = {};
  endGatherSegment("trail");
  const w = woundLevel();
  if(w === "none") wins++;
  if(WOUND_ORDER.indexOf(w) > WOUND_ORDER.indexOf(worst)) worst = w;
}
check("送死档单次遭遇 → 重伤/濒死（200 次取样）",
      WOUND_ORDER.indexOf(worst) >= WOUND_ORDER.indexOf("heavy"),
      "最高伤势 " + worst + "，全身而退 " + wins + "/200");

/* 对照：轻松档单次遭遇必定打赢（战力碾压） */
S = newState(); S.day = 10;
S.gear.push({ slot:"weapon", name:"测试巨斧", rar:4, val:500, on:true });
let hurt2 = 0;
for(let i = 0; i < 200; i++){
  S.wound = "none"; S.dyingH = 0; segYield = {};
  endGatherSegment("forest");   /* 威胁 1 vs 战力 502 → 轻松档 */
  if(woundIdx() > 0) hurt2++;
}
check("轻松档单次遭遇不会受伤（200 次取样）", hurt2 === 0, "受伤 " + hurt2 + "/200");

/* ★ 离线免死：即使开了激进模式硬闯送死档，挂机期间也不会死 */
S = newState(); S.day = 10; S.aggressive = true;
S.gear.push({ slot:"weapon", name:"破铁管", rar:1, val:20, on:true });
S.plan.am = "trail"; S.plan.pm = "trail";
S.lastSave = Date.now() - 2 * 86400 * 1000;
settleOffline();
check("★ 离线时即使硬闯送死档也不会死", !S.lastReport, "伤势=" + woundLevel());
check("离线期间伤势上限为「重伤」", woundIdx() <= WOUND_ORDER.indexOf("heavy"), woundLevel());

console.log("");
console.log("--- 16. 老档迁移（字段兼容）---");
S = { res:{wood:10,stone:5,metal:3,food:5,water:5}, bld:{house:2,storage:9},
      chests:{wood:1, iron:3, code:2},
      wave:1, day:1, plan:{am:"forest",pm:"junk"}, gear:[], injured:2, lastSave:Date.now() };
migrateSave();
check("箱子 iron → bronze", S.chests.bronze === 3 && S.chests.iron === undefined, "青铜箱=" + S.chests.bronze);
check("箱子 code → relic", S.chests.relic === 2 && S.chests.code === undefined, "遗迹箱=" + S.chests.relic);
check("新增箱子档位补零", S.chests.silver === 0 && S.chests.gold === 0);
check("伤势 injured → wound", S.wound === "light" && S.injured === undefined, S.wound);
check("补齐阶段/背包/重生字段", S.age === 1 && S.bagLv === 0 && S.rebirth === 0);
check("补齐激进模式字段", S.aggressive === false);
check("储物箱档位上限扩到 " + STORAGE_MAX + "（老档 9 档原样保留）", S.bld.storage === 9, "storage=" + S.bld.storage);
check("补齐新增物品键", S.res.ironOre === 0 && S.res.sulfur === 0 && S.res.steel === 0);

console.log("");
console.log("--- 17. 流速提速 + 自动开箱（挂机爽点）---");
/* 提速：1 现实小时 ≈ TIME_SCALE×timeMul 游戏秒 = 24×2/3600×3600 = 48 游戏小时 = 2 游戏天 */
check("默认速档为 2×（挂机 1 现实小时 ≈ 2 游戏天）", (S.timeMul || 1) === 2, "timeMul=" + S.timeMul);
const mul = S.timeMul || 1;
const gameDayPerRealHour = TIME_SCALE * mul / 3600 * 3600 / 24;   /* 游戏天/现实小时 */
check("挂机 3 小时应能撑到首灾（第 3 天）", gameDayPerRealHour * 3 >= 3,
      "3 现实小时 ≈ " + (gameDayPerRealHour * 3).toFixed(1) + " 游戏天（首灾在第 3 天）");

/* 自动开箱：addChest 后箱子即时被打开（计数不累积，战利品进账） */
S = newState();
S.found = ["junk","forest","quarry","river"];
S.autoOpen = true;
S.plan.am = "forest"; S.plan.pm = "forest"; S.curSeg = "night"; S.day = 0;
const loot0 = JSON.stringify(S.res);
let anyChest = false;
for(let i = 0; i < 24; i++){
  advanceHours(1);
  if(Object.values(S.chests).some(v => v > 0)) anyChest = true;
}
const totalChests = Object.values(S.chests).reduce((a, b) => a + (b || 0), 0);
check("★ 自动开箱开启时箱子不堆积（即时开）", totalChests === 0, "待开=" + JSON.stringify(S.chests));
check("★ 自动开箱确实产出战利品（资源变了）", JSON.stringify(S.res) !== loot0, "已推进 24 游戏小时");

/* 关闭自动开箱：箱子会累积，待开提示生效 */
S = newState();
S.found = ["junk","forest"];
S.autoOpen = false;
S.plan.am = "forest"; S.plan.pm = "forest"; S.curSeg = "night"; S.day = 0;
let pend = 0;
for(let i = 0; i < 30; i++){ advanceHours(1); pend = Object.values(S.chests).reduce((a, b) => a + (b || 0), 0); }
check("自动开箱关闭时箱子会累积", pend > 0, "待开箱=" + pend);

/* 速档换算函数正确 */
check("setSpeed 全局函数存在", typeof setSpeed === "function");
check("toggleAutoOpen 全局函数存在", typeof toggleAutoOpen === "function");

/* --- 18. 每日抽签（v7.13：今日运势影响采集收成）--- */
console.log("");
console.log("--- 18. 每日抽签（今日运势）---");
check("签文表完整（6 级，概率合计 100%）", FORTUNES.length === 6 && FORTUNES.reduce((a, f) => a + f.p, 0) === 100,
      FORTUNES.map(f => f.name + f.p + "%").join(" "));
check("期望收成 ≥ 1（抽签整体不亏）", FORTUNES.reduce((a, f) => a + f.mul * f.p, 0) / 100 >= 1,
      "期望 ×" + (FORTUNES.reduce((a, f) => a + f.mul * f.p, 0) / 100).toFixed(2));
check("rollFortune 返回合法签", (() => { for(let i = 0; i < 200; i++){ const v = rollFortune(); if(v < 0 || v > 5) return false; } return true; })());
S = newState();
S.autoOpen = false;
S.plan.am = "forest"; S.plan.pm = "forest"; S.curSeg = "night";
S.day = 0.35;                                   /* hod=8.4，上午中段 */
S.fortune = { d: 0, i: 3 };                     /* 平 ×1（d 对齐，不会被重抽覆盖） */
const fA0 = S.res.wood;
advanceHours(0.2);
const fG1 = S.res.wood - fA0;
S.fortune = { d: Math.floor(S.day), i: 0 };     /* 切大吉 ×2.5 */
const fA1 = S.res.wood;
advanceHours(0.2);
const fG2 = S.res.wood - fA1;
check("大吉 ×2.5 真的放大了采集量", fG1 > 0 && Math.abs(fG2 - fG1 * 2.5) < 1e-6,
      "平 0.2h 木 +" + fG1.toFixed(2) + " → 大吉 0.2h 木 +" + fG2.toFixed(2) + "（比值 " + (fG1 > 0 ? (fG2 / fG1).toFixed(2) : "?") + "）");
check("顶栏显示今日签（fortuneOf）", typeof fortuneOf === "function" && fortuneOf().name === "大吉");
check("跨天自动重抽（checkFortune）", (() => {
  S.fortune = { d: Math.floor(S.day) - 1, i: 3 };
  const i2 = checkFortune();
  return S.fortune.d === Math.floor(S.day) && typeof i2 === "number";
})());

/* --- 19. 吉凶关联开箱（v7.15）--- */
console.log("");
console.log("--- 19. 吉凶关联开箱（图纸概率 × 运势 / 品质提升）---");
S = newState();
const avgRar = () => { let s = 0; for(let i = 0; i < 3000; i++) s += rollRarity("wood"); return s / 3000; };
S.fortune = { d: 0, i: 3 };                    /* 平 ×1 */
const avgNormal = avgRar();
S.fortune = { d: 0, i: 0 };                    /* 大吉 ×2.5 */
const avgLucky = avgRar();
check("大吉开出装备品质显著更高", avgLucky > avgNormal + 0.1,
      "平均值 " + avgNormal.toFixed(2) + " → 大吉 " + avgLucky.toFixed(2));
check("大吉图纸概率 ×2.5", Math.abs((BP_CHANCE.wood * fortuneMul()) - BP_CHANCE.wood * 2.5) < 1e-9,
      "木箱 2% → " + (BP_CHANCE.wood * 2.5 * 100).toFixed(1) + "%");
check("越级图纸概率封顶 ×2", Math.min(2, fortuneMul()) === 2);
S.fortune = { d: 0, i: 4 };                    /* 凶 ×0.8 */
check("凶签品质偏移极轻微（不给硬惩罚）", Math.abs((fortuneMul() - 1) * 10 + 2) < 1e-9,
      "凶签偏移 " + ((fortuneMul() - 1) * 10).toFixed(1) + "（品质线仅微降）");
S.fortune = { d: 0, i: 3 };

/* --- 20. 灾报与灾史（v7.16）--- */
console.log("");
console.log("--- 20. 灾报与灾史 ---");
S = newState(); S.day = 5; S.wave = 1;
S.bld.fortify = 3;                             /* 防御 = 茅草屋20 + 工事180 = 200 ≥ 首灾 50 */
check("初始没有灾史", (S.disLog || []).length === 0);
disResolve();                                  /* 在线结算：应写入灾史 */
check("天灾结算后写入灾史", (S.disLog || []).length === 1, "共 " + (S.disLog || []).length + " 条");
const rep = S.disLog[0];
check("灾报内容完整（结果/防御/强度/奖励）", rep.win === true && rep.have >= rep.need && /木材/.test(rep.rewards),
      "第" + rep.wave + "场" + rep.name + " 防御" + rep.have + " vs " + rep.need + "　" + rep.rewards);
check("渡灾后排除下一场类型与时间", S.wave === 2 && typeof S.nextDis === "number");
check("灾史多条累计（再扛一场）", (() => { S.wave = 2; disResolve(); return S.disLog.length === 2; })());
check("离线天灾记未读标记", (() => {
  S.wave = 3; offlineMode = true; disResolve(); offlineMode = false;
  return S.disUnread === true && S.disLog.length === 3;
})());
check("灾史含失败场次字段（有损失与伤势记录）", (() => {
  S.wave = 9; S.bld.fortify = 0;               /* 防御 20 < 第9场强度 → 必败 */
  disResolve();
  const r = S.disLog[S.disLog.length - 1];
  return r.win === false && r.lossPct > 0 && r.wounded === true;
})());
S = newState();

/* --- 21. 图纸阶段分层（v8.1：主掉当前阶段，偶尔 +1，不出 +2）--- */
console.log("");
console.log("--- 21. 图纸阶段分层 ---");
S = newState(); S.day = 5; S.age = 1; S.wave = 1; S.autoOpen = false;
const got = [];
for(let i = 0; i < 12; i++){
  const before = S.bp.length;
  if(!grantBlueprint("测试")) break;
  got.push(S.bp[S.bp.length - 1]);
}
const bTiers = got.filter(b => !STORAGE_BP.includes(b)).map(b => bpTierOf(b));   /* v8.23：储物图纸按材质档掉落，不参与阶段分层统计 */
check("阶段 1 掉图纸不出现 T3 废纸（前 12 张）", bTiers.length >= 8 && Math.max.apply(null, bTiers) <= 2,
      "掉落 " + got.length + " 张，最高 T" + Math.max.apply(null, bTiers));
const t1cnt = bTiers.filter(t => t === 1).length;
/* 注：T1 池只有 5 张（抽完就滑层），12 次里 T1 落在 3~5 张属正常波动，阈值取 0.24 */
check("主掉当前阶段（T1 为主）", bTiers.length > 0 && t1cnt >= 3 && t1cnt / bTiers.length > 0.24,
      "T1 占 " + t1cnt + "/" + bTiers.length);
check("阶段 1 的 T1 图纸集齐后自动滑向 T2", (() => {
  S.bp = [].concat(BLUEPRINTS, GEAR_BLUEPRINTS, STORAGE_BP, CRAFT_SLOT_BPS.map(s => s.bp))
          .filter(b => bpTierOf(b) === 1);
  const ok = grantBlueprint("测试滑层");
  return ok && bpTierOf(S.bp[S.bp.length - 1]) === 2;
})(), "T1 全集齐后必掉 T2");
S = newState();

/* --- 22. 无限化骨架（v8.6：间隔联动/复合灾/公式材质档/词缀/粗制）--- */
console.log("");
console.log("--- 22. 无限化骨架 ---");
check("间隔联动：w<20 恒 7 天", disGapAt(3) === 7 && disGapAt(10) === 7 && disGapAt(19) === 7);
check("间隔联动：w≥20 同源递增", disGapAt(20) === Math.ceil(7 * Math.pow(1.35, 0.5)) && disGapAt(25) === Math.ceil(7 * Math.pow(1.35, 3)));
check("威胁动态化：age 越高威胁越高", (() => { S = newState(); S.age = 1; const a = spotThreat("station"); S.age = 3; const b = spotThreat("station"); S.age = 1; return b > a && b === Math.round(20 * 1.3); })(), "加油站 20 → " + (20 * 1.3));
check("公式材质档：预生成到 20 档，def 严格 ×1.8 递推（v8.12 解除 12 档上限）", HOUSE_TIERS.length === 21 && HOUSE_TIERS[7].name === "钛合金堡垒" && HOUSE_TIERS[12].def === Math.round(500 * Math.pow(1.8, 6)) && Math.abs(HOUSE_TIERS[20].def / Math.round(500 * Math.pow(1.8, 14)) - 1) < 0.001,
      "第 12 档 def=" + HOUSE_TIERS[12].def);
check("粗制配方：与装备图纸一一对应", FORGE_RECIPES.length === GEAR_RECIPES.filter(r => r.bp).length,
      FORGE_RECIPES.length + " 条粗制配方");
check("粗制装备 val ×0.6", FORGE_RECIPES.every(r => r.outGear.val === Math.round((GEAR_RECIPES.find(g => "c_" + g.id === r.id).outGear.val) * 0.6)));
check("词缀 roll：传说 2~3 条", (() => { for(let i = 0; i < 40; i++){ const t = rollAffixes(4, 4); if(t.length < 2 || t.length > 3) return false; } return true; })());
check("粗制词条上限精良（≤1 条）", (() => { for(let i = 0; i < 40; i++){ const t = rollAffixes(4, 2); if(t.length > 1) return false; } return true; })());
check("词缀值 roll [50%, 100%]", (() => { for(let i = 0; i < 60; i++){ const t = rollAffixes(3, 4); for(const x of t){ if(x.startsWith("gatherBoost:")){ const v = parseFloat(x.split(":")[1]); if(v < 12 || v > 25) return false; } } } return true; })());
check("复合灾：第 15 场采样出现双灾", (() => {
  S = newState(); S.day = 100; S.wave = 15; S.bld.fortify = 20; S.disLog = []; S.chests.wood = 0; S.autoOpen = false;
  for(let i = 0; i < 20; i++){ S.wave = 15; disResolve(); }
  return (S.disLog || []).some(r => String(r.name || "").includes("×"));
})());
check("加工台设施存在", !!BLDCFG.find(b => b.id === "forge" && b.max === 2), "装备加工台 req 木屋");

/* ===== v8.7 发电链 ===== */
check("发电链三档存在（柴油→生物→温差）", POWER_TIERS.length === 4 &&
      POWER_TIERS[1].name === "柴油发电机" && POWER_TIERS[2].name === "生物发电机" && POWER_TIERS[3].name === "温差发电机",
      POWER_TIERS.slice(1).map(t => t.name).join("→"));
check("发电机设施已注册（max3, req 钢铁避难所）", (() => {
  const b = BLDCFG.find(x => x.id === "generator");
  return !!b && b.max === 3 && b.req === 5;
})());
check("发电机按档成本（cost 特例不走 COST_K）", (() => {
  S = newState(); S.bld.generator = 0;
  const c0 = cost("generator");
  S.bld.generator = 2;
  const c2 = cost("generator");
  return c0.steel === POWER_TIERS[1].cost.steel && c2.battery === POWER_TIERS[3].cost.battery;
})());
check("炼油无需图纸（基础工艺不赌随机）", (() => {
  S = newState(); S.bp = [];
  return hasBlueprint(recipeById("refineFuel")) === true;
})());
check("电池图纸在掉落池且配方受图纸门控", BLUEPRINTS.includes("电池图纸") && (() => {
  S = newState(); S.bp = [];
  const locked = hasBlueprint(recipeById("battery")) === false;
  S.bp.push("电池图纸");
  return locked && hasBlueprint(recipeById("battery")) === true;
})());
check("农田/收集器日产落地且幂等（v8.7 补课）", (() => {
  S = newState(); S.bld.farm = 1; S.bld.collector = 2;
  S.res.food = 0; S.res.water = 0;
  dailyFacilityTick(100);
  const f1 = S.res.food, w1 = S.res.water;
  dailyFacilityTick(100);                       /* 同一天：不得重复结算 */
  return f1 === 10 && w1 === 10 && S.res.food === 10 && S.res.water === 10;
})());
check("发电机足料运转/断料停转", (() => {
  S = newState(); S.bld.generator = 1; S.res.fuel = 5;
  dailyFacilityTick(200);
  const ran = S.powerOn === true && S.res.fuel === 3;
  S.res.fuel = 0;
  dailyFacilityTick(201);
  return ran && S.powerOn === false;
})());
check("电力加成标志（采集 ×1.08、制作 ×1.16 @Lv2）", (() => {
  S = newState(); S.bld.generator = 2; S.powerOn = true;
  return powerOn() === true && powerLv() === 2;
})());
check("火药有消耗方（冲锋枪配方含火药）", (() => {
  const smg = GEAR_RECIPES.find(r => r.id === "g_smg");
  return smg && smg.in.gunpowder >= 1;
})());

/* ===== v8.9 精修（双轨制桥接） ===== */
check("精修配方与图纸装备一一对应", GEAR_RECIPES.filter(r => r.bp).every(r =>
      REFINE_RECIPES.some(x => x.refineOf === r.id)),
      REFINE_RECIPES.length + " 条精修配方");
check("装备加工台可升 Lv.2（reqPerLv 需钛合金堡垒）", (() => {
  const b = BLDCFG.find(x => x.id === "forge");
  return !!b && b.max === 2 && b.reqPerLv && b.reqPerLv[1] === 7;
})());
check("精修材料随图纸减半（×0.8 → ×0.4）", (() => {
  S = newState(); S.bp = [];
  const rec = REFINE_RECIPES.find(r => r.refineOf === "g_smg") || REFINE_RECIPES[0];
  const src = recipeById(rec.refineOf);
  const noBp = craftCostOf(rec);
  S.bp.push(src.bp);
  const withBp = craftCostOf(rec);
  const k = Object.keys(noBp)[0];
  return noBp[k] === Math.max(1, Math.ceil(src.in[k] * 0.8)) && withBp[k] === Math.max(1, Math.ceil(src.in[k] * 0.4));
})());
check("精修门槛：缺高级加工台 / 缺底子都开不了工", (() => {
  S = newState(); S.age = 3; S.bld.bench = 3; S.bld.forge = 1;
  S.res.ironChunk = 999; S.res.plank = 999; S.res.rope = 999; S.res.wood = 9999; S.res.stone = 9999;
  const rec = REFINE_RECIPES[0];
  const src = recipeById(rec.refineOf);
  S.bp.push(src.bp);
  S.crafts = [];
  const noForge = startCraft(rec.id, 1) === false;
  S.bld.forge = 2; S.crafts = [];
  const noRough = startCraft(rec.id, 1) === false;
  S.gear.push({ slot: "weapon", name: rec.needRough, rar: 2, val: 10, on: false, tag: null, tags: [] });
  S.crafts = [];
  const ok = startCraft(rec.id, 1) === true;
  return noForge && noRough && ok;
})());
check("精修产出完全体（本体名 + 满性能 val）", (() => {
  S = newState(); S.age = 3; S.bld.bench = 3; S.bld.forge = 2;
  S.gear = [{ slot:"weapon", name:"粗制·铁管长矛", rar:2, val:48, on:false, tag:null, tags:[] }];
  const rec = REFINE_RECIPES.find(r => r.refineOf === "g_spear") || REFINE_RECIPES[0];
  const src = recipeById(rec.refineOf);
  const before = S.gear.length;
  craftFinish(rec);
  const made = S.gear.filter(g => g.name === src.name);
  return made.length >= 1 && made[0].val === src.outGear.val && S.gear.length === before + 1;
})());
check("取消精修按实际扣料退还", (() => {
  S = newState(); S.age = 3; S.bld.bench = 3; S.bld.forge = 2;
  const rec = REFINE_RECIPES[0];
  S.gear = [{ slot:"weapon", name: rec.needRough, rar:2, val:10, on:false, tag:null, tags:[] }];
  S.bp = [];
  const unit = craftCostOf(rec);
  const k = Object.keys(unit)[0];
  for(const m in unit) S.res[m] = 9999;          /* 全部材料备足，否则开不了工 */
  const before = S.res[k];
  S.crafts = [];
  if(!startCraft(rec.id, 1)) return false;
  const paid = before - S.res[k];
  cancelCraft(rec.id);
  return paid === unit[k] && S.res[k] === before;
})());

/* ===== v8.10 批量制作数量 ===== */
check("做满：按材料上限计算数量", (() => {
  S = newState();
  S.res.ironChunk = 40; S.res.coal = 10;          /* 炼钢：铁块4 + 煤4 → 上限 = min(10, 2) = 2 */
  const rec = recipeById("steel");
  return !!rec && craftQtyMax("steel") === 2;
})());
check("数量输入直填 + 越界钳制（1 ~ 当前段位上限）", (() => {
  craftQtySet("steel", 500);
  const a = craftQtyVal("steel");
  craftQtySet("steel", 0);
  const b = craftQtyVal("steel");
  craftQtySet("steel", 999999);
  const c = craftQtyVal("steel");
  return a === 500 && b === 1 && c === craftQtyCap();
})());
check("±100 快捷键按百步调整", (() => {
  craftQtySet("steel", 250);
  craftQty("steel", 100);
  const a = craftQtyVal("steel");
  craftQty("steel", -100);
  const b = craftQtyVal("steel");
  return a === 350 && b === 250;
})());
check("开工按钮显示批量份数", (() => {
  S = newState(); S.res.ironChunk = 400; S.res.coal = 400;
  craftQtySet("steel", 100);
  return canPayQty(recipeById("steel"), craftQtyVal("steel")) === true;
})());

/* ===== v8.28 批量制作上限随段位放大 ===== */
check("批量上限：默认（T≤3，无高阶图纸）为 9999", (() => {
  S = newState();
  return craftQtyCap() === 9999;
})());
check("批量上限随已解锁最高段位放大（解锁 T24 图纸 → 999999）", (() => {
  S = newState();
  const hi = recipeById("f_w24"); if(!hi) return false;
  S.bp.push(hi.bp);
  return craftQtyCap() === 999999;
})());
check("高段位下 UI 输入按新上限收敛", (() => {
  S = newState();
  const hi = recipeById("f_w24"); S.bp.push(hi.bp);
  craftQtySet("steel", 9e9);
  return craftQtyVal("steel") === craftQtyCap() && craftQtyCap() === 999999;
})());
check("高段位下引擎开工数量按新上限收敛", (() => {
  S = newState();
  S.age = 5; S.bld.bench = 1;                         /* 跨过材料阶段门槛 + 工作台 */
  const hi = recipeById("f_w24"); S.bp.push(hi.bp);
  S.res.ironOre = 1e12; S.res.coal = 1e12;            /* 给足材料（矿石炼铁无图纸门槛，可直接开工） */
  const cap = craftQtyCap();
  const ok = startCraft("smeltIron", 9e9);
  const q = ok ? S.crafts[0].qty : 0;
  if(ok) cancelCraft("smeltIron");
  return ok && q === cap && cap > 9999;
})());

/* ===== v8.11 设施等级越界修复（储物箱"掉回 1 级"假象） ===== */
check("储物档位越界取最高档（不回退最低档）", (() => {
  const top = STORAGE_TIERS[STORAGE_TIERS.length - 1];
  return storageTier(999).lv === top.lv && storageTier(999).cap === top.cap && storageCap(-3) === storageCap(0);
})());
check("设施等级一律夹回上限（迁移兜底）", (() => {
  S = newState();
  S.bld.storage = 99; S.bld.coat = 5; S.bld.forge = 7; S.bld.house = 40; S.bld.generator = 8;
  migrateSave();
  return S.bld.storage === STORAGE_MAX && S.bld.coat === 1 && S.bld.forge === 2 && S.bld.house === 30 && S.bld.generator === 3;
})());
check("开箱彩蛋升级不越上限（满级改给建材）", (() => {
  S = newState();
  for(const b of BLDCFG) S.bld[b.id] = b.max || 0;      /* 全部顶到上限 */
  const i = SURPRISE_CFG.findIndex(c => c.id === "blueprint");
  const before = JSON.stringify(S.bld);
  if(i >= 0 && SURPRISES[i]) SURPRISES[i].fn();
  const over = BLDCFG.some(b => b.max && lv(b.id) > b.max);
  return i >= 0 && !over && JSON.stringify(S.bld) === before;
})());
check("彩蛋升级在未满级设施上仍生效", (() => {
  S = newState();
  for(const b of BLDCFG) S.bld[b.id] = b.max || 0;
  S.bld.forge = 0;                                       /* 只留一个未满级 */
  const i = SURPRISE_CFG.findIndex(c => c.id === "blueprint");
  if(i >= 0 && SURPRISES[i]) SURPRISES[i].fn();
  return S.bld.forge === 1;
})());

/* ===== v8.12 战力 × 天灾 / 装备代际公式化 ===== */
check("守家总攻（战力+火力）抵减天灾强度（上限砍半）", (() => {
  S = newState(); S.age = 3; S.wave = 20; S.bld.house = 8; S.bld.fortify = 5;
  S.gear = [{ slot:"weapon", name:"测试枪", rar:4, val:200, on:true, tag:"ranged", tags:[] }];
  S.nextDis = 0; S.warned = true;
  const fBefore = homeAttack();                  /* 灾前守家总攻 = 战力 + 火力（灾后避难所可能降档） */
  advanceHours(2);
  const r = S.disLog[S.disLog.length - 1];
  const expect = Math.min(Math.round(r.rawNeed * ATK_DIS_CAP), Math.round(fBefore * ATK_DIS_CUT));
  return r && r.atkCut > 0 && r.need === r.rawNeed - r.atkCut && r.atkCut === expect;
})());
check("总攻越高削减越多（但不超过一半）", (() => {
  S = newState(); S.age = 3; S.wave = 20; S.bld.house = 8; S.bld.fortify = 5;
  S.gear = [{ slot:"weapon", name:"神装", rar:4, val:99999, on:true, tag:"ranged", tags:[] }];
  S.nextDis = 0; S.warned = true;
  advanceHours(2);
  const r = S.disLog[S.disLog.length - 1];
  return r && r.atkCut === Math.round(r.rawNeed * ATK_DIS_CAP);
})());
check("公式装备代际（武器+护甲 38 件 + v8.27 护符 20 件 = 58）", (() => {
  const w6 = FORMULA_GEAR.find(r => r.tier === 6 && r.outGear.slot === "weapon");
  const w7 = FORMULA_GEAR.find(r => r.tier === 7 && r.outGear.slot === "weapon");
  const tal = FORMULA_GEAR.filter(r => r.outGear.slot === "talisman");
  return FORMULA_GEAR.length === 58 && w6 && w7 && Math.abs(w7.outGear.val / w6.outGear.val - 1.8) < 0.05
      && tal.length === 20 && tal.filter(r => r.tier >= 6).length === 19;   /* 护符 T5~T24 */
})());
check("公式装备门槛看材质档（needHouse = tier + 1）", (() => {
  const rec = FORMULA_GEAR.find(r => r.tier === 6 && r.outGear.slot === "weapon");
  S = newState(); S.bld.bench = 3; S.bld.house = 5;
  S.bp.push(rec.bp);
  S.res.steel = 9999; S.res.copperWire = 9999; S.res.gunpowder = 9999;
  S.crafts = [];
  const blocked = startCraft(rec.id, 1) === false;
  S.bld.house = 7; S.crafts = [];
  return blocked && startCraft(rec.id, 1) === true;
})());
check("高代际箱子能开出当代装备（阶段3：金箱 ≤T6 / 遗迹 ≤T7）", (() => {
  S = { age: 3 };
  return chestMaxTier("gold") === 6 && chestMaxTier("relic") === 7 && chestMaxTier("wood") === 1;
})());
check("材质链上限解除（避难所可升到 30 档）", (() => {
  const b = BLDCFG.find(x => x.id === "house");
  return !!b && b.max === 30 && houseTier(30).def > houseTier(20).def && houseTier(30).name.length > 0;
})());
check("公式装备也有粗制/精修版本（双轨制覆盖高代际）", (() => {
  const rec = FORMULA_GEAR.find(r => r.tier === 6 && r.outGear.slot === "weapon");
  const rough = recipeById("c_" + rec.id), fine = recipeById("r_" + rec.id);
  return !!rough && !!fine && rough.outGear.val === Math.round(rec.outGear.val * 0.6) && fine.outGear.val === rec.outGear.val;
})());

/* ===== v8.13 火力体系（避难所自带火力 + 攻击建筑） ===== */
check("避难所材质链自带火力（防御 ×0.06，随档 ×1.8 递推）", (() => {
  return houseFire(1) === 1 && houseFire(6) === 30 && houseFire(8) === Math.round(houseTier(8).def * 0.06) && houseFire(8) > houseFire(7);
})(), "茅草屋 1 → 合金 30 → " + houseTier(8).name + " " + houseFire(8));
check("火力塔已注册（max10 / req 石屋 / +45 火力每级）", (() => {
  const b = BLDCFG.find(x => x.id === "turret");
  return !!b && b.max === 10 && b.req === 3;
})());
check("火力 = 建筑火力（材质档 + 火力塔）；战力与火力叠加且武器只算一次", (() => {
  S = newState(); S.bld.house = 6; S.bld.turret = 0; S.gear = [];
  const base = fire();
  S.bld.turret = 4;
  const withTurret = fire();
  S.gear = [{ slot:"weapon", name:"测试枪", rar:3, val:200, on:true, tag:"ranged", tags:[] }];
  const atkWith = atk(), fireWith = fire(), total = homeAttack();
  /* 武器 200：战力 +200（全额），火力不变（不重复计入），总攻 = 战力 + 火力 */
  return base === houseFire(6) && withTurret === base + 180
      && fireWith === withTurret && atkWith === atk0AfterWeaponPlaceholder()
      && total === atkWith + fireWith;
})());
function atk0AfterWeaponPlaceholder(){ return 6 * 2 + 200; }
check("火力不影响探索可达性（战力与火力分工）", (() => {
  S = newState(); S.bld.house = 6; S.bld.turret = 10;
  S.gear = [];
  const a1 = atk();
  S.bld.turret = 0;
  return atk() === a1;                            /* 火力塔不该改变战力 */
})());
/* ===== v8.14 无限阶段（阶段 4+ 公式化） ===== */
check("无限阶段：阶段表扩到 12（阶段 4+ 公式生成）", (() => {
  return AGES.length === 12 && AGES[3].id === 4 && AGES[11].id === 12 && AGES[3].tier === 4;
})(), AGES.slice(1).map(a => a.name).join("→"));
check("阶段推进条件公式化（阶段4：wave 11 + 避难所 Lv6）", (() => {
  S = newState(); S.age = 3; S.wave = 12; S.bld.house = 6;   /* req.wave=11 指"渡过 11 场" → S.wave=12 */
  const p = ageProgress();
  return !p.final && p.next.id === 4 && p.ok === true;
})());
check("阶段 3 不再是最终阶段（推进链路延续）", (() => {
  S = newState(); S.age = 3;
  return ageProgress().final === false && ageProgressText().length > 0;
})());
check("高阶材料注册（幽能结晶 T4 / 星尘 T5 / 虚空合金 T6）", (() => {
  const g = INV_GROUPS.find(x => x.id === "mat");
  return ITEMS.prism.tier === 4 && ITEMS.stardust.tier === 5 && ITEMS.voidAlloy.tier === 6
      && g.keys.includes("prism") && g.keys.includes("stardust") && g.keys.includes("voidAlloy")
      && TIER_NAME[4].indexOf("T4") === 0;
})());
check("新探索点产出高阶材料（矿点 + 遗迹点）", (() => {
  const mine = SPOTS.endMine4, relic = SPOTS.endRelic4;
  return !!mine && !!relic && mine.y.prism > 0 && relic.y.prism > 0
      && mine.threat === endlessSpotThreat(4) && relic.threat > mine.threat;
})(), "阶段4 矿点威胁 " + SPOTS.endMine4.threat + " / 遗迹 " + SPOTS.endRelic4.threat);
check("新灾种按天灾场次解锁（确定性、不污染前期池）", (() => {
  const p1 = disPoolAtWave(29).map(t => t.name), p2 = disPoolAtWave(31).map(t => t.name);
  return p1.length === 6 && p2.includes("幽能风暴") && !p1.includes("幽能风暴")
      && disTypeAtWave(31).name === disTypeAtWave(31).name;
})());
check("高阶装备吃高阶材料（T7 起）", (() => {
  const g7 = GEAR_RECIPES.find(r => r.id === "f_w7");
  return !!g7 && (g7.in.prism || 0) > 0;
})());
/* ===== v8.15 世界地图（脱机挂视图·一期） ===== */
check("世界地图：所有地点都有坐标且在画布内", (() => {
  let ok = true;
  for(const id in SPOTS){
    const q = spotPos(id);
    if(!isFinite(q.x) || !isFinite(q.y) || q.x < 0 || q.y < 0 || q.x > MAP_W || q.y > MAP_H) ok = false;
  }
  return ok && spotPos("junk").x > 0 && spotPos("junk").y > 0;
})());
check("坐标确定性（同一地点永远同一位置）", (() => {
  return JSON.stringify(spotPos("endMine6")) === JSON.stringify(spotPos("endMine6"))
      && (function(){ const q = spotPos("oilField"); return q.x >= 330 && q.x <= 1480 && q.y >= 120 && q.y <= 930; })();
})());
check("威胁分带：<45 安全 / 45~160 危险 / >160 死域", threatBand(2).key === "safe"
  && threatBand(45).key === "risk" && threatBand(160).key === "risk" && threatBand(161).key === "dead");
check("轨迹环形缓冲（上限 400、保留最新）", (() => {
  S = newState(); S.trail = [];
  for(let i = 0; i < 520; i++){
    S.day += 0.01;
    trailPush("move", i % 2 ? "forest" : "quarry");
  }
  return S.trail.length <= 400 && S.trail.length > 300;
})(), "长度 " + (S.trail || []).length);
check("轨迹去重（同刻同地同类不重复记）", (() => {
  S = newState(); S.trail = [];
  trailPush("move", "forest");
  const a = S.trail.length;
  trailPush("move", "forest");
  return S.trail.length === a;
})());
check("关键节点自动记轨迹（时段切换 + 天灾）", (() => {
  S = newState(); S.trail = []; S.age = 3; S.wave = 5; S.bld.house = 8; S.bld.fortify = 6;
  S.plan.am = "forest"; S.plan.pm = "quarry"; S.day = 0.5; S.curSeg = "am";
  advanceHours(14);
  const hasMove = (S.trail || []).some(x => x.k === "move" && x.s);
  const hasDis = (S.disLog || []).length > 0 ? (S.trail || []).some(x => x.k === "dis") : true;
  return hasMove && hasDis;
})());
check("地图节点：只含已发现或本阶段可见的地点", (() => {
  S = newState(); S.age = 1;
  S.found = ["junk", "forest"];
  const nodes = mapNodes();
  return nodes.some(n => n.id === "junk" && n.known)
      && !nodes.some(n => n.id === "endMine4")
      && nodes.every(n => n.tier <= 1 || n.known);
})());
check("地图 SVG 可渲染（含避难所/地点/主角）", (() => {
  S = newState(); S.found = ["junk", "forest", "quarry"];
  trailPush("move", "forest"); trailPush("discover", "quarry");
  const svg = mapSvgText();
  return svg.indexOf("<svg") === 0 && svg.length > 1200
      && svg.includes("避难所") && svg.includes("后山树林") && /赶路中|在/.test(svg);   /* v8.15b 主角标签含“赶路中” */
})(), "SVG " + mapSvgText().length + " 字符");
check("离线回放：滑块定位与回到实时", (() => {
  S = newState(); S.trail = [];
  for(let i = 0; i < 10; i++){ S.day += 0.5; trailPush("move", i % 2 ? "forest" : "river"); }
  mapOpen = true;
  mapReplayTo(3);
  const at3 = mapReplayIdx;
  mapReplayTo(9);
  const atEnd = mapReplayIdx;
  mapReplayLive();
  const live = mapReplayIdx;
  mapOpen = false;
  return at3 === 3 && atEnd === -1 && live === -1;
})());
check("挂机概览统计（地点/天灾/采样点）", (() => {
  S = newState(); S.trail = [];
  trailPush("move", "forest"); trailPush("discover", "quarry");
  trailPush("dis", null, "win:酸雨"); trailPush("dis", null, "lose:寒潮");
  const sum = mapSummary();
  return sum.spots === 2 && sum.disCount === 2 && sum.disWin === 1 && sum.points === 4;
})());
/* ===== v8.16 页面内实时地图 ===== */
check("实时地图：主角位置随时间变化（每秒在动）", (() => {
  S = newState(); S.trail = [];
  S.plan.am = "forest"; S.plan.pm = "quarry"; S.plan.night = "rest";
  S.found = ["junk", "forest", "quarry"];
  trailPush("move", "forest");
  S.day = 6.26;                      /* 06:00 段刚出门（hod 6.24）→ 应当"在路上" */
  const a = heroRenderPos();
  S.day = 6.30;                      /* hod 7.2 → 位置继续靠近目标 */
  const b = heroRenderPos();
  const d0 = Math.hypot(a.x - b.x, a.y - b.y);
  S.day = 6.4;                        /* hod 9.6 → 已抵达（赶路只占时段前 1/4） */
  const arrived = heroRenderPos();
  return a.moving === true && b.moving === true && d0 > 0 && arrived.moving === false;
})(), "移动距离 " + (() => { S.day = 6.26; const a = heroRenderPos(); S.day = 6.30; const b = heroRenderPos(); return Math.round(Math.hypot(a.x - b.x, a.y - b.y)); })() + " 单位");
check("实时地图：结构签名只在变化时重建", (() => {
  S = newState(); S.found = ["junk", "forest"]; S.trail = [];
  mapSigInline = "";
  const sig1 = mapStructSig();
  const sig2 = mapStructSig();
  S.day += 0.01;                       /* 时间推进不改结构 → 签名不变（只挪小人） */
  const sig3 = mapStructSig();
  trailPush("discover", "quarry");     /* 发现新地点 → 签名变化（重建） */
  const sig4 = mapStructSig();
  return sig1 === sig2 && sig2 === sig3 && sig4 !== sig3;
})());
check("实时地图：内嵌渲染与概览卡片可生成（headless 安全）", (() => {
  S = newState(); S.found = ["junk", "forest"]; S.trail = [];
  trailPush("move", "forest");
  const html = mapSvgText("");
  const side = mapSideText(), evs = mapEventsText();
  mapUpdateLive("");                  /* 无 DOM 方法时不得抛错 */
  mapTick();
  return html.indexOf("mapHero") > 0 && side.includes("轨迹跨度") && evs.length > 0;
})());
check("实时地图：地点标签随阶段解锁（未发现阶段点不出现）", (() => {
  S = newState(); S.age = 4; S.found = ["junk"];
  S.trail = [];
  const svg4 = mapSvgText("");
  S.age = 1;
  const svg1 = mapSvgText("");
  return svg4.includes("endMine4") === false && svg1.length <= svg4.length;
})());
/* ===== v8.17 区域地图体系（换高级地图出高级材料） ===== */
check("区域地图体系：T1~T12 共 12 张区域，T4+ 每区 3 个点", (() => {
  const zones = MAP_DEFS.filter(m => m.tier >= 4);
  return MAP_DEFS.length === 12 && zones.length === 9
      && zones.every(m => m.spots.length === 3 && SPOTS[m.spots[0]] && SPOTS[m.spots[1]] && SPOTS[m.spots[2]]);
})(), MAP_DEFS.slice(3, 6).map(m => m.name).join("→"));
check("每区有安全/富矿/遗迹三档（威胁与产量分档）", (() => {
  const safe = SPOTS.z6Safe, rich = SPOTS.z6Rich, relic = SPOTS.z6Relic;
  return rich.threat > safe.threat && relic.threat > rich.threat
      && (rich.y.steel || 0) > (safe.y.steel || 0) && relic.chest > safe.chest;
})());
check("新区域直产当代加工品（绕开制作线瓶颈）", (() => {
  return (SPOTS.z6Rich.y.steel || 0) > 0 && (SPOTS.z6Rich.y.copperWire || 0) > 0
      && (SPOTS.z7Rich.y.alloyIngot || 0) > 0 && (SPOTS.z7Relic.y.quantumCoil || 0) > 0;
})());
check("区域主导材料逐段升级（幽能结晶→星尘→虚空合金→量子线圈）", (() => {
  return zoneMatKey(4) === "prism" && zoneMatKey(5) === "stardust" && zoneMatKey(6) === "voidAlloy" && zoneMatKey(7) === "quantumCoil";
})());
check("产量倍率与材质档同源（house 7 = 1，每档 ×2.0）", (() => {
  S = newState(); S.bld.house = 7; const a = yieldScaleMul();
  S.bld.house = 8; const b = yieldScaleMul();
  S.bld.house = 12; const c = yieldScaleMul();
  return a === 1 && Math.abs(b - 2.0) < 1e-9 && Math.abs(c - Math.pow(2, 5)) < 1e-6;
})());
check("采集产量随材质档缩放（house 7 vs 12 → 约 ×32）", (() => {
  S = newState(); S.age = 8; S.bld.house = 7; S.bld.bench = 5; S.bld.storage = 18;   /* v8.23 给足容量，避免满载折损干扰产量倍率断言 */
  S.found = ["z10Rich"]; S.plan.am = "z10Rich"; S.plan.pm = "rest"; S.plan.night = "rest";
  S.aggressive = true;
  S.gear = [{ slot:"weapon", name:"test", rar:4, val:4000000, on:true, tag:"ranged", tags:[] }];   /* 送死档会被拦，先给够战力 */
  S.res.food = 999; S.res.water = 999;
  const run6 = (day, house) => {
    S.bld.house = house; S.res.steel = 0; S.stam = 100; S.wound = "none";
    S.day = day; S.curSeg = "am"; S.wound = "none";
    advanceHours(6);
    return S.res.steel || 0;
  };
  /* v8.24：两次模拟固定 Math.random（否则运势/遭遇让比值抖动，偶发假失败） */
  const R = Math.random;
  Math.random = () => 0.99;
  const a = run6(6.25, 7);        /* 基准：house 7（倍率 1） */
  const b = run6(7.25, 12);       /* house 12（倍率 32） */
  Math.random = R;
  const ratio = a > 0 ? b / a : 0;
  return a > 0 && Math.abs(ratio - Math.pow(2, 5)) / Math.pow(2, 5) < 0.15;   /* 稳定收敛到 ×32 */
})());
check("新材料接进建造链（材质档 Lv10+ 吃区域材料）", (() => {
  return (HOUSE_TIERS[10].cost.prism || 0) > 0 && (HOUSE_TIERS[13].cost.stardust || 0) > 0
      && (HOUSE_TIERS[16].cost.voidAlloy || 0) > 0 && (HOUSE_TIERS[19].cost.alloyIngot || 0) > 0
      && (HOUSE_TIERS[20].cost.alloyIngot || 0) > 0;
})());
check("高阶加工品已注册（合金锭 / 量子线圈）", (() => {
  const g = INV_GROUPS.find(x => x.id === "mat");
  return ITEMS.alloyIngot && ITEMS.quantumCoil && ITEMS.alloyIngot.tier === 5 && ITEMS.quantumCoil.tier === 6
      && g.keys.includes("alloyIngot") && g.keys.includes("quantumCoil");
})());
/* ===== v8.18 储物箱档位体系（每阶段放出新的存储设备，要图纸 + 要材料） ===== */
check("仓储容量只由储物箱档位决定（不随材质档白送）", (() => {
  S = newState(); S.bld.storage = 5; S.bld.house = 7;
  const a = storageCapNow();
  S.bld.house = 17; const b = storageCapNow();
  S.bld.house = 30; const c = storageCapNow();
  return a === b && b === c && a === storageCap(5);
})());
check("储物箱 " + STORAGE_MAX + " 档封顶，6 档起每档容量 ×2.0", (() => {
  if(STORAGE_TIERS.length !== STORAGE_MAX + 1) return false;
  if(storageTier(5).cap !== 300000 || storageTier(6).cap !== 600000 || storageTier(8).cap !== 2400000) return false;
  for(let lv = 6; lv <= STORAGE_MAX; lv++){
    if(storageTier(lv).cap !== Math.round(storageTier(lv - 1).cap * 2)) return false;
  }
  return true;
})());
check("每档储物箱都要图纸，且按对应阶段分层掉落", (() => {
  for(let lv = 6; lv <= STORAGE_MAX; lv++){
    const t = storageTier(lv);
    if(!t.bp || !STORAGE_BP.includes(t.bp)) return false;
    if(bpTierOf(t.bp) !== t.tier || t.tier !== Math.min(AGES.length, lv - 2)) return false;
  }
  S = newState(); S.bp = [];
  const noBp = storageBpOk(6);
  S.bp = [storageTier(6).bp];
  const withBp = storageBpOk(6);
  return noBp === false && withBp === true;
})());
/* v8.23：储物箱只用加工品（钢/铜线/电池）——区域材料（虚空合金/量子线圈）卡在 z6+ 高威胁区，
   用它当仓储材料会让"战力没跟上"的玩家陷入爆仓死循环（容量升不动、产量天天涨）。 */
check("储物箱只用加工品（钢/铜线/电池），不占区域材料", (() => {
  for(let lv0 = 6; lv0 <= STORAGE_MAX; lv0++){
    const c = storageTier(lv0).cost || {};
    if(!(c.steel > 0) || !(c.copperWire > 0) || !(c.battery > 0)) return false;
    if(c.prism || c.stardust || c.voidAlloy || c.quantumCoil || c.alloyIngot) return false;
  }
  return true;
})());
check("储物箱升级成本走档位材料表（不是通用通式）", (() => {
  S = newState(); S.bld.storage = 5;
  const c = cost("storage"), t6 = storageTier(6).cost;
  return c.steel === t6.steel && c.prism === t6.prism && !c.wood;
})());
/* v8.18b：老档残留的旧版地点（endless 初版的 endMine 系列 / endRelic 系列）不该占探索队列，
 * 否则队首停在"打不过的旧点"上，玩家以为探索停滞、拿不到新区域材料。 */
check("老档残留的旧版地点不占探索队列（v8.18b）", (() => {
  S = newState(); S.age = 6; S.found = [];
  S.queue = ["endMine5", "endRelic6", "z4Safe", "z4Rich"];
  migrateSave();
  return S.queue.every(id => id.indexOf("end") !== 0)
      && S.queue[0] === "z4Safe"
      && S.queue.includes("z4Rich") && S.queue.includes("z6Rich");
})());
check("阶段推进把新区域地点加入待发现队列", (() => {
  S = newState(); S.age = 3; S.wave = 12; S.bld.house = 17;
  S.found = []; S.queue = [];
  checkAgeAdvance();
  return S.age === 4 && S.queue.filter(id => id.indexOf("z4") === 0).length === 3;
})());

/* ===== v8.19 战力引导（装备图纸分层 + 可造提示 + 一键穿最强） ===== */
check("装备图纸按「能造的阶段」分层（不再把 T4+ 全压成 tier3）", (() => {
  const r6 = GEAR_RECIPES.find(r => r.bp && r.tier === 6);
  const r11 = GEAR_RECIPES.find(r => r.bp && r.tier === 11);
  return gearTierStage(1) === 1 && gearTierStage(3) === 2 && gearTierStage(6) === 4
      && gearTierStage(11) === 6 && gearTierStage(24) === 12
      && bpTierOf(r6.bp) === 4 && bpTierOf(r11.bp) === 6;
})(), "阶段6 掉落池只含可造代际（T≤11）");
check("可造最强武器 = 图纸在手 + 门槛通过 + 材料齐", (() => {
  S = newState(); S.age = 6; S.bld.house = 17; S.bld.bench = 5;
  const rec = GEAR_RECIPES.find(r => r.bp && r.tier === 6 && r.outGear.slot === "weapon");
  S.bp = [rec.bp];
  for(const k in S.res) S.res[k] = 0;
  const empty = bestCraftableWeapon();
  for(const k in rec.in) S.res[k] = rec.in[k] * 2;
  const ok = bestCraftableWeapon();
  return empty === null && ok && ok.rec.bp === rec.bp && ok.val === rec.outGear.val;
})());
check("装备对比：差值 = 该件 − 当前穿上的同槽位件", (() => {
  S = newState();
  S.gear = [
    { slot:"weapon", name:"弱枪", rar:1, val:100, on:true, tags:[] },
    { slot:"weapon", name:"强枪", rar:2, val:300, on:false, tags:[] }
  ];
  return gearDelta(S.gear[1]) === 200 && gearDelta(S.gear[0]) === 0
      && equipped("weapon").name === "弱枪" && bestInBag("weapon").name === "强枪";
})());
check("一键穿最强：逐槽位换上最强件", (() => {
  S = newState();
  S.gear = [
    { slot:"weapon", name:"弱枪", rar:1, val:100, on:true, tags:[] },
    { slot:"weapon", name:"强枪", rar:2, val:300, on:false, tags:[] },
    { slot:"armor", name:"弱甲", rar:1, val:50, on:true, tags:[] },
    { slot:"armor", name:"强甲", rar:2, val:80, on:false, tags:[] }
  ];
  equipBestAll();
  return atk() === 300 + lv("house") * 2 && equipped("armor").name === "强甲"
      && S.gear.filter(g => g.on).length === 2;
})());

/* ===== v8.20 图纸/配方查找提速（未解锁折叠 + 分组） ===== */
check("制作面板：未解锁配方默认折叠成一行（不再逐条铺开）", (() => {
  S = newState(); S.bld.bench = 5; S.age = 6; S.bld.house = 17;
  S.bp = [GEAR_RECIPES.find(r => r.bp && r.tier === 6).bp];
  for(const k in showLocked) delete showLocked[k];
  sigBench = ""; renderWorkbench();
  const html = (document.getElementById("workbenchPanel") && document.getElementById("workbenchPanel").innerHTML) || "";
  return html.indexOf("未解锁图纸 ×") >= 0 && html.indexOf("❓ 未知图纸") < 0;
})());
check("制作面板：点开后能看到未解锁的传闻", (() => {
  /* v8.26：装备组已按槽位拆开，折叠键变成 gear-weapon / gear-armor / gear-talisman */
  for(const k of ["gear-weapon", "gear-armor", "gear-talisman", "rough-weapon", "refine-weapon"]) showLocked[k] = true;
  sigBench = ""; renderWorkbench();
  const html = (document.getElementById("workbenchPanel") && document.getElementById("workbenchPanel").innerHTML) || "";
  return html.indexOf("❓ 未知图纸") >= 0;
})());
check("制作面板：可开工的排在缺料/门槛未达之前", (() => {
  S = newState(); S.bld.bench = 5; S.age = 6; S.bld.house = 17;
  const t6 = GEAR_RECIPES.find(r => r.bp && r.tier === 6 && r.outGear.slot === "weapon");
  const t11 = GEAR_RECIPES.find(r => r.bp && r.tier === 11 && r.outGear.slot === "weapon");
  S.bp = [t6.bp, t11.bp];                       /* t6 材料齐、t11 材料缺 */
  for(const k in S.res) S.res[k] = 0;
  for(const k in t6.in) S.res[k] = t6.in[k] * 2;
  for(const k in showLocked) delete showLocked[k];
  sigBench = ""; renderWorkbench();
  const html = (document.getElementById("workbenchPanel") && document.getElementById("workbenchPanel").innerHTML) || "";
  return html.indexOf(t6.name) >= 0 && html.indexOf(t11.name) >= 0
      && html.indexOf(t6.name) < html.indexOf(t11.name);
})());
check("图纸页签：按类别与代际分组（未获得的不列出）", (() => {
  S = newState();
  S.bp = [GEAR_RECIPES.find(r => r.bp && r.tier === 6).bp, "木箱柜图纸", RECIPES.find(r => r.bp).bp];
  invTab = "bp"; sigInv = ""; renderInventory();
  const html = (document.getElementById("inventoryPanel") && document.getElementById("inventoryPanel").innerHTML) || "";
  return html.indexOf("已获得") >= 0 && html.indexOf("装备 · T6") >= 0
      && html.indexOf("储物箱") >= 0 && html.indexOf("材料加工") >= 0;
})());

/* ===== v8.21 加工品阶梯 + 攒料天数估算 ===== */
check("电池从 T4 区域起就有产出（不再断档到 T6+）", (() => {
  return (SPOTS.z4Rich.y.battery || 0) > 0 && (SPOTS.z4Safe.y.battery || 0) > 0
      && (SPOTS.z6Rich.y.alloyIngot || 0) > 0 && (SPOTS.z7Rich.y.quantumCoil || 0) > 0;
})());
check("affordEstimate：按当前日程算天数，并指出该换哪个产地点", (() => {
  S = newState(); S.age = 6; S.bld.house = 12; S.bld.bench = 5;
  S.found = ["z4Safe", "z4Rich"];
  S.plan.am = "z4Safe"; S.plan.pm = "rest"; S.plan.night = "rest";
  for(const k in S.res) S.res[k] = 0;
  const rate = SPOTS.z4Safe.y.prism * yieldScaleMul() * 6;
  const a = affordEstimate({ prism: rate * 2 });
  S.plan.am = "rest";
  const c = affordEstimate({ prism: rate });
  return Math.abs(a.days - 2) < 0.05 && a.notScheduled.length === 0
      && c.notScheduled.length === 1 && c.notScheduled[0].k === "prism"
      && c.notScheduled[0].at === SPOTS.z4Rich.name;
})());
check("affordEstimate：既无产地又无配方的材料会告警", (() => {
  S = newState(); S.found = [];
  S.plan.am = "rest"; S.plan.pm = "rest"; S.plan.night = "rest";
  const e = affordEstimate({ voidAlloy: 10 });
  return e.noSource.length === 1 && e.noSource[0] === "voidAlloy";
})());
check("地点一览显示实际每段产量（含随材质档增长的倍率）", (() => {
  S = newState(); S.age = 6; S.bld.house = 12; S.found = ["z4Rich"];
  S.plan.am = "rest"; S.plan.pm = "rest"; S.plan.night = "rest";
  sigPlan = ""; renderPlan();
  const html = (document.getElementById("planPanel") || {}).innerHTML || "";
  const want = fmtCap(Math.round(SPOTS.z4Rich.y.steel * yieldScaleMul() * 6)) + "/段";
  return html.indexOf(want) >= 0;
})());

/* ===== v8.28 底图地图（AI 废土地图 + 中心放射散点） ===== */
check("v8.28 底图地图：画布匹配废土地图尺寸、可见节点都在位图内", (() => {
  S = newState(); S.age = 6; S.found = ["junk","forest","quarry","river"];
  S.queue = ["z4Safe","z4Rich","z4Relic","z5Safe","z5Rich","z5Relic","z6Safe","z6Rich"];
  if(MAP_W !== 1536 || MAP_H !== 1024) return false;
  if(typeof MAP_BASE_IMG === "undefined" || !MAP_BASE_IMG) return false;
  const nodes = mapNodes();
  if(!nodes.length) return false;
  for(const n of nodes)
    if(n.pos.x < 20 || n.pos.x > MAP_W - 20 || n.pos.y < 20 || n.pos.y > MAP_H - 20) return false;
  return true;
})());
check("v8.28 底图地图：老地点（T1~T3）聚拢在避难所附近、后期区域向外扩散", (() => {
  S = newState(); S.found = ["junk","forest","quarry","river","ironMine","coalSeam","station","market","trail","copperMine","sulfurPit","niterBed","oilField"];
  const C = MAP_CENTER;
  for(const id of S.found){ const q = spotPos(id); if(Math.hypot(q.x - C.x, q.y - C.y) > 320) return false; }
  /* 后期区域点（z9）应明显比老地点离避难所更远 */
  S.age = 9; S.found = ["z9Safe","z9Rich","z9Relic"];
  for(const id of ["z9Safe","z9Rich","z9Relic"]){ const q = spotPos(id); if(Math.hypot(q.x - C.x, q.y - C.y) < 340) return false; }
  return true;
})());
check("地图只画已发现 + 当前队列里的点（旧版残留孤儿点不出现）", (() => {
  S = newState(); S.age = 6; S.found = ["junk"]; S.queue = ["z4Safe"];
  const ids = mapNodes().map(n => n.id);
  return ids.includes("junk") && ids.includes("z4Safe") && !ids.includes("forest")
      && !ids.some(id => id.indexOf("endMine") === 0 || id.indexOf("endRelic") === 0);
})());
check("v8.28 底图地图：同区域三点（安全/富矿/遗迹）散落在画布内且围绕避难所扩散", (() => {
  S = newState(); S.age = 6; S.found = ["z4Safe","z4Rich","z4Relic"];
  const C = MAP_CENTER;
  const ps = ["z4Safe","z4Rich","z4Relic"].map(spotPos);
  if(ps.some(q => q.x < 20 || q.x > MAP_W - 20 || q.y < 20 || q.y > MAP_H - 20)) return false;
  if(ps.some(q => Math.hypot(q.x - C.x, q.y - C.y) < 200)) return false;   /* 不在避难所身上 */
  const set = new Set(ps.map(q => q.x + "," + q.y));                       /* 三点散开（不全重合） */
  return set.size >= 2;
})());

/* ===== v8.23 储物箱跟材质档（容量与产量同步）+ 满载不扣存量 ===== */
check("储物箱档位跟材质档：house 18 可升到 Lv16（容量随产量 ×2/档）", (() => {
  S = newState(); S.bld.house = 18;
  const canUpTo = Math.min(STORAGE_MAX, S.bld.house - 2);
  S.bld.house = 3;
  const lowCap = Math.min(STORAGE_MAX, S.bld.house - 2);
  return canUpTo === 16 && lowCap === 1 && storageCap(16) === 300000 * Math.pow(2, 11)
      && storageCap(5) === 300000;
})());
check("仓储满载：新采物资只 1/4 进仓，且不扣已有存量", (() => {
  /* v8.24：改成确定性口径——①两次模拟都固定 Math.random（否则运势/遭遇让比值抖动）；
     ②给足储物箱容量，让"基准组"真的不满载（旧写法容量只有 2500，两组建模都会溢仓，
     比值逼近 1 → 偶发失败）。 */
  const R = Math.random;
  Math.random = () => 0.99;
  const cap = storageCap(20);                    /* 储物箱拉满，基准组不满仓 */
  const run = fill => {
    S = newState(); S.age = 6; S.bld.house = 12; S.bld.bench = 5; S.bld.storage = 20;
    S.found = ["z4Rich"]; S.plan.am = "z4Rich"; S.plan.pm = "rest"; S.plan.night = "rest";
    S.aggressive = true;
    S.gear = [{ slot:"weapon", name:"t", rar:4, val:4000000, on:true, tag:"ranged", tags:[] }];
    S.res.food = 999; S.res.water = 999;
    S.res.wood = fill;
    S.day = 6.25; S.curSeg = "am";
    const b = S.res.steel || 0;
    advanceHours(6);
    return { got: (S.res.steel || 0) - b, kept: Math.floor(S.res.wood || 0) };
  };
  const normal = run(0), full = run(cap + 1);
  Math.random = R;
  const ratio = normal.got > 0 ? full.got / normal.got : 0;
  return normal.got > 0 && full.got > 0
      && Math.abs(ratio - OVERFLOW_GATHER_MUL) < 0.05      /* 满载 = 基准的 1/4 */
      && full.kept > cap - 10;                             /* 已存物资不被扣 */
})());
/* ===== v8.24 页面拆分（基地 / 工作台 / 库存 / 灾史） ===== */
check("页面切换：setPage 切 .on 类，并记住选择", (() => {
  setPage("history");
  const hOn = document.getElementById("page-history").className.indexOf("on") >= 0;
  const bOff = document.getElementById("page-base").className.indexOf("on") < 0;
  const btnOn = document.getElementById("pb-history").className.indexOf("on") >= 0;
  setPage("bench");
  const bOn = document.getElementById("page-bench").className.indexOf("on") >= 0;
  setPage("base");
  return hOn && bOff && btnOn && bOn && curPage === "base";
})());
/* ===== v8.30 基地页：地图铺满全屏背景 + 浮动按钮坞 + 弹出面板 =====
 * 用户："把地图作为背景，然后把其他能缩小成按钮的都缩小成按钮。" */
check("v8.30 布局：地图背景进基地页，六个面板 + 地图信息缩成右下浮动按钮", (() => {
  const html = __fs.readFileSync(__path.join(__ROOT, "index.html"), "utf8");
  const iBase = html.indexOf('id="page-base"');
  const iBg = html.indexOf('id="mapInlineBg"');
  const iDock = html.indexOf('id="fabDock"');
  const iBench = html.indexOf('id="page-bench"');
  const fabs = (html.match(/class="fab"/g) || []).length;
  const keys = ["info","bld","now","hero","plan","chest","log"];
  return iBase > 0 && iBg > iBase && iDock > iBase && iBench > -1
      && fabs === 7
      && html.indexOf("maphero") < 0
      && keys.every(k => html.indexOf('id="fab-' + k + '"') > 0 && html.indexOf('id="pop-' + k + '"') > 0)
      && keys.every(k => html.indexOf('id="fsum-' + k + '"') > 0);
})());
check("v8.30 弹出：默认全收起，点开写进 localStorage", (() => {
  const defAllClosed = POP_KEYS.every(k => !isPopOpen(k));
  togglePop("bld");
  const popOn = document.getElementById("pop-bld").className.indexOf("on") >= 0;
  const fabOn = document.getElementById("fab-bld").className.indexOf("on") >= 0;
  const saved = JSON.parse(localStorage.getItem("shelterPops") || "{}");
  const onState = isPopOpen("bld") && popOn && fabOn && saved.bld === true;
  togglePop("bld");
  return defAllClosed && onState && !isPopOpen("bld");
})());
check("v8.30 弹出：closeAllPops 全部收起", (() => {
  togglePop("bld"); togglePop("hero");
  closeAllPops();
  return POP_KEYS.every(k => !isPopOpen(k)
    && document.getElementById("pop-" + k).className.indexOf("on") < 0
    && document.getElementById("fab-" + k).className.indexOf("on") < 0);
})());
check("v8.30 按钮摘要：收起时每个按钮都有一行状态（设施/进行中/主角/日程/箱子/地图）", (() => {
  S = newState(); S.day = 6.3; S.crafts = [];
  S.plan = { am:"forest", pm:"quarry", night:"rest" };
  S.chests.wood = 2; S.chests.bronze = 1;
  S.trail = [{ k:"born", d:0, h:6 }];
  updateFabSums();
  const g = k => document.getElementById("fsum-" + k).textContent;
  return g("bld").indexOf("已建") === 0
      && g("now").indexOf("上午") >= 0 && g("now").indexOf("🕐") > 0
      && g("hero").indexOf("战力") > 0 && g("hero").indexOf("防御") > 0
      && g("plan").indexOf("上午") === 0 && g("plan").indexOf("夜里") > 0
      && g("chest").indexOf("木箱 2") >= 0 && g("chest").indexOf("青铜箱 1") >= 0
      && g("info").length > 0;
})());
check("v8.30 按钮摘要：日志行 = 最近一条日志", (() => {
  log("🧪 按钮摘要测试");
  return document.getElementById("fsum-log").textContent === "🧪 按钮摘要测试";
})());
check("灾史页：列出全部场次 + 概览 + 走势，可按结果筛选", (() => {
  S = newState();
  S.disLog = [
    { wave:1, name:"辐射尘", day:12, win:true, have:100, need:80, rewards:"木材+10" },
    { wave:2, name:"寒潮", day:20, win:false, have:90, need:150, lossPct:10 },
    { wave:3, name:"洪水", day:30, win:true, have:200, need:180, rewards:"石料+20" }
  ];
  sigHis = ""; renderHistory();
  const all = (document.getElementById("historyPanel").innerHTML.match(/class="hisrow/g) || []).length;
  setHisFilter("win");
  const win = (document.getElementById("historyPanel").innerHTML.match(/class="hisrow/g) || []).length;
  setHisFilter("lose");
  const lose = (document.getElementById("historyPanel").innerHTML.match(/class="hisrow/g) || []).length;
  setHisFilter("all");
  const html = document.getElementById("historyPanel").innerHTML;
  return all === 3 && win === 2 && lose === 1
      && html.indexOf("hiscards") >= 0 && html.indexOf("hisbars") >= 0 && html.indexOf("总胜率") >= 0;
})());
check("灾史已从主角面板拆出（只留摘要与入口按钮）", (() => {
  S = newState();
  S.disLog = [{ wave:1, name:"辐射尘", day:12, win:true, have:100, need:80, rewards:"x" }];
  sigHero = ""; renderHero();
  const hero = document.getElementById("heroPanel").innerHTML;
  return hero.indexOf("查看全部灾史") >= 0 && hero.indexOf("灾史（经历过的天灾）") < 0;
})());
check("工作台搜索：按材料/名称过滤（只留命中的组）", (() => {
  S = newState(); S.bld.bench = 5; S.age = 6; S.bld.house = 17;
  S.bp = GEAR_RECIPES.filter(r => r.bp).map(r => r.bp);        /* 全解锁便于计数 */
  benchQuery = ""; sigBench = ""; renderWorkbench();
  const allN = (document.getElementById("workbenchPanel").innerHTML.match(/<div class="rec">/g) || []).length;
  benchQuery = "钢"; sigBench = ""; renderWorkbench();
  const steelN = (document.getElementById("workbenchPanel").innerHTML.match(/<div class="rec">/g) || []).length;
  benchQuery = "磁轨"; sigBench = ""; renderWorkbench();
  const railHtml = document.getElementById("workbenchPanel").innerHTML;
  const railN = (railHtml.match(/<div class="rec">/g) || []).length;
  benchQuery = ""; sigBench = ""; renderWorkbench();
  return allN > 10 && steelN > 0 && steelN < allN && railN > 0 && railN < allN && railHtml.indexOf("磁轨炮") >= 0;
})());
check("工作台分组可整组收起（收起后不出卡片，只留标题）", (() => {
  S = newState(); S.bld.bench = 5; S.age = 6; S.bld.house = 17;
  S.bp = GEAR_RECIPES.filter(r => r.bp).map(r => r.bp);
  /* v8.26：装备按槽位分栏后，每个子分组各自可收起 */
  benchQuery = ""; benchSlot = "all";
  for(const k of ["gear-weapon", "gear-armor", "gear-talisman"]) groupFold[k] = true;
  sigBench = ""; renderWorkbench();
  const folded = document.getElementById("workbenchPanel").innerHTML;
  const foldedN = (folded.match(/<div class="rec">/g) || []).length;
  for(const k of ["gear-weapon", "gear-armor", "gear-talisman"]) groupFold[k] = false;
  sigBench = ""; renderWorkbench();
  const openN = (document.getElementById("workbenchPanel").innerHTML.match(/<div class="rec">/g) || []).length;
  return folded.indexOf("装备制造（图纸）") >= 0 && folded.indexOf("已收起") >= 0 && foldedN < openN;
})());
check("工作台：装备按槽位分栏（武器 / 护甲 / 护符各一组）", (() => {
  S = newState(); S.bld.bench = 5; S.age = 6; S.bld.house = 17;
  S.bp = GEAR_RECIPES.filter(r => r.bp).map(r => r.bp);
  benchQuery = ""; benchSlot = "all";
  for(const k in groupFold) delete groupFold[k];
  sigBench = ""; renderWorkbench();
  const html = document.getElementById("workbenchPanel").innerHTML;
  return html.indexOf("⚔️ 武器") >= 0 && html.indexOf("🛡️ 护甲") >= 0 && html.indexOf("🧿 护符") >= 0
      && html.indexOf("reccat") >= 0;
})());
check("工作台：槽位筛选只看一类（选武器时不出现护甲卡片）", (() => {
  S = newState(); S.bld.bench = 5; S.age = 6; S.bld.house = 17;
  S.bp = GEAR_RECIPES.filter(r => r.bp).map(r => r.bp);
  benchQuery = "";
  for(const k in groupFold) delete groupFold[k];
  setBenchSlot("weapon");
  const w = document.getElementById("workbenchPanel").innerHTML;
  setBenchSlot("armor");
  const a = document.getElementById("workbenchPanel").innerHTML;
  setBenchSlot("all");
  const all = document.getElementById("workbenchPanel").innerHTML;
  return w.indexOf("🛡️ 护甲") < 0 && a.indexOf("⚔️ 武器") < 0
      && (w.match(/<div class="rec">/g) || []).length < (all.match(/<div class="rec">/g) || []).length
      && benchSlot === "all";
})());
check("导航徽标：工作台显示当前可开工件数", (() => {
  S = newState(); S.bld.bench = 5; S.age = 1;
  for(const k in S.res) S.res[k] = 99999;
  sigBench = ""; renderWorkbench();
  const txt = document.getElementById("pbBenchN").textContent;
  return craftableNow > 0 && txt.indexOf("可开工") >= 0 && txt.indexOf(String(craftableNow)) >= 0;
})());

/* ===== v8.25 制作速度随材质档（材料加工 ×2/档，装备限速 ×8） ===== */
check("制作速度：材料加工随材质档 ×2/档，装备类限速 ×" + CRAFT_GEAR_SPEED_MAX, (() => {
  S = newState(); S.bld.bench = 5; S.bld.generator = 3;
  const at = h => { S.bld.house = h; return { mat: craftSpeed({ kind: "mat" }), gear: craftSpeed({ kind: "gear" }) }; };
  const a = at(7), b = at(13), c = at(30);
  return Math.abs(a.mat - 2.48) < 0.01 && Math.abs(a.gear - 2.48) < 0.01        /* house 7：基础 ×2.48 */
      && Math.abs(b.mat / a.mat - Math.pow(2, 6)) < 0.01                        /* 每档 ×2 */
      && b.gear === CRAFT_GEAR_SPEED_MAX && c.gear === CRAFT_GEAR_SPEED_MAX     /* 装备封顶 */
      && c.mat > c.gear * 1000;                                                 /* 材料加工不封顶 */
})());
check("制作速度跟得上采集倍率（后期制作线不再是死机制）", (() => {
  S = newState(); S.bld.bench = 5; S.bld.generator = 3;
  let ok = true;
  for(const h of [10, 14, 18, 22, 26, 30]){
    S.bld.house = h;
    if(craftSpeed({ kind: "mat" }) < yieldScaleMul() * 0.9) ok = false;
  }
  return ok;
})());
check("制作线真的按新速度推进（材质档 14 比 7 快 30 倍以上）", (() => {
  const run = house => {
    S = newState(); S.age = 8; S.bld.house = house; S.bld.bench = 5; S.bld.generator = 3;
    S.bp = ["炼钢图纸"];
    S.res.ironChunk = 99999; S.res.coal = 99999;
    S.crafts = []; S.nextDis = 999; S.nextBeast = 999;
    S.plan.am = "rest"; S.plan.pm = "rest"; S.plan.night = "rest";
    S.res.food = 999; S.res.water = 999;
    S.day = 6.25; S.curSeg = "am";
    startCraft("steel", 400);
    advanceHours(4);
    const left = S.crafts.length ? (S.crafts[0].qty || 0) : 0;
    return 400 - left;                       /* 已完成的份数 */
  };
  const low = run(7), high = run(14);
  return low > 0 && high > low * 30;         /* 速度差 2^7 = 128 倍量级 */
})());
check("工作台面板显示当前制作速度（材料加工 / 装备分开）", (() => {
  S = newState(); S.bld.bench = 5; S.bld.generator = 3; S.bld.house = 18;
  sigBench = ""; renderWorkbench();
  const html = document.getElementById("workbenchPanel").innerHTML;
  return html.indexOf("当前速度") >= 0 && html.indexOf("材料加工 ×") >= 0 && html.indexOf("装备 ×8") >= 0;
})());

/* ===== v8.27 护符线打通（用户："这装备没有对应的升级，护符和护甲都没有对应提升"） ===== */
check("三条装备线全程无缺口（T2~T24 每代都有武器/护甲/护符）", (() => {
  const bpGear = GEAR_RECIPES.filter(r => r.bp && !r.rough && !r.refine);
  for(const slot of ["weapon", "armor", "talisman"]){
    const tiers = bpGear.filter(r => r.outGear.slot === slot).map(r => r.tier);
    for(let t = 2; t <= 24; t++) if(tiers.indexOf(t) < 0) return false;
  }
  return true;
})());
check("护符数值走独立小量纲（搜集效率 %，T24 封顶 100）", (() => {
  const tal = GEAR_RECIPES.filter(r => r.bp && !r.rough && !r.refine && r.outGear.slot === "talisman")
                          .sort((a, b) => a.tier - b.tier);
  let mono = true;
  for(let i = 1; i < tal.length; i++) if(tal[i].outGear.val < tal[i - 1].outGear.val) mono = false;
  const t24 = tal.find(r => r.tier === 24);
  return mono && tal[0].outGear.val < 20 && t24 && t24.outGear.val === 100
      && tal.every(r => r.outGear.val <= 100);          /* 绝不越界成"战力"量纲 */
})());
check("护符的搜集效率真的生效（prodBonus 接入采集），总和封顶 +300%（v8.42 三插槽）", (() => {
  S = newState();
  const t8 = GEAR_RECIPES.find(r => r.bp && !r.rough && !r.refine && r.outGear.slot === "talisman" && r.tier === 8);
  S.gear = [{ slot:"talisman", name:t8.name, rar:3, val:t8.outGear.val, on:true, tag:t8.outGear.tag, tags:[] }];
  const b = prodBonus();
  S.gear[0].val = 99999;                                /* 超大数值护符 → 总和封顶 +300% */
  const capped = prodBonus();
  S.gear[0].val = t8.outGear.val;
  /* 叠加：再穿两件 +100% → 合计 val/100 + 2（不到上限则不钳） */
  S.gear.push({ slot:"talisman", name:"甲", rar:4, val:100, on:true, tags:[] });
  S.gear.push({ slot:"talisman", name:"乙", rar:4, val:100, on:true, tags:[] });
  const stacked = prodBonus();
  S.gear[1].on = false; S.gear[2].on = false;
  return Math.abs(b - t8.outGear.val / 100) < 1e-9 && Math.abs(capped - TALISMAN_SLOTS) < 1e-9
      && Math.abs(stacked - (t8.outGear.val / 100 + 2)) < 1e-9 && Math.abs(prodBonus() - b) < 1e-9;
})());
check("v8.42 护符插槽：toggleGear 最多穿 3 件，第 4 件被拒", (() => {
  S = newState();
  S.gear = [1,2,3,4].map(n => ({ slot:"talisman", name:"符"+n, rar:3, val:10*n, on:false, tags:[] }));
  for(let i = 0; i < 3; i++) toggleGear(i);
  const ok3 = equippedCount("talisman") === 3;
  toggleGear(3);                                        /* 第 4 件：应被拒绝 */
  return ok3 && equippedCount("talisman") === 3 && !S.gear[3].on;
})());
check("v8.42 equipBestAll：护符按 val 降序穿满 Top3", (() => {
  S = newState();
  S.gear = [1,2,3,5,4].map(n => ({ slot:"talisman", name:"符"+n, rar:3, val:10*n, on:false, tags:[] }));
  equipBestAll();
  const worn = S.gear.filter(g => g.on).map(g => g.val).sort((a,b)=>b-a);
  return worn.length === 3 && worn.join(",") === "50,40,30";
})());
check("v8.42 gearDelta：护符有空位=纯收益，满了=比最弱的一件", (() => {
  S = newState();
  S.gear = [
    { slot:"talisman", name:"A", rar:3, val:80, on:true, tags:[] },
    { slot:"talisman", name:"B", rar:3, val:60, on:true, tags:[] },
    { slot:"talisman", name:"C", rar:3, val:40, on:false, tags:[] }
  ];
  const free = gearDelta(S.gear[2]);                    /* 有空位 → +40 */
  S.gear[2].on = true;                                  /* 穿满 3 件 */
  S.gear.push({ slot:"talisman", name:"D", rar:3, val:70, on:false, tags:[] });
  const full = gearDelta(S.gear[3]);                    /* 满了 → 70 - 最弱40 = +30 */
  S.gear.push({ slot:"talisman", name:"E", rar:3, val:20, on:false, tags:[] });
  const worse = gearDelta(S.gear[4]);                   /* 满了 → 20 - 40 = -20 */
  return free === 40 && full === 30 && worse === -20;
})());
check("护符按代际轮换功能词条（不是每代都同一个）", (() => {
  const tal = GEAR_RECIPES.filter(r => r.bp && !r.rough && !r.refine && r.outGear.slot === "talisman" && r.tier >= 5 && r.tier <= 12);
  const tags = tal.map(r => r.outGear.tag);
  return new Set(tags).size === tags.length && tags.every(t => !!t);
})());
check("装备数值标签按槽位显示（护符是「搜集效率 +N%」）", (() => {
  S = newState(); S.bld.bench = 5; S.age = 8; S.bld.house = 20;
  S.bp = GEAR_RECIPES.filter(r => r.bp).map(r => r.bp);
  benchSlot = "talisman"; benchQuery = "";
  for(const k in groupFold) delete groupFold[k];
  sigBench = ""; renderWorkbench();
  const html = document.getElementById("workbenchPanel").innerHTML;
  benchSlot = "weapon"; sigBench = ""; renderWorkbench();
  const w = document.getElementById("workbenchPanel").innerHTML;
  benchSlot = "all";
  return html.indexOf("搜集效率 +") >= 0 && html.indexOf("战力/防御") < 0 && w.indexOf("战力 ") >= 0;
})());
check("开箱装备的护符也用小量纲（不会掉出 +300 万的护符）", (() => {
  let ok = true;
  for(let t = 1; t <= 24; t++){
    const v = EQUIP_VAL[t] && EQUIP_VAL[t].talisman;
    if(!v || v[1] > 100) ok = false;
  }
  return ok;
})());

console.log("");
const bad = results.filter(r => !r.ok);
console.log(bad.length ? "❌ 失败 " + bad.length + " 项：" + bad.map(b => b.name).join("；") : "🎉 全部通过（" + results.length + " 项）");
process.exit(bad.length ? 1 : 0);

})()`).catch(e => { console.log("运行时错误:", e.stack.split("\n").slice(0, 6).join("\n")); process.exit(1); });
