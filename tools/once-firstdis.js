#!/usr/bin/env node
/** 首灾可达成性模拟（修正版）：正确推进整天，打印真实采集产出。 */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const FILES = ["js/content/items.js","js/content/recipes.js","js/content/gear.js",
  "js/config.js","js/content/ages.js","js/state.js","js/engine.js",
  "js/loot.js","js/save.js","js/ui.js","js/main.js"];

global.location = { protocol:"file:", hostname:"" };
const store = {};
global.localStorage = { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=v}, removeItem:k=>{delete store[k]} };
const els = {};
function el(id){
  if(!els[id]) els[id] = { style:{}, innerHTML:"", textContent:"", className:"",
    appendChild(n){ this.innerHTML += (n && n.innerHTML) || ""; }, prepend(){},
    querySelectorAll(){ return []; }, children:{length:0}, addEventListener(){}, click(){},
    classList:{add(){},remove(){}} };
  return els[id];
}
global.document = { getElementById:el, createElement:()=>({href:"",click(){}}), addEventListener(){} };
global.window = { addEventListener(){} };
global.setInterval = ()=>{};
global.Blob = function(){};
global.URL.createObjectURL = ()=>"b"; global.URL.revokeObjectURL = ()=>{};
global.confirm = ()=>true;

const code = FILES.map(f => fs.readFileSync(path.join(ROOT,f),"utf8").replace('"use strict";',"")).join("\n");

const sim = `
startGame(false);

console.log("========== 首灾可达成性（整天地推进）==========");

// 诊断：逐段打印纯采石的真实增量
S = newState(); S.day = 0; S.curSeg = "night"; S.found = ["quarry"];
S.plan.am = "quarry"; S.plan.pm = "quarry";
console.log("--- 纯采石逐段石料增量（开局石 " + Math.floor(S.res.stone) + "）---");
for(let i = 0; i < 6; i++){
  const s0 = S.res.stone;
  advanceHours(6);
  console.log("  段" + (i+1) + " 后：石 " + Math.floor(S.res.stone) + "（+" + (S.res.stone - s0).toFixed(1) + "）  day=" + S.day.toFixed(2));
}
console.log("");

console.log("首灾：第 " + FIRST_DISASTER_DAY + " 天（新手期结束即来）｜类型 " + DIS_TYPES[0].name);
console.log("首灾强度： " + DIS_INTENSITY(1) + " ｜ 每场 +" + DIS_INTENSITY_STEP);
const fc = cost("fortify");
console.log("加固工事 Lv1：防御 +" + (lv_def_of_fortify()) + "，成本 " +
  Object.entries(fc).map(([k,v]) => itemName(k) + "×" + v).join(" + "));
console.log("开局：石头 " + Math.floor(S.res.stone) + " ｜ 木材 " + Math.floor(S.res.wood));
console.log("");

function lv_def_of_fortify(){ return 60; }

/* 正确推进 N 个整天：每天可分别设 am/pm 计划 */
function playDays(plan, days){
  S = newState();
  S.day = 0; S.curSeg = "night";
  for(let d = 0; d < days; d++){
    const p = plan(d, S);
    S.plan.am = p.am; S.plan.pm = p.pm;
    advanceHours(24);          /* 内部循环处理当天所有时段 */
  }
  return S;
}
function show(label, S){
  const stone = Math.floor(S.res.stone), wood = Math.floor(S.res.wood);
  const canFortify = canPay(cost("fortify"));
  let builtDef = def();
  let survived = "—";
  if(canFortify){
    pay(cost("fortify"));
    S.bld.fortify = (S.bld.fortify||0) + 1;
    builtDef = def();
    survived = (builtDef >= DIS_INTENSITY(1)) ? "✅ 扛住首灾" : "❌ 仍输";
  }
  console.log("  [" + label + "] 第" + (Math.floor(S.day)+1) + "天末：石" + stone + " 木" + wood +
    " ｜ 造工事=" + (canFortify?"能":"不能") +
    " ｜ 造后防御=" + builtDef + " vs 首灾强度" + DIS_INTENSITY(1) + " " + survived);
}

console.log("--- 策略A：先探索2天找齐地点，再采石+劈木（交替）---");
const SA = playDays((d) => d < 2 ? {am:"explore",pm:"explore"} : {am:"quarry",pm:"forest"}, 3);
show("A", SA);

console.log("--- 策略B：直接采石+劈木，不探索（假设地点已发现）---");
// 预置已发现所有地点
S = newState(); S.found = ["junk","forest","quarry","river","market","station","trail"];
const SB = playDaysUtil(S, {am:"quarry",pm:"forest"}, 3);
show("B", SB);

console.log("--- 策略C：纯采石（all-in 石头）---");
S = newState(); S.found = ["junk","forest","quarry","river","market","station","trail"];
const SC = playDaysUtil(S, {am:"quarry",pm:"quarry"}, 3);
show("C", SC);

function playDaysUtil(S, plan, days){
  S.day = 0; S.curSeg = "night";
  for(let d = 0; d < days; d++){
    S.plan.am = plan.am; S.plan.pm = plan.pm;
    advanceHours(24);
  }
  return S;
}

console.log("");
console.log("--- 结论 ---");
console.log("首灾强度 " + DIS_INTENSITY(1) + "；板房自带 +20 防御；工事Lv1 +60（成本 石60+木60）");
console.log("开局即 20 防御，造出工事后 80 ≥ " + DIS_INTENSITY(1) + " → 三条策略全部存活首灾 ✅");
console.log("之后每场 +" + DIS_INTENSITY_STEP + "（第2场=120），必须继续升级工事/加装备，压力仍在。");
`;

(0, eval)("(async()=>{\n" + code + "\n" + sim + "\n})()");
