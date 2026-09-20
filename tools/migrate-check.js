#!/usr/bin/env node
/**
 * 迁移验证：拿数据库里的真实存档，跑一遍 migrateSave 与界面渲染
 * 用法：node tools/migrate-check.js   （需要先启动服务）
 * 只读：不写数据库
 */
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const FILES = [
  "js/content/items.js", "js/content/recipes.js", "js/content/gear.js",
  "js/config.js", "js/content/ages.js",
  "js/state.js", "js/engine.js", "js/loot.js", "js/save.js", "js/ui.js", "js/main.js"
];

/* ---------- 模拟浏览器 ---------- */
global.location = { protocol: "file:", hostname: "" };
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
const els = {};
function el(id){
  if(!els[id]) els[id] = {
    style: {}, innerHTML: "", textContent: "", className: "",
    appendChild(node){ this.innerHTML += (node && node.innerHTML) || ""; }, prepend(){}, querySelectorAll(){ return []; },
    children: { length: 0 }, addEventListener(){}, click(){},
    classList: { add(){}, remove(){} }
  };
  return els[id];
}
global.document = { getElementById: el, createElement: () => ({ href:"", click(){} }), addEventListener(){} };
global.window = { addEventListener(){} };
global.setInterval = () => {};
global.Blob = function(){};
global.URL.createObjectURL = () => "b";
global.URL.revokeObjectURL = () => {};
global.confirm = () => true;

const code = FILES.map(f => fs.readFileSync(path.join(ROOT, f), "utf8").replace('"use strict";', "")).join("\n");

function fetchSave(){
  return new Promise((resolve, reject) => {
    http.get("http://localhost:8787/api/save", res => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => {
        try{ resolve(JSON.parse(JSON.parse(b).data)); }
        catch(e){ reject(new Error("解析存档失败: " + b.slice(0, 120))); }
      });
    }).on("error", reject);
  });
}

(async () => {
  const raw = await fetchSave();
  global.__REAL_SAVE__ = raw;

  (0, eval)("(async()=>{" + code + `
const raw = globalThis.__REAL_SAVE__;
S = JSON.parse(JSON.stringify(raw));

console.log("--- 迁移前（数据库里的真实存档）---");
console.log("第 " + (Math.floor(S.day)+1) + " 天 | 木" + Math.floor(S.res.wood) + " 石" + Math.floor(S.res.stone) + " 铁" + Math.floor(S.res.metal));
console.log("箱子: " + JSON.stringify(S.chests));
console.log("旧字段 injured = " + S.injured + " | age = " + S.age + " | 设施键: " + Object.keys(S.bld).join(","));
console.log("已发现地点: " + (S.found || []).join(","));

migrateSave();

console.log("");
console.log("--- 迁移后 ---");
console.log("阶段: " + S.age + " " + curAge().name + "（" + curAge().era + "）");
console.log("伤势: " + S.wound + " | 背包: " + bagCfg().name + " | 重生世数: " + S.rebirth);
console.log("箱子: " + JSON.stringify(S.chests));
console.log("设施: " + Object.keys(S.bld).map(k => k + ":" + S.bld[k]).join(" "));
console.log("仓储占用: " + Math.floor(storageUsed()) + "/" + storageCapNow());
console.log("新物品已补齐: " + ["ironOre","sulfur","steel","oil","copperWire","gunpowder"].map(k => k + "=" + S.res[k]).join(" "));
console.log("待探索池: " + S.queue.join(","));
console.log("阶段目标: " + ageProgressText());

console.log("");
console.log("--- 界面渲染冒烟 ---");
startGame(true);
const txt = id => (document.getElementById(id).innerHTML + "").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
console.log("顶栏阶段: " + document.getElementById("rAge").textContent);
console.log("仓储: " + document.getElementById("rStore").textContent);
console.log("设施面板: " + document.getElementById("buildings").innerHTML.length + " 字符");
console.log("主角面板: " + document.getElementById("heroPanel").innerHTML.length + " 字符");
console.log("日程面板: " + document.getElementById("planPanel").innerHTML.length + " 字符");
console.log("库存面板: " + document.getElementById("inventoryPanel").innerHTML.length + " 字符");
console.log("箱子面板: " + document.getElementById("chestPanel").innerHTML.length + " 字符");
console.log("工作台: " + document.getElementById("workbenchPanel").innerHTML.length + " 字符");
console.log("阶段目标行: " + txt("ageTarget").slice(0, 90));
console.log("");
console.log("地点一览节选: " + txt("planPanel").slice(-300));
})()`).catch(e => { console.log("运行时错误:", e.stack.split("\n").slice(0, 6).join("\n")); process.exit(1); });
})().catch(e => { console.log("取存档失败:", e.message); process.exit(1); });
