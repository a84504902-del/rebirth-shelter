#!/usr/bin/env node
/**
 * tools/page-preview.js — 用真实存档生成"四页布局"静态预览
 * 用法：node tools/page-preview.js
 * 产出：预览-页面拆分.html（可直接双击打开，页签可切换；只是快照，不接存档）
 *
 * 做法：headless 跑一遍渲染函数 → 把各面板的 HTML 填回 index.html 的骨架里，
 *       再去掉所有事件属性、补一个小脚本负责页签切换。
 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.join(__dirname, "..");

/* ---------- 读真实存档（不回写） ---------- */
let saveData = null;
try{
  const db = new DatabaseSync(path.join(ROOT, "shelter.db"), { readOnly: true });
  saveData = db.prepare("SELECT data FROM save WHERE id = 1").get().data;
}catch(e){ console.log("读库失败（用新档演示）：" + e.message); }

/* ---------- headless 环境 ---------- */
/* 带「HTML 累积」的 DOM 桩：设施面板是 createElement + appendChild 拼出来的，
   所以 appendChild 要把子节点的 HTML 累进父节点的 innerHTML，快照才拿得到内容。 */
const mk = () => {
  const o = {
    style:{}, innerHTML:"", textContent:"", className:"", value:"", dataset:{}, children:[], lastChild:null,
    appendChild(c){ o.children.push(c); o.innerHTML += (c && (c.innerHTML || c.textContent || "")) || ""; o.lastChild = c; return c; },
    prepend(c){ o.innerHTML = ((c && (c.innerHTML || c.textContent || "")) || "") + o.innerHTML; return c; },
    insertBefore(c){ return o.appendChild(c); },
    removeChild(c){ o.children = o.children.filter(x => x !== c); return c; },
    remove(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
    addEventListener(){}, click(){}, focus(){}, blur(){},
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){}
  };
  return o;
};
const els = {};
const stub = { getElementById: (id) => (els[id] = els[id] || mk()), createElement: () => mk(), addEventListener(){}, querySelectorAll(){ return []; } };
global.location = { protocol:"file:", hostname:"" };
global.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
global.document = stub; global.window = stub; global.setInterval = () => {}; global.confirm = () => true;

const FILES = ["js/content/items.js","js/content/recipes.js","js/content/gear.js","js/config.js","js/content/ages.js","js/state.js","js/engine.js","js/loot.js","js/content/endless.js","js/content/map.js","js/content/maps.js","js/save.js","js/ui.js"];
const code = FILES.map(f => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/"use strict";/g, "")).join("\n");

(0, eval)(code + `
S = ${saveData ? "(" + saveData + ")" : "newState()"};
migrateSave();
invalidateUI();
/* 只渲染面板，不推进时间（纯快照）——每块单独 try，坏一块不影响其它 */
const __steps = { ageTarget:()=>renderHUD(), buildings:()=>renderBuildings(), nowPanel:()=>renderNow(),
  heroPanel:()=>renderHero(), planPanel:()=>renderPlan(), chestPanel:()=>renderChests(),
  workbenchPanel:()=>renderWorkbench(), inventoryPanel:()=>renderInventory(), historyPanel:()=>renderHistory(),
  mapInlineBg:()=>{ if(typeof updateFabSums === "function") updateFabSums(); if(typeof mapTick === "function") mapTick(); if(typeof mapBandSide === "function") mapBandSide(); } };
for(const __k in __steps){
  try{ __steps[__k](); }catch(e){ console.log("⚠️ " + __k + " 渲染失败：" + e.message); }
}
`);

/* ---------- 把骨架里的占位替换成渲染结果 ---------- */
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* 日志是本次会话的 DOM 内容（不进存档），快照里给个说明 */
els["log"] = els["log"] || mk();
els["log"].innerHTML = '<div class="logline text-dim">（预览快照：游戏日志只保留本次会话，这里为空是正常的）</div>';

const PANELS = ["ageTarget","buildings","nowPanel","heroPanel","planPanel","chestPanel","openResult",
                "log","mapInfoBody","mapChip","workbenchPanel","inventoryPanel","historyPanel","mapInlineBg",
                "fileStatus","saveHint"];
let filled = 0;
for(const id of PANELS){
  const e = els[id];
  if(!e) continue;
  const val = e.innerHTML || e.textContent || "";
  if(!val) continue;
  const re = new RegExp(`(<(?:div|span)[^>]*id="${id}"[^>]*>)([\\s\\S]*?)(</(?:div|span)>)`);
  if(re.test(html)){ html = html.replace(re, (m, a, b, c) => a + val + c); filled++; }
}

/* 顶栏数字（renderHUD 写的是 textContent） */
const HUD = ["rAge","rWood","rStone","rMetal","rFood","rWater","rDef","rAtk","rStore","rPower","rDay","rFortune","rClock","rChestPending","disName","disTimer","disBadgeTxt","woundBox","rebirthBox",
             /* v8.30 基地页浮动按钮摘要（同是 textContent） */
             "fsum-info","fsum-bld","fsum-now","fsum-hero","fsum-plan","fsum-chest","fsum-log"];
for(const id of HUD){
  const e = els[id];
  if(!e || !e.textContent) continue;
  const re = new RegExp(`(id="${id}"[^>]*>)([\\s\\S]*?)(<)`);
  if(re.test(html)) html = html.replace(re, (m, a, b, c) => a + String(e.textContent) + c);
}

/* 预览页不放游戏脚本；去掉所有事件属性，避免点了报错 */
html = html.replace(/\s(on[a-z]+)="[^"]*"/g, "");
html = html.replace(/<script src="js\/[^"]+"><\/script>\n?/g, "");

/* 加一个只负责页签切换的小脚本 */
html = html.replace("</body>", `<script>
(function(){
  function go(p){
    document.querySelectorAll("main.page").forEach(function(m){ m.className = "page" + (m.id === "page-" + p ? " on" : ""); });
    document.querySelectorAll(".pagenav .pb").forEach(function(b){ b.className = "pb" + (b.id === "pb-" + p ? " on" : ""); });
  }
  var tabs = ["base","bench","inv","history"];
  document.querySelectorAll(".pagenav .pb").forEach(function(b){
    b.addEventListener("click", function(){ go(b.id.replace("pb-","")); });
  });
  /* 主体里那些"查看全部灾史 →"之类的按钮：把 setPage 换成 go */
  document.querySelectorAll("[data-goto]").forEach(function(b){ b.addEventListener("click", function(){ go(b.getAttribute("data-goto")); }); });
  /* v8.30 基地页弹出面板：快照里全部展开，一屏看全（真实游戏里默认全收起） */
  document.querySelectorAll(".pop").forEach(function(f){ f.className = "pop on"; });
  document.querySelectorAll("button").forEach(function(b){
    if(b.textContent.indexOf("查看全部灾史") >= 0) b.addEventListener("click", function(){ go("history"); });
    if(b.textContent.indexOf("制作") >= 0 || b.textContent.indexOf("工作台") >= 0){ /* 保持原样 */ }
  });
  go("base");
})();
</script>
</body>`);

const out = path.join(ROOT, "预览-页面拆分.html");
fs.writeFileSync(out, html, "utf8");
const size = (fs.statSync(out).size / 1024).toFixed(0);
console.log("已生成 " + out + "（" + size + " KB，填了 " + filled + " 个面板）");
