/* ============================================================
 * engine.js — 时间推进引擎
 * 一切进度都从这里走：按小时切片推进，绝不跨越时段边界
 *
 * 本次新增（v7）：
 *   1. 生死阶梯：受伤 → 重伤 → 濒死 → 死亡（离线免死）
 *   2. 阶段推进：按天灾场次 + 关键建筑双轨检查
 *   3. 分层过滤：低阶段绝不产出高阶层物品
 *   4. 仓储溢出：超出容量的部分受潮/被偷（软惩罚）
 * ============================================================ */
"use strict";

let lastTick = Date.now();
let clockTimer = null;   /* v8.8 主循环定时器句柄（stopClock 用） */
let segMul = 1;          /* 当前时段产出系数 */
let segYield = {};       /* 本时段累计产出（受伤损失时按此扣） */
let segTired = false;    /* 本时段是否疲劳 */
let offlineMode = false; /* 是否处于离线结算中（离线免死的关键开关） */

/* 夜间能否出工：需要照明词条（提灯等） */
function nightWorkable(){ return hasTag(LIGHT_TAG) && (S.plan.night || "rest") !== "rest"; }
function isWorkSeg(seg){ return seg === "am" || seg === "pm" || (seg === "night" && nightWorkable()); }
function actOf(seg){ return seg === "night" ? (S.plan.night || "rest") : (S.plan[seg] || "rest"); }
function isSpotAct(a){ return !!SPOTS[a]; }

/* ---------- 时段开始 ---------- */
function startSegment(seg){
  if(seg === "night" && !nightWorkable()){      /* 夜间自动睡觉 */
    S.stam = Math.min(100, S.stam + STAM_SLEEP);
    /* 普通睡眠只能养好轻伤——重伤和濒死必须靠白天的「休息」或绷带 */
    if(S.wound === "light") woundHeal(1, "睡了一夜");
    return;
  }

  let act = actOf(seg);
  if(seg === "night") log(`🏮 提灯亮着——夜里也出工了。`);

  /* ★ 送死档拦截：没开激进模式时，主角不会硬闯必死的地方（挂机安全保险丝） */
  if(isSpotAct(act) && spotBlocked(act)){
    const a = assessSpot(act);
    log(`⛔ ${SPOTS[act].name} 威胁 ${spotThreat(act)}，你的战力只有 ${atk()}（判定「${a.tier.name}」）——主角在门口转了一圈，没进去。`, "bad");
    log(`　（想强行前往：在「主角」面板打开「⚠️ 激进模式」，收益 +${Math.round(AGGRESSIVE_REWARD*100)}%，但会死）`, "warn");
    act = "rest";
  }

  if(act === "explore"){
    S.stam = Math.max(0, S.stam - STAM_EXPLORE);
    doExplore();
    segMul = 0; segYield = {};
    return;
  }
  if(act === "workbench"){          /* 在工作台加工：占时段、耗体力，产出在 craftTick 里按小时推进 */
    S.stam = Math.max(0, S.stam - STAM_CRAFT);
    segMul = 0; segYield = {};
    if(!S.crafts.length) log("🛠️ 主角留守了半天，但没什么可做的——去「🛠️ 制作」面板开一条线（开工后出门也照做）。");
    return;
  }
  if(act === "rest"){
    S.stam = Math.min(100, S.stam + STAM_REST);
    /* 白天的休息是主要的自然疗伤手段（能治到重伤，濒死也能缓一级） */
    if(woundIdx() > 0) woundHeal(WOUND_REST_HEAL, "休息了半天");
    segMul = 0; segYield = {};
    return;
  }
  /* 采集 */
  segTired = S.stam < TIRED_BELOW;
  S.stam = Math.max(0, S.stam - STAM_GATHER);
  if(segTired) log("😮‍💨 主角太累了，这半天的动作慢了半拍（产出 -40%）。");
  if(woundIdx() > 0) log(`${woundInfo().icon} 带伤干活，效率只有 ${Math.round(woundMul() * 100)}%。`);

  /* 激进模式：在危险/送死档地点作业时产出 +50%（风险换收益） */
  let aggrMul = 1;
  if(S.aggressive && isSpotAct(act)){
    const a = assessSpot(act);
    if(a.tier.key === "risky" || a.tier.key === "suicide") aggrMul = 1 + AGGRESSIVE_REWARD;
  }
  segMul = woundMul() * (segTired ? TIRED_MUL : 1) * (0.85 + Math.random() * 0.3) * aggrMul;
  segYield = {};
}

/* ---------- 捕猎陷阱：消耗诱饵，不占主角时段（前期箱子的重要来源） ---------- */
function snareTick(hours){
  const l = S.bld.snare || 0;
  if(l <= 0) return;
  /* ★ 诱饵是"效率"而不是"开关"：没诱饵时仍有猎物自己撞上来（40% 效率）。
   *   否则会出现"陷阱←诱饵←生肉←陷阱"的死锁。 */
  const bait = Math.floor(S.res.bait || 0);
  const rate = SNARE_RATE * l * hours * (bait > 0 ? 1 : SNARE_NOBAIT_RATE);
  if(Math.random() >= rate) return;
  if(bait > 0) S.res.bait -= 1;          /* 有诱饵才消耗 */

  /* 猎物产出（只出当前阶段允许的东西） */
  const pool = SNARE_LOOT.filter(x => Object.keys(x.out).every(k => itemAllowed(k)));
  if(!pool.length) return;
  let roll = Math.random() * pool.reduce((a, x) => a + x.w, 0), pick = pool[0];
  for(const it of pool){ if(roll < it.w){ pick = it; break; } roll -= it.w; }
  const parts = [];
  for(const k in pick.out){
    const v = randRange(pick.out[k]);
    S.res[k] += v;
    parts.push(`${itemIcon(k)}${itemName(k)}+${v}`);
  }
  let msg = `🪤 陷阱有动静——捉到猎物：${parts.join("，")}`;

  if(Math.random() < SNARE_CHEST){
    const tier = effChestTier("bronze");
    addChest(tier, null);
    msg += `，猎物身上还缠着个${CHESTNAME[tier]}（已收入库房）`;
  }
  log(msg, "good");
}

/* ---------- 生肉会腐坏（熏肉/储物箱才能久存） ---------- */
function spoilTick(hours){
  const meat = S.res.meat || 0;
  if(meat <= 0.01) return;
  const keep = storageSpoilMul(lv("storage"));      /* 储物箱档位决定腐坏速度 */
  const rate = MEAT_SPOIL_PER_DAY * keep * hours / 24;
  const lost = meat * rate;
  S.res.meat = Math.max(0, meat - lost);
  if(lost >= 1) log(`🥩 有 ${Math.floor(lost)} 份生肉坏了——把肉熏制起来，或者升级储物箱。`, "warn");
}

/* ---------- 仓储溢出（v8.23 起：只提示，不再扣你已存的物资） ----------
 * 旧版每天按比例扣掉超出容量的散装材料——挂机一夜回来资源缩水，太伤。
 * 现在"满载"的代价转移到采集端：新采的只有 1/4 进仓（见 OVERFLOW_GATHER_MUL）。
 * 储物箱档位已改为跟随材质档（house-2），产量 ×2/档 与容量 ×2/档 同步，升级即可解决。 */
function overflowTick(hours){
  const used = storageUsed(), cap = storageCapNow();
  if(used <= cap) return;
  const pct = Math.min(999, Math.round((used - cap) / Math.max(1, cap) * 100));
  if(hours > 0 && Math.random() < 0.3){
    const nx = STORAGE_TIERS.find(t => t.lv === lv("storage") + 1);
    const need = nx
      ? `下一档「${nx.name}」需要材质档 ${lv("storage") + 3}${lv("house") >= lv("storage") + 3 ? "（已满足 ✓，图纸齐就能建）" : "（先把避难所升上去）"}`
      : "已经是最高档了";
    log(`🌧️ 仓库超载 ${pct}%——新采的物资大部分堆不下（只 1/4 进仓）。${need}。`, "warn");
  }
}

/* ---------- 工作台加工（占用时段，单人生存的取舍） ---------- */
/** 产出一件成品（材料在开工时已扣） */
function craftFinish(rec){
  if(rec.kind === "gear"){
    const g = rec.outGear;
    const base = rec.refine ? recipeById(rec.refineOf) : rec;      /* v8.9 精修：产出本体，不是"精修·XX" */
    let rar = rec.tier >= 4 ? 4 : rec.tier === 3 ? 3 : 2;
    if(rec.rough) rar = Math.min(rar, 2);                    /* 粗制装备词条上限：精良 */
    const item = { slot:g.slot, name: base ? base.name : rec.name, rar, val:g.val, on:false, tag:g.tag };
    /* ★ v8.6 暗黑词缀：roll 词条（粗制上限精良；图纸/精修满性能装 25% 概率追加 1 条） */
    item.tags = rec.rough ? rollAffixes(rar, 2)
              : (Math.random() < 0.25 ? rollAffixes(Math.min(3, rar + 1), 4) : []);
    const affixTxt = item.tags.length ? item.tags.map(t => tagInfo(t).name).join("、") : "";
    const ti = g.tag ? tagInfo(g.tag) : null;
    log(`🛠️ 完工：做出了 <b class="r${rar}">${item.name}</b>${rec.refine ? "（✨精修完全体）" : ""}${affixTxt ? "（词缀：" + affixTxt + "）" : ""}${ti ? "（词条：" + ti.name + "）" : ""}`, "good");
    if(ti) log(`　└ ${ti.desc}`, "good");
    equipOrSalvage(item);
  }else{
    for(const k in rec.out) S.res[k] = (S.res[k] || 0) + rec.out[k];
    const outTxt = Object.entries(rec.out).map(([k, v]) => `${itemIcon(k)}${itemName(k)}+${v}`).join("，");
    log(`🛠️ 完工：${rec.name} → ${outTxt}`, "good");
  }
  /* ★ v8.50：落库职责上移到 craftTick（批量完工只落库一次）——
   *   原来 77 万份的补完工循环每份 save(true) 强制落库一次，直接把主线程卡死。 */
}

/** 所有制作线按小时推进（与外出完全并行：主角出门时也照做）。
 *  线带 qty（v7.12）：一份做完立即入库并连做下一份，直到数量清零。
 *  ★ v8.50 防卡死：巨量补完工（离线挂机 + 大批量上限 999999）分两类消化——
 *   - 材料类：纯算术批量入库 + 一条汇总日志（几十万份也是毫秒级）；
 *   - 装备类：逐份 roll 词条，但每 tick 限 CRAFT_GEAR_CATCHUP 份，剩余进度保留、分帧消化。 */
function craftTick(hours){
  if(!S.crafts || !S.crafts.length) return;
  const benchLv = S.bld.bench || 0;
  let anyFinish = false;   /* ★ v8.50 本轮是否有完工（决定是否落库） */

  const done = [];
  for(const c of S.crafts){
    const rec = recipeById(c.id);
    if(!rec) continue;
    if(!rec.noBench && benchLv <= 0) continue;                /* 没工作台：只有徒手配方推进 */
    if(!hasBlueprint(rec)) continue;
    /* v8.25 逐配方取速度：材料加工随材质档 ×2/档，装备类限速 ×8（见 config.js craftSpeed） */
    const speed = (typeof craftSpeed === "function") ? craftSpeed(rec) : 1;
    if(c.qty == null) c.qty = 1;
    c.prog += hours * speed;
    /* ★ v8.50 防卡死补完工 */
    let made = 0;
    if(rec.outGear){
      /* 装备类：逐份 roll 词条/词缀，限流消化（剩余进度保留在 c.prog，下 tick 继续） */
      while(c.qty > 0 && c.prog >= rec.hours && made < CRAFT_GEAR_CATCHUP){
        craftFinish(rec);
        c.qty--; made++;
        c.prog -= rec.hours;
      }
    }else{
      /* 材料类：★ v8.51 O(1) 算术批量入库 —— 不逐份迭代（qty 上限 999999，
       * 逐份虽是轻活也有几十 ms 开销；算术式完成后连 1000 万份都是微秒级），汇总一条日志 */
      const n = Math.min(c.qty, Math.floor(c.prog / Math.max(rec.hours, 1e-9)));
      if(n > 0){
        const bulk = {};
        for(const k in rec.out) bulk[k] = rec.out[k] * n;
        for(const k in bulk) S.res[k] = (S.res[k] || 0) + bulk[k];
        c.qty -= n;
        c.prog -= n * rec.hours;
        const outTxt = Object.entries(bulk).map(([k, v]) => `${itemIcon(k)}${itemName(k)}+${fmt(v)}`).join("，");
        log(`🛠️ 批量完工：${rec.name} ×${n} → ${outTxt}`, "good");
        anyFinish = true;
      }
    }
    if(made > 0) anyFinish = true;
    if(c.qty <= 0) done.push(c);
  }
  if(anyFinish) save(true);   /* ★ v8.50 本轮有完工 → 统一落库一次 */
  if(!done.length) return;
  S.crafts = S.crafts.filter(c => !done.includes(c));
}

/** 开工一条制作线：检查槽位、材料并预扣。qty = 一次做几份（v7.12） */
function startCraft(id, qty){
  const rec = recipeById(id);
  if(!rec) return false;
  /* v8.28 上限随段位放大：旧写死 999 远低于 UI 的 9999，后期更不够（钢/高阶材料要以万计）。
   * 与 UI 共用 craftQtyCap()；ui.js 未加载时回退 9999，保证不崩。 */
  const cap = (typeof craftQtyCap === "function") ? craftQtyCap() : 9999;
  const n = Math.max(1, Math.min(cap, Math.floor(qty || 1)));

  /* 槽位限制：同时只能开 craftSlotMax() 条线 */
  if(S.crafts.length >= craftSlotMax()){
    const nx = nextSlotBp();
    log(`🛠️ 制作线已经占满（${S.crafts.length}/${craftSlotMax()} 条）。` +
        (nx ? `需要图纸「${nx.bp}」才能同时开更多线——去开箱子找找。` : "已经到上限了。"), "bad");
    return false;
  }
  /* 同一配方不能重复开工 */
  if(S.crafts.some(c => c.id === id)){ log(`🛠️ 「${rec.name}」已经在做了。`, "bad"); return false; }

  if(!rec.noBench && (S.bld.bench || 0) <= 0){
    const hand = RECIPES.filter(x => x.noBench).map(x => x.name).join("、");
    log(`🛠️ 「${rec.name}」需要工作台（现在还没有）。徒手能做的只有：${hand}。`, "bad");
    return false;
  }
  if(!hasBlueprint(rec)){ log(`🛠️ 「${rec.name}」需要图纸：${rec.bp}`, "bad"); return false; }
  /* ★ 粗制装备（v8.6 双轨制）：需要装备加工台，无需图纸 */
  if(rec.rough && (S.bld.forge || 0) <= 0){
    log(`🔨 「${rec.name}」需要「装备加工台」（木屋后可建）——建好它，没有图纸也能打装备。`, "bad");
    return false;
  }
  /* ★ 精修（v8.9 双轨制桥接）：高级加工台（Lv.2）+ 一件同名粗制装当底子（不消耗） */
  if(rec.refine){
    if((S.bld.forge || 0) < (rec.needForge || 2)){
      log(`✨ 「${rec.name}」需要「高级装备加工台」（装备加工台升到 Lv.2，需钛合金堡垒级别的材质工艺）。`, "bad");
      return false;
    }
    if(!hasRoughGear(rec.needRough)){
      log(`✨ 精修需要一件「${rec.needRough}」当底子（不消耗）——先在工作台打一件。`, "bad");
      return false;
    }
  }
  if(rec.kind === "gear" && (rec.tier || 1) > ageGearTier() && !rec.needHouse){
    log(`🛠️ 「${rec.name}」超出了当前阶段的工艺水平——先推进到下一阶段（需要 ${GEAR_TIER[rec.tier]} 的能力）。`, "bad");
    return false;
  }
  /* ★ v8.12 公式代际装备（T6+）：不看阶段，看避难所材质档（工艺水平跟着家走） */
  if(rec.needHouse && lv("house") < rec.needHouse){
    log(`🛠️ 「${rec.name}」需要材质档 ${rec.needHouse} 级的工艺（当前 ${lv("house")} 级「${houseTier(lv("house")).name}」）——先把避难所升上去。`, "bad");
    return false;
  }
  if(rec.tier && rec.kind !== "gear" && rec.tier > ageMaxTier()){
    log(`🛠️ 「${rec.name}」需要更高级的材料（${TIER_NAME[rec.tier]}），现在做不了。`, "bad");
    return false;
  }
  /* v8.9：精修走 craftCostOf（基准 ×0.8，持图纸减半） */
  const unitCost = (typeof craftCostOf === "function") ? craftCostOf(rec) : rec.in;
  const need = {};
  for(const k in unitCost) need[k] = unitCost[k] * n;
  if(!canPay(need)){ log(`🛠️ 材料不够做 ${n} 份：${Object.entries(need).map(([k, v]) => `${itemName(k)}×${v}`).join("，")}`, "bad"); return false; }
  pay(need);
  S.crafts.push({ id, prog:0, qty:n });
  log(`🛠️ 开了第 ${S.crafts.length} 条制作线：${rec.name} ×${n}（每份 ${hourText(rec.hours)}，材料已扣）——出门干活也照做`, "good");
  return true;
}

/** 取消一条制作线（退回全部已扣材料） */
function cancelCraft(id){
  const i = S.crafts.findIndex(c => c.id === id);
  if(i < 0) return false;
  const c = S.crafts[i];
  const rec = recipeById(id);
  if(rec){
    const unit = (typeof craftCostOf === "function") ? craftCostOf(rec) : rec.in;   /* v8.9 精修按实际扣料退还 */
    for(const k in unit) S.res[k] = (S.res[k] || 0) + unit[k] * (c.qty || 1);
  }
  S.crafts.splice(i, 1);
  if(rec) log(`🛠️ 取消了「${rec.name}」×${c.qty || 1}，材料已退回。`);
  return true;
}

/* ---------- 背包升级（不占时段，花材料解锁） ---------- */
function upgradeBag(){
  const nx = bagNextCfg();
  if(!nx){ log("🎒 背包已经是最大容量了。"); return false; }
  if(!canPay(nx.cost)){
    log(`🎒 材料不够：${Object.entries(nx.cost).map(([k, v]) => `${itemName(k)}×${v}`).join("，")}`, "bad");
    return false;
  }
  pay(nx.cost);
  S.bagLv = nx.lv;
  log(`🎒 背包升级为「${nx.name}」——一次外出能带回 ${nx.carry[0]}~${nx.carry[1]} 个箱子。`, "good");
  invalidateUI(); renderAll();
  return true;
}

/* ---------- 箱子：等级受阶段限制（未解锁的一律降级为木箱） ---------- */
function effChestTier(want){
  if(!want) return "wood";
  return chestUnlocked(want) ? want : "wood";
}

function addChest(tier, reason){
  S.chests[tier] = (S.chests[tier] || 0) + 1;
  S.dryH = 0;                    /* 拿到箱子就重置保底计时 */
  if(reason) log(reason);
  /* ★ 挂机自动开箱（默认开）：让战利品即时进日志，挂机也有爽点。
   *   关掉则箱子留在「箱子」标签页手动开（适合想自己挑时机的人）。 */
  if(S.autoOpen && typeof openChest === "function") openChest(tier, 1);
}

/* ---------- 时段结束（危险遭遇判定） ----------
 * ★ 判定完全基于「战力 vs 威胁」的档位，而不是纯概率：
 *   战力碾压的地方，野兽根本不敢露面；战力不够的地方，去之前 UI 就会警告。
 */
function endGatherSegment(spotId){
  const spot = SPOTS[spotId];
  if(!spot) return;

  const a = assessSpot(spotId);
  const tier = a.tier;

  /* 遭遇概率随档位变化：轻松档 ×0.3，送死档 ×1.5 */
  if(Math.random() >= spot.danger * tier.dangerMul) return;

  /* 词条：远程压制——额外的全身而退概率 */
  if(hasTag("ranged") && Math.random() < RANGED_DODGE){
    log(`🏹 在${spot.name}远远望见野兽，主角抬手一箭，它掉头跑了（远程压制：全身而退）。`,"good");
    return;
  }

  /* 判定胜负：档位决定胜率（轻松/稳妥必赢） */
  if(Math.random() < tier.win){
    /* ★ 打赢必得兽皮——这是兽皮在陷阱之外的重要来源，
     *   堵死"绳索←兽皮←陷阱←绳索"的死锁（新手礼包用完后也能靠打猎续上） */
    const winLoot = winBeastLoot();
    for(const k in winLoot) S.res[k] = (S.res[k] || 0) + winLoot[k];
    const lootTxt = Object.entries(winLoot).map(([k, v]) => `${itemIcon(k)}${itemName(k)}+${v}`).join("，");
    if(tier.key === "easy" || tier.key === "safe"){
      log(`🐺 在${spot.name}撞上了野兽——它看清了主角手里的家伙，掉头就跑。（战力 ${atk()} vs 威胁 ${spotThreat(spotId)}，${tier.name}）`,"good");
    }else{
      log(`🐺 在${spot.name}撞上了野兽，主角一个回合把它撂倒——剥了皮、割了肉（${lootTxt}）。`,"good");
    }
    return;
  }

  /* 战败：伤势由档位决定（不会"随机猝死"，是明码标价的后果） */
  const woundName = THREAT_WOUND[tier.key] || "light";
  const targetIdx = WOUND_ORDER.indexOf(woundName);
  const heavyIdx = WOUND_ORDER.indexOf("heavy");
  const before = woundLevel();

  if(offlineMode && targetIdx > heavyIdx){
    /* ★ 离线免死：最多到重伤，不再恶化 */
    if(woundIdx() < heavyIdx) woundSet("heavy", true);
    log(`🐺 在${spot.name}遭遇野兽，主角带伤脱身——挂机保护生效，不会再糟。`, "warn");
  }else if(woundIdx() >= targetIdx){
    /* 已经不低于该档位了：不再重复恶化，只是白白挨一下 */
    log(`🐺 在${spot.name}又撞上野兽，主角勉强撑住（伤势已在「${WOUND[woundLevel()].name}」）。`, "bad");
  }else{
    S.wound = woundName;
    if(woundName === "dying") S.dyingH = DYING_HOURS;
    log(`${WOUND[woundName].icon} 在${spot.name}被野兽袭击——战力 ${atk()} vs 威胁 ${spotThreat(spotId)}，判定「${tier.name}」。${WOUND[woundName].desc}`, "bad");
  }

  for(const k in segYield) S.res[k] = Math.max(0, S.res[k] - segYield[k] * 0.5);
  if(before !== "none") log("　└ 采集的东西也丢了一半。", "bad");
}

/* ---------- 探索（成批搬回物资箱 + 可能发现新地点） ---------- */
function doExplore(){
  if(S.queue.length && Math.random() < 0.75){
    const id = S.queue.shift();
    S.found.push(id);
    if(typeof trailPush === "function") trailPush("discover", id);   /* v8.15 轨迹 */
    const sp = SPOTS[id];
    log(`🗺️ 主角勘察了周边：发现了「${sp.name}」！${sp.desc}（日程里可以安排过去了）`,"good");
    /* 发现时就把威胁摊开说清楚，不让玩家去撞 */
    const a = assessThreat(sp.threat);
    if(a.tier.key === "suicide"){
      log(`　⚠️ 威胁 ${sp.threat} ｜ 你的战力 ${atk()} → 「${a.tier.name}」。现在去不了，至少需要 ${needAtkFor(id, "hard")} 战力。`, "warn");
    }else{
      log(`　威胁 ${sp.threat} ｜ 你的战力 ${atk()} → 「${a.tier.name}」（${a.tier.note}）`, "good");
    }
    S.res.wood += 10; S.res.stone += 5;
  }else if(S.queue.length === 0){
    log("🗺️ 周边已经探得差不多了，主角轻车熟路地扫了几处废墟。");
    S.res.wood += 15; S.res.metal += 8;
  }else{
    log("🗺️ 转了半天没发现新地方，但沿路把废弃的房子翻了个遍。");
    S.res.wood += 8;
  }

  /* 探索必搬箱：一次能搬回多少，取决于背包容量 */
  const carry = bagCarryRange();
  const n = randRange(carry);
  for(let i = 0; i < n; i++) addChest("wood", null);
  let msg = `🎒 背包（${bagCfg().name}）装满就回——搬回 ${n} 个${CHESTNAME.wood}`;
  const bt = effChestTier("bronze");
  if(bt !== "wood" && Math.random() < 0.25){
    addChest(bt, null);
    msg += `，还撬开一处上锁的储物间，多带一个${CHESTNAME[bt]}`;
  }
  log(msg + "。", "good");

  /* 探索也是图纸的主要来源之一 */
  if(Math.random() < EXPLORE_BP_CHANCE) grantBlueprint("探索途中翻到的旧图纸");
}

/** 获得一张还没拿到的图纸（preferGear = 优先给装备图纸）
 *  ★ v8.1 阶段分层：主掉当前阶段图纸（85%），15% 出高一级的惊喜；不再掉高两级的废纸。
 *     当前阶段图纸集齐后自动滑向下一级（为阶段推进做准备）。 */
function grantBlueprint(src, preferGear){
  const owned = S.bp || [];
  const gearPool = (typeof GEAR_BLUEPRINTS !== "undefined" ? GEAR_BLUEPRINTS : []).filter(b => !owned.includes(b));
  const matPool  = BLUEPRINTS.filter(b => !owned.includes(b));
  /* v8.23：储物图纸按"材质档能升到的档位"过滤（不再按阶段）——
   *  储物箱档位已与材质档挂钩（升到 lv 需 house ≥ lv+2），图纸可用性同步跟 house 走。 */
  /* 注意：非储物图纸返回 0（不是 99）——返回 99 会让下面 isNewStore 把它们误判成新档位储物图纸，
     整批被踢出阶段分层池（阶段 1 就只剩 2 张 T1，抽完立刻掉 T3）。 */
  const storeLvOf = bp => {
    const t = (typeof STORAGE_TIERS !== "undefined") ? STORAGE_TIERS.find(x => x.bp === bp) : null;
    return t ? t.lv : 0;
  };
  const isStoreBp = bp => (typeof STORAGE_BP !== "undefined") && STORAGE_BP.indexOf(bp) >= 0;
  /* lv1~5 是原始档位（只需图纸）；lv6 起才跟材质档挂钩（house ≥ lv+2） */
  const storeUsableLv = Math.max(5, (typeof S !== "undefined" && S && S.bld) ? (S.bld.house - 2) : 5);
  const storePool = (typeof STORAGE_BP !== "undefined" ? STORAGE_BP : [])
    .filter(b => !owned.includes(b) && storeLvOf(b) <= storeUsableLv);
  /* 制作线槽位图纸：解锁"同时能做几种" */
  const slotPool = (typeof CRAFT_SLOT_BPS !== "undefined" ? CRAFT_SLOT_BPS : [])
    .map(s => s.bp).filter(b => b && !owned.includes(b));
  let pool = matPool.concat(gearPool).concat(storePool).concat(slotPool).filter(b => b && typeof b === "string");
  if(preferGear && gearPool.length && Math.random() < 0.65) pool = gearPool;

  /* ★ 仓储告急时优先给储物箱图纸（温和引导，不让玩家卡在爆仓里）——池子已按材质档过滤 */
  let storeHint = false;
  if(storePool.length && storageUsed() > storageCapNow() * 0.8){
    if(Math.random() < 0.7){
      pool = storePool;
      storeHint = true;
    }
  }
  /* 制作线占满时优先给槽位图纸（解锁"同时做更多种"） */
  if(slotPool.length && (S.crafts || []).length >= craftSlotMax() && Math.random() < 0.6){
    pool = slotPool;
  }
  if(!pool.length) return false;

  /* ★ 阶段分层抽选。v8.23：储物图纸分两条线——
     老档位（lv1~5）参与阶段分层（就是原始设计）；新档位（lv>=6）按材质档解锁，走独立支线，不进主池，
     否则它们会把阶段分层的池子稀释掉（阶段 1 掉出一堆用不上的高阶储物图纸）。 */
  const cur = ageMaxTier();
  const isNewStore = b => isStoreBp(b) && storeLvOf(b) >= 6;
  const legacyPool = pool.filter(b => !isNewStore(b));
  const newStorePool = pool.filter(b => isNewStore(b));
  const main = legacyPool.filter(b => bpTierOf(b) <= cur);          /* 当前阶段：有用 */
  const next = legacyPool.filter(b => bpTierOf(b) === cur + 1);     /* 高一级：惊喜 */
  if(main.length && (Math.random() < 0.85 || !next.length)) pool = main;
  else if(next.length) pool = next;
  else if(legacyPool.length){
    /* 主池与惊喜池都空（本阶段图纸集齐）→ 按最接近的未拥有层级兜底，不放开到任意 tier */
    const minT = Math.min.apply(null, legacyPool.map(b => bpTierOf(b)));
    pool = legacyPool.filter(b => bpTierOf(b) === minT);
  }
  /* 新档位储物图纸（lv>=6）：材料档够格（house>=8，即 house-2>=6）时才有 15% 概率作为附加支线出现；
     仓储告急时另有 storeHint 优先。house 低时不启用，免得污染早期阶段分层。 */
  if(newStorePool.length && (S.bld.house || 1) >= 8 && Math.random() < 0.15) pool = newStorePool;

  const bp = pool[Math.floor(Math.random() * pool.length)];
  S.bp.push(bp);
  const isStore = storePool.includes(bp);
  const isSlot = slotPool.includes(bp);
  const tail = isSlot ? `（同时能做的种类 → ${craftSlotMax()} 种）`
             : isStore ? "（储物箱可以升到下一档了）"
             : "（制作面板里可以开工了）";
  log(`📜 ${src ? src + "：" : ""}获得图纸「${bp}」${tail}`, "warn");
  if(storeHint) log("　└ 仓储快满了，这张来得正是时候。", "good");
  return true;
}

/* ---------- 天灾（按序列推进：提前预告类型，针对性准备） ---------- */
function disResolve(){
  const t = disType();
  let name = t.name;
  let mult = t.mult;
  let mitigated = false;

  /* 词条：对应灾种的抗性装备（防毒面具/保温服/防水装备/隔热壳/防酸披风） */
  if(t.tag && hasTag(t.tag)){
    mult *= (1 - HAZARD_MITIGATION);
    mitigated = true;
  }
  /* ★ 防灾设施（v8.5）：避难所固有的抗灾建设（防酸涂层/保温/排水/地下室/密封舱门），
   *   与装备抗性乘法叠加——对齐小说"建设避难所本身来抗灾"的核心玩法。 */
  let facCut = 0;
  for(const b of BLDCFG){
    if(b.mitTag === t.tag && lv(b.id) > 0) facCut += b.mitCut;
  }
  if(facCut > 0){
    mult *= (1 - facCut);
    mitigated = true;
  }

  /* ★ 复合灾（v8.6）：第 12 场起 30% 概率双灾并发——两套建造命题同时考验 */
  let compound = null;
  if(S.wave >= 12 && Math.random() < 0.3){
    const pool = DIS_TYPES.filter(x => x.name !== name);
    const t2 = pool[Math.floor(Math.random() * pool.length)];
    let m2 = 0.6;
    if(t2.tag && hasTag(t2.tag)) m2 *= (1 - HAZARD_MITIGATION);
    for(const b of BLDCFG){ if(b.mitTag === t2.tag && lv(b.id) > 0) m2 *= (1 - b.mitCut); }
    compound = { name: t2.name, multFinal: m2 };
  }
  const compoundMul = compound ? Math.max(mult, compound.multFinal) * 1.4 : mult;

  /* ★ v8.12 战力抵减（用户："攻击力没跟天灾难度挂钩"）：
   *   主角带武器主动出击，每点战力抵 0.5 强度，上限砍掉一半——装备不再是摆设。 */
  const rawNeed = Math.round(disIntensity() * compoundMul);
  const atkCut = attackCut(rawNeed);   /* v8.13b 守家总攻 = 战力 + 火力（叠加） */
  const need = Math.max(0, rawNeed - atkCut);
  const have = def();
  const disName = name + (compound ? "×" + compound.name : "");
  name = disName;
  if(compound) log(`⛈️ 灾变叠加：${compound.name} 与 ${name} 同时降临！`);

  let report;
  if(have >= need){
    const w = 150 + S.wave*80, st = 100 + S.wave*60, m = 100 + S.wave*50;
    S.res.wood += w; S.res.stone += st; S.res.metal += m;
    const ct = effChestTier(S.wave >= 4 ? "silver" : "bronze");
    S.chests[ct] = (S.chests[ct] || 0) + 1;
    const relicGot = Math.random() < 0.3;
    if(relicGot) S.chests.relic += 1;
    log(`🌪️ ${name}来袭！防御 ${have} ≥ 强度 ${need}${atkCut ? `（战力+火力出击削弱 ${atkCut}）` : ""}${mitigated ? `（装备抗性已生效，强度按 ${Math.round(t.mult*100)}%×70% 计）` : ""}，避难所扛住了。灾后废墟里翻出：木材+${w} 石料+${st} 金属+${m}，还有个${CHESTNAME[ct]}！`,"good");
    report = {
      win: true, wave: S.wave, name, day: Math.floor(S.day) + 1, have, need, mitigated,
      atkCut, rawNeed,
      rewards: `木材 +${w}、石料 +${st}、金属 +${m}、${CHESTNAME[ct]} ×1${relicGot ? "、遗迹箱 ×1" : ""}`
    };
  }else{
    const k = lossMul();
    const lossPct = Math.round(DIS_LOSS * k * 100);
    for(const key of ["wood","stone","metal","food","water"]) S.res[key] *= (1 - DIS_LOSS * k);
    let houseDown = null;
    if(lv("house") > 1){
      S.bld.house--;
      houseDown = houseTier(lv("house"));
      log(`${houseDown.icon} 避难所在${name}中损毁，从上一档跌回了「${houseDown.name}」！`,"bad");
    }
    log(`🌪️ ${name}来袭！防御 ${have} < 强度 ${need}${atkCut ? `（战力+火力已削弱 ${atkCut}，但不够）` : ""}……损失惨重，物资 -${lossPct}%。`,"bad");
    /* 天灾也会让人受伤（离线时不超过重伤） */
    let wounded = false;
    if(offlineMode){
      if(woundIdx() < WOUND_ORDER.indexOf("heavy")) woundSet("heavy", true);
      wounded = true;
    }else{
      woundWorsen(`${name}中避难所被冲开`);
      wounded = true;
    }
    report = {
      win: false, wave: S.wave, name, day: Math.floor(S.day) + 1, have, need, mitigated,
      atkCut, rawNeed, lossPct, houseDown, wounded
    };
  }

  /* ★ 灾报（v7.16）：写入灾史可随时翻查；在线弹全屏公告，离线则记未读 */
  S.disLog = S.disLog || [];
  S.disLog.push(report);
  if(typeof trailPush === "function") trailPush("dis", null, (report.win ? "win" : "lose") + ":" + report.name);   /* v8.15 轨迹 */
  if(!offlineMode) showDisBanner(report);
  else S.disUnread = true;
  save();   /* ★ 天灾结算立即落库（重要节点不等节流） */

  S.wave++;
  S.nextDisType = disTypeAtWave(S.wave).name;   /* v8.14 新灾种按场次解锁 */
  const gap = disGapAt(S.wave);
  S.nextDis = S.day + gap;
  S.warned = false;
  log(`📅 第 ${S.wave} 场灾难：${S.nextDisType}｜预计第 ${Math.ceil(S.nextDis)} 天（间隔 ${gap} 天）。${disType().tip}`);
}

/* ---------- 野兽袭击 ---------- */
function beastEvent(){
  if(inNewbie()){                     /* 新手期不刷野兽 */
    S.nextBeast = NEWBIE_DAYS + 1;
    return;
  }
  const strength = beastStrength(), have = def();
  /* v8.12：野兽是"还手"的主场——战力同样削弱（上限砍半） */
  const cut = attackCut(strength);   /* v8.13b 守家总攻 = 战力 + 火力（叠加） */
  const need = Math.max(0, strength - cut);
  if(have >= need){
    S.res.food += 6;
    log(`🐺 野兽夜里摸进避难所，${cut ? `战力与火力网先打了一轮（削弱 ${cut}），` : ""}被陷阱和防御挡住，反手猎了它——口粮 +6（新鲜肉）。`,"good");
  }else{
    const k = lossMul();
    S.res.wood *= (1 - BEAST_LOSS * k);
    S.res.stone *= (1 - BEAST_LOSS * k);
    S.res.metal *= (1 - BEAST_LOSS * k);
    log(`🐺 野兽袭击！防御 ${have} < ${need}${cut ? `（战力+火力已削弱 ${cut}）` : ""}，材料被糟蹋了不少（-20%）。加固工事、换把好武器吧。`,"bad");
    if(offlineMode){
      if(woundIdx() < WOUND_ORDER.indexOf("heavy")) woundSet("heavy", true);
    }else{
      woundWorsen("夜里被野兽抓伤");
    }
  }
  S.nextBeast = S.day + BEAST_GAP_MIN + Math.floor(Math.random() * (BEAST_GAP_MAX - BEAST_GAP_MIN + 1));
}

/* ---------- 阶段推进 ---------- */
function checkAgeAdvance(){
  const p = ageProgress();
  if(!p.ok || p.final || !p.next) return false;
  const from = curAge(), to = p.next;

  S.age = to.id;
  /* 新阶段的资源点进入探索池 */
  for(const id of (SPOTQUEUE_BY_AGE[to.id] || [])){
    if(!S.found.includes(id) && !S.queue.includes(id)) S.queue.push(id);
  }
  S.stats.ageReached = Math.max(S.stats.ageReached || 1, to.id);
  if(typeof trailPush === "function") trailPush("age", null, String(to.id));   /* v8.15 轨迹 */

  log(`🎉 【阶段推进】${from.name} → ${to.name}（${to.era}）`, "good");
  log(`　${to.tagline}`, "good");
  for(const u of to.unlock) log(`　＋ 解锁：${u}`, "good");
  if(typeof showAgeBanner === "function") showAgeBanner(to);
  invalidateUI();
  save();
  return true;
}

/* ---------- 死亡 ---------- */
function playerDie(cause){
  const days = Math.floor(S.day) + 1;
  S.stats.deaths = (S.stats.deaths || 0) + 1;
  S.stats.best = Math.max(S.stats.best || 0, days);

  const report = {
    day: days,
    age: curAge().name,
    wave: S.wave,
    cause,
    chests: S.stats.chestsOpened || 0,
    deaths: S.stats.deaths,
    rebirth: (S.rebirth || 0) + 1,
    places: (S.found || []).map(id => SPOTS[id] ? SPOTS[id].name : id),
    bps: (S.bp || []).length,
    when: Date.now()
  };
  S.lastReport = report;

  log(`💀 主角没能撑过来。这一世活了 ${days} 天，走到了${report.age}。`, "bad");
  log("　但你早就知道会这样——记忆还在，一切可以重来。", "warn");
  if(typeof trailPush === "function") trailPush("death", null, report.cause || "");   /* v8.15 轨迹 */
  if(typeof showDeathBanner === "function") showDeathBanner(report);
  save();
}

/* ---------- 重生（死亡不是失败，是第二幕） ---------- */
function doRebirth(){
  const report = S.lastReport;
  const keepBld = {};
  for(const b of BLDCFG){
    const l = lv(b.id);
    if(l <= 0){ keepBld[b.id] = 0; continue; }
    if(b.id === "house"){ keepBld[b.id] = Math.max(1, Math.floor(l * REBIRTH_KEEP_BLD)); continue; }
    keepBld[b.id] = Math.floor(l * REBIRTH_KEEP_BLD) + (Math.random() < 0.35 ? 1 : 0);
  }
  const bps = (S.bp || []).slice();          /* 图纸：知识不会忘 */
  const rebirth = (S.rebirth || 0) + 1;
  const stats = S.stats;
  stats.born = Date.now(); stats.bornDay = 0;

  S = newState();
  S.bp = bps;
  S.bld = keepBld;
  S.rebirth = rebirth;
  S.stats = stats;
  S.lastReport = report;
  S.forewarn = rebirth * REBIRTH_FOREWARN;   /* 前世记忆：天灾预告提前 */

  /* 重生加成：初始物资随世数叠加（保证"这一世一定比上一世强"） */
  for(const k in REBIRTH_BONUS) S.res[k] += REBIRTH_BONUS[k] * rebirth;

  if(typeof trailPush === "function") trailPush("born", null, String(rebirth));   /* v8.15 轨迹 */
  log(`🌅 第 ${rebirth} 世开始了。`, "good");
  log(`　你带着 ${bps.length} 张图纸和上辈子的记忆回来——避难所还留着 ${Object.entries(keepBld).filter(([,v]) => v > 0).map(([k, v]) => `${(BLDCFG.find(b => b.id === k) || {}).name}Lv.${v}`).join("、") || "一片空地"}。`, "good");
  log(`　这一次，你比谁都清楚什么时候该造什么。`, "good");
  if(typeof hideDeathBanner === "function") hideDeathBanner();
  invalidateUI();
  renderAll();
  save();
}

/* ---------- 主推进：按小时切片 ---------- */
function advanceHours(dtH, isOffline){
  offlineMode = !!isOffline;
  let rem = dtH;
  globalThis.__advIter = 0;
  while(rem > 1e-9){
    /* ★ v8.51 循环守卫：总迭代有硬上限（>400 = 数值病态，截断结算防挂死）。
     *  注意：浮点卡边界（step 极小）是正常自愈现象——走一小步就越过边界了，
     *  不要在这里 break 小步长（v8.51 初版曾因此把游戏时间冻死在整点边界）。 */
    if(++globalThis.__advIter > 400){ break; }
    const hod = (S.day * 24) % 24;
    const segEnd = hod < 6 ? 6 : hod < 12 ? 12 : hod < 18 ? 18 : 24;
    const step = Math.min(rem, segEnd - hod);
    const seg = segOf(hod);
    checkFortune();                                  /* 跨入新的一天：自动抽今日签（v7.13） */

    /* 时段切换：先结算上一段，再开启新段 */
    if(S.curSeg !== seg){
      if((S.curSeg === "am" || S.curSeg === "pm") || (S.curSeg === "night" && nightWorkable())){
        const prevAct = actOf(S.curSeg);
        if(prevAct && prevAct !== "explore" && prevAct !== "workbench" && prevAct !== "rest") endGatherSegment(prevAct);
      }
      startSegment(seg);
      if(typeof trailPush === "function") trailPush("move", actOf(seg));   /* v8.15 轨迹 */
      S.curSeg = seg;
      if(seg !== "night" || nightWorkable()){
        const label = seg === "am" ? "上午" : seg === "pm" ? "下午" : "夜间";
        log(`🕙 ${label}：${planLabel(actOf(seg))}`);
      }
    }

    /* 采集产出（探索/加工/休息都不产采集资源） */
    const act = actOf(seg);
    const isGather = act && act !== "explore" && act !== "workbench" && act !== "rest";
    if(isWorkSeg(seg) && isGather){
      const sp = SPOTS[act];
      if(sp){
        const toolMul = hasTag("tool") ? (1 + TOOL_BONUS) : 1;
        const fortMul = fortuneMul();                /* 今日运势：只影响采集收成 */
        /* v8.6 搜集词条 + v8.27 护符搜集效率（v8.42：3 插槽可叠加，封顶 +300%） */
        const gatMul = 1 + Math.min(100, tagSum("gatherBoost")) / 100
                         + ((typeof prodBonus === "function") ? prodBonus() : 0);
        const powMul = powerOn() ? 1 + 0.04 * powerLv() : 1;             /* v8.7 电力：机械化采集 */
        /* v8.23：仓库满载时"堆不下"——新采的只有 1/4 能进仓（代价体现在这里，
         *  而不是扣你已存的物资：挂机一夜回来发现家被搬空太伤了）。 */
        const overMul = isOverflow() ? OVERFLOW_GATHER_MUL : 1;
        for(const k in sp.y){
          if(!itemAllowed(k)) continue;                  /* 阶段过滤：高阶层物品不产出 */
          const gain = sp.y[k] * step * segMul * toolMul * fortMul * gatMul * powMul * overMul * (typeof spotYieldMul === "function" ? spotYieldMul(sp) : 1);   /* v8.17 区域/材质档产量倍率 */
          S.res[k] += gain;
          segYield[k] = (segYield[k] || 0) + gain;
        }
        if(Math.random() < sp.chest * step * segMul){
          addChest(effChestTier(sp.ct), `🎒 在${sp.name}搜到了一个${CHESTNAME[effChestTier(sp.ct)]}`);
        }
        /* ★ 死锁自救：兽皮 0 + 绳索 0 + 没陷阱时，出门必定带回兽皮。
         *   否则玩家会永久卡在"造不出陷阱 → 没兽皮 → 造不出绳索"。 */
        const pity = pityPelt();
        if(pity){
          S.res.pelt = (S.res.pelt || 0) + pity;
          log(`🟤 在${sp.name}发现了动物活动的痕迹——剥了几张兽皮带回来（+${pity}）。有了这个就能搓绳索、造陷阱了。`,"good");
        }
      }
    }

    /* ★ 制作与外出完全并行：不管主角在采集还是探索，制作线都照常推进。
     *   排「🛠️ 留守制作」时段只是加速（代价是那半天不出门）。 */
    if(S.crafts.length){
      const focused = isWorkSeg(seg) && act === "workbench";
      craftTick(step * (focused ? CRAFT_FOCUS_MUL : CRAFT_IDLE_RATE));
    }

    /* 被动系统：陷阱捕猎、生肉腐坏、仓储溢出 */
    snareTick(step);
    spoilTick(step);
    overflowTick(step);

    survivalTick(step);
    S.lastSave = Date.now();
    S.day += step / 24;

    /* 保底机制：太久没收获，主角一定会带回来一个箱子（避免长期空手） */
    S.dryH = (S.dryH || 0) + step;
    if(S.dryH >= DRY_CHEST_HOURS){
      addChest("wood", `🎒 主角不甘心空手而归，摸黑翻了半宿，总算带回一个${CHESTNAME.wood}。`);
    }

    /* 跨天：伤势自然恢复一点、存档、检查阶段推进 */
    if((S.day * 24) % 24 < hod){
      S.stats.daysLived = Math.floor(S.day) + 1;
      if(S.wound === "light" && Math.random() < 0.5) woundHeal(1, "睡了一夜");
      save();
      checkAgeAdvance();
    }

    /* 濒死倒计时（只在人在场时倒数；离线期间暂停 → 离线免死） */
    if(S.wound === "dying" && !offlineMode){
      S.dyingH -= step;
      if(S.dyingH <= 0){ playerDie("伤势得不到处理，没能撑过去"); rem -= step; break; }
      else if(S.dyingH <= 6 && Math.floor(S.dyingH + step) !== Math.floor(S.dyingH)){
        log(`💀 主角快撑不住了！还有约 ${Math.ceil(S.dyingH)} 小时——用绷带或排休息。`, "bad");
      }
    }

    /* 天灾与野兽（离线期间同样会发生；新手期内不会有） */
    const remDis = S.nextDis - S.day;
    const warnDays = DIS_DECAY_NOTE + (S.forewarn || 0);
    if(!S.warned && remDis <= warnDays){
      S.warned = true;
      const t = disType();
      log(`⚠️ 灾难预警：${warnDays} 天内「${t.name}」将降临。${t.tip}`,"warn");
    }
    if(remDis <= 0) disResolve();
    else if(!inNewbie() && S.day >= S.nextBeast) beastEvent();

    rem -= step;
  }
  offlineMode = false;
}

/* ---------- 在线主循环（每秒一次） ---------- */
function tick(){
  if(typeof readOnlyLost !== "undefined" && readOnlyLost) return;   /* v8.8 已让位给新标签页：停摆防覆盖 */
  const now = Date.now();
  const realSec = Math.min((now - lastTick) / 1000, 3600);   /* 单帧最多补 1 小时真实时间 */
  const mul = (typeof S !== "undefined" && S && S.timeMul) ? S.timeMul : 1;
  const gameHours = realSec * TIME_SCALE * mul / 3600;       /* 换算成游戏小时（含速档） */
  lastTick = now;
  /* ★ 页面切到后台 = 玩家不在场 → 按离线规则结算：主角不会死，濒死也不倒数 */
  const away = (typeof document !== "undefined" && document.visibilityState && document.visibilityState !== "visible");
  advanceHours(gameHours, away);
  if(Math.floor(now / 1000) % 5 === 0) save();
  renderHUD();
}

function startClock(){
  lastTick = Date.now();
  if(clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(tick, 1000);
}
/** v8.8 单写者：被新标签页接管后停掉本页主循环（内存继续走就会互相覆盖存档） */
function stopClock(){
  if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
}

/* ---------- 离线结算（离线免死：所有致命结算在此降级） ---------- */
function settleOffline(){
  const realSec = Math.min((Date.now() - (S.lastSave || Date.now())), 7 * 86400 * 1000) / 1000;
  if(realSec * TIME_SCALE <= 60) return;
  const gameHours = realSec * TIME_SCALE / 3600;
  const woundBefore = woundLevel();
  advanceHours(gameHours, true);            /* ★ 离线模式：主角不会死，最多重伤 */
  S.hungry = (S.sate <= 5 || S.hydro <= 5);
  const d = Math.floor(gameHours / 24), h = Math.floor(gameHours % 24);
  log(`你离开了 ${Math.floor(realSec/3600)} 小时（游戏内 ${d ? d + " 天 " : ""}${h} 小时），主角按日程照常干活。`
    + `${S.hungry ? "⚠️ 口粮见底，主角饿着肚子！" : ""}`
    + `${woundIdx() > 0 ? `（${woundInfo().icon}${woundInfo().name}，效率 ${Math.round(woundMul()*100)}%）` : ""}`
    + `　—— 挂机期间主角不会死，这是底线。`, "good");
}
