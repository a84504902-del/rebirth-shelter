#!/usr/bin/env node
/**
 * tools/land-check.js — 校验"所有地点坐标是否落在陆地上"（v8.31 新增）
 *
 * 做法：headless 加载游戏模块 → 枚举 SPOTS 里每一个地点 → 算 spotPos()
 *        → 拿 tools/land-mask.json（从底图自动提取的陆地遮罩）逐点判定。
 * 判定标准：以落点为圆心、半径 R 的圆盘内所有 16px 网格必须都是陆地
 *           （保证标记点 + 名字/威胁文字不会压到海里）。
 *
 * 用法：node tools/land-check.js [--dump]
 *   --dump 额外把坐标写到 tools/land-positions.json（供叠图目检）
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MASK = JSON.parse(fs.readFileSync(path.join(__dirname, "land-mask.json"), "utf8"));
const R = Number(process.env.LAND_R || 1);   /* 判定半径（格数，1 格 = 16px：标记圆半径 ~8px + 文字 ~8px，刚好够） */

/* ---------- headless 环境 ---------- */
global.location = { protocol: "file:", hostname: "" };
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
const mk = () => ({ style:{}, innerHTML:"", textContent:"", className:"", value:"", appendChild(){}, prepend(){}, querySelectorAll(){ return []; }, children:{length:0}, addEventListener(){}, click(){}, classList:{add(){},remove(){},toggle(){}}, lastChild:null, remove(){}, dataset:{} });
const els = {};
global.document = { getElementById: id => (els[id] = els[id] || mk()), createElement: () => mk(), addEventListener(){}, querySelectorAll(){ return []; } };
global.window = { addEventListener(){} };
global.setInterval = () => {};
global.Blob = function(){}; global.URL.createObjectURL = () => "blob:t"; global.URL.revokeObjectURL = () => {};
global.confirm = () => true;

const FILES = ["js/content/items.js","js/content/recipes.js","js/content/gear.js","js/config.js","js/content/ages.js","js/state.js","js/engine.js","js/loot.js","js/content/endless.js","js/content/map.js","js/content/maps.js","js/save.js","js/ui.js"];
const code = FILES.map(f => fs.readFileSync(path.join(ROOT, f), "utf8").replace('"use strict";', "")).join("\n");

(0, eval)(code + `
S = newState();
migrateSave();
global.__ROWS = Object.keys(SPOTS).map(id => {
  const p = spotPos(id);
  const sp = SPOTS[id];
  return { id, name: sp.name, tier: sp.tier || sp.zone || 1, lane: spotLane(id), x: p.x, y: p.y };
});
global.__ZO = zoneColumns().map(z => ({ tier: z.tier, name: z.name, x: z.x, y: z.y }));
global.__W = MAP_W; global.__H = MAP_H;
global.__C = MAP_CENTER;
`);

const { gw, gh, cell, imgW, imgH, mask } = MASK;
const at = (gx, gy) => (gx >= 0 && gy >= 0 && gx < gw && gy < gh) ? mask[gy][gx] === 1 : false;

/** 落点周围 R 格圆盘是否全陆地 */
function diskLand(x, y){
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  for(let dy = -R; dy <= R; dy++) for(let dx = -R; dx <= R; dx++){
    if(dx * dx + dy * dy > R * R + 0.5) continue;
    if(!at(cx + dx, cy + dy)) return false;
  }
  return true;
}
/** 距最近海水的格数（用于报告"贴得多近"） */
function distSea(x, y){
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  for(let r = 0; r <= 40; r++){
    for(let dy = -r; dy <= r; dy++) for(let dx = -r; dx <= r; dx++){
      if(Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if(!at(cx + dx, cy + dy)) return r;
    }
  }
  return 99;
}

const rows = global.__ROWS.map(r => ({ ...r, land: diskLand(r.x, r.y), sea: distSea(r.x, r.y) }));

const bad = rows.filter(r => !r.land);
console.log(`底图 ${imgW}x${imgH}，遮罩 ${gw}x${gh}（${cell}px/格），判定半径 ${R} 格 = ${R * cell}px`);
console.log(`地点总数 ${rows.length}，落海 ${bad.length} 个`);
/* 分布概览：按"距中心方位角"分 8 扇区统计，看是否还堆在一条竖线上 */
const C = global.__C;
const sec = Array(8).fill(0);
for(const r of rows){ const a = Math.atan2(r.y - C.y, r.x - C.x) * 180 / Math.PI; sec[Math.floor(((a + 360) % 360) / 45)]++; }
console.log("方位分布(从正右起顺时针每45°): " + sec.join(" / "));
console.log("最贴海的一批（按距海格数升序 Top8）：");
rows.slice().sort((a, b) => a.sea - b.sea).slice(0, 8).forEach(r =>
  console.log(`  ${r.land ? "✓" : "✗"} ${r.name.padEnd(6, "　")} T${String(r.tier).padStart(2)} lane${r.lane} (${r.x},${r.y}) 距海 ${r.sea} 格`));
if(bad.length){
  console.log("\n❌ 落海地点：");
  bad.forEach(r => console.log(`  ${r.name} T${r.tier} (${r.x},${r.y})`));
} else console.log("\n✅ 所有地点均在陆地上");

/* 区域大字（地名）位置也顺便校验 */
const zbad = global.__ZO.filter(z => !diskLand(z.x, z.y - 72));
console.log("\n区域大字：" + global.__ZO.length + " 个，" + (zbad.length ? "❌ 落海 " + zbad.map(z => z.name).join("/") : "✅ 全部在陆地"));

if(process.argv.includes("--dump")){
  fs.writeFileSync(path.join(__dirname, "land-positions.json"), JSON.stringify({ W: global.__W, H: global.__H, spots: rows, zones: global.__ZO }, null, 1));
  console.log("-> tools/land-positions.json");
}
process.exit(bad.length || zbad.length ? 1 : 0);
