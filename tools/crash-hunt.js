/* 用真实存档 headless 加载游戏，二分定位挂死子系统 */
const fs = require("fs"), path = require("path");
const realSetTimeout = setTimeout;
global.location = { protocol: "http:", hostname: "192.168.1.2" };   /* SERVER_MODE=true */
const store = {}; global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v, removeItem: k => delete store[k] };
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = { id, style: {}, innerHTML: "", textContent: "", children: [], appendChild(){}, querySelectorAll: () => [], addEventListener(){}, classList: { add(){}, remove(){} }, click(){}, prepend(){}, dataset: {}, setAttribute(){}, title: "" }),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, innerHTML: "", textContent: "", appendChild(){}, querySelectorAll: () => [], addEventListener(){}, classList: { add(){}, remove(){} }, click(){} }),
  addEventListener(){},
  body: { appendChild(){} }
};
global.window = { addEventListener(){} };
global.setInterval = () => 0; global.clearInterval = () => {}; global.setTimeout = () => 0;
global.Blob = function(){}; global.URL.createObjectURL = () => ""; global.URL.revokeObjectURL = () => {};
global.confirm = () => true;
global.fetch = async () => { throw new Error("offline-test"); };

process.on("exit", c => console.log("[exit code=" + c + "]"));
process.on("uncaughtException", e => { console.log("[uncaught] " + (e && e.stack || e)); process.exit(1); });
process.on("unhandledRejection", e => console.log("[rejection] " + (e && (e.stack || e.message) || e)));

const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(path.join(__dirname, "..", "shelter.db"), { readOnly: true });
const row = db.prepare("SELECT data FROM save WHERE id = 1").get();
global.__RAW = row.data;
console.log("[1] db save: day=" + (Math.floor(JSON.parse(row.data).day || 0) + 1));

const FILES = ["js/content/items.js","js/content/recipes.js","js/content/gear.js","js/config.js","js/content/ages.js","js/state.js","js/engine.js","js/loot.js","js/content/endless.js","js/content/map.js","js/content/maps.js","js/save.js","js/ui.js","js/main.js"];
let code = FILES.map(f => "\n/*==== " + f + " ====*/\n" + fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace('"use strict";', "")).join("\n");

/* 循环守卫注入（advanceHours 的 while） */
const GUARD = "while(rem > 1e-9){ globalThis.__iter = (globalThis.__iter || 0) + 1;" +
  " if(globalThis.__iter > 200){ console.log('🛑 LOOP GUARD: 迭代>200, rem=' + rem + ' day=' + S.day); break; }";
code = code.replace("while(rem > 1e-9){", GUARD);
console.log("[2] guard injected=" + (code.includes("LOOP GUARD")));

const mode = process.env.HUNT || "all";
/* 看门狗：15 秒没返回 = 挂死 */
realSetTimeout(() => {
  const s = globalThis.__S;
  console.log("🛑 WATCHDOG: advanceHours 挂死>15s（mode=" + mode + "）day=" + s.day.toFixed(2) +
    " food=" + s.res.food.toFixed(0) + " water=" + s.res.water.toFixed(0) +
    " sate=" + s.sate + " hydro=" + s.hydro + " autoEat=" + s.autoEat +
    " crafts=" + (s.crafts || []).length +
    " craft0=" + ((s.crafts || [])[0] ? (s.crafts[0].id + " qty=" + s.crafts[0].qty + " prog=" + s.crafts[0].prog) : "-"));
  process.exit(2);
}, 15000);

try{
  (0, eval)(code + `
;console.log('[3] scripts OK');
S = JSON.parse(global.__RAW); globalThis.__S = S;
migrateSave(); console.log('[4] migrateSave OK');
const mode = process.env.HUNT || "all";
if(mode === "nocraft" || mode === "all") S.crafts = [];
if(mode === "noeat"  || mode === "all") S.autoEat = false;
console.log('[5] mode=' + mode + ' day=' + S.day.toFixed(2) + ' nextDis=' + S.nextDis + ' nextBeast=' + S.nextBeast + ' crafts=' + (S.crafts||[]).length + ' autoEat=' + S.autoEat);
advanceHours(0.1, true); console.log('[6] 0.1h OK');
advanceHours(1, true);    console.log('[7] 1h OK');
advanceHours(6, true);    console.log('[8] 6h OK');
advanceHours(24, true);   console.log('[9] 24h OK');
console.log('[10] 全部通过');
clearTimeout(0);`);
}catch(e){
  console.log("❌ " + (e && e.stack || e).split("\n").slice(0, 6).join("\n"));
}
console.log("[eval done]");
process.exit(0);
