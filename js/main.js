/* ============================================================
 * main.js — 启动入口与生命周期
 * 有存档 → 直接进入游戏；只有全新存档才显示开场画面
 * ============================================================ */
"use strict";

let clockStarted = false;

/** 进入游戏：关掉开场遮罩、渲染、启动时钟（重复调用安全） */
function beginGame(){
  const intro = document.getElementById("intro");
  if(intro) intro.style.display = "none";

  migrateSave();
  invalidateUI();      /* 换档/重开后强制重建面板 */
  renderAll();

  /* 如果上一世已经死了但还没重生（例如刷新了页面），把死亡报告重新摆出来 */
  if(S.lastReport && S.lastReport.rebirth === (S.rebirth || 0) + 1 && typeof showDeathBanner === "function"){
    showDeathBanner(S.lastReport);
  }

  if(!clockStarted){
    clockStarted = true;
    startClock();

    /* 页面切后台 / 关闭前立即保存（v8.8：force 落库，这两个时点绝不能丢） */
    document.addEventListener("visibilitychange", () => {
      if(document.visibilityState === "hidden"){ S.lastSave = Date.now(); save(true); }
    });
    window.addEventListener("beforeunload", () => {
      if(S && S.res){ S.lastSave = Date.now(); save(true); }
    });
  }
}

/** 开始/继续：cont=true 表示继续现有进度 */
async function startGame(cont){
  if(cont){
    log("轮回继续。上一次的记忆还残留着。","warn");
    beginGame();
    return;
  }

  /* ★ v8.47 多设备防覆盖：当前页面没加载到任何进度、而数据库里有存档时，
   * 开「新的一世」前必须二次确认——防止在别的设备/异常连接下误点，
   * 把主机数据库里几百天的进度用一局新档覆盖掉。 */
  if(SERVER_MODE && (!S || !S.res || Math.floor(S.day || 0) < 1)){
    try{
      const r = await fetch("/api/save");
      const d = await r.json();
      if(d && d.data){
        const dbS = JSON.parse(d.data);
        const days = Math.floor(dbS.day || 0) + 1;
        if(days > 1){
          const ok = confirm(`⚠️ 数据库里已有进度：第 ${days} 天（wave ${dbS.wave || 1}）。\n这很可能是你在其他设备上的存档，直接开始会用新档覆盖它（save_history 快照里仍可找回）。\n确定要放弃该进度、重新开始吗？`);
          if(!ok) return;
        }
      }
    }catch(e){
      if(!confirm("⚠️ 连不上存档服务——现在开始的新一世只存在本浏览器里，换设备会丢。\n确定继续吗？")) return;
    }
  }

  /* 全新一世 */
  const age0 = newState();
  S = age0;
  S.lastReport = null;
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}

  /* 新手大礼包 */
  for(const k in NEWBIE_GIFT.res)    S.res[k]       += NEWBIE_GIFT.res[k];
  for(const k in NEWBIE_GIFT.chests) S.chests[k]    += NEWBIE_GIFT.chests[k];
  for(const b of (NEWBIE_GIFT.bps || [])) if(!S.bp.includes(b)) S.bp.push(b);

  /* ★ 自动开箱：开局礼包里的箱子在开始时一并打开（否则会一直挂在待开里） */
  if(S.autoOpen && typeof openChest === "function"){
    for(const t of ["relic","gold","silver","bronze","wood"]){
      const n = S.chests[t] || 0;
      if(n > 0){ S.chests[t] = 0; openChest(t, n); }
    }
  }

  if(SERVER_MODE){
    serverSave(true);
    log("⚠️ 新的一世已开始，数据库里的旧存档被覆盖（shelter.db 的历史快照里还留着）。","warn");
  }
  const age = curAge();
  log(`🌍 第 ${(S.rebirth || 0) + 1} 世开始——当前阶段：${age.name}（${age.era}）`, "good");
  for(const line of age.enter) log(line);
  log(`🎁 新手大礼包：木材+${NEWBIE_GIFT.res.wood} 石料+${NEWBIE_GIFT.res.stone} 金属+${NEWBIE_GIFT.res.metal} 口粮+${NEWBIE_GIFT.res.food} 水+${NEWBIE_GIFT.res.water}，`
    + `${CHESTNAME.wood}×${NEWBIE_GIFT.chests.wood}、${CHESTNAME.bronze}×${NEWBIE_GIFT.chests.bronze}`,"good");
  if(NEWBIE_GIFT.bps && NEWBIE_GIFT.bps.length){
    log(`📜 还塞给你一张「${NEWBIE_GIFT.bps.join("、")}」——和升级要用的木板绳索。`, "good");
    log(`　└ 去「避难所设施」把📦储物箱升到 Lv.1（容量 2500 → 7000），就不怕东西放不下了。`, "good");
  }
  log(`🛡️ 新手期 ${NEWBIE_DAYS} 天：没有任何野兽和天灾，安心探索、攒物资、把家底搭起来。`);
  log(`📅 第 ${FIRST_DISASTER_DAY} 天将迎来第一场灾难（首场是「${DIS_TYPES[0].name}」），之后每 ${DIS_GAP} 天一场，每场都会提前预告类型。`);
  log("🗺️ 周边资源点要靠「探索周边」发现——排一次探索，主角就往外面走一步。");
  log("⚔️ 每个地点都有「威胁值」，战力不够的地方会被锁住（送死档根本排不进去）——不会再让主角去送死。");
  log("⭐ 当前阶段目标：渡过 3 场天灾 + 把工作台升到 Lv.2 → 进入「工业期」，解锁铁矿、铁块与青铜箱。");
  log("💀 放心挂机：你不在的时候主角不会死，最多受伤。");
  beginGame();
}

/** 手动重新开始一世（需确认，避免误触丢进度） */
function restartGame(){
  if(!confirm("确定要放弃当前进度、重新开始一世吗？\n（数据库里的历史快照仍然保留，可事后找回）")) return;
  startGame(false);
}

(async function init(){
  S = newState();

  /* 存档说明文案随模式变化 */
  const hint = document.getElementById("saveHint");
  if(hint){
    if(SERVER_MODE){
      hint.innerHTML = `存档实时写入数据库文件 <span style="color:var(--txt)">${SAVE_FILE_HINT}</span>`
        + `（刷新页面、换浏览器都不受影响，可用任何 SQLite 工具打开查看）。「导出存档」是额外备份一份 json。`;
    }else{
      hint.innerHTML = `当前没走数据库模式——请双击 <span style="color:var(--txt)">启动游戏.bat</span> 启动服务后再玩。`
        + `现在进度只会临时存在浏览器里，可以用「导出/导入存档」手动备份。`;
    }
  }

  let has = false;
  if(SERVER_MODE){
    const r = await loadFromServer();
    console.log("[存档诊断] loadFromServer →", r);
    if(r === "db"){ has = true; fileStatus("✅ 已从数据库 shelter.db 读取存档（第 " + (Math.floor(S.day)+1) + " 天）"); }
    else if(r === "local-newer"){ has = true; fileStatus("✅ 浏览器里的存档比数据库新（上次服务断线时的兜底）——已回写数据库"); }
    else if(r === "migrated"){ has = true; fileStatus("✅ 已把浏览器里的旧存档迁入数据库 shelter.db（第 " + (Math.floor(S.day)+1) + " 天）"); }
    else if(r === "empty"){
      fileStatus("数据库 shelter.db 已就绪，还没有存档——开一世新的吧");
      /* v8.47：服务通但库里没档——若你在其他设备明明有进度，多半连到了另一份 shelter.db */
      const box0 = document.querySelector("#intro .box");
      if(box0){
        const warn0 = document.createElement("p");
        warn0.style.color = "var(--warn)";
        warn0.innerHTML = `⚠️ 存档服务已连上，但数据库里<b>没有存档行</b>。如果你在其他设备上明明有进度，说明这里连接到的 shelter.db 不是同一份（服务可能从别的目录启动了）——请勿直接开新档，先回主机确认服务窗口里显示的「存档位置」。`;
        box0.appendChild(warn0);
      }
    }
    else {
      has = loadOffline();
      fileStatus("⚠️ 连不上数据库服务（" + r + "），临时用浏览器存档顶着", true);
      /* ★ v8.47 连接失败时在开场画面上显眼警告——别让用户误以为没存档就点了新的一世 */
      if(!has){
        const box = document.querySelector("#intro .box");
        if(box){
          const warn = document.createElement("p");
          warn.style.color = "var(--bad)";
          warn.innerHTML = `⚠️ <b>无法连接存档服务（${location.host || "未通过服务访问"}，${r}）</b>——数据库里可能已有其他设备的进度。<br>请勿直接开始新的一世（会覆盖数据库进度）！请刷新页面重试，或确认主机上的服务正在运行。`;
          box.appendChild(warn);
        }
      }
    }
  }else{
    has = loadOffline();
    if(has) fileStatus("已读取浏览器内的存档（第 " + (Math.floor(S.day)+1) + " 天）——双击「启动游戏.bat」可改用数据库存档");
  }

  if(has){
    /* 有存档：直接进游戏，不再显示开场画面 */
    beginGame();
    log(`🔄 页面已刷新，进度自动接上（第 ${Math.floor(S.day)+1} 天）。`,"good");
  }else{
    /* 全新存档：显示开场，由玩家点「开始新的一世」 */
    const intro = document.getElementById("intro");
    if(intro) intro.style.display = "flex";
  }
})();
