/* ============================================================
 * save.js — 存档：数据库（本地服务）/ 浏览器 / 导入导出
 * 优先写数据库 shelter.db；没有服务时退回浏览器存储
 * ============================================================ */
"use strict";

let lastServerWrite = 0;

/* ---------- v8.8 会话标识（单写者裁决的客户端侧）----------
 * sid：每个标签页一个（sessionStorage，刷新不变）；
 * SSTART：每次页面加载的时间戳——后打开/后刷新的标签页自动接管写入权。 */
let SID = "", SSTART = Date.now();
try{
  SID = sessionStorage.getItem("shelterSid") || "";
  if(!SID){ SID = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("shelterSid", SID); }
}catch(e){ SID = "s" + Math.random().toString(36).slice(2); }

/* 被 409 拒绝：游戏已在更新的标签页打开，本页停摆只读，防止继续用旧内存覆盖存档 */
let readOnlyLost = false;
function takeoverLost(){
  if(readOnlyLost) return;
  readOnlyLost = true;
  fileStatus("⚠️ 游戏已在更新的标签页中打开——本页已暂停保存。请在新标签页继续玩，或关掉它后刷新本页接管。", true);
  log("⚠️ 检测到另一个标签页正在运行游戏，本页已暂停（防止互相覆盖存档）。", "bad");
  if(typeof stopClock === "function") stopClock();
}

function fileStatus(msg, bad){
  const el = document.getElementById("fileStatus");
  if(!el) return;
  el.textContent = msg;
  el.style.color = bad ? "var(--bad)" : "var(--dim)";
}

/* ---------- 写：数据库 ---------- */
function serverSave(force){
  if(!SERVER_MODE || readOnlyLost) return;
  const now = Date.now();
  if(!force && now - lastServerWrite < 8000) return;   /* 8 秒节流 */
  lastServerWrite = now;
  S._sid = SID; S._sstart = SSTART; S.savedAt = now;   /* v8.8 会话标记 + 时间戳（读取比新用） */
  fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(S),
    keepalive: true
  })
    .then(async r => {
      if(r.status === 409){ takeoverLost(); return; }
      const d = await r.json();
      if(d.ok) fileStatus("✅ 已保存进数据库 shelter.db（第 " + (Math.floor(S.day)+1) + " 天）");
      else fileStatus("⚠️ 保存失败：" + (d.error || "未知错误"), true);
    })
    .catch(e => {
      fileStatus("⚠️ 数据库保存失败：" + e.message + "——已先写浏览器兜底（服务恢复后自动迁回）", true);
      try{ localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }catch(_){}   /* v8.8 失败兜底：别让进度只活在内存里 */
    });
}

/* ---------- 统一入口 ---------- */
function save(force){
  if(SERVER_MODE) serverSave(force === true);
  else { try{ S.savedAt = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }catch(e){} }
}

/* ---------- 读：数据库（含旧存档迁移；v8.8 与浏览器存档"比新"防回档） ---------- */
async function loadFromServer(){
  try{
    let local = null;
    try{ const raw = localStorage.getItem(SAVE_KEY); local = raw ? JSON.parse(raw) : null; }catch(e){}
    let r;
    try{
      r = await fetch("/api/save");
    }catch(netErr){
      console.error("[存档诊断] fetch /api/save 网络失败：", netErr && netErr.message);
      return "error:fetch";
    }
    console.log("[存档诊断] GET /api/save → HTTP", r.status);
    if(!r.ok) return "error:" + r.status;
    const d = await r.json();
    if(d && d.data){
      const dbS = JSON.parse(d.data);
      /* 浏览器里的档明显更新（典型：上次服务断线走了 localStorage 兜底）→ 优先用并回写数据库。
       * ★ v8.49 防回退：还要求本地进度（day）不落后于数据库——否则换设备时，
       *   本机浏览器里残留的低进度新档（比如误点出来的第 1 天）会在时间戳上"比新"，
       *   把数据库里几百天的进度顶掉。 */
      if(local && local.res && local.savedAt && (!dbS.savedAt || (local.savedAt > dbS.savedAt + 30000 && (local.day || 0) >= (dbS.day || 0)))){
        S = local;
        migrateSave(); settleOffline(); serverSave(true);
        return "local-newer";
      }
      S = dbS;
      migrateSave();
      settleOffline();
      return "db";
    }
    if(local && local.res){
      S = local;
      migrateSave();
      settleOffline();
      serverSave(true);
      return "migrated";
    }
    return "empty";
  }catch(e){
    console.error("[存档诊断] loadFromServer 异常：", e && e.message);
    return "error";
  }
}

/* ---------- 读：浏览器 ---------- */
function loadOffline(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const d = JSON.parse(raw);
    if(!d || !d.res) return false;
    S = d;
    migrateSave();
    settleOffline();
    return true;
  }catch(e){ return false; }
}

/* ---------- 导出 / 导入（备份用） ---------- */
function exportSave(){
  const blob = new Blob([JSON.stringify(S)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "重生避难所存档-第" + (Math.floor(S.day)+1) + "天-" + new Date().toISOString().slice(0,10) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
  log("📤 已导出一份存档备份（在浏览器下载文件夹里）。","good");
  fileStatus("已导出备份文件");
}

function importSave(input){
  const f = input.files && input.files[0];
  if(!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try{
      const d = JSON.parse(rd.result);
      if(!d || !d.res) throw new Error("不是有效的避难所存档");
      S = d;
      migrateSave();
      S.lastSave = Date.now();
      save();
      invalidateUI();
      renderAll();
      log(`📥 导入成功：现在是第 ${Math.floor(S.day)+1} 天。`,"good");
      fileStatus("✅ 已导入存档（第 " + (Math.floor(S.day)+1) + " 天）");
      input.value = "";
    }catch(e){
      log("导入失败：" + e.message, "bad");
      fileStatus("导入失败：" + e.message, true);
      input.value = "";
    }
  };
  rd.readAsText(f);
}
