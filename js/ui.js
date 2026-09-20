/* ============================================================
 * ui.js — 全部界面渲染与交互入口
 *
 * 重要：界面每秒会刷新一次，但下拉菜单、按钮、复选框这类交互元素
 * 如果被反复重建，用户就点不中。所以每个面板都做「签名缓存」：
 * 只有签名变化（等级/资源够不够/日程/状态）时才重建 DOM。
 * ============================================================ */
"use strict";

/* 各面板上次渲染的签名 */
let sigBld = "", sigHero = "", sigPlan = "", sigInv = "", sigBench = "", sigChest = "", sigNow = "";
/* 库存面板的视图状态（用户可选） */
let invTab = "mat";          /* mat / made / use / gear / bp / chest */
let invSort = "count";       /* count / tier */
/* v8.20 制作面板：哪些分组展开了"未解锁图纸"（默认收起；用户："找个图纸要翻很久"） */
const showLocked = {};
function toggleLocked(key){
  showLocked[key] = !showLocked[key];
  sigBench = ""; renderAll();
}
/* v8.24 工作台：搜索框 + 分组折叠（160+ 张配方，整组收起才好翻） */
let benchQuery = "";
const groupFold = {};
function toggleGroupFold(key){
  groupFold[key] = !groupFold[key];
  sigBench = ""; renderAll();
}
function setBenchQuery(v){
  benchQuery = String(v || "").trim();
  sigBench = ""; renderAll();
}
function benchFoldAll(v){
  for(const k of ["mat", "gear", "rough", "refine"]) groupFold[k] = v;
  benchQuery = "";
  const inp = document.getElementById("benchSearch");
  if(inp) inp.value = "";
  sigBench = ""; renderAll();
}
/* v8.26 槽位筛选：武器 / 护甲 / 护符（用户："护甲 护符 武器都放一起，找的不方便"） */
const SLOT_ORDER = ["weapon", "armor", "talisman"];
const SLOT_ICON = { weapon:"⚔️", armor:"🛡️", talisman:"🧿" };
let benchSlot = "all";        /* all / weapon / armor / talisman */
function setBenchSlot(s){
  benchSlot = (SLOT_ORDER.indexOf(s) >= 0) ? s : "all";
  sigBench = ""; renderAll();
}
function updateBenchBar(){
  for(const s of ["all"].concat(SLOT_ORDER)){
    const b = document.getElementById("bs-" + s);
    if(b) b.className = "mini" + (benchSlot === s ? " on" : "");
  }
}

/* ============================================================
 * v8.24 页面切换：基地 / 工作台 / 库存 / 灾史
 * 用户："把灾史和制作单独放一个页面里，图纸越来越多，拉的太长了。"
 *  —— 制作与灾史拆成独立整页（全宽），基地页只留设施/主角/日程/日志。
 * ============================================================ */
const PAGE_TITLE = { base: "🏠 基地", bench: "🛠️ 工作台", inv: "🎒 库存", history: "📜 灾史" };
let curPage = "base";
let craftableNow = 0;          /* 现在就能开工的配方数（工作台徽标用） */
try{ const _p = localStorage.getItem("shelterPage"); if(_p && PAGE_TITLE[_p]) curPage = _p; }catch(e){}

function applyPage(){
  for(const p in PAGE_TITLE){
    const el = document.getElementById("page-" + p);
    if(el) el.className = "page" + (p === curPage ? " on" : "");
    const btn = document.getElementById("pb-" + p);
    if(btn) btn.className = "pb" + (p === curPage ? " on" : "");
  }
}
function setPage(p){
  if(!PAGE_TITLE[p]) p = "base";
  if(p !== curPage){
    curPage = p;
    try{ localStorage.setItem("shelterPage", p); }catch(e){}
  }
  if(p === "history" && S && S.disUnread) S.disUnread = false;   /* 进了灾史页即视为已读 */
  applyPage();
  invalidateUI();
  renderAll();
}
/** 导航徽标：工作台显示"现在能开工几件"，灾史显示未读灾报 */
function updatePageNav(){
  const b = document.getElementById("pbBenchN");
  if(b){ b.textContent = craftableNow > 0 ? ("可开工 " + craftableNow) : ""; b.style.display = craftableNow > 0 ? "" : "none"; }
  const hb = document.getElementById("pbHistoryN");
  if(hb){
    const L = (typeof S !== "undefined" && S && S.disLog) ? S.disLog : [];
    const unread = !!(typeof S !== "undefined" && S && S.disUnread && L.length);
    hb.textContent = unread ? "新灾报" : "";
    hb.className = "pbadge" + (unread ? " warn" : "");
    hb.style.display = unread ? "" : "none";
  }
  if(typeof updateBenchBar === "function") updateBenchBar();   /* v8.26 槽位筛选按钮高亮 */
}

/* ============================================================
 * v8.30 基地页：地图铺满全屏背景，细节面板缩成右下角浮动按钮
 *   用户："把地图作为背景，然后把其他能缩小成按钮的都缩小成按钮。"
 *   —— 地图 position:fixed 铺满视口（永远在最后面）；设施/进行中/主角/日程/箱子/日志/
 *      地图信息 各是一个右下角浮动按钮（FAB），点开浮在地图上的弹出面板。
 *      收起时按钮上仍有一行实时摘要（同 v8.29），展开状态存 localStorage。
 * ============================================================ */
const POP_KEYS = ["info", "bld", "now", "hero", "plan", "chest", "log"];
const popOpen = {};
for(const _pk of POP_KEYS) popOpen[_pk] = false;
try{
  const _raw = localStorage.getItem("shelterPops");
  if(_raw){ const o = JSON.parse(_raw) || {}; for(const k of POP_KEYS) if(k in o) popOpen[k] = !!o[k]; }
}catch(e){}

function isPopOpen(k){ return !!popOpen[k]; }
/** 面板打开时隐藏 mapchip（避免左上信息条和面板叠压）；面板全关时恢复 */
function syncMapChip(){
  const open = Object.values(popOpen).some(v => v);
  const el = document.getElementById("mapChip");
  if(el) el.style.display = open ? "none" : "";
}
function applyPop(){
  for(const k of POP_KEYS){
    const pop = document.getElementById("pop-" + k);
    if(pop) pop.className = "pop" + (popOpen[k] ? " on" : "");
    const fab = document.getElementById("fab-" + k);
    if(fab){
      fab.className = "fab" + (popOpen[k] ? " on" : "");
      if(fab.setAttribute) fab.setAttribute("aria-expanded", popOpen[k] ? "true" : "false");
    }
  }
  syncMapChip();
  applyPopSize();   /* 根据当前视口 / header 高度重新算面板尺寸 */
}
/** 把面板位置对齐「中间地图区」边界，避免小窗口下堆叠溢出 */
function applyPopSize(){
  try{
    /* mapMain 高度由 CSS flex:1 自动计算，JS 仅作兜底（极端浏览器兼容） */
    const mainEl = document.getElementById("mapMain");
    if(mainEl){
      const rect = mainEl.getBoundingClientRect();
      if(rect.height < 260){
        /* 仅在 flex 计算失效时回退到手动设定 */
        const fabEl = document.getElementById("fabDock");
        const fabH  = fabEl ? fabEl.getBoundingClientRect().height : 0;
        const availH = Math.max(260, window.innerHeight - fabH - 90);
        mainEl.style.height = Math.round(availH) + "px";
      }else{
        mainEl.style.height = "";
      }
    }
    /* 弹出面板：top 在 fabDock 底部，bottom 距 savebar 顶部 28px */
    const fabEl = document.getElementById("fabDock");
    const fabH  = fabEl ? fabEl.getBoundingClientRect().height + 4 : 44;
    for(const k of POP_KEYS){
      const pop = document.getElementById("pop-" + k);
      if(!pop || !pop.classList.contains("on")) continue;
      pop.style.top     = fabH + "px";
      pop.style.bottom  = "28px";
      pop.style.height  = "auto";
    }
  }catch(e){}
}
function savePop(){
  try{ localStorage.setItem("shelterPops", JSON.stringify(popOpen)); }catch(e){}
}
function togglePop(k){
  if(POP_KEYS.indexOf(k) < 0) return;
  popOpen[k] = !popOpen[k];
  savePop();
  applyPop();
  /* 展开时补画一次（面板可能因签名缓存而搁着没更新），避免出现空面板 */
  if(popOpen[k]){ invalidateUI(); renderAll(); }
}
function closeAllPops(){
  for(const k of POP_KEYS) popOpen[k] = false;
  savePop(); applyPop();
}
function setFabSum(k, txt){
  const el = document.getElementById("fsum-" + k);
  if(el && el.textContent !== txt) el.textContent = txt;
}

/** 浮动按钮上的一行实时摘要（随 HUD 每秒刷新；纯读取，不推进任何数值） */
function updateFabSums(){
  /* 📊 地图：当前位置（一眼知道主角在哪） */
  try{ setFabSum("info", mapNowText()); }catch(e){}

  /* 🏭 设施：已建 N 项 / 有几项现在就能升 */
  try{
    let built = 0, up = 0, total = 0;
    for(const b of (typeof BLDCFG !== "undefined" ? BLDCFG : [])){
      total++;
      const l = lv(b.id);
      if(l > 0) built++;
      if(l < b.max && canPay(cost(b.id))) up++;
    }
    setFabSum("bld", `已建 ${built}/${total} 项${up ? " · " + up + " 项可升级" : ""}`);
  }catch(e){}

  /* ⏳ 进行中：现在在干嘛 + 游戏钟 + 几条制作线在跑 */
  try{
    const hod = (S.day * 24) % 24, seg = segOf(hod), act = actOf(seg);
    const what = !isWorkSeg(seg) ? "😴 睡觉回体力"
      : act === "workbench" ? "🛠️ 留守制作"
      : act === "explore" ? "🗺️ 探索周边"
      : planLabel(act);
    let t = `${segName(seg)} · ${what} · 🕐 ${clockText(hod)}`;
    const n = (S.crafts || []).length;
    if(n) t += ` · 🛠️ 制作线 ${n} 条`;
    setFabSum("now", t);
  }catch(e){}

  /* 🧍 主角：状态 / 体力 / 战力防御 */
  try{
    const wi = woundInfo();
    const st = isDying() ? "💀 濒死"
      : woundIdx() > 0 ? wi.icon + " " + wi.name
      : S.hungry ? "⚠️ 虚弱" : "✅ 健康";
    setFabSum("hero", `${st} · 体力 ${Math.round(S.stam)} · 战力 ${atk()} / 防御 ${def()}`);
  }catch(e){}

  /* 📅 日程：上午 / 下午 / 夜里 */
  try{
    const p = S.plan || {};
    const cn = { am:"上午", pm:"下午", night:"夜里" };
    setFabSum("plan", ["am", "pm", "night"].map(k => cn[k] + " " + planLabel(p[k] || "rest")).join(" · "));
  }catch(e){}

  /* 📦 物资箱：各档数量（没有就写"暂无"） */
  try{
    const order = ["wood", "bronze", "silver", "gold", "relic"];
    const parts = order.filter(t => (S.chests[t] || 0) > 0).map(t => `${CHESTNAME[t]} ${S.chests[t]}`);
    setFabSum("chest", parts.length ? parts.join(" · ") : "暂无箱子");
  }catch(e){}
  /* 📜 日志摘要由 state.js 的 log() 直接写（最近一条） */
}

/** 强制下次刷新时重建全部面板（换存档、重开、阶段推进时调用） */
function invalidateUI(){
  sigBld = sigHero = sigPlan = sigInv = sigBench = sigChest = sigNow = "";
  sigHis = "";
}

function bar(cur, color){
  const w = Math.max(0, Math.min(100, cur));
  const c = w < 15 ? "var(--bad)" : color;
  return `<div class="bar"><i style="width:${w}%;background:${c}"></i></div>`;
}
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])); }

/* ============================================================
 * 全屏横幅：阶段推进 / 死亡报告
 * ============================================================ */
function showBanner(title, lines, btnText, btnFn, kind){
  const el = document.getElementById("banner");
  if(!el) return;
  const t = document.getElementById("bannerTitle");
  const b = document.getElementById("bannerBody");
  const btn = document.getElementById("bannerBtn");
  if(t){ t.textContent = title; t.className = kind || ""; }
  if(b) b.innerHTML = lines.map(x => `<p>${esc(x)}</p>`).join("");
  if(btn){ btn.textContent = btnText; btn.onclick = btnFn; }
  el.classList.remove("hidden");
  el.style.display = "flex";
}
function hideBanner(){
  const el = document.getElementById("banner");
  if(el){ el.classList.add("hidden"); el.style.display = "none"; }
}
function showAgeBanner(age){
  showBanner(`阶段推进 · ${age.name}`, age.enter.concat(["", "解锁： " + age.unlock.join("　/　")]), "继续", hideBanner, "age");
}
function showDeathBanner(report){
  const lines = [
    `第 ${report.day} 天，${report.age}。`,
    `死因：${report.cause}`,
    "",
    `这一世你开过 ${report.chests} 个箱子，探过 ${report.places.length} 个地方，留下 ${report.bps} 张图纸。`,
    `走过的路：${report.places.join("、") || "（还没走出多远）"}`,
    "",
    "但记忆还在。图纸不会忘，避难所的废墟也还在原地。",
    `这是第 ${report.rebirth} 世——重新开始，这一次你会更快。`
  ];
  showBanner("你死了", lines, "🌅 重生", () => doRebirth(), "death");
}

/** 灾报横幅（v7.16）：天灾结算后的全屏公告
 *  v8.12：显示战力出击的削弱量（战力终于和天灾挂钩） */
function showDisBanner(r){
  const cut = r.atkCut ? `（战力出击削弱 ${r.atkCut}：原始强度 ${r.rawNeed} → ${r.need}）` : "";
  const cutLine = r.atkCut
    ? `⚔️ 战力 ${atk()} ＋ 火力 ${fire()} 出击（总攻 ${homeAttack()}），削掉 ${r.atkCut} 点灾势${r.atkCut >= Math.round((r.rawNeed || 0) * 0.5) ? "（已达上限：最多砍一半）" : ""}——升材质档、加火力塔、换更好的武器都能削更多。`
    : `⚔️ 战力 ${atk()} ＋ 火力 ${fire()} 没能削弱灾势——换更好的武器、建火力塔、升级材质档都可以提升。`;
  const lines = r.win ? [
    `${r.day} 天，${r.name}过去了。`,
    `防御 ${r.have} ≥ 强度 ${r.need}${cut}${r.mitigated ? "（抗性装备立功了）" : ""}——避难所扛住了。`,
    cutLine,
    "",
    `灾后清点：${r.rewards}。`,
    `下一场：${S.nextDisType}，预计第 ${Math.ceil(S.nextDis)} 天。趁现在补防御、囤物资。`
  ] : [
    `${r.day} 天，${r.name}冲开了避难所。`,
    `防御 ${r.have} < 强度 ${r.need}${cut}——没扛住。`,
    cutLine,
    "",
    `物资损失 ${r.lossPct}%` +
      (r.houseDown ? `，避难所跌回了「${r.houseDown.name}」` : "") +
      (r.wounded ? "，主角也受了伤" : "") + "。",
    `下一场：${S.nextDisType}，预计第 ${Math.ceil(S.nextDis)} 天。把防御补上，别再输了。`
  ];
  showBanner(`🌪️ 第 ${r.wave} 场天灾 · ${r.name}`, lines, "知道了", hideBanner, r.win ? "age" : "death");
}

/** 查看离线期间产生的灾报（顶栏提示按钮） */
function readDisReport(){
  S.disUnread = false;
  const last = (S.disLog || [])[(S.disLog || []).length - 1];
  if(last) showDisBanner(last);
  invalidateUI(); renderAll();
}

/* 小浮层提示（越级图纸等大发现） */
let toastTimer = null;
function showToast(title, body){
  const el = document.getElementById("toast");
  if(!el) return;
  el.innerHTML = `<div class="toast-t">✦ ${esc(title)}</div><div class="toast-b">${esc(body || "")}</div>`;
  el.classList.remove("hidden");
  el.style.display = "block";
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add("hidden"); el.style.display = "none"; }, 6000);
}
function showBigFind(name, mystery){  showToast("越级图纸 · " + name, (mystery || "") + "　（现在做不了，但记住它）");
}

/* ============================================================
 * ⏳ 当前进行中（挂机游戏的"存在感"面板）
 * 一眼看到：现在在干什么、干了多少、还剩多久、这趟能得到什么
 * ============================================================ */
function renderNow(){
  const el = document.getElementById("nowPanel");
  if(!el) return;

  const hod = (S.day * 24) % 24;
  const seg = segOf(hod);
  const segStart = seg === "am" ? 6 : seg === "pm" ? 12 : (hod < 6 ? 0 : 18);
  const left = Math.max(0, segStart + 6 - hod);
  const segPct = Math.max(0, Math.min(100, Math.round((hod - segStart) / 6 * 100)));
  const act = actOf(seg);
  const working = isWorkSeg(seg);
  const lines = (S.crafts || []).map(c => ({ c, rec: recipeById(c.id) })).filter(x => x.rec);
  const craftSig = lines.map(x => x.c.id + ":" + (x.c.qty || 1) + ":" + Math.round(x.c.prog / x.rec.hours * 100)).join(",");

  const gather = Object.entries(segYield || {}).filter(([, v]) => v >= 1)
    .map(([k, v]) => `${itemIcon(k)}${itemName(k)} ×${Math.floor(v)}`).join("　");

  /* 签名：分钟级精度（每游戏分钟重绘一次，时钟才会走） */
  const sig = [seg, act, working ? 1 : 0, clockText(hod), segPct,
               craftSig, S.crafts.length, gather].join("|");
  if(sig === sigNow) return;
  sigNow = sig;

  const segNameTxt = seg === "am" ? "上午" : seg === "pm" ? "下午" : "夜间";

  /* 标题：现在在干什么 */
  let head;
  if(!working){
    head = `${segNameTxt} · 😴 睡觉回体力`;
  }else if(act === "workbench"){
    head = `${segNameTxt} · 🛠️ 留守制作（加速 ×${CRAFT_FOCUS_MUL}）`;
  }else if(act === "explore"){
    head = `${segNameTxt} · 🗺️ 探索周边`;
  }else if(act === "rest"){
    head = `${segNameTxt} · 😴 休息`;
  }else{
    const sp = SPOTS[act];
    head = `${segNameTxt} · ${sp ? sp.icon + " " + sp.name : "休息"}`;
  }

  const segEnd = (segStart + 6) % 24;
  const leftTxt = hourText(left);
  const endReal = realText(left);
  let h = `<div class="nowhead">
      <span>${esc(head)}</span>
      <b>🕐 ${clockText(hod)}</b>
    </div>`;
  h += `<div class="nowbar"><i style="width:${segPct}%"></i></div>
        <div class="nowmeta">
          <span class="text-dim">${segNameTxt} ${clockText(segStart)} — ${clockText(segEnd)}　已过 ${segPct}%</span>
          <span class="text-dim">还剩 ${leftTxt}（现实约 ${endReal}）</span>
        </div>`;

  /* 制作线（与外出并行的第二条轨道，可能同时有多条） */
  if(lines.length){
    const rate = (working && act === "workbench") ? CRAFT_FOCUS_MUL : CRAFT_IDLE_RATE;
    const rateTxt = (working && act === "workbench") ? "留守加速 ×" + CRAFT_FOCUS_MUL : "出门也照做 ×1";
    h += `<div class="nowsub"><span>🛠️ 制作线 ${lines.length}/${craftSlotMax()}（${rateTxt}）</span></div>`;
    for(const { c, rec } of lines){
      const q = c.qty || 1;
      const pct = Math.min(100, Math.round(c.prog / rec.hours * 100));
      const remainH = Math.max(0, (rec.hours - c.prog) / rate);
      const outTxt = rec.kind === "gear"
        ? rec.name
        : Object.entries(rec.out).map(([k, v]) => `${itemIcon(k)}${itemName(k)}×${v}`).join(" ");
      h += `<div class="nowsub" style="margin-top:4px">
        <span>${rec.icon} ${rec.name}${q > 1 ? ` ×${q}` : ""}　<b>${pct}%</b></span>
        <span class="text-dim">还需 ${hourText(remainH)}（现实约 ${realText(remainH)}）</span>
      </div>
      <div class="nowbar small"><i style="width:${pct}%"></i></div>
      <div class="nowmeta"><span class="text-dim">得：${outTxt}${q > 1 ? `（还剩 ${q} 份）` : ""}</span></div>`;
    }
  }else if(working && act === "workbench"){
    h += `<div class="nowsub text-bad">没有在做的东西 —— 去右栏「🛠️ 制作」面板点「开工」（开工后出门也照做）</div>`;
  }

  /* 本时段收获 */
  if(working && gather) h += `<div class="nowgain">本时段已收获　${gather}</div>`;
  else if(working)      h += `<div class="nowgain text-dim">本时段还在进行中……</div>`;

  el.innerHTML = h;
}

/* ============================================================
 * 设施列表
 * ============================================================ */
/** v8.21：按当前日程估算"这批材料大约还要攒几天"（用户："这种花费普通材料多少年能攒够啊"）。
 *  区域采集为主（每段 6 游戏小时 × 挖矿倍率），制作线按半数槽位投入补算；
 *  返回 { days, notScheduled:[{k,at}], noSource:[k] } —— 只求量级感，不做精确预测。 */
function affordEstimate(c){
  const planIds = [S.plan.am, S.plan.pm, S.plan.night].filter(id => id && SPOTS[id]);
  let worst = 0;
  const notScheduled = [], noSource = [];
  for(const k in c){
    const need = c[k] - Math.floor(S.res[k] || 0);
    if(need <= 0) continue;
    let perDay = 0;
    for(const id of planIds){
      const sp = SPOTS[id];
      if(sp && sp.y && sp.y[k]) perDay += sp.y[k] * ((typeof spotYieldMul === "function") ? spotYieldMul(sp) : 1) * 6;
    }
    /* 采集排班没覆盖 → 用制作线兜（半数槽位投入估算） */
    if(perDay <= 0 && (typeof RECIPES !== "undefined")){
      const rec = RECIPES.find(r => r.out && r.out[k]);
      if(rec && (S.bld.bench || 0) > 0){
        /* v8.25 用统一的速度函数（含材质档倍率），别再自己算一遍 */
        const spd = (typeof craftSpeed === "function") ? craftSpeed(rec) : 1;
        perDay += (rec.out[k] || 0) * (24 / rec.hours) * spd * Math.max(1, Math.floor(craftSlotMax() / 2));
      }
    }
    /* 已发现的产地：若当前日程没排到"最好的那个点"，提示换点（通常能快几十倍） */
    const src = (S.found || []).filter(id => SPOTS[id] && SPOTS[id].y && SPOTS[id].y[k]);
    if(src.length){
      let bestRate = 0, bestId = null;
      for(const id of src){
        const r = SPOTS[id].y[k] * ((typeof spotYieldMul === "function") ? spotYieldMul(SPOTS[id]) : 1) * 6;
        if(r > bestRate){ bestRate = r; bestId = id; }
      }
      const onPlan = planIds.some(id => SPOTS[id] && SPOTS[id].y && SPOTS[id].y[k]);
      if(!onPlan) notScheduled.push({ k, at: SPOTS[bestId].name, gain: bestRate });
    }else if(perDay <= 0){
      noSource.push(k);
    }
    if(perDay <= 0) continue;
    worst = Math.max(worst, need / perDay);
  }
  return { days: worst, notScheduled, noSource };
}
function renderBuildings(){
  const el = document.getElementById("buildings");
  if(!el) return;

  const rows = BLDCFG.map(b => {
    /* v8.9 reqPerLv：按当前等级取该档的避难所门槛（如装备加工台 Lv.2 需钛合金堡垒） */
    /* v8.23 储物箱特例：档位跟"材质档"走（升到 lv+1 需 house ≥ lv+3），不再跟阶段——
     *  容量增速必须与产量增速（×2/材质档）同步，否则 house 一高产量 ×2048、容量还停在 ×4，采半天就爆仓。 */
    const reqNeed = (b.id === "storage")
      ? (lv("storage") + 1 <= 5 ? 0 : lv("storage") + 3)      /* v8.23：lv1~5 是原始档位，不受材质档限制 */
      : ((b.reqPerLv && b.reqPerLv[Math.min(lv(b.id), b.reqPerLv.length - 1)]) || b.req);
    const locked = reqNeed && lv("house") < reqNeed;
    const c = cost(b.id);
    /* 需要图纸的设施（储物箱）：v8.2 起持有"目标档或更高档"图纸即可（跳档凭证） */
    const bp = (b.needBp && lv(b.id) < b.max) ? b.needBp(lv(b.id)) : null;
    let bpOk = !bp || (S.bp || []).includes(bp);
    if(b.id === "storage" && lv(b.id) < b.max) bpOk = storageBpOk(lv(b.id) + 1);
    return { b, locked, reqNeed, c, bp, bpOk, ok: !locked && canPay(c) && lv(b.id) < b.max && bpOk };
  });
  const sig = rows.map(r => `${lv(r.b.id)}${r.ok ? 1 : 0}${r.locked ? 1 : 0}${r.bpOk ? 1 : 0}${r.bp || ""}`).join("|")
    + "|" + Math.floor(storageUsed()) + "|" + storageCapNow();
  if(sig === sigBld) return;
  sigBld = sig;

  el.innerHTML = "";
  for(const r of rows){
    const { b, locked, reqNeed, c, ok, bp, bpOk } = r;
    /* v8.7c 缺料明示：不够的材料标红，按钮直接写缺什么缺多少——不再让玩家猜"材料不足"差在哪 */
    const lacks = Object.entries(c).filter(([k, v]) => (S.res[k] || 0) < v);
    /* v8.8c 升级花费显示材料全名——纯图标（🔩）曾让用户把"钢"误认成"铁块"，往返猜谜 */
    const costStr = Object.entries(c)
      .map(([k, v]) => `<span class="c-${k}${(S.res[k] || 0) < v ? " danger" : ""}" title="${itemName(k)}：有 ${Math.floor(S.res[k] || 0)} / 需 ${v}">${itemName(k)}×${v}</span>`).join("　");
    /* v8.21：把"还要攒多久 / 该去哪采"直接写出来（未满级才算） */
    const est = lv(b.id) < b.max ? affordEstimate(c) : { days: 0, notScheduled: [], noSource: [] };
    let estTip = "";
    if(est.days > 0){
      const d = est.days < 1 ? "不到 1" : Math.ceil(est.days);
      estTip += est.days > 30
        ? `　<span class="text-bad">⚠️ 按当前日程约 ${d} 天——换个产地点会快得多</span>`
        : `　<span class="text-dim">按当前日程 ≈ ${d} 天</span>`;
    }
    if(est.notScheduled.length) estTip += `　<span class="text-dim">（${est.notScheduled.slice(0, 3).map(x => `${itemName(x.k)} 排班去「${x.at}」采`).join("、")}）</span>`;
    if(est.noSource.length) estTip += `　<span class="text-bad">⚠️ ${est.noSource.map(itemName).join("、")} 暂无产地（需新区域或制作线）</span>`;

    let btnTxt = "升级";
    if(locked) btnTxt = "🔒 需" + houseTier(reqNeed).name;
    else if(lv(b.id) >= b.max) btnTxt = "已满级";
    else if(!bpOk) btnTxt = "🔒 缺图纸";
    /* v8.8 缺料明示必须在 house/power 文案之前——否则避难所按钮永远显示"升为「XX」"，缺料原因被藏住 */
    else if(!canPay(c)) btnTxt = "缺 " + lacks.map(([k, v]) => `${itemName(k)}×${Math.ceil(v - (S.res[k] || 0))}`).join(" ");
    else if(b.house) btnTxt = "升为「" + houseTier(lv(b.id) + 1).name + "」";   /* v8.15 公式兜底（彩蛋可顶出预生成档位） */
    else if(b.power) btnTxt = lv(b.id) === 0 ? "建造「柴油发电机」" : "升为「" + POWER_TIERS[lv(b.id) + 1].name + "」";

    const div = document.createElement("div");
    div.className = "bld" + (locked ? " locked" : "");
    const title = b.house
      ? `${houseTier(lv(b.id)).icon} <b>${houseTier(lv(b.id)).name}</b> <span class="lv">避难所 ${lv(b.id)}/${b.max}</span>`
      : b.power && lv(b.id) > 0
      ? `${powerTier(lv(b.id)).icon} <b>${b.name}·${powerTier(lv(b.id)).name}</b> <span class="lv">Lv.${lv(b.id)}/${b.max}</span>`
      : `${b.icon} ${b.name} <span class="lv">Lv.${lv(b.id)}/${b.max}</span>`;
    div.innerHTML = `
      <div class="row1">
        <span class="name">${title}</span>
        <button data-b="${b.id}" ${ok ? "" : "disabled"}>${btnTxt}</button>
      </div>
      <div class="eff">${b.eff(Math.max(1, lv(b.id)))}</div>
      <div class="eff">升级花费：${costStr}${bp ? `　+　📜 ${bp}${bpOk ? "" : "（没找到）"}` : ""}${estTip}</div>`;
    el.appendChild(div);
  }

  el.querySelectorAll("button[data-b]").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.b, c = cost(id);
      const b = BLDCFG.find(x => x.id === id);
      if(b.needBp){
        const bp = b.needBp(lv(id));
        const ok = (id === "storage") ? storageBpOk(lv(id) + 1) : !bp || (S.bp || []).includes(bp);
        if(!ok){ log(`🔒 ${b.name}升级需要「${bp}」——从箱子里找。`, "bad"); return; }
      }
      /* v8.23 储物箱：材质档门槛（容量与产量同步） */
      if(id === "storage" && lv("storage") + 1 > 5){
        const needH = lv("storage") + 3;
        if(lv("house") < needH){
          log(`🔒 储物箱升到「${storageTier(lv("storage") + 1).name}」需要材质档 ${needH}（现在是 ${lv("house")}「${houseTier(lv("house")).name}」）——先把避难所升上去。`, "bad");
          return;
        }
      }
      if(!canPay(c)) return;
      pay(c);
      S.bld[id] = lv(id) + 1;
      if(id === "house"){
        const t = houseTier(lv(id));
        log(`${t.icon} 避难所升级为「${t.name}」！${t.note}`, "good");
      }else{
        log(`${b.icon} ${b.name} 升到 Lv.${lv(id)}`, "good");
      }
      if(id === "storage") log(`　└ 仓储容量提升到 ${storageCap(lv(id))}。`, "good");
      invalidateUI();
      renderAll();
    };
  });
}

/* ============================================================
 * 主角面板（状态 / 伤势 / 装备）
 * ============================================================ */
function renderHero(){
  const hp = document.getElementById("heroPanel");
  if(!hp) return;

  const seg = segOf((S.day * 24) % 24);
  const cur = actOf(seg);

  const sig = [
    Math.round(S.stam), Math.round(S.sate), Math.round(S.hydro),
    Math.floor(S.res.food), Math.floor(S.res.water), Math.floor(S.res.medkit || 0),
    S.autoEat ? 1 : 0, S.wound, Math.ceil(S.dyingH || 0), S.hungry ? 1 : 0,
    seg, cur, atk(), def(), inNewbie() ? 1 : 0, S.aggressive ? 1 : 0,
    hasTag("ranged") ? 1 : 0, bagLevel(),
    (S.disLog || []).length,
    S.gear.filter(g => g.on).map(g => `${g.slot}${g.val}${g.rar}${g.tag || ""}`).join(",")
  ].join("|");
  if(sig === sigHero) return;
  sigHero = sig;

  const eq = S.gear.filter(x => x.on);
  const wi = woundInfo();
  const status = inNewbie()
    ? `<span class="text-ok">新手期（安全，无野兽）</span>`
    : woundIdx() > 0
      ? `<span class="text-bad">${wi.icon} ${wi.name}（效率 ${Math.round(woundMul() * 100)}%）</span>`
      : S.hungry ? '<span class="text-bad">虚弱（快饿垮了）</span>'
      : '<span class="text-ok">健康</span>';

  const dyingWarn = isDying()
    ? `<div class="dying">💀 濒死倒计时：约 ${Math.ceil(S.dyingH)} 小时
        <div class="text-dim" style="font-size:11px">立刻用绷带，或把日程改成「😴 休息」。离开游戏期间不会死亡。</div></div>`
    : "";

  hp.innerHTML = `
    <div class="statrow"><span>状态</span><b>${status}</b></div>
    ${dyingWarn}
    <div class="statrow"><span>现在</span><b style="font-weight:400" class="text-dim">${segName(seg)} ｜ 当前 ${planLabel(cur)}</b></div>
    <div class="statrow"><span>体力 ${Math.round(S.stam)}/100</span></div>
    ${bar(S.stam, "#c9a227")}
    ${woundIdx() > 0 ? `
    <div class="statrow" style="margin-top:4px"><span>伤势：${wi.icon} ${wi.name}</span>
      <button class="mini" onclick="useMedkit()">用绷带（剩 ${Math.floor(S.res.medkit || 0)}）</button></div>` : ""}
    <div class="statrow" style="margin-top:4px">
      <span>饱食度 ${Math.round(S.sate)}/100 <span class="text-dim">（-${SATE_DECAY}/天）</span></span>
      <button class="mini" onclick="eatFood(true)">吃饭</button>
    </div>
    ${bar(S.sate, "var(--food)")}
    <div class="statrow" style="margin-top:4px">
      <span>水分 ${Math.round(S.hydro)}/100 <span class="text-dim">（-${HYDRO_DECAY}/天）</span></span>
      <button class="mini" onclick="drinkWater(true)">喝水</button>
    </div>
    ${bar(S.hydro, "var(--water)")}
    <div class="statrow" style="margin-top:4px">
      <span>储备：粮 ${Math.floor(S.res.food)} / 水 ${Math.floor(S.res.water)}</span>
      <label class="text-dim" style="font-size:11px;cursor:pointer">
        <input type="checkbox" ${S.autoEat ? "checked" : ""} onchange="S.autoEat=this.checked;invalidateUI();renderAll()"> 自动进食
      </label>
    </div>
    <div class="statrow"><span>战力 ${atk()} ｜ 防御 ${def()} ｜ 建筑火力 ${fire()}</span></div>
    <div class="statrow text-dim" style="font-size:11px">
      <span>⚔️ 守家总攻 = 战力 ${atk()} ＋ 火力（材质档 ${houseFire(lv("house"))} ＋ 火力塔 ${lv("turret") * 45}）= <b>${homeAttack()}</b>　→　天灾来袭可削 <b class="text-ok">${Math.round(homeAttack() * ATK_DIS_CUT)}</b> 点强度（上限砍一半）</span>
    </div>
    ${hasTag("ranged") ? `<div class="text-ok" style="font-size:11px">🏹 远程压制：威胁判定时视为战力 +${Math.round((RANGED_TIER_BONUS - 1) * 100)}%</div>` : ""}
    ${(() => {   /* v8.19 战力引导：把"现在就能提升多少"直接说出来 */
      const tips = [];
      const curW = equipped("weapon");
      const bagBest = bestInBag("weapon");
      const bagGain = bagBest && bagBest !== curW ? bagBest.val - (curW ? curW.val : 0) : 0;
      if(bagGain > 0) tips.push(`🎒 背包里有更强的武器 <b>${esc(bagBest.name)}</b>（战力 +${bagGain}）——去「背包 → 装备」换上`);
      const craft = bestCraftableWeapon();
      const craftGain = craft ? craft.val - (curW ? curW.val : 0) : 0;
      if(craftGain > 0) tips.push(`🛠️ 可制造更强的武器 <b>${esc(craft.rec.name)}</b>（战力 +${craftGain}）——去「制作 → 装备制造」开工`);
      if(!tips.length) return "";
      return `<div class="statrow text-ok" style="font-size:11px"><span>⚔️ 战力可提升：${tips.join("；")}</span></div>`;
    })()}
    <div class="statrow"><span>背包：🎒 ${bagCfg().name}（一次带回 ${bagCfg().carry[0]}~${bagCfg().carry[1]} 箱）</span>${bagNextCfg() ? `<button class="mini" onclick="upgradeBag()">升级</button>` : ""}</div>
    <div class="statrow"><span>⚠️ 激进模式</span>
      <label class="text-dim" style="font-size:11px;cursor:pointer">
        <input type="checkbox" ${S.aggressive ? "checked" : ""} onchange="toggleAggressive(this.checked)"> 允许前往 ⛔ 地点
      </label>
    </div>
    ${S.aggressive ? '<div class="text-bad" style="font-size:11px">已开启：主角会去威胁过高的地方，产出 +50%，但**可能死**（离线仍免死）</div>' : ""}
    <div style="margin-top:6px">${
      eq.length
        ? eq.map(x => `<div class="eqline">[${SLOTNAME[x.slot]}] <span class="r${x.rar}">${x.name}</span> ${
            x.slot === "weapon" ? "战力+" + x.val : x.slot === "armor" ? "防御+" + x.val : "搜集效率+" + x.val + "%"}`
            + gearTagsText(x) + `</div>`).join("")
        : '<div class="eqline text-dim">两手空空，开箱子找点装备吧</div>'
    }</div>
    ${(() => {
      /* v8.24 灾史已拆到独立页：这里只留一行摘要 + 入口（原来把它们全铺在主角面板里，
         加上制作面板一起把主页面拉得很长）。 */
      const L = S.disLog || [];
      if(!L.length) return "";
      const last = L[L.length - 1];
      const win = L.filter(r => r.win).length;
      return `<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:6px">
      <div class="statrow"><span>📜 灾史</span><span class="text-dim">已历 ${L.length} 场 · 守住 ${win} · 失守 ${L.length - win}</span></div>
      <div class="eqline" style="line-height:1.5">
        <span class="${last.win ? "text-ok" : "text-bad"}">${last.win ? "✅" : "❌"}</span>
        最近：第 ${last.wave} 场 · ${esc(last.name)}${last.day ? `（第 ${last.day} 天）` : ""}
        <span class="text-dim" style="font-size:11px">${last.legacy ? "改版前渡过，明细未记录" : "防御 " + last.have + " vs 强度 " + last.need}</span>
      </div>
      <div style="margin-top:4px"><button class="mini" onclick="setPage('history')">查看全部灾史 →</button></div>
    </div>`;
    })()}`;
}

/* ============================================================
 * 库存面板（可查看 / 整理）
 * ============================================================ */
function setInvTab(t){ invTab = t; invalidateUI(); renderAll(); }
function setInvSort(s){ invSort = s; invalidateUI(); renderAll(); }

/** 分批丢弃：n 可以是数字 / "half" / "all" */
function discardItem(k, n){
  const have = Math.floor(S.res[k] || 0);
  if(have <= 0) return;
  let amount;
  if(n === "all")       amount = have;
  else if(n === "half") amount = Math.ceil(have / 2);
  else                  amount = Math.min(have, Math.max(1, Math.floor(Number(n) || 1)));

  if(amount >= have && !confirm(`把 ${have} 份「${itemName(k)}」全部丢弃？`)) return;

  S.res[k] = Math.max(0, (S.res[k] || 0) - amount);
  const left = Math.floor(S.res[k]);
  log(`🗑️ 丢弃了 ${amount} 份${itemName(k)}${left ? `（剩 ${left}）` : "（已清空）"}`);
  invalidateUI();
  renderAll();
}

/** 生成一排分批丢弃按钮 */
function discardBtns(k, v){
  let b = `<button class="mini" onclick="discardItem('${k}',1)" title="丢掉 1 份">−1</button>`;
  if(v >= 5)  b += `<button class="mini" onclick="discardItem('${k}',10)" title="丢掉 10 份">−10</button>`;
  if(v >= 4)  b += `<button class="mini" onclick="discardItem('${k}','half')" title="丢掉一半">½</button>`;
  b += `<button class="mini danger" onclick="discardItem('${k}','all')" title="全部丢掉">全</button>`;
  return b;
}

function renderInventory(){
  const el = document.getElementById("inventoryPanel");
  if(!el) return;

  const used = storageUsed(), cap = storageCapNow();
  const over = used > cap;
  const sig = [
    invTab, invSort,
    Math.floor(used), cap,
    invTab === "bp" ? (S.bp || []).length : "",
    invTab === "chest" ? ["wood","bronze","silver","gold","relic"].map(t => S.chests[t] || 0).join(",") : "",
    invTab === "gear" ? S.gear.length + ":" + S.gear.filter(g => g.on).length : "",
    invTab === "mat" ? INV_GROUPS[0].keys.map(k => Math.floor(S.res[k] || 0)).join(",") : "",
    invTab === "made" ? INV_GROUPS[1].keys.map(k => Math.floor(S.res[k] || 0)).join(",") : "",
    invTab === "use" ? INV_GROUPS[2].keys.map(k => Math.floor(S.res[k] || 0)).join(",") : ""
  ].join("~");
  if(sig === sigInv) return;
  sigInv = sig;

  /* 容量条 */
  const pct = Math.min(100, Math.round(used / cap * 100));
  let h = `<div class="capwrap">
    <div class="statrow" style="margin:0">
      <span>📦 储物箱：${storageTier(lv("storage")).name}（Lv.${lv("storage")}/5）</span>
      <b class="${over ? "text-bad" : ""}">${Math.floor(used)} / ${cap}</b>
    </div>
    <div class="bar" style="margin-top:3px"><i style="width:${pct}%;background:${over ? "var(--bad)" : "var(--ok)"}"></i></div>
    ${over
      ? `<div class="text-bad" style="font-size:11px;margin-top:2px">⚠️ 超出容量 ${Math.floor(used - cap)} —— 外面的物资每天受潮/被偷。丢掉一些，或者升级储物箱（需要对应图纸）</div>`
      : `<div class="text-dim" style="font-size:10.8px;margin-top:2px">剩余空间 ${Math.floor(cap - used)}</div>`}
  </div>`;

  /* ★ 爆仓处置：按占用排序，给出最快腾空间的几项 */
  if(over){
    const top = [];
    for(const k in ITEMS){
      const v = Math.floor(S.res[k] || 0);
      if(v > 0) top.push({ k, v, vol: v * itemVol(k) });
    }
    top.sort((a, b) => b.vol - a.vol);
    h += `<div class="freeroom">
      <div class="fr-t">🧹 谁最占地方（点一下就丢）</div>
      ${top.slice(0, 5).map(x => `<div class="invrow">
        <span>${itemIcon(x.k)} ${itemName(x.k)} <span class="text-dim" style="font-size:10.5px">占 ${Math.round(x.vol)}</span></span>
        <span class="discard-btns">${discardBtns(x.k, x.v)}</span>
      </div>`).join("")}
      <div class="text-dim" style="font-size:10.5px;margin-top:3px">按容量占用排序。也可以升级储物箱一次解决。</div>
    </div>`;
  }

  /* 页签 */
  const tabs = [["mat","材料"],["made","加工品"],["use","消耗品"],["gear","装备"],["bp","图纸"],["chest","箱子"]];
  h += `<div class="tabs">` + tabs.map(([id, nm]) =>
    `<span class="tab${invTab === id ? " on" : ""}" onclick="setInvTab('${id}')">${nm}</span>`).join("") + `</div>`;

  /* 排序 */
  if(["mat"].includes(invTab)){
    h += `<div class="sorts">排序：
      <span class="sbtn${invSort === "count" ? " on" : ""}" onclick="setInvSort('count')">按数量</span>
      <span class="sbtn${invSort === "tier" ? " on" : ""}" onclick="setInvSort('tier')">按阶段</span></div>`;
  }

  /* 内容 */
  if(invTab === "chest"){
    const fo = fortuneOf();
    const ftip = fo.mul > 1
      ? `<div class="text-ok" style="font-size:11.5px;margin-bottom:6px">🎲 今日【${fo.name}】：图纸概率 ×${fo.mul}，装备品质提升——趁今天开箱！</div>`
      : fo.mul < 1
        ? `<div class="text-dim" style="font-size:11.5px;margin-bottom:6px">🎲 今日【${fo.name}】：开箱无加成（运势只影响图纸与品质，不降产量）。</div>`
        : "";
    h += ftip;
    h += ["wood","bronze","silver","gold","relic"].map(t => {
      const n = S.chests[t] || 0;
      if(!n && t !== "wood") return "";
      const maxT = chestMaxTier(t);
      return `<div class="invrow"><span>${CHESTNAME[t]} <span class="text-dim" style="font-size:10.5px">（可开出到 ${TIER_NAME[maxT] || "T1"}）</span></span><b>${n}</b></div>`;
    }).join("") || '<div class="text-dim" style="font-size:12px">还没有箱子</div>';
  }else if(invTab === "bp"){
    const bps = S.bp || [];
    h += bps.length
      ? (() => {
          /* v8.20：图纸按类别 + 代际分组、组内按名称排序（用户："找个图纸要翻很久"）。
           *  未获得的图纸本来就不列出，只给"还差多少张"的进度感。 */
          const catOf = bp => {
            if(typeof STORAGE_BP !== "undefined" && STORAGE_BP.includes(bp)) return { k: "store", t: "📦 储物箱", order: 30 };
            if(typeof CRAFT_SLOT_BPS !== "undefined" && CRAFT_SLOT_BPS.some(s => s.bp === bp)) return { k: "slot", t: "🧰 制作线扩容", order: 28 };
            const g = (typeof GEAR_RECIPES !== "undefined") && GEAR_RECIPES.find(x => x.bp === bp);
            if(g) return { k: "t" + (g.tier || 1), t: `⚔️ 装备 · T${g.tier || 1}（阶段 ${gearTierStage(g.tier || 1)} 起可掉）`, order: 10 + (g.tier || 1) * 0.1 };
            const r = (typeof RECIPES !== "undefined") && RECIPES.find(x => x.bp === bp);
            if(r) return { k: "mat", t: "🔧 材料加工", order: 5 };
            return { k: "other", t: "📜 其他", order: 90 };
          };
          const bmap = new Map();
          for(const bp of bps){
            const c = catOf(bp);
            if(!bmap.has(c.k)) bmap.set(c.k, { t: c.t, order: c.order, list: [] });
            bmap.get(c.k).list.push(bp);
          }
          const cats = [...bmap.values()].sort((a, b) => a.order - b.order);
          const allBp = new Set();
          if(typeof RECIPES !== "undefined") RECIPES.forEach(r => r.bp && allBp.add(r.bp));
          if(typeof GEAR_RECIPES !== "undefined") GEAR_RECIPES.forEach(r => r.bp && allBp.add(r.bp));
          if(typeof STORAGE_BP !== "undefined") STORAGE_BP.forEach(b => allBp.add(b));
          if(typeof CRAFT_SLOT_BPS !== "undefined") CRAFT_SLOT_BPS.forEach(s => s.bp && allBp.add(s.bp));
          return `<div class="invrow"><span>已获得 <b>${bps.length}</b> / ${allBp.size} 张
            <span class="text-dim" style="font-size:10.5px">（还差 ${allBp.size - bps.length} 张——探索、开箱、遗迹点掉落；未获得的不会列出来）</span></span></div>`
            + cats.map(c =>
                `<div class="text-dim" style="font-size:11.5px;margin:8px 0 3px">${c.t}（${c.list.length} 张）</div>`
                + c.list.slice().sort().map(bp => `<div class="invrow"><span>📜 ${esc(bp)}</span><b class="text-ok">✓</b></div>`).join("")
              ).join("");
        })()
      : '<div class="text-dim" style="font-size:12px">还没有图纸。探索和高级箱子是图纸的来源。</div>';
  }else if(invTab === "gear"){
    const gs = (S.gear || []).map((g, i) => ({ g, i }));
    const SLOT_ORDER = { weapon: 0, armor: 1, talisman: 2 };     /* v8.19：按槽位分组、槽位内按强度降序 */
    gs.sort((a, b) => (SLOT_ORDER[a.g.slot] - SLOT_ORDER[b.g.slot]) || (b.g.val - a.g.val));
    const bagBestW = bestInBag("weapon"), curW = equipped("weapon");
    const canUp = bagBestW && (!curW || bagBestW.val > curW.val);
    /* v8.42 护符插槽占用量提示 */
    const talUsed = equippedCount("talisman"), talCap = talismanSlots();
    h += `<div class="invrow"><span class="text-dim" style="font-size:11px">🧿 护符插槽 <b>${talUsed}/${talCap}</b>（可同时穿戴 ${talCap} 件，搜集效率可叠加，封顶 +${talCap * 100}%）</span></div>`;
    h += gs.length
      ? (canUp
          ? `<div class="invrow"><span class="text-ok" style="font-size:11.5px">⚔️ 有更强的武器：<b>${esc(bagBestW.name)}</b>（战力 ${bagBestW.val}，+${bagBestW.val - (curW ? curW.val : 0)}）</span>
             <span><button class="mini" onclick="equipBestAll()">一键穿最强</button></span></div>`
          : "")
        + gs.map(({ g, i }) => {
          const d = gearDelta(g);
          const mark = g.on
            ? `<span class="text-dim" style="font-size:10.5px">已装备</span>`
            : (d > 0 ? `<span class="text-ok" style="font-size:10.5px">↑ 比当前 +${d}</span>`
                     : (d < 0 ? `<span class="text-dim" style="font-size:10.5px">↓ 比当前 ${d}</span>` : ""));
          return `<div class="invrow">
          <span>${g.on ? "✅" : "　"} [${SLOTNAME[g.slot]}] <span class="r${g.rar}">${esc(g.name)}</span>
          <span class="text-dim" style="font-size:10.5px">${g.slot === "weapon" ? "战力" : g.slot === "armor" ? "防御" : "采集"}+${g.val}</span> ${mark}${gearTagsText(g)}</span>
          <span><button class="mini" onclick="toggleGear(${i})">${g.on ? "卸下" : "穿上"}</button>
          <button class="mini" onclick="dropGear(${i})">丢</button></span>
        </div>`; }).join("")
      : '<div class="text-dim" style="font-size:12px">没有装备</div>';
  }else{
    const grp = INV_GROUPS.find(g => g.id === invTab) || INV_GROUPS[0];
    let keys = grp.keys.slice();
    if(invSort === "tier") keys.sort((a, b) => (itemTier(a) - itemTier(b)) || (itemName(a) < itemName(b) ? -1 : 1));
    const rows = keys.map(k => ({ k, v: Math.floor(S.res[k] || 0) })).filter(r => r.v > 0);
    if(invSort === "count") rows.sort((a, b) => b.v - a.v);
    h += rows.length
      ? rows.map(r => {
          const vol = Math.round(r.v * itemVol(r.k));
          return `<div class="invrow">
            <span>${itemIcon(r.k)} ${itemName(r.k)}
              <span class="tierbadge t${itemTier(r.k)}">T${itemTier(r.k)}</span>
              <b style="margin-left:2px">×${r.v}</b>
              <span class="text-dim" style="font-size:10.5px">占${vol}容量</span></span>
            <span><span class="discard-btns">${discardBtns(r.k, r.v)}</span></span>
          </div>`;
        }).join("")
      : '<div class="text-dim" style="font-size:12px">这一类还是空的</div>';
  }

  el.innerHTML = h;
}

/* ============================================================
 * v8.19 战力引导辅助：装备对比 / 一键穿最强 / 可造最强武器
 *  （用户："已经很久没提升战力，最大的可能是没有新装备出现了"——
 *    实测：他有「磁轨炮 T6 val 992」图纸 + 材料齐 + 门槛过，却一直没造，
 *    因为面板不告诉他"这比现在强多少"。数值路早铺好了，缺的是把路标出来。）
 * ============================================================ */
/** 当前穿在身上的某槽位装备 */
function equipped(slot){ return (S.gear || []).find(g => g.slot === slot && g.on) || null; }
/** ★ v8.42 护符多插槽：护符可同时穿 TALISMAN_SLOTS 件，其余槽位仍 1 件 */
function equippedCount(slot){ return (S.gear || []).filter(g => g.slot === slot && g.on).length; }
function talismanSlots(){ return (typeof TALISMAN_SLOTS === "number") ? TALISMAN_SLOTS : 3; }
/** 背包里（含已穿的）某槽位最强的一件 */
function bestInBag(slot){
  let best = null;
  for(const g of (S.gear || [])) if(g.slot === slot && (!best || g.val > best.val)) best = g;
  return best;
}
/** 与"同槽位当前装备"的差值（正数=更强）
 *  v8.42 护符：有空位 → 纯收益（+自身 val）；满了 → 与身上最弱的一件比 */
function gearDelta(g){
  if(g.slot === "talisman"){
    const worn = (S.gear || []).filter(x => x.slot === "talisman" && x.on);
    if(worn.includes(g)) return 0;
    if(worn.length < talismanSlots()) return g.val;
    const weakest = worn.reduce((a, b) => (b.val < a.val ? b : a), worn[0]);
    return g.val - weakest.val;
  }
  const cur = equipped(g.slot);
  if(cur === g) return 0;
  return g.val - (cur ? cur.val : 0);
}
/** 现在就能造出的最强武器（图纸在手 / 门槛通过 / 材料齐）→ { rec, val } 或 null */
function bestCraftableWeapon(){
  let best = null;
  const list = (typeof allRecipes === "function") ? allRecipes() : [];
  for(const r of list){
    if(r.kind !== "gear" || !r.outGear || r.outGear.slot !== "weapon") continue;
    if(r.refine) continue;                                        /* 精修略过（要底子） */
    if(r.bp && !(S.bp || []).includes(r.bp)) continue;             /* 图纸装备：必须持有 */
    if(r.rough && (S.bld.forge || 0) <= 0) continue;               /* 粗制装备：需加工台 */
    if((r.tier || 1) > ageGearTier()) continue;                    /* 工艺门槛 */
    if((r.needHouse || 1) > lv("house")) continue;                 /* 材质档门槛 */
    const unit = (typeof craftCostOf === "function") ? craftCostOf(r) : r.in;
    if(typeof canPay === "function" && !canPay(unit)) continue;     /* 材料齐不齐 */
    const val = r.outGear.val || 0;
    if(!best || val > best.val) best = { rec: r, val };
  }
  return best;
}
/** 一键穿上每个槽位最强的装备（v8.42：护符按插槽 Top3 一起穿） */
function equipBestAll(){
  let n = 0, gain = 0;
  const slots = ["weapon", "armor", "talisman"];
  for(const slot of slots){
    if(slot === "talisman"){
      /* 护符：身上已有的先算收益，然后按 val 降序穿满插槽 */
      const all = (S.gear || []).filter(g => g.slot === "talisman");
      const prevGain = all.filter(g => g.on).reduce((s, g) => s + g.val, 0);
      const top = all.slice().sort((a, b) => b.val - a.val).slice(0, talismanSlots());
      for(const g of all) g.on = false;
      for(const g of top) g.on = true;
      const newGain = top.reduce((s, g) => s + g.val, 0);
      n += top.length; gain += newGain - prevGain;
      continue;
    }
    const b = bestInBag(slot), cur = equipped(slot);
    if(b && (!cur || b.val > cur.val)){
      if(cur) cur.on = false;
      b.on = true; n++;
      gain += b.val - (cur ? cur.val : 0);
    }
  }
  if(n) log(`⚔️ 换上了 ${n} 件更强的装备${gain > 0 ? `（战力/属性 +${gain}）` : ""}`, "good");
  else log("现在身上的已经是最好的了。");
  invalidateUI(); renderAll();
}

/* 装备穿脱 / 丢弃 */
function toggleGear(i){
  const g = S.gear[i];
  if(!g) return;
  if(g.on){ g.on = false; log(`卸下 ${g.name}`); }
  else if(g.slot === "talisman" && equippedCount("talisman") >= talismanSlots()){
    log(`🧿 护符插槽已满（${talismanSlots()}/${talismanSlots()}）——先卸下一件再穿`, "warn");
    invalidateUI(); renderAll(); return;
  }
  else{
    /* v8.42：护符多插槽——穿上时不卸别的护符；武器/护甲仍单件替换 */
    if(g.slot !== "talisman"){
      const cur = S.gear.find(x => x.slot === g.slot && x.on && x !== g);
      if(cur) cur.on = false;
    }
    g.on = true;
    log(`换上 ${g.name}`, "good");
  }
  invalidateUI(); renderAll();
}
function dropGear(i){
  const g = S.gear[i];
  if(!g) return;
  if(!confirm(`确定丢弃「${g.name}」？`)) return;
  S.gear.splice(i, 1);
  log(`🗑️ 丢弃了 ${g.name}`);
  invalidateUI(); renderAll();
}

/* ============================================================
 * 工作台面板
 * ============================================================ */
const CRAFT_QTY = {};                                   /* 每个配方的暂存制作数量（不进存档） */
/* v8.28 批量制作上限随段位放大：后期装备/材料动辄上万份，旧 UI 上限 9999、引擎内更仅 999，根本不够。
 * 上限跟随"玩家已解锁的最高配方段位"——早期(T≤3)与旧版一致 9999，后期逐级放大到 999999。
 * 用全局上限（而非按单配方 tier）是因为瓶颈在基础材料（钢 T2 等）：只有随玩家进度整体抬高，
 * 才能让你在后期一次排队生产以百万计的铁块/钢材去喂高阶装备。 */
const CRAFT_QTY_MAX = 9999;                             /* T≤3 的基准上限（保留旧常量名，便于兼容） */
const CRAFT_QTY_CAPS = [ [3, 9999], [6, 49999], [10, 99999], [14, 299999], [18, 499999], [99, 999999] ];
/** 玩家当前已解锁（有图纸）配方里的最高段位。
 *  - 粗制/精修是母配方的派生（无图纸、tier 继承到 T24），不能算作"已解锁段位"，否则一开局就顶到 999999；
 *  - 需要图纸的配方，只有真正持有该图纸才算解锁（S.bp 含 rec.bp）；无图纸的基础材料始终可开（tier≤3）。 */
function craftQtyTopTier(){
  let t = 1;
  for(const r of allRecipes()){
    if(r.rough || r.refine) continue;                       /* 派生配方不算段位 */
    if(r.bp && !(S.bp || []).includes(r.bp)) continue;      /* 需图纸但没拿到 → 不算 */
    t = Math.max(t, r.tier || 1);
  }
  return t;
}
/** 当前段位对应的"一次最多做几份"上限（全局） */
function craftQtyCap(){
  const t = craftQtyTopTier();
  for(const [lim, cap] of CRAFT_QTY_CAPS) if(t <= lim) return cap;
  return 999999;
}
function craftQtyVal(id){ return Math.max(1, Math.min(craftQtyCap(), CRAFT_QTY[id] || 1)); }
/** 按现有材料能做的最大数量（"做满"按钮用） */
function craftQtyMax(id){
  const rec = recipeById(id);
  if(!rec) return 1;
  const unit = (typeof craftCostOf === "function") ? craftCostOf(rec) : rec.in;
  let m = craftQtyCap();
  for(const k in unit){
    const per = unit[k] || 1;
    m = Math.min(m, Math.floor(Math.floor(S.res[k] || 0) / per));
  }
  return Math.max(1, m);
}
function craftQtySet(id, v){
  CRAFT_QTY[id] = Math.max(1, Math.min(craftQtyCap(), Math.floor(Number(v)) || 1));
  const inp = document.getElementById("cq-" + id);
  if(inp && String(inp.value) !== String(CRAFT_QTY[id])) inp.value = CRAFT_QTY[id];
  const btn = document.getElementById("cqbtn-" + id);
  if(btn){
    btn.disabled = !canPayQty(recipeById(id), CRAFT_QTY[id]);
    if(btn.textContent && btn.textContent.indexOf("开工") === 0) btn.textContent = "开工 ×" + CRAFT_QTY[id];
  }
}
function craftQty(id, d){ craftQtySet(id, craftQtyVal(id) + d); }
function craftQtyMaxSet(id){ craftQtySet(id, craftQtyMax(id)); }
function canPayQty(rec, n){ if(!rec) return false; const unit = (typeof craftCostOf === "function") ? craftCostOf(rec) : rec.in; const need = {}; for(const k in unit) need[k] = unit[k] * n; return canPay(need); }
/** ★ v8.43 缺料明示：做 n 份时还差哪些材料、各差多少 → [[key, 差额], ...]（按差额降序） */
function lacksQty(rec, n){
  if(!rec) return [];
  const unit = (typeof craftCostOf === "function") ? craftCostOf(rec) : rec.in;
  const out = [];
  for(const k in unit){
    const short = Math.ceil(unit[k] * n - (S.res[k] || 0));
    if(short > 0) out.push([k, short]);
  }
  return out.sort((a, b) => b[1] - a[1]);
}

function renderWorkbench(){
  const el = document.getElementById("workbenchPanel");
  if(!el) return;

  const bench = S.bld.bench || 0;
  const all = allRecipes();
  const running = (S.crafts || []).map(c => ({ c, rec: recipeById(c.id) })).filter(x => x.rec);
  const sig = [bench, running.map(x => x.c.id + ":" + Math.floor(x.c.prog / x.rec.hours * 20)).join(","),
    craftSlotMax(), ageMaxTier(),
    all.map(r => (r.tier || 1) + (hasBlueprint(r) ? 1 : 0) + Object.keys(r.in).map(k => Math.floor(S.res[k] || 0)).join("_")).join("|"),
    (S.bp || []).length,
    lv("house"),                                        /* v8.25 材质档影响制作速度显示 */
    benchQuery,                                         /* v8.24 搜索词 */
    benchSlot,                                          /* v8.26 槽位筛选 */
    ["mat", "gear", "rough", "refine"].map(k => groupFold[k] ? 1 : 0).join("")   /* v8.24 分组折叠态 */
  ].join("~");
  if(sig === sigBench) return;
  sigBench = sig;

  let h = "";
  let canNowN = 0;      /* v8.24 统计"现在就能开工"的件数 → 导航徽标 */

  /* 制作线槽位条 */
  const slotMax = craftSlotMax(), slotNow = running.length;
  const nxSlot = nextSlotBp();
  h += `<div class="slotsbar">
    <div class="statrow" style="margin:0">
      <span>🔧 制作线（同时能做几种）</span>
      <b class="${slotNow >= slotMax ? "text-bad" : ""}">${slotNow} / ${slotMax}</b>
    </div>
    <div class="slotcells">${
      Array.from({ length: CRAFT_SLOT_MAX }, (_, i) =>
        `<i class="${i < slotNow ? "on" : i < slotMax ? "free" : "lock"}"></i>`).join("")
    }</div>
    ${nxSlot ? `<div class="text-dim" style="font-size:11px;margin-top:3px">下一格需要图纸「${nxSlot.bp}」（${nxSlot.note}）</div>`
             : `<div class="text-dim" style="font-size:11px;margin-top:3px">制作线已开到上限</div>`}
    <div class="text-dim" style="font-size:11px;margin-top:3px">⚙️ 当前速度：${(typeof craftSpeedText === "function") ? craftSpeedText() : "—"}
      <span title="材料加工速度随避难所材质档每档 ×2（与采集同源）；装备类限速 ×8">ⓘ</span></div>
  </div>`;

  if(bench <= 0){
    h += `<div class="handnote">🖐️ 还没有工作台——下面这些可以<b>徒手做</b>。
      「绳索」正是造出工作台的关键材料（工作台需要 木材×100 + 石料×40 + 绳索×1）。<br>
      ★ 制作与外出<b>不冲突</b>：开工后主角照样出门采集/探索，制作线自己推进。</div>`;
  }
  /* 正在做的每一条线 */
  for(const { c, rec } of running){
    const pct = Math.min(100, Math.round((c.prog / rec.hours) * 100));
    const q = c.qty || 1;
    /* v8.25 速度随材质档变，把"还需多久"直接写出来（含剩余份数） */
    const spd = (typeof craftSpeed === "function") ? craftSpeed(rec) : 1;
    const leftH = Math.max(0, (q * rec.hours - c.prog) / (spd || 1));
    h += `<div class="crafting">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
        <span>🔨 ${rec.icon} ${rec.name} <b>×${q}</b>　<b>${pct}%</b>${q > 1 ? `　<span class="text-dim" style="font-size:11px">做完这份还剩 ${q - 1} 份</span>` : ""}</span>
        <button class="mini danger" onclick="cancelCraft('${rec.id}')">取消（退料）</button>
      </div>
      <div class="bar" style="margin-top:3px"><i style="width:${pct}%;background:#c9a227"></i></div>
      <div class="text-dim" style="font-size:11px;margin-top:2px">速度 ×${(typeof fmtSpeed === "function") ? fmtSpeed(spd) : spd}　·　全部做完还需 ${Math.round(leftH * 10) / 10} 游戏小时${leftH >= 24 ? `（约 ${(leftH / 24).toFixed(1)} 天）` : ""}<br>
        出门干活也照做；排「🛠️ 留守制作」时段加速 ×${CRAFT_FOCUS_MUL}</div>
    </div>`;
  }

  /* 背包升级 */
  const nx = bagNextCfg();
  h += `<div class="rec">
    <div class="row1">
      <span class="name">🎒 背包：${bagCfg().name} <span class="lv">一次带回 ${bagCfg().carry[0]}~${bagCfg().carry[1]} 箱</span></span>
      ${nx ? `<button class="mini" ${canPay(nx.cost) ? "" : "disabled"} onclick="upgradeBag()">升级为${nx.name}</button>` : `<span class="text-dim" style="font-size:11px">已最大</span>`}
    </div>
    ${nx ? `<div class="eff">${Object.entries(nx.cost).map(([k, v]) => `${itemIcon(k)}${itemName(k)}×${v}`).join(" ")} → 一次带回 ${nx.carry[0]}~${nx.carry[1]} 箱</div>` : ""}
  </div>`;

  const busyIds = running.map(x => x.c.id);
  const full = running.length >= slotMax;
  /* 阶段门槛：装备看代际（ageGearTier）；v8.12 公式代际装备看材质档（needHouse）；材料加工看阶层 */
  const me2 = r => (r.kind === "gear")
    ? (r.needHouse ? (lv("house") < r.needHouse) : ((r.tier || 1) > ageGearTier()))
    : ((r.tier || 1) > ageMaxTier());

  const group = (title, list, key) => {
    /* v8.20 排序：能立刻开工的最前 → 缺料的 → 门槛未达的 → 未解锁（折叠）
     *  用户："图纸太多了，我现在找个图纸都要翻很久。" */
    const rank = r => {
      if(!hasBlueprint(r)) return 9;
      let s = me2(r) ? 3 : 0;
      if(!canPayQty(r, 1)) s += 1;
      if(r.kind === "gear" && r.outGear && r.outGear.slot === "weapon" && !r.refine){
        const cur = equipped("weapon");
        if(r.outGear.val > (cur ? cur.val : 0)) s -= 0.5;      /* 能提升战力的再往前 */
      }
      return s;
    };
    /* v8.24 搜索：按配方名 / 材料名 / 图纸名过滤（只留命中的组） */
    const qm = r => {
      if(!benchQuery) return true;
      const q = benchQuery.toLowerCase();
      if((r.name || "").toLowerCase().indexOf(q) >= 0) return true;
      if((r.bp || "").toLowerCase().indexOf(q) >= 0) return true;
      for(const k in (r.in || {})){
        if((itemName(k) || "").toLowerCase().indexOf(q) >= 0 || (k || "").toLowerCase().indexOf(q) >= 0) return true;
      }
      for(const k in (r.out || {})){
        if((itemName(k) || "").toLowerCase().indexOf(q) >= 0) return true;
      }
      return false;
    };
    const src = list.filter(qm);
    if(!src.length) return "";
    /* v8.24 分组折叠：整组 160+ 张时可以只留标题（搜索时自动全展开，方便看命中） */
    const folded = !benchQuery && key && groupFold[key];
    const caret = key ? (folded ? "▸" : "▾") : "";
    let g = `<div class="recgroup text-dim"${key ? ` onclick="toggleGroupFold('${key}')"` : ""}>`
      + `${caret} ${title} <span style="opacity:.65">（${src.length} 项）</span>`
      + `${folded ? `　<span style="font-size:10.5px">已收起 · 点此展开</span>` : ""}</div>`;
    if(folded) return g;
    const sorted = src.slice().sort((a, b) => rank(a) - rank(b));
    let any = false;
    let lockedHtml = "", lockedN = 0;
    for(const r of sorted){
      const me = me2(r);
      const busy = busyIds.includes(r.id);
      const q = craftQtyVal(r.id);
      const mats = canPayQty(r, q);
      /* v8.9 精修：缺高级加工台 / 缺底子 → 按钮禁用并说明原因 */
      const noRough = !!(r.refine && !hasRoughGear(r.needRough));
      const noForge = !!(r.refine && (S.bld.forge || 0) < (r.needForge || 2));
      const btnTxt = busy ? "制作中" : full ? "线满了" : me ? (r.needHouse ? ("需材质档" + r.needHouse) : "阶段不足") : noForge ? "缺高级加工台" : noRough ? "缺底子" : mats ? ("开工 ×" + q) : "材料不足";
      const btnDis = busy || full || me || !mats || noRough || noForge ? "disabled" : "";
      const qtyDis = busy || full || me ? "disabled" : "";
      if(!btnDis && hasBlueprint(r)) canNowN++;    /* v8.24 可开工计数（已解锁 + 材料齐 + 门槛过） */
      /* v8.10 批量数量控件：直接输入数字 + ±1/±10/±100 + 一键做满（按现有材料上限） */
      const qMax = craftQtyMax(r.id);
      const qtyBox = `<span class="qtybox">
        <button class="mini" ${qtyDis} onclick="craftQty('${r.id}',-100)">−100</button>
        <button class="mini" ${qtyDis} onclick="craftQty('${r.id}',-10)">−10</button>
        <button class="mini" ${qtyDis} onclick="craftQty('${r.id}',-1)">−</button>
        <input id="cq-${r.id}" class="qtyinp" type="number" min="1" max="${craftQtyCap()}" value="${q}"
               onchange="craftQtySet('${r.id}', this.value)" title="直接输入数量，支持几百上千">
        <button class="mini" ${qtyDis} onclick="craftQty('${r.id}',1)">＋</button>
        <button class="mini" ${qtyDis} onclick="craftQty('${r.id}',10)">+10</button>
        <button class="mini" ${qtyDis} onclick="craftQty('${r.id}',100)">+100</button>
        <button class="mini" ${qtyDis} onclick="craftQtyMaxSet('${r.id}')" title="按现有材料能做满的最大数量（当前最多 ${qMax} 份）">做满</button>
      </span>`;
      const bpOk = hasBlueprint(r);
      const tierTag = `<span class="tierbadge t${r.tier || 1}">T${r.tier || 1}</span>`;
      /* v8.9 精修走实际成本（基准 ×0.8，持图纸减半）；v8.43 不够的材料标红 */
      const rCost = (typeof craftCostOf === "function") ? craftCostOf(r) : r.in;
      const inTxt = Object.entries(rCost).map(([k, v]) => {
        const lack = (S.res[k] || 0) < v;
        return `${itemIcon(k)}${itemName(k)}×<span class="${lack ? "text-bad" : "text-ok"}">${v}</span>`;
      }).join(" ");
      /* v8.43 缺料明示：材料不足时直接列出"还差什么、差多少" */
      const lacksHtml = (!mats && !busy && !full && !me && !noForge && !noRough)
        ? (() => {
            const lk = lacksQty(r, q);
            if(!lk.length) return "";
            return `<div class="eff text-bad" style="font-size:11.5px">❗ 还缺：${lk.map(([k, v]) => `${itemIcon(k)}${itemName(k)}×${fmt(v)}`).join("、")}（按做 ${q} 份算；存量不足的材料已在上方标红）</div>`;
          })()
        : "";

      if(!bpOk){
        /* 没有图纸：默认折叠（只留一条"未解锁 ×N"），展开才看传闻 */
        const mystery = r.mystery || "传闻：还没人知道这东西怎么做出来。";
        lockedN++;
        lockedHtml += `<div class="rec locked">
          <div class="row1"><span class="name">❓ 未知图纸</span><span class="text-bad" style="font-size:11px">未解锁</span></div>
          <div class="eff">${mystery}</div>
        </div>`;
        continue;
      }
      any = true;

      if(r.kind === "gear"){
        const ti = tagInfo(r.outGear.tag);
        const roughTip = r.refine
          ? `<div class="eff">底子：<span class="${hasRoughGear(r.needRough) ? "text-ok" : "text-bad"}">${r.needRough}${hasRoughGear(r.needRough) ? "（在手 ✓）" : "（没有——先在加工台打一件）"}</span></div>`
          : r.needHouse
          ? `<div class="eff">工艺门槛：避难所材质档 ≥ ${r.needHouse}（当前 Lv.${lv("house")}「${houseTier(lv("house")).name}」）</div>`
          : "";
        /* v8.19 战力引导：把"这件做出来能涨多少"写在标题上（各槽位各自比）
         * v8.27：护甲的对比参照护甲、护符参照护符——原来只有武器有对比提示。 */
        let vsTip = "";
        {
          /* v8.42：护符按多插槽比较（有空位=纯收益 / 满了=比最弱的一件），其余槽位单件比较 */
          const dv = gearDelta({ slot: r.outGear.slot, val: r.outGear.val, on: false });
          const unit = r.outGear.slot === "talisman" ? "%" : "";
          vsTip = dv > 0
            ? ` <span class="text-ok" style="font-size:11px">↑ 比当前${SLOTNAME[r.outGear.slot]} +${dv}${unit}</span>`
            : `<span class="text-dim" style="font-size:11px">（当前${SLOTNAME[r.outGear.slot]}更强）</span>`;
        }
        /* v8.27 数值标签按槽位（护符的 val 是"搜集效率 %"，原来统一写"战力/防御"是误导） */
        const valLabel = r.outGear.slot === "weapon" ? `战力 ${r.outGear.val}`
                       : r.outGear.slot === "armor" ? `防御 ${r.outGear.val}`
                       : `搜集效率 +${r.outGear.val}%`;
        g += `<div class="rec">
          <div class="row1">
            <span class="name">${tierTag}${r.icon} ${r.name} <span class="lv">${hourText(r.hours)} · ${valLabel}</span>${vsTip}</span>
            <span>${qtyBox}<button class="mini" id="cqbtn-${r.id}" ${btnDis} onclick="startCraft('${r.id}', craftQtyVal('${r.id}'))">${btnTxt}</button></span>
          </div>
          <div class="eff">词条：<span class="text-ok">${ti.name}</span> —— ${ti.desc}</div>
          ${roughTip}
          <div class="eff">${inTxt} → 做 ${q} 份需材料 ×${q}${q > 1 ? `　<span class="text-dim">（预计 ${Math.round(r.hours * q * 10) / 10} 游戏小时）</span>` : ""}</div>
          ${lacksHtml}
        </div>`;
      }else{
        const outTxt = Object.entries(r.out).map(([k, v]) => `${itemIcon(k)}${itemName(k)}+${v}`).join(" ");
        g += `<div class="rec">
          <div class="row1">
            <span class="name">${tierTag}${r.icon} ${r.name} <span class="lv">${hourText(r.hours)}/份</span></span>
            <span>${qtyBox}<button class="mini" id="cqbtn-${r.id}" ${btnDis} onclick="startCraft('${r.id}', craftQtyVal('${r.id}'))">${btnTxt}</button></span>
          </div>
          <div class="eff">${inTxt} → ${outTxt}${q > 1 ? `　<span class="text-dim">（×${q} 份，预计 ${Math.round(r.hours * q * 10) / 10} 游戏小时）</span>` : ""}</div>
          ${lacksHtml}
          <div class="eff">${r.desc}</div>
        </div>`;
      }
    }
    /* v8.20：未解锁的一律折成一行，点开才看（默认收起，避免"在废纸里翻图"） */
    if(lockedN){
      const open = key && showLocked[key];
      g += `<div class="rec locked" style="cursor:pointer" ${key ? `onclick="toggleLocked('${key}')"` : ""}>
        <div class="row1"><span class="name">❓ 未解锁图纸 ×${lockedN}</span>
        <span class="text-dim" style="font-size:11px">${key ? (open ? "点此收起 ▲" : "点此展开传闻 ▼") : ""}</span></div>
      </div>`;
      g += open ? lockedHtml : "";
    }
    return (any || lockedN) ? g : "";
  };

  /* v8.26 装备大类 → 按槽位拆成三个可各自收起的子分组（与槽位筛选联动） */
  const gearCategory = (title, list, key) => {
    let out = "";
    for(const slot of SLOT_ORDER){
      if(benchSlot !== "all" && benchSlot !== slot) continue;
      const sub = list.filter(r => r.outGear && r.outGear.slot === slot);
      if(!sub.length) continue;
      out += group(`${SLOT_ICON[slot]} ${SLOTNAME[slot]}`, sub, key + "-" + slot);
    }
    return out ? `<div class="reccat">${title}</div>` + out : "";
  };

  /* 没有工作台时只列徒手配方 */
  const avail = list => bench > 0 ? list : list.filter(r => r.noBench);
  const matHtml = group("材料加工" + (bench > 0 ? "" : "（徒手可做）"), avail(RECIPES), "mat");
  /* v8.26：选了具体槽位时，把材料加工放到最后（筛选要看的是那类装备） */
  if(benchSlot === "all") h += matHtml;
  if(bench > 0){
    /* v8.26 装备按槽位分栏（用户："护甲 护符 武器都放一起，找的不方便"）
     *  每个大类下拆成「武器 / 护甲 / 护符」三个可各自收起的子分组；
     *  配合顶上的槽位筛选，可直接只看一类。 */
    h += gearCategory("装备制造（图纸）", typeof GEAR_RECIPES !== "undefined" ? GEAR_RECIPES : [], "gear");
    if(typeof FORGE_RECIPES !== "undefined")
      h += gearCategory("⚒️ 装备加工台（粗制 · 无需图纸）", FORGE_RECIPES, "rough");
    /* v8.9 精修：高级装备加工台（forge Lv.2）解锁 —— 粗制装 → 满性能完全体 */
    if(typeof REFINE_RECIPES !== "undefined" && (S.bld.forge || 0) >= 2)
      h += gearCategory("✨ 精修（粗制 → 完全体 · 无需图纸）", REFINE_RECIPES, "refine");
  }
  if(benchSlot !== "all") h += matHtml;
  if(benchQuery){
    h = `<div class="benchsearchhint">🔍 「${esc(benchQuery)}」${
      h ? "" : `—— 没有匹配的配方。<span class="text-dim">试试材料名（钢、幽能结晶）或装备名（磁轨炮）。</span>`
    }　<button class="mini" onclick="benchFoldAll(false)">清空搜索</button></div>` + h;
  }
  el.innerHTML = h;
  craftableNow = canNowN;                          /* v8.24 导航徽标用 */
  updatePageNav();
}

/* ============================================================
 * v8.24 灾史页（从主角面板里拆出来，独立整页）
 * 用户："把灾史和制作单独放一个页面里" —— 灾史原来贴在主角面板底部，
 *  场次一多就把基地页拉得很长；这里给足空间：概览卡 + 走势 + 筛选 + 完整列表。
 * ============================================================ */
let sigHis = "";
let hisFilter = "all";        /* all / win / lose */
function setHisFilter(f){
  hisFilter = (f === "win" || f === "lose") ? f : "all";
  sigHis = "";
  renderHistory();
}
function renderHistory(){
  const el = document.getElementById("historyPanel");
  if(!el) return;
  const L = S.disLog || [];
  const sig = [L.length, hisFilter, S.wave, Math.ceil(S.nextDis || 0), Math.floor(S.day),
               inNewbie() ? 1 : 0, (S.disUnread ? 1 : 0), atk(), def(), fire()].join("|");
  if(sig === sigHis) return;
  sigHis = sig;

  const win = L.filter(r => r.win).length, lose = L.length - win;
  const rate = L.length ? Math.round(win / L.length * 100) : 0;
  const last10 = L.slice(-10);
  const r10 = last10.length ? Math.round(last10.filter(r => r.win).length / last10.length * 100) : 0;
  const maxNeed = L.reduce((m, r) => Math.max(m, r.need || 0), 0);

  let h = `<div class="hiscards">
    <div class="hiscard"><span>经历场次</span><b>${L.length}</b></div>
    <div class="hiscard"><span>守住</span><b class="text-ok">${win}</b></div>
    <div class="hiscard"><span>失守</span><b class="${lose ? "text-bad" : "text-dim"}">${lose}</b></div>
    <div class="hiscard"><span>总胜率</span><b class="${rate >= 80 ? "text-ok" : rate >= 50 ? "" : "text-bad"}">${rate}%</b></div>
    <div class="hiscard"><span>最近 10 场</span><b class="${r10 >= 80 ? "text-ok" : r10 >= 50 ? "" : "text-bad"}">${r10}%</b></div>
    <div class="hiscard"><span>最高灾势</span><b>${maxNeed}</b></div>
  </div>`;

  /* 下一场 + 当前守家能力 */
  h += `<div class="hisnext">
    <span>${inNewbie()
      ? `🛡️ 新手期还剩 ${durText(newbieLeftDays())}（期间没有天灾）`
      : `⏳ 下一场：<b>${S.nextDisType || disType().name}</b> · 预计第 ${Math.ceil(S.nextDis || 0)} 天（还有 ${Math.max(0, Math.ceil((S.nextDis || 0) - S.day))} 天）`}</span>
    <span class="text-dim">🛡️ 防御 ${def()}　⚔️ 战力 ${atk()}　🔥 火力 ${fire()}　→ 守家总攻 ${atk() + fire()}</span>
  </div>`;

  if(!L.length){
    h += `<div class="text-dim" style="font-size:12px;padding:6px 2px">还没有经历过天灾。第一场之前，把防御（加固工事/材质档）和火力（火力塔/武器）补上。</div>`;
    el.innerHTML = h;
    return;
  }

  /* 灾势 vs 防御 走势（最近 14 场，同一比例尺） */
  const recent = L.slice(-14);
  const peak = Math.max.apply(null, recent.map(r => Math.max(r.need || 0, r.have || 0))) || 1;
  const BH = 96;
  h += `<div class="hischart">
    <div class="recgroup text-dim">最近 ${recent.length} 场：灾势 vs 你的防御（同一比例尺）</div>
    <div class="hisbars">${recent.map(r => {
      const nh = Math.max(3, Math.round((r.need || 0) / peak * BH));
      const hh = Math.max(3, Math.round((r.have || 0) / peak * BH));
      return `<div class="hisbar" title="第 ${r.wave} 场 ${r.name}：灾势 ${r.need} ／ 防御 ${r.have}">
        <i class="bneed" style="height:${nh}px"></i>
        <i class="bhave" style="height:${hh}px"></i>
        <em>${r.wave}</em></div>`;
    }).join("")}</div>
    <div class="hislegend"><span class="lg-need">■ 灾势</span><span class="lg-have">■ 防御</span><span class="text-dim">左早 → 右近</span></div>
  </div>`;

  /* 筛选 */
  h += `<div class="hisflt">
    ${[["all", "全部", L.length], ["win", "守住", win], ["lose", "失守", lose]].map(([k, n, c]) =>
      `<button class="pb ${hisFilter === k ? "on" : ""}" onclick="setHisFilter('${k}')">${n} ${c}</button>`).join("")}
  </div>`;

  const list = L.slice().reverse().filter(r => hisFilter === "all" ? true : (hisFilter === "win" ? r.win : !r.win));
  h += list.length ? `<div class="hislist">${list.map(r => `
    <div class="hisrow ${r.win ? "ok" : "bad"}">
      <div class="hishead">
        <span class="hiswave">第 ${r.wave} 场</span>
        <span class="hisname">${esc(r.name || "天灾")}</span>
        <span class="histag ${r.win ? "ok" : "bad"}">${r.win ? "✅ 扛住" : "❌ 失守"}</span>
        <span class="text-dim" style="margin-left:auto;font-size:11px">${r.day ? "第 " + r.day + " 天" : ""}</span>
      </div>
      <div class="hisbody text-dim">${r.legacy ? "改版前渡过，明细未记录"
        : `防御 <b>${r.have}</b>${r.atkCut ? ` ＋ 战力/火力削减 <b class="text-ok">${r.atkCut}</b>` : ""} vs 灾势 <b>${r.need}</b>${(r.rawNeed && r.rawNeed !== r.need) ? `（原始 ${r.rawNeed}）` : ""}${r.mitigated ? "　· 抗性装备生效" : ""}`}</div>
      ${r.legacy ? "" : `<div class="hisbody">${r.win
        ? `<span class="text-ok">战利品：${esc(r.rewards || "—")}</span>`
        : `<span class="text-bad">损失 ${r.lossPct}% 物资${r.houseDown ? `，避难所跌回「${esc(r.houseDown.name)}」` : ""}${r.wounded ? "，主角受伤" : ""}</span>`}</div>`}
    </div>`).join("")}</div>`
    : `<div class="text-dim" style="font-size:12px;padding:6px 2px">这个分类下还没有记录。</div>`;

  el.innerHTML = h;
}

/* ============================================================
 * 日程
 * ============================================================ */
function renderPlan(){
  const el = document.getElementById("planPanel");
  if(!el) return;

  const sig = [S.found.join(","), S.plan.am, S.plan.pm, S.plan.night || "rest", S.queue.length,
               (S.bld.bench || 0) > 0 ? 1 : 0, hasTag("light") ? 1 : 0, isDying() ? 1 : 0,
               atk(), S.aggressive ? 1 : 0, hasTag("ranged") ? 1 : 0].join("|");
  if(sig === sigPlan) return;
  sigPlan = sig;

  const opts = seg => {
    const plan = seg === "night" ? (S.plan.night || "rest") : S.plan[seg];
    let h = `<select onchange="setPlan('${seg}',this.value)">`;
    /* v8.17 按区域分组（换高级地图出高级材料：先在日程里把区域分清） */
    const zones = [];
    for(const id of S.found){
      const sp = SPOTS[id];
      if(!sp) continue;
      const zn = (typeof mapNameOfSpot === "function") ? mapNameOfSpot(id) : "";
      let g = zones.find(x => x.name === zn);
      if(!g){ g = { name: zn, list: [] }; zones.push(g); }
      g.list.push(id);
    }
    for(const g of zones){
      h += `<optgroup label="${esc(g.name)}">`;
      for(const id of g.list){
      const sp = SPOTS[id];
      const a = assessThreat(sp.threat);
      const blocked = a.tier.key === "suicide" && !S.aggressive;
      h += `<option value="${id}" ${plan === id ? "selected" : ""} ${blocked ? "disabled" : ""}>`
         + `${sp.icon} ${sp.name}（威胁 ${sp.threat}）${blocked ? " ⛔" : ""}</option>`;
      }
      h += `</optgroup>`;
    }
    h += `<option value="explore" ${plan === "explore" ? "selected" : ""}>🗺️ 探索周边</option>`;
    /* 加工选项一直可用：没有工作台时也能徒手做（绳索/熏肉/诱饵） */
    h += `<option value="workbench" ${plan === "workbench" ? "selected" : ""}>🛠️ 留守制作（加速 ×${CRAFT_FOCUS_MUL}，不出门）</option>`;
    h += `<option value="rest" ${plan === "rest" ? "selected" : ""}>😴 休息</option></select>`;
    return h;
  };
  const nightRow = hasTag("light")
    ? `<div class="planrow"><span class="lbl">夜间（18-6时）</span>${opts("night")}</div>
       <div class="text-ok" style="font-size:11px;margin-top:2px">🏮 提灯在手——夜里也能出工，一天当三天用（但夜里干活一样耗体力）</div>`
    : `<div class="planrow"><span class="lbl">夜间</span><span class="text-dim" style="font-size:12px">自动睡觉，体力 +${STAM_SLEEP}（有照明装备后夜里也能出工）</span></div>`;

  /* ★ 地点一览：威胁明码标价，一眼看出能不能去（按威胁升序 = 成长阶梯顺序） */
  const rows = S.found.map(id => ({ id, sp: SPOTS[id] }))
    .filter(x => x.sp)
    .sort((a, b) => a.sp.threat - b.sp.threat)
    .map(({ id, sp }) => {
    const a = assessThreat(sp.threat);
    const blocked = a.tier.key === "suicide" && !S.aggressive;
    const cls = a.tier.cls === "ok" ? "text-ok" : a.tier.cls === "warn" ? "spot-warn" : "text-bad";
    /* v8.21：产出显示"实际每时段产量"（含随材质档增长的倍率）——旧版只列材料名，
     *  玩家看不出"这地方到底产多少"，也感觉不到产量已经涨了千倍。 */
    const outMul = (typeof spotYieldMul === "function") ? spotYieldMul(sp) : 1;
    const out = Object.entries(sp.y)
      .map(([k, v]) => `${itemName(k)} ${fmtCap(Math.round(v * outMul * 6))}/段`)
      .join(" · ");
    let advice;
    if(a.tier.key === "suicide")      advice = `需要 ${needAtkFor(id, "hard")} 战力才敢去`;
    else if(a.tier.key === "risky")   advice = `撑得住，但会受伤`;
    else if(a.tier.key === "hard")    advice = `有点勉强`;
    else                              advice = a.tier.note;
    return `<div class="spotrow${blocked ? " blocked" : ""}">
      <div class="l1"><span>${sp.icon} ${sp.name}</span><b class="${cls}">${blocked ? "⛔ " : ""}${a.tier.name}</b></div>
      <div class="l2"><span class="zonechip">${(typeof mapNameOfSpot === "function") ? esc(mapNameOfSpot(id)) : ""}</span> 威胁 ${sp.threat} ｜ 你 ${atk()} ｜ ${out}<br>
        <span class="text-dim">${advice}</span></div>
    </div>`;
  }).join("");

  el.innerHTML = `
    ${isDying() ? `<div class="dying">💀 濒死中——建议把日程改成「😴 休息」，或用绷带</div>` : ""}
    <div class="planrow"><span class="lbl">上午（6-12时）</span>${opts("am")}</div>
    <div class="planrow"><span class="lbl">下午（12-18时）</span>${opts("pm")}</div>
    ${nightRow}
    <div class="text-dim" style="font-size:11.5px;margin-top:6px">📍 已发现地点（⚠️ 战力不够的地方去不了）</div>
    <div style="margin-top:3px">${rows || '<div class="text-dim" style="font-size:12px">还没探到任何地点</div>'}</div>
    <div class="text-dim" style="font-size:11.5px;margin-top:6px">
      未发现地点：${S.queue.length} 处 ｜ 日程改动会在「下一个时段」开始生效。
    </div>`;
}

function setPlan(seg, val){
  /* ★ 排班拦截：送死档地点不允许排（除非开了激进模式） */
  if(SPOTS[val] && spotBlocked(val)){
    const a = assessSpot(val);
    log(`⛔ ${SPOTS[val].name}：威胁 ${spotThreat(val)}，你的战力 ${atk()}（判定「${a.tier.name}」）——去了回不来。`, "bad");
    log(`　至少需要 ${needAtkFor(val, "hard")} 战力才敢去；或者开「⚠️ 激进模式」硬闯（可能死）。`, "warn");
    invalidateUI();
    renderAll();
    return;
  }
  S.plan[seg] = val;
  log(`📅 ${seg === "am" ? "上午" : seg === "pm" ? "下午" : "夜间"}日程改为：${planLabel(val)}`);
  invalidateUI();
  renderAll();
}

/** 激进模式开关 */
function toggleAggressive(on){
  S.aggressive = !!on;
  if(S.aggressive){
    log("⚠️ 激进模式已开启：主角会前往威胁过高的地方——产出 +" + Math.round(AGGRESSIVE_REWARD * 100) + "%，但可能死。", "bad");
  }else{
    log("✅ 激进模式已关闭：主角恢复保守，送死档地点一律不去。", "good");
  }
  invalidateUI();
  renderAll();
}

/* ============================================================
 * 宝箱面板
 * ============================================================ */
function renderChests(){
  const el = document.getElementById("chestPanel");
  if(!el) return;

  const order = ["wood", "bronze", "silver", "gold", "relic"];
  const sig = order.map(t => `${S.chests[t] || 0}`).join(",") + "|" + ageMaxTier();
  if(sig === sigChest) return;
  sigChest = sig;

  let h = "";
  let shown = 0;
  for(const t of order){
    const n = S.chests[t] || 0;
    const unlocked = chestUnlocked(t);
    if(n === 0 && !unlocked && t !== "wood") continue;
    shown++;
    const maxT = chestMaxTier(t);
    const capNote = (!unlocked || maxT < (CHEST_TIER_MAX[t] || 1))
      ? `<span class="text-dim" style="font-size:10.5px">（当前阶段只能开出到 ${TIER_NAME[maxT]}；留着以后开更划算）</span>` : "";
    h += `<div class="chestrow">
      <span class="ch-t">${CHESTNAME[t]}</span><span class="cnt">${n}</span>
      <button ${n ? "" : "disabled"} onclick="openChest('${t}',1)">开 1 个</button>
      <button ${n ? "" : "disabled"} onclick="openChest('${t}',999)">全开</button>
      ${capNote}
    </div>`;
  }
  if(!shown) h = '<div class="text-dim" style="font-size:12px">还没有箱子。采集、探索、陷阱都能带回箱子。</div>';
  el.innerHTML = h;
}

/* ============================================================
 * 顶栏与整体刷新
 * ============================================================ */
function renderHUD(){
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };

  /* 阶段栏 */
  const age = curAge();
  set("rAge", `${age.name}`);
  const at = document.getElementById("ageTarget");
  if(at){
    const p = ageProgress();
    if(p.final){
      at.innerHTML = `🌍 <b>${age.icon} ${age.name}</b>（${age.era}）　<span class="text-dim">已是当前最终阶段</span>`;
    }else{
      const items = p.parts.map(x =>
        `<span class="${x.done ? "done" : ""}">${x.done ? "✓" : "○"} ${esc(x.txt)}</span>`).join("　");
      at.innerHTML = `🌍 当前：<b>${age.icon} ${age.name}</b>（${age.era}）<br>`
        + `<span class="text-dim">距「${p.next.name}」还需：</span>${items}`;
    }
  }

  /* 伤势栏（只在受伤时显示） */
  const wo = document.getElementById("woundBox");
  if(wo){
    if(woundIdx() > 0){
      wo.style.display = "";
      wo.innerHTML = `${woundInfo().icon} <b>${woundInfo().name}</b>`;
      wo.className = isDying() ? "wound dying" : "wound";
    }else{
      wo.style.display = "none";
    }
  }

  set("rWood", fmt(S.res.wood));
  set("rStone", fmt(S.res.stone));
  set("rMetal", fmt(S.res.metal));
  set("rFood", fmt(S.res.food));
  set("rWater", fmt(S.res.water));
  set("rDef", def());
  set("rAtk", atk());
  set("rDay", Math.floor(S.day) + 1);
  set("rClock", clockText());          /* 游戏时钟：14:32 */
  const rf = document.getElementById("rFortune");
  if(rf){
    const f = fortuneOf();
    rf.textContent = `${f.name}${f.mul !== 1 ? ` ×${f.mul}` : ""}`;
    rf.style.color = f.mul > 1 ? "var(--ok, #7bd88f)" : f.mul < 1 ? "var(--bad, #e24b4a)" : "";
  }

  /* ★ 速档高亮 + 自动开箱按钮 + 待开宝箱提示 */
  const mul = S.timeMul || 1;
  if(typeof document !== "undefined" && document.querySelectorAll){
    document.querySelectorAll(".speedctl .spd").forEach(b => {
      b.classList.toggle("on", Number(b.dataset.mul) === mul);
    });
  }
  const ao = document.getElementById("btnAutoOpen");
  if(ao){
    ao.textContent = "自动开箱：" + (S.autoOpen ? "开" : "关");
    if(ao.classList && ao.classList.toggle) ao.classList.toggle("on", !!S.autoOpen);
  }
  const pending = Object.values(S.chests || {}).reduce((a, b) => a + (b || 0), 0);
  const badge = document.getElementById("chestBadge");
  if(badge){
    if(!S.autoOpen && pending > 0){
      badge.style.display = "";
      set("rChestPending", pending);
    }else badge.style.display = "none";
  }

  /* ★ 离线期间的灾报未读提示（v7.16） */
  const disBadge = document.getElementById("disBadge");
  if(disBadge){
    if(S.disUnread && (S.disLog || []).length){
      disBadge.style.display = "";
      const last = S.disLog[S.disLog.length - 1];
      set("disBadgeTxt", `📋 ${last.name}灾报${last.win ? "" : "（失守）"}——点开查看`);
    }else disBadge.style.display = "none";
  }

  /* 重生次数（第一次之后才显示） */
  const rb = document.getElementById("rebirthBox");
  if(rb){
    if(S.rebirth > 0){ rb.style.display = ""; rb.textContent = `🌅 第 ${S.rebirth + 1} 世`; }
    else rb.style.display = "none";
  }

  /* 仓储容量提示 */
  const sc = document.getElementById("rStore");
  if(sc){
    const used = Math.floor(storageUsed()), cap = storageCapNow();
    sc.textContent = `${used}/${cap}`;
    sc.className = used > cap ? "danger" : "";
  }

  /* ★ 电力指示（v8.7）：有几级电、哪台机型、是否在运转——一眼看清避难所的电力状态 */
  const pb = document.getElementById("rPowerBox");
  if(pb){
    const glv = powerLv();
    if(glv > 0){
      pb.style.display = "";
      const t = powerTier(glv), on = powerOn();
      const eat = Object.entries(t.consume).map(([k, v]) => `${itemIcon(k)}${v}`).join(" ");
      const stock = Object.keys(t.consume).map(k => `${Math.floor(S.res[k] || 0)}${itemName(k)}`).join("/");
      set("rPower", `${t.icon}${t.name.slice(0, 2)}·${on ? "运转" : "停转"}`);
      const el = document.getElementById("rPower");
      if(el) el.className = on ? "text-ok" : "danger";
      pb.title = `电力 Lv.${glv}：采集 +${4 * glv}%、制作速度 +${8 * glv}%\n日耗 ${eat}（现存 ${stock}）\n${on ? "运转中" : "❗ 缺料停转——加成失效，补料后天结算自动恢复"}`;
    }else pb.style.display = "none";
  }

  const rem = Math.max(0, S.nextDis - S.day);
  const warnDays = DIS_DECAY_NOTE + (S.forewarn || 0);
  const el = document.getElementById("disTimer");
  if(el){
    /* 新手期：精确到分钟的倒计时；之后显示距下一场天灾还有多久 */
    el.textContent = inNewbie()
      ? durText(newbieLeftDays())
      : durText(rem);
    el.className = (rem <= warnDays || newbieLeftDays() < 0.5) ? "danger" : "";
  }
  const dn = document.getElementById("disName");
  if(dn){
    if(inNewbie()){
      dn.textContent = `🛡️ 新手期结束倒计时`;
      dn.style.color = "var(--ok)";
    }else{
      /* ★ v8.45 预告下一场强度 + 对照当前防御给出"能不能扛住"的判断 */
      const I = disIntensity();
      const cut = attackCut(I);
      const need = Math.max(0, I - cut);
      const ok = def() >= need;
      dn.textContent = rem <= warnDays
        ? `⚠️ ${disType().name} 将至！强度 ${fmt(I)} ${ok ? "✓可扛" : "✗危险"}`
        : `下一场：${disType().name} · 强度 ${fmt(I)} ${ok ? "✓" : "✗"}`;
      dn.style.color = !ok ? "var(--bad)" : (rem <= warnDays ? "var(--warn)" : "var(--dim)");
      dn.title = `下一场「${disType().name}」基础强度 ${I}`
        + `\n守家总攻 ${Math.round(homeAttack())} 抵减 -${cut} → 需要防御 ≥ ${need}`
        + `\n当前防御 ${def()} → ${ok ? "✅ 能扛住（普通灾）" : "❌ 扛不住！快升级甲/工事/材质档"}`
        + `\n复合灾（wave≥12 后 30% 概率双灾并发）按 ×1.4 计，建议留出余量`
        + `\n对应抗性词条/防灾设施可再打折（见灾种说明）`;
    }
  }

  renderNow();
  renderBuildings();
  renderHero();
  renderPlan();
  renderWorkbench();
  renderInventory();
  renderChests();
  renderHistory();                               /* v8.24 灾史页（签名不变则跳过重建） */
  updatePageNav();                               /* v8.24 导航徽标 */
  updateFabSums();                              /* v8.30 浮动按钮摘要（收起也能看到状态） */
  if(typeof mapTick === "function") mapTick();   /* v8.16 实时地图：每秒跟随主角位置/倒计时 */
}

function renderAll(){ renderHUD(); if(typeof renderMap === "function") renderMap();   /* v8.15 地图（打开时才画） */ }

/* ---------- 速档 / 自动开箱 控制（顶栏按钮调用） ---------- */
function setSpeed(mul){
  mul = Number(mul) || 1;
  S.timeMul = mul;
  save();
  renderHUD();
  const minPerDay = 1440 / (TIME_SCALE * mul);   /* 现实分钟 / 游戏天 */
  log(`⏩ 时间流速：${mul}×（约 ${Math.round(minPerDay)} 现实分钟 = 1 游戏天${mul >= 4 ? "，挂机飞快" : ""}）`, "good");
}

function toggleAutoOpen(){
  S.autoOpen = !S.autoOpen;
  save();
  renderHUD();
  log(`📦 自动开箱已${S.autoOpen ? "开启" : "关闭"}${S.autoOpen ? "——挂机时战利品直接进日志" : "——箱子会累积在「箱子」标签页，自己挑时机开"}`, "good");
}

/* v8.6 多词条显示：tag 单词条 + tags 数组统渲染 */
function gearTagsText(g){
  const list = [];
  if(g.tag) list.push(tagInfo(g.tag).name);
  for(const t of (g.tags || [])) list.push(tagInfo(t).name);
  return list.length ? '　<span class="text-ok" style="font-size:11px">◆ ' + list.join(" / ") + '</span>' : "";
}
/* ============================================================
 * 世界地图（v8.16：页面内实时地图带 + 全屏放大 + 离线回放）
 *   实时策略：结构（节点/轨迹/回放游标）只在签名变化时重建；
 *   每秒只更新主角位置、天灾倒计时、概览数字 —— 低成本、看得见在动。
 *   纯表现层：只读 S.trail / SPOTS / 日程，不改任何数值。
 * ============================================================ */
let mapOpen = false;                 /* 全屏浮层 */
let mapReplayIdx = -1;               /* -1 = 实时 */
let mapPlayTimer = null;
let mapSigInline = "", mapSigOverlay = "";
let mapTickN = 0;

function mapPrefix(isOverlay){ return isOverlay ? "o" : ""; }

function toggleMap(on){
  mapOpen = (on === undefined) ? !mapOpen : !!on;
  const el = document.getElementById("mapOverlay");
  if(!el) return;
  el.style.display = mapOpen ? "flex" : "none";
  if(mapOpen){ mapReplayIdx = -1; mapSigOverlay = ""; renderMapInto("mapSvg", true); }
  else mapReplayStop();
}

function toggleMapBar(){
  /* v8.30 起地图为全屏背景、无"收起"概念；保留空函数以兼容旧调用点 */
}

/* 结构签名：变了才重建 SVG（节点发现/轨迹增长/阶段/避难所档/回放位置/天灾类型） */
function mapStructSig(){
  return [ (S.found || []).join(","), (S.trail || []).length, S.age || 1, lv("house"),
           S.nextDisType || "", mapReplayIdx, mapOpen ? 1 : 0 ].join("|");
}

/* ---------- SVG 生成（prefix 区分内嵌/全屏，mode="bg" 时铺满背景） ---------- */
function mapSvgText(prefix, mode){
  const P = prefix || "";
  const W = MAP_W, H = MAP_H, C = MAP_CENTER;
  const IMG = (typeof MAP_BASE_IMG !== "undefined") ? MAP_BASE_IMG : "assets/map/map-base.png";
  const nodes = mapNodes();
  const trail = S.trail || [];
  const hero = heroRenderPos();
  let s = "";
  /* v8.28：AI 废土地图底图（无文字），地名/避难所/天灾/主角用矢量叠加在上面 */
  s += `<image href="${IMG}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="废土地图底图"/>`;
  /* 左侧外海：半透明 + 竖排标注 */
  s += `<rect x="0" y="0" width="330" height="${H}" fill="#0c1318" opacity="0.30"/>`;
  s += `<text x="150" y="${H/2}" fill="#8fa0a8" font-size="16" text-anchor="middle" opacity="0.7" transform="rotate(-90 150 ${H/2})" font-family="serif">外海 · 未探索</text>`;
  /* 区域大字（散落在对应地点群上方，呼应参考图的水墨地名） */
  for(const c of zoneColumns()){
    const fs = c.tier <= 3 ? 26 : 30;
    s += `<text x="${c.x}" y="${c.y - 72}" fill="#efe2c4" font-size="${fs}" text-anchor="middle" opacity="0.30" font-weight="bold" font-family="serif" style="paint-order:stroke;stroke:#0c0a07;stroke-width:4px">${esc(c.name)}</text>`;
  }
  /* 轨迹：已访问地点的连线 */
  const visited = [];
  for(const t of trail) if(t.s && !visited.includes(t.s)) visited.push(t.s);
  if(visited.length > 1){
    const pts = visited.map(id => { const q = spotPos(id); return q.x + "," + q.y; }).join(" ");
    s += `<polyline points="${pts}" fill="none" stroke="#5DCAA5" stroke-width="1.6" stroke-dasharray="6 5" opacity="0.5"/>`;
  }
  /* 避难所（大陆中心） */
  s += `<circle cx="${C.x}" cy="${C.y}" r="30" fill="none" stroke="#9FE1CB" stroke-width="1" opacity="0.5"/>`;
  s += `<rect x="${C.x-13}" y="${C.y-13}" width="26" height="26" rx="4" fill="#04342C" stroke="#5DCAA5" stroke-width="1.5"/>`;
  s += `<text x="${C.x}" y="${C.y+34}" fill="#9FE1CB" font-size="13" text-anchor="middle" font-weight="bold" style="paint-order:stroke;stroke:#0c0a07;stroke-width:3px">避难所 Lv.${lv("house")}</text>`;
  /* 天灾收缩圈（动态倒计时） */
  if(S.nextDis){
    s += `<circle cx="${C.x}" cy="${C.y}" r="48" fill="none" stroke="#E24B4A" stroke-width="1.6" stroke-dasharray="4 4" opacity="0.85"/>`;
    s += `<text id="mapDis${P}" x="${C.x}" y="${C.y-56}" fill="#F09595" font-size="13" text-anchor="middle" style="paint-order:stroke;stroke:#0c0a07;stroke-width:3px">${esc(S.nextDisType || "天灾")} · 还有 ${Math.ceil((S.nextDis||0)-S.day)} 天</text>`;
  }
  /* 地点节点（已知/未发现，威胁分带着色） */
  for(const n of nodes){
    const q = n.pos, on = n.known, band = threatBand(n.threat);
    const col = !on ? "#5F5E5A" : band.key === "dead" ? "#E24B4A" : band.key === "risk" ? "#EF9F27" : "#5DCAA5";
    s += `<g style="paint-order:stroke">`;
    s += `<circle cx="${q.x}" cy="${q.y}" r="7" fill="#15110d" stroke="${col}" stroke-width="1.4"${on ? "" : " opacity=0.5"}/>`;
    s += `<text x="${q.x}" y="${q.y-12}" fill="${on ? col : "#6f6e6a"}" font-size="12" text-anchor="middle" style="paint-order:stroke;stroke:#0c0a07;stroke-width:3px">${on ? esc(n.name) : "未发现"}</text>`;
    if(on) s += `<text x="${q.x}" y="${q.y+20}" fill="#cdbfa0" font-size="11" text-anchor="middle" style="paint-order:stroke;stroke:#0c0a07;stroke-width:2.5px">威胁 ${n.threat}</text>`;
    s += `</g>`;
  }
  /* 回放光标 */
  if(mapReplayIdx >= 0 && trail[mapReplayIdx]){
    const t = trail[mapReplayIdx];
    const q = t.s ? spotPos(t.s) : { x: C.x, y: C.y };
    s += `<circle cx="${q.x}" cy="${q.y}" r="13" fill="none" stroke="#FAC775" stroke-width="1.6" stroke-dasharray="3 3"/>`;
  }
  /* 主角（动态位置 + 状态） */
  const heroTxt = hero.moving
    ? "🚶 赶路中 → " + (((SPOTS[hero.spot] || {}).name) || "避难所")
    : (hero.spot ? "在" + ((SPOTS[hero.spot] || {}).name || "") + "干活" : "在避难所");
  s += `<g id="mapHero${P}" transform="translate(${hero.x},${hero.y})" style="transition:transform .9s linear">`;
  s += `<circle cx="0" cy="0" r="9" fill="#EF9F27"/>`;
  s += `<circle cx="0" cy="0" r="14" fill="none" stroke="#FAC775" stroke-width="1.2" opacity="0.7"/>`;
  s += `<text id="mapHeroLabel${P}" x="0" y="-20" fill="#FAC775" font-size="12" text-anchor="middle" style="paint-order:stroke;stroke:#0c0a07;stroke-width:3px">${esc(heroTxt)}</text>`;
  s += `</g>`;
  /* 罗盘（右上） */
  s += `<g transform="translate(1430,150)" opacity="0.85" font-family="serif">
    <circle r="26" fill="none" stroke="#8a7a5c" stroke-width="1"/>
    <path d="M0 -22 L6 0 L0 22 L-6 0 Z" fill="#9c8a64"/>
    <path d="M0 -22 L6 0 L0 0 Z" fill="#cbb98c"/>
    <text x="0" y="-28" font-size="11" fill="#cbb98c" text-anchor="middle">N</text></g>`;
  /* 比例尺（左下） */
  s += `<g transform="translate(60,985)" opacity="0.85" font-family="serif">
    <line x1="0" y1="0" x2="120" y2="0" stroke="#cbb98c" stroke-width="1.6"/>
    <line x1="0" y1="-5" x2="0" y2="5" stroke="#cbb98c" stroke-width="1.6"/>
    <line x1="60" y1="-3" x2="60" y2="3" stroke="#cbb98c" stroke-width="1"/>
    <line x1="120" y1="-5" x2="120" y2="5" stroke="#cbb98c" stroke-width="1.6"/>
    <text x="0" y="-9" font-size="9" fill="#cbb98c">0</text>
    <text x="112" y="-9" font-size="9" fill="#cbb98c">200km</text></g>`;
  /* 图例 + 水印遮罩（右下角） */
  s += `<g transform="translate(1188,890)" font-family="serif" font-size="10" fill="#cbb98c">
    <rect x="-8" y="-14" width="206" height="60" fill="#0c1318" opacity="0.55" stroke="#3a2f22" stroke-width="0.6"/>
    <circle cx="0" cy="-4" r="5" fill="#e08a3c"/><text x="12" y="-1">避难所</text>
    <circle cx="0" cy="13" r="4" fill="#5DCAA5"/><text x="12" y="16">已探地点</text>
    <circle cx="86" cy="13" r="4" fill="#E24B4A"/><text x="98" y="16">天灾</text>
    <circle cx="0" cy="30" r="4" fill="#EF9F27"/><text x="12" y="33">主角</text></g>`;

  /* bg 模式：铺满全屏背景（slice 裁切 + 无圆角）；否则居中留边 */
  const par = (mode === "bg") ? "xMidYMid slice" : "xMidYMid meet";
  const radius = (mode === "bg") ? "0" : "12px";
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="${par}" style="display:block;border-radius:${radius}" role="img" aria-label="世界地图">${s}</svg>`;
}

function mapSideText(){
  const sum = mapSummary();
  const span = (sum.from && sum.to) ? `第 ${sum.from.d + 1} → ${sum.to.d + 1} 天` : "还没有轨迹";
  let h = `<div class="map-stat"><span>轨迹跨度</span><b>${span}</b></div>`;
  h += `<div class="map-stat"><span>跑过地点</span><b>${sum.spots} 处</b></div>`;
  h += `<div class="map-stat"><span>天灾遭遇</span><b>${sum.disCount} 场（守住 ${sum.disWin}）</b></div>`;
  h += `<div class="map-stat"><span>轨迹采样</span><b>${sum.points} 点</b></div>`;
  h += `<div class="map-stat"><span>当前位置</span><b>${mapNowText()}</b></div>`;
  return h;
}
function mapNowText(){
  const h = heroRenderPos();
  if(h.moving) return "🚶 赶路中 → " + (((SPOTS[h.spot] || {}).name) || "避难所");
  return h.spot ? "在" + ((SPOTS[h.spot] || {}).name || "") + "干活" : "在避难所";
}

function mapEventsText(){
  const trail = S.trail || [];
  const keys = { discover: "🔍 发现", dis: "🌪️ 天灾", age: "🌟 阶段", born: "🌅 重生", death: "💀 死亡", move: "🚶 前往" };
  const evs = trail.filter(x => x.k !== "move").slice(-10).reverse();
  if(!evs.length) return `<div class="text-dim" style="font-size:12px">还没有值得回看的事件。</div>`;
  return evs.map(e => {
    const what = e.n ? (e.n.indexOf("win:") === 0 ? "守住" + e.n.slice(4) : e.n.indexOf("lose:") === 0 ? "失守" + e.n.slice(5) : e.n)
                      : e.s ? ((SPOTS[e.s] || {}).name || e.s) : "";
    return `<div class="map-event"><span class="text-dim">第 ${e.d + 1} 天</span> ${keys[e.k] || e.k} ${esc(String(what))}</div>`;
  }).join("");
}

/* ---------- 渲染：结构重建（签名变化时）+ 每秒实时更新 ---------- */
function renderMapInto(elId, isOverlay, force, mode){
  const el = document.getElementById(elId);
  if(!el) return;
  const P = mapPrefix(isOverlay);
  if(mode === undefined) mode = isOverlay ? "" : "bg";
  const sig = mapStructSig();
  if(force || sig !== (isOverlay ? mapSigOverlay : mapSigInline)){
    el.innerHTML = mapSvgText(P, mode);
    if(isOverlay) mapSigOverlay = sig; else mapSigInline = sig;
  }
  mapUpdateLive(P);
}

function mapUpdateLive(P){
  const h = heroRenderPos();
  const g = document.getElementById("mapHero" + P);
  if(g && typeof g.setAttribute === "function") g.setAttribute("transform", `translate(${h.x},${h.y})`);   /* headless 下无 DOM 方法时跳过 */
  const lb = document.getElementById("mapHeroLabel" + P);
  if(lb){
    const txt = h.moving ? "🚶 赶路中 → " + (((SPOTS[h.spot] || {}).name) || "避难所")
                         : (h.spot ? "在" + ((SPOTS[h.spot] || {}).name || "") + "干活" : "在避难所");
    if(typeof lb === "object" && lb.textContent !== txt) lb.textContent = txt;
  }
  const dt = document.getElementById("mapDis" + P);
  if(dt) dt.textContent = (S.nextDisType || "天灾") + " · 还有 " + Math.ceil((S.nextDis || 0) - S.day) + " 天";
}

/** 左上角极简信息条（只读，跟随地图） */
function updateMapChip(){
  const el = document.getElementById("mapChip");
  if(!el) return;
  const rem = Math.max(0, Math.ceil((S.nextDis || 0) - S.day));
  const pos = mapNowText();
  let last = "";
  try{ const lg = document.getElementById("log"); if(lg && lg.firstChild) last = lg.firstChild.textContent.replace(/^\[[\d:]+\]\s*/, ""); }catch(e){}
  const loc = pos.replace(/^🚶\s*/, "赶路中 ");
  el.innerHTML =
    `<span class="mc">🌪️ ${esc(S.nextDisType || "天灾")} 还有 ${rem} 天</span>` +
    `<span class="mc">📍 ${esc(loc)}</span>` +
    (last ? `<span class="mc">📜 ${esc(last)}</span>` : "");
}

function mapBandSide(){
  const el = document.getElementById("mapInfoBody");
  if(!el) return;
  el.innerHTML = `<div class="mapband-card">${mapSideText()}</div>` +
                 `<div class="mapband-card"><div class="mapband-cardhead">最近事件</div>${mapEventsText()}</div>`;
}

/* 每秒调用（renderHUD 末尾） */
function mapTick(){
  renderMapInto("mapInlineBg", false, false, "bg");     /* v8.30 地图铺满全屏背景 */
  if(mapOpen) renderMapInto("mapSvg", true);
  mapTickN = (mapTickN + 1) % 5;
  if(mapTickN === 0) mapBandSide();                    /* 地图信息面板（可能未展开，但便宜） */
  updateMapChip();
  const sl = document.getElementById("mapSlider");
  if(sl && mapOpen){
    const n = (S.trail || []).length;
    sl.max = String(Math.max(0, n - 1));
    if(mapReplayIdx < 0) sl.value = String(Math.max(0, n - 1));
  }
  const info = document.getElementById("mapReplayInfo");
  if(info && mapOpen){
    const t = (mapReplayIdx >= 0) ? (S.trail || [])[mapReplayIdx] : null;
    info.textContent = t
      ? `第 ${t.d + 1} 天 ${String(t.h).padStart(2, "0")}:00 ｜ ${({ move: "前往", discover: "发现新地点", dis: "天灾结算", age: "阶段推进", born: "重生", death: "死亡" })[t.k] || t.k} ${t.s ? ((SPOTS[t.s] || {}).name || t.s) : (t.n || "")}`
      : "拖动滑块，回看这段时间它跑过的地方。";
  }
  /* v8.29 徽标两处（全屏浮层 + 基地页地图带），原来只更新到浮层那个 */
  const liveTxt = mapReplayIdx >= 0 ? "回放中" : "实时运行";
  const liveCls = "map-live" + (mapReplayIdx >= 0 ? " replay" : "");
  for(const lid of ["mapLive"]){
    const live = document.getElementById(lid);
    if(live){ live.textContent = liveTxt; live.className = liveCls; }
  }
}

/* 兼容旧调用点 */
function renderMap(){ mapTick(); }

/* ---------- 回放控制（纯视觉，不推进游戏时间） ---------- */
function mapReplayTo(i){
  const n = (S.trail || []).length;
  if(!n) return;
  const k = Math.max(0, Math.min(n - 1, Math.floor(Number(i))));
  mapReplayIdx = (k >= n - 1 && !mapPlayTimer) ? -1 : k;
  mapSigOverlay = ""; mapSigInline = "";
  mapTick();
}
function mapReplayLive(){ mapReplayStop(); mapReplayIdx = -1; mapSigOverlay = ""; mapSigInline = ""; mapTick(); }
function mapReplayToggle(){
  if(mapPlayTimer) return mapReplayStop();
  const n = (S.trail || []).length;
  if(n < 2) return;
  if(mapReplayIdx < 0) mapReplayIdx = Math.max(0, n - 40);
  const btn = document.getElementById("mapPlayBtn");
  if(btn) btn.textContent = "⏸ 暂停";
  mapPlayTimer = setInterval(() => {
    if(!mapOpen) return mapReplayStop();
    const m = (S.trail || []).length;
    mapReplayIdx++;
    if(mapReplayIdx >= m - 1){ mapReplayIdx = m - 1; mapSigOverlay = ""; mapTick(); return mapReplayStop(); }
    mapSigOverlay = "";
    mapTick();
  }, 650);
}
function mapReplayStop(){
  if(mapPlayTimer){ clearInterval(mapPlayTimer); mapPlayTimer = null; }
  const btn = document.getElementById("mapPlayBtn");
  if(btn) btn.textContent = "▶ 播放";
}
try{ applyPop(); }catch(e){}            /* v8.30 基地页弹出面板初始状态（读 localStorage） */
/* 页面加载后应用弹出状态（DOM 就绪即可） */
if(typeof document !== "undefined" && document.addEventListener) document.addEventListener("DOMContentLoaded", () => {
  try{ applyPop(); }catch(e){}
  try{ applyPage(); }catch(e){}
  /* 窗口大小变化时重算面板高度，避免拖拽 / 旋转屏幕后面板溢出 */
  let _rto;
  window.addEventListener("resize", () => { clearTimeout(_rto); _rto = setTimeout(applyPopSize, 120); });
});
