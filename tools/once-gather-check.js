/* 一次性：模拟真实采集会话，统计掉箱率与基础产出
 * 复现"按小时推进"和"按整段推进"两种点击方式
 */
const fs = require("fs"), path = require("path");
const ROOT = "E:/teams/重生避难所";
const FILES = ["js/content/items.js","js/content/recipes.js","js/content/gear.js","js/config.js","js/content/ages.js","js/state.js","js/engine.js","js/loot.js","js/save.js","js/ui.js","js/main.js"];
global.location = { protocol:"file:", hostname:"" };
const store = {};
global.localStorage = { getItem:k=>k in store?store[k]:null, setItem:(k,v)=>store[k]=v, removeItem:k=>delete store[k] };
const els = {};
function el(id){ if(!els[id]) els[id]={style:{},innerHTML:"",textContent:"",className:"",appendChild(n){this.innerHTML+=(n&&n.innerHTML)||""},prepend(){},querySelectorAll(){return[]},children:{length:0},addEventListener(){},click(){},classList:{add(){},remove(){}}}; return els[id]; }
global.document = { getElementById:el, createElement:()=>({href:"",click(){}}), addEventListener(){} };
global.window = { addEventListener(){} }; global.setInterval=()=>{};
global.Blob=function(){}; global.URL.createObjectURL=()=>"b"; global.URL.revokeObjectURL=()=>{};
global.confirm=()=>true;

const code = FILES.map(f=>fs.readFileSync(path.join(ROOT,f),"utf8").replace('"use strict";','')).join("\n");

const sim = `
S = newState();
// 只解锁新手期能去的几个点
S.found = ["junk","forest","river","quarry"];
function chestCount(){ return Object.values(S.chests||{}).reduce((a,b)=>a+(b||0),0); }

function session(spot, hours, stepH){
  S.day = 0; S.curSeg = "night";
  S.plan.am = spot; S.plan.pm = spot;
  const c0 = chestCount();
  const wood0 = S.res.wood, stone0 = S.res.stone;
  const N = Math.round(hours/stepH);
  for(let i=0;i<N;i++) advanceHours(stepH);
  const got = chestCount() - c0;
  return { got, wood: Math.floor(S.res.wood-wood0), stone: Math.floor(S.res.stone-stone0) };
}

console.log("===== 模拟：新手期 4 个采集点，各推进 30 个小时（=现实 10 小时） =====");
console.log("（按整段 6h 推进 / 按 1h 步进 两种点击方式）");
for(const spot of ["junk","forest","river","quarry"]){
  const r6 = session(spot, 30, 6);
  const r1 = session(spot, 30, 1);
  console.log(
    SPOTS[spot].name.padEnd(6),
    "| 6h推进: 箱"+String(r6.got).padStart(2)+" 木+"+String(r6.wood).padStart(4)+" 石+"+String(r6.stone).padStart(4),
    "| 1h步进: 箱"+String(r1.got).padStart(2)+" 木+"+String(r1.wood).padStart(4)+" 石+"+String(r1.stone).padStart(4)
  );
}
console.log("");
console.log("===== 一个真实新手 3 天（按 1h 步进），混合采集，看能否攒够首灾工事(木60+石60) =====");
S = newState();
S.found = ["junk","forest","river","quarry"];
S.day = 0; S.curSeg = "night";
// 第1天：杂物堆+树林；第2天：树林+碎石坡；第3天：碎石坡+树林
const plan3 = [["junk","forest"],["forest","quarry"],["quarry","forest"]];
let day=0;
for(const [am,pm] of plan3){
  S.plan.am = am; S.plan.pm = pm;
  for(let i=0;i<24;i++) advanceHours(1);
  console.log("  第"+(day+1)+"天末: 木"+Math.floor(S.res.wood)+" 石"+Math.floor(S.res.stone)+" 箱"+chestCount()+" 陷阱Lv"+lv("snare")+" 工事Lv"+lv("fortify"));
  day++;
}
`;

(0,eval)("(async()=>{\n" + code + "\n" + sim + "\n})()");
