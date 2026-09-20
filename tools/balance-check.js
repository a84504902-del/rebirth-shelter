/* 天灾强度 vs 装备强度平衡分析（只读，不改游戏状态） */
const fs = require("fs"), path = require("path");
global.location = { protocol: "file:", hostname: "" };
const store = {}; global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => store[k] = v, removeItem: k => delete store[k] };
global.document = { getElementById: id => ({ style: {}, innerHTML: "", textContent: "", appendChild(){}, querySelectorAll: () => [], children: { length: 0 }, addEventListener(){}, classList: { add(){}, remove(){} }, click(){}, prepend(){}, dataset: {} }), createElement: () => ({ style: {}, innerHTML: "", textContent: "", appendChild(){}, querySelectorAll: () => [], children: { length: 0 }, addEventListener(){}, classList: { add(){}, remove(){} }, click(){} }), addEventListener(){} };
global.window = { addEventListener(){} }; global.setInterval = () => {}; global.Blob = function(){}; global.URL.createObjectURL = () => ""; global.URL.revokeObjectURL = () => {}; global.confirm = () => true;
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(path.join(__dirname, "..", "shelter.db"), { readOnly: true });
global.__RAW = db.prepare("SELECT data FROM save WHERE id = 1").get().data;
const FILES = ["js/content/items.js","js/content/recipes.js","js/content/gear.js","js/config.js","js/content/ages.js","js/state.js","js/engine.js","js/loot.js","js/content/endless.js","js/content/map.js","js/content/maps.js","js/save.js","js/ui.js"];
const code = FILES.map(f => fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace('"use strict";', "")).join("\n");
(0, eval)(code + "S=JSON.parse(global.__RAW);migrateSave();globalThis.G={wave:S.wave,age:S.age,house:S.bld.house,atk:atk(),def:def(),home:homeAttack?homeAttack():0,tagSum,hazardMit:HAZARD_MITIGATION};");

const G = globalThis.G;
console.log("=== 你的存档现状 ===");
console.log("wave=" + G.wave + "（即将来第 " + G.wave + " 场）  age=" + G.age + "  材质档 house=" + G.house);
console.log("战力=" + G.atk + "  防御=" + G.def + "  守家攻(战力+火力)=" + G.home);
const rawNeed = Math.max(30, 50 + (G.wave - 1) * 70);
const cut = Math.min(Math.round(rawNeed * 0.5), Math.round(G.home * 0.35));
const need = rawNeed - cut;
console.log("下一场普通天灾: 基础强度 " + rawNeed + " → 战力抵减 -" + cut + " → 需要防御 " + need);
console.log("→ 你的防御 " + G.def + (G.def >= need ? " ≥ " : " < ") + need + " → " + (G.def >= need ? "✅ 稳扛（甚至复合灾也扛得住）" : "❌ 扛不住"));
const compoundNeed = Math.round(rawNeed * 1.4) - cut;   // 复合灾最坏: mult 1.0×1.4
console.log("复合灾最坏情形: 需要 " + compoundNeed + " → " + (G.def >= compoundNeed ? "✅" : "❌"));
console.log("");

console.log("=== 全程推演：天灾强度(线性) vs 装备防御(×1.8/代) ===");
console.log("假设: 每阶段打 3~4 场灾推进, 到区域 t 时 wave≈(t-1)*3.5+1, 守家攻抵满 50%");
console.log("wave | 天灾基础 | 抵减后需防御 | 该时期合理装备代际 | 该代护甲中值 | 余量");
for (const t of [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24]) {
  const waveAt = Math.round((t - 1) * 3.5) + 1;
  const base = Math.max(30, 50 + (waveAt - 1) * 70);
  const needH = Math.round(base * 0.5);                       // 抵满 50% 后
  const armorMid = t <= 3 ? [33, 90, 240][t - 1] : Math.round(185 * Math.pow(1.8, t - 3));
  const margin = (armorMid / needH).toFixed(1);
  console.log(String(waveAt).padStart(4) + " | " + String(base).padStart(8) + " | " + String(needH).padStart(12) + " | T" + String(t).padEnd(2) + " | " + String(armorMid).padStart(10) + " | ×" + margin);
}
console.log("");
console.log("=== 区域怪物威胁 vs 武器（探索线） ===");
console.log("区域 | 安全点威胁 | 同代武器中值 | 比率 | 判定");
for (const t of [4, 6, 8, 10, 12, 16, 20, 24]) {
  const spotT = Math.min(24, Math.max(1, 2 * t - 3));
  const wMid = 170 * Math.pow(1.8, spotT - 3);
  const threatSafe = Math.round(wMid * 1.2);
  const ratio = (wMid / threatSafe).toFixed(2);
  const verdict = wMid / threatSafe >= 1.5 ? "轻松" : wMid / threatSafe >= 1.1 ? "稳妥" : wMid / threatSafe >= 0.8 ? "吃力" : wMid / threatSafe >= 0.5 ? "危险" : "送死";
  console.log("T" + String(t).padEnd(2) + " | " + String(threatSafe).padStart(12) + " | " + String(Math.round(wMid)).padStart(12) + " | " + ratio + " | 刚造出同代武器去安全点=" + verdict + "（设计意图: 吃力→稳妥）");
  console.log("     | 富矿威胁=" + Math.round(threatSafe * 1.3) + " 遗迹威胁=" + Math.round(threatSafe * 1.5) + " → 同代武器去富矿=" + (wMid / (threatSafe * 1.3) >= 0.8 ? "吃力" : "危险") + "，下一代武器去=" + (wMid * 1.8 / (threatSafe * 1.3) >= 1.5 ? "轻松" : "稳妥"));
}
