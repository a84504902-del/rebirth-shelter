#!/usr/bin/env node
/**
 * tools/map-preview.js — 用真实存档生成"世界地图"静态预览（脱机挂视图·一期）
 * 用法：node tools/map-preview.js [模拟游戏小时数，默认 320]
 * 产出：预览-世界地图.html（可直接双击打开）
 *
 * 说明：地图本身是纯表现层，这里为了让预览有内容，
 *       会在内存里把存档向前推进若干游戏小时（不回写存档）。
 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const HOURS = Number(process.argv[2] || 320);
const ROOT = path.join(__dirname, "..");

/* ---------- 读取真实存档 ---------- */
let saveData = null;
try{
  const db = new DatabaseSync(path.join(ROOT, "shelter.db"), { readOnly: true });
  saveData = db.prepare("SELECT data FROM save WHERE id = 1").get().data;
}catch(e){ console.log("读库失败（将用新档演示）：" + e.message); }

/* ---------- headless 环境 ---------- */
const mk = () => ({ style:{}, innerHTML:"", textContent:"", className:"", value:"", appendChild(){}, prepend(){}, querySelectorAll(){ return []; }, children:{length:0}, addEventListener(){}, click(){}, classList:{add(){},remove(){},toggle(){}}, lastChild:null, remove(){}, dataset:{} });
const els = {};
const stub = { getElementById: (id) => (els[id] = els[id] || mk()), createElement: () => mk(), addEventListener(){}, querySelectorAll(){ return []; } };
global.location = { protocol:"file:", hostname:"" };
global.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
global.document = stub; global.window = stub; global.setInterval = () => {}; global.confirm = () => true;

const FILES = ["js/content/items.js","js/content/recipes.js","js/content/gear.js","js/config.js","js/content/ages.js","js/state.js","js/engine.js","js/loot.js","js/content/endless.js","js/content/map.js","js/save.js","js/ui.js"];
const code = FILES.map(f => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/"use strict";/g, "")).join("\n");

(0, eval)(code + `
S = ${saveData ? "(" + saveData + ")" : "newState()"};
migrateSave();
/* 演示：把存档向前推进 HOURS 游戏小时，收集轨迹（不改写真实存档） */
const __before = (S.trail || []).length;
let __run = 0;
while(__run < ${HOURS}){ advanceHours(4); __run += 4; }
const __trail = (S.trail || []).slice(-260);
const __nodes = mapNodes();
const __sum = mapSummary();
const __svg = mapSvgText();
const __stats = mapSideText();
const __events = mapEventsText();
const __meta = {
  day: Math.floor(S.day) + 1, wave: S.wave, age: curAge().name, house: lv("house"),
  houseName: houseTier(lv("house")).name, def: def(), fire: fire(), atk: atk(),
  trailN: __trail.length, total: (S.trail || []).length, ranHours: __run
};
global.__OUT = { svg: __svg, stats: __stats, events: __events, meta: __meta, sum: __sum };
`);

const O = global.__OUT;
const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>重生避难所 · 世界地图（脱机挂视图预览）</title>
<style>
:root{--bg:#141413;--panel:#1f1f1e;--panel2:#262625;--txt:#F1EFE8;--dim:#888780;--line:#3a3a38;--ok:#5DCAA5;--warn:#FAC775;--bad:#F09595}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.6 system-ui,"Segoe UI",sans-serif;padding:16px 20px}
h1{font-size:15px;font-weight:500;margin:0 0 4px}
.sub{font-size:12px;color:var(--dim);margin-bottom:14px}
.wrap{display:flex;gap:16px;align-items:flex-start}
.canvas{flex:1;min-width:0;border-radius:12px;overflow:hidden}
.side{width:320px;flex:0 0 320px;display:flex;flex-direction:column;gap:10px}
.card{background:var(--panel2);border-radius:10px;padding:10px 12px}
.map-stat{display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0}
.map-stat span{color:var(--dim)}
.map-event{font-size:12.5px;padding:2px 0}
.note{font-size:12px;color:var(--dim);margin-top:14px;line-height:1.7}
</style></head><body>
<h1>🗺️ 世界地图 · 脱机挂视图（预览）</h1>
<div class="sub">基于你的真实存档模拟 ${O.meta.ranHours} 游戏小时 ｜ 第 ${O.meta.day} 天 · ${O.meta.age} · 第 ${O.meta.wave} 场天灾将至 ｜ 避难所 Lv.${O.meta.house}「${O.meta.houseName}」 防御 ${O.meta.def} · 火力 ${O.meta.fire}</div>
<div class="wrap">
  <div class="canvas">${O.svg}</div>
  <div class="side">
    <div class="card">${O.stats}</div>
    <div class="card">
      <div style="font-size:12.5px;margin-bottom:6px;color:var(--dim)">最近事件（真实记录）</div>
      ${O.events}
    </div>
  </div>
</div>
<div class="note">
游戏内「🗺️ 地图」按钮打开的就是这个视图：<br>
· 三条底纹 = 安全区 / 危险区 / 死域（按地点威胁分层）<br>
· 绿/黄/红描边的点 = 已发现地点（颜色即威胁带，数字为动态威胁值）；灰色「未发现」= 本阶段可去但还没探到<br>
· 橙色圆点 = 主角当前位置（跟着日程走，位置有平滑过渡）；虚线 = 到访顺序连线<br>
· 红色虚线圈 = 下一场天灾倒计时<br>
· 右侧「离线回放」滑块可拖动回看任意时刻它跑过的地方（纯视觉，不推进游戏时间）
</div>
</body></html>`;

const out = path.join(ROOT, "预览-世界地图.html");
fs.writeFileSync(out, html, "utf8");
console.log("已生成：" + out);
console.log("存档状态：第 " + O.meta.day + " 天 · " + O.meta.age + " · 轨迹 " + O.meta.total + " 点（本次模拟 " + O.meta.ranHours + " 游戏小时）");
