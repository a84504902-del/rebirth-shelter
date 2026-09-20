#!/usr/bin/env node
/**
 * 一次性抽样：开箱产出分布（验证 v7.10「物资筐必出 + 装备/图纸叠加」）
 * 用法：node tools/once-chest-check.js
 * 只读不写库（走浏览器存档分支）
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
  "js/loot.js",
  "js/save.js",
  "js/ui.js",
  "js/main.js"
];

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

const code = FILES.map(f => fs.readFileSync(path.join(ROOT, f), "utf8").replace('"use strict";', "")).join("\n");

(0, eval)("(async()=>{" + code + `
await new Promise(r => setTimeout(r, 100));
startGame(false);
S.autoOpen = false;

const RES_KEYS = Object.keys(S.res);
function snapshot(){ const o = {}; for(const k of RES_KEYS) o[k] = S.res[k] || 0; return o; }

async function sample(tier, n, age){
  S = newState();
  S.autoOpen = false;
  if(age) S.age = age;
  S.chests[tier] = n;
  let totKinds = 0;
  const samples = [];
  for(let i = 0; i < n; i++){
    const b = snapshot();
    openChest(tier, 1);
    const a = snapshot();
    const ks = RES_KEYS.filter(k => a[k] - b[k] > 0);
    totKinds += ks.length;
    if(i < 3) samples.push(ks.map(k => k + "+" + Math.round(a[k] - b[k])).join(" "));
  }
  console.log("=== " + tier + " x" + n + "（阶段 " + (age || 1) + "）===");
  console.log("平均每箱产出的物品种类:", (totKinds / n).toFixed(1) + " 种");
  samples.forEach((s, i) => console.log("  样例" + (i + 1) + ": " + s));
  console.log("  图纸总数: " + ((S.bp || []).length) + "  已装备: " + S.gear.filter(g => g.on).length);
  console.log("");
}

await sample("wood", 100, 1);
await sample("bronze", 100, 2);
await sample("silver", 100, 3);
})()`);
