/* ============================================================
 * loot.js — 宝箱、装备生成、穿戴与拆解
 *
 * 本次新增（v7）：
 *   1. 箱子等级：木箱 / 青铜箱 / 白银箱 / 黄金箱 / 遗迹箱
 *   2. 分层过滤：产出受「箱子等级」与「当前阶段」双重限制，取低者
 *   3. 越级惊喜：极小概率开出"跨阶段图纸"（图纸可以越级，成品装备不行）
 * ============================================================ */
"use strict";

/* 各等级箱子"内容上限"（阶层）：relic 允许当前阶段 +1
 * v8.12：高档箱放开到更高代际（黄金 6 / 遗迹 7）——否则阶段 3 后期开箱永远是 T3 废铁，
 *        战力无从成长。阶段 1/2 仍按 ageMaxTier 收紧（新手期不出高级物）。 */
const CHEST_TIER_MAX = { wood: 1, bronze: 2, silver: 4, gold: 6, relic: 7 };

/** 某个箱子在当前阶段实际能开出到哪一阶层 */
function chestMaxTier(tier){
  const base = CHEST_TIER_MAX[tier] || 1;
  const ageMax = ageMaxTier();
  const cap = ageMax >= 3 ? (ageMax + (tier === "relic" ? 4 : 3)) : ageMax;
  return Math.min(base, cap);
}

/* ---------- 装备代际（石制 → 铁器 → 机械） ---------- */
const EQUIP_BASES = {
  1: { weapon: ["石斧", "木棒", "破铁管"],            armor: ["破皮甲", "旧棉衣"],   talisman: ["旧怀表", "骨哨"] },
  2: { weapon: ["铁管长矛", "废土砍刀", "猎弓"],       armor: ["铆钉皮甲", "机车皮衣"], talisman: ["黄铜护符", "指南针"] },
  3: { weapon: ["连发弩", "改装猎枪"],                armor: ["旧军防弹衣"],          talisman: ["机械怀表"] }
};
const EQUIP_VAL = {
  1: { weapon: [15, 27], armor: [18, 33], talisman: [8, 18] },
  2: { weapon: [45, 80], armor: [50, 90], talisman: [20, 40] },
  3: { weapon: [120, 220], armor: [130, 240], talisman: [50, 90] }
};

/* ============================================================
 * v8.12 装备代际公式化（T4~T12）：val 每代 ×1.8，与避难所材质链/天灾曲线同源。
 *   原因：装备随机代际原本只到 T3（val≤220×品质），玩家挂到第 26 场天灾后战力彻底没有成长手段。
 *   名称用完则加罗马数字后缀（·Ⅱ/·Ⅲ…），阶梯没有终点。
 * ============================================================ */
const EQUIP_NAMES = {
  4: { weapon: ["霰弹枪", "自动步枪", "榴弹发射器"], armor: ["战术背心", "复合护甲"], talisman: ["军用电台", "激光测距仪"] },
  5: { weapon: ["电磁矛", "线圈枪", "脉冲步枪"],   armor: ["动力外骨骼", "电磁护盾"], talisman: ["神经接口", "能量核心"] },
  6: { weapon: ["磁轨炮", "等离子刃", "链锯枪"],   armor: ["动力装甲", "反应装甲"],   talisman: ["战术AI芯片", "量子罗盘"] },
  7: { weapon: ["幽能刃", "相位枪", "奇点炮"],     armor: ["幽能战甲", "虚空护盾"],   talisman: ["幽能结晶", "相位锚"] },
  8: { weapon: ["纳米刃", "分解射线", "纳米蜂群"], armor: ["纳米战衣", "自适应装甲"], talisman: ["纳米核心", "数据圣物"] }
};
const ROMAN = ["", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ"];
/* ---------- v8.27 护符数值独立量纲 ----------
 * 武器/护甲的 val 是"战力 / 防御"（战斗量纲，×1.8/代际）；
 * 护符的 val 是「搜集效率 +X%」（见 state.js prodBonus → engine 采集结算）。
 * 两者量纲不同：护符若也跟 ×1.8，T24 会变成 +30 万%，把采集倍率炸掉。
 * → 护符走独立的小曲线：T1 起每代 +4%，T24 正好封顶 +100%。 */
function talismanCoreVal(t){ return Math.min(100, 8 + 4 * Math.max(0, t - 1)); }
for(let t = 1; t <= 3; t++){
  const c = talismanCoreVal(t);
  EQUIP_VAL[t].talisman = [c, Math.min(100, Math.round(c * 1.25))];
}
(function genEquipTiers(){
  const top = 3;
  const vals = { weapon: EQUIP_VAL[3].weapon, armor: EQUIP_VAL[3].armor, talisman: EQUIP_VAL[3].talisman };
  for(let n = 4; n <= 24; n++){   /* v8.14：配合无限阶段扩到 T24 */
    const k = Math.pow(1.8, n - 3);
    EQUIP_VAL[n] = {
      weapon:   [Math.round(vals.weapon[0] * k),   Math.round(vals.weapon[1] * k)],
      armor:    [Math.round(vals.armor[0] * k),    Math.round(vals.armor[1] * k)],
      talisman: (() => { const c = talismanCoreVal(n); return [c, Math.min(100, Math.round(c * 1.2))]; })()
    };
    const src = EQUIP_NAMES[n] || EQUIP_NAMES[8];
    const suffix = n <= 8 ? "" : "·" + (ROMAN[Math.floor((n - 9) / 1) + 1] || ("+" + (n - 8)));
    EQUIP_BASES[n] = {
      weapon:   src.weapon.map(s => s + suffix),
      armor:    src.armor.map(s => s + suffix),
      talisman: src.talisman.map(s => s + suffix)
    };
  }
})();

/* 品质概率（按箱子等级）
 * v7.15：吉签抬高品质线——r 加 (运势-1)×10 偏移，大吉(+1.5) 等效 r+15，
 * 高档位概率明显上升；平/凶不降（不给硬惩罚）。 */
function rollRarity(tier){
  const r = Math.random() * 100 + (fortuneMul() - 1) * 10;
  if(tier === "wood")   return r < 70 ? 1 : r < 95 ? 2 : 3;
  if(tier === "bronze") return r < 45 ? 1 : r < 82 ? 2 : r < 97 ? 3 : 4;
  if(tier === "silver") return r < 25 ? 1 : r < 65 ? 2 : r < 92 ? 3 : 4;
  return r < 50 ? 2 : r < 90 ? 3 : 4;
}

/** 生成一件装备：代际由「箱子允许的阶层」决定 */
function genEquip(tier){
  const maxT = Math.max(1, chestMaxTier(tier));
  /* 从允许的代际里随机选一档（越高的箱子越容易出高代际） */
  let t = 1;
  if(maxT >= 4){
    /* v8.12：高代际箱子能开出当代装备（60% 顶代 / 25% 次代 / 15% 再降一档） */
    const r = Math.random();
    t = r < 0.6 ? maxT : r < 0.85 ? maxT - 1 : Math.max(1, maxT - 2);
  }
  else if(maxT >= 3){ const r = Math.random(); t = r < 0.45 ? 3 : r < 0.8 ? 2 : 1; }
  else if(maxT >= 2){ t = Math.random() < 0.45 ? 2 : 1; }

  const rar  = rollRarity(tier);
  const slot = ["weapon", "armor", "talisman"][Math.floor(Math.random() * 3)];
  const bases = EQUIP_BASES[t] ? EQUIP_BASES[t][slot] : EQUIP_BASES[1][slot];
  const base = bases[Math.floor(Math.random() * bases.length)];
  const affix = AFFIX[rar][Math.floor(Math.random() * AFFIX[rar].length)];
  const rng = (EQUIP_VAL[t] && EQUIP_VAL[t][slot]) || EQUIP_VAL[Math.min(24, Math.max(1, t))][slot] || EQUIP_VAL[1][slot];   /* v8.12 越界兜底到最高已定义代际 */
  let val = Math.round((rng[0] + Math.random() * (rng[1] - rng[0])) * MULT[rar]);
  if(slot === "talisman") val = Math.min(val, 100);   /* ★ v8.41 护符量纲：品质乘数后仍钳到 +100%（结算封顶一致，面板不虚标） */
  /* ★ v8.6 暗黑词缀：开箱装备按品质 roll 词条（传说 2~3 条，必含高值） */
  const tags = rollAffixes(rar, 4);
  return { slot, name: (affix || "") + base, rar, val, on: false, gen: t, tags };
}

/** 比现有装备好就换上，否则拆解成金属 */
function equipOrSalvage(it){
  /* ★ v8.42 护符 3 插槽：有空位直接装上；满了才和"身上最弱的护符"比，赢了就换 */
  if(it.slot === "talisman"){
    const worn = S.gear.filter(g => g.slot === "talisman" && g.on);
    const slots = (typeof TALISMAN_SLOTS === "number") ? TALISMAN_SLOTS : 1;
    if(worn.length < slots){
      it.on = true;
      S.gear.push(it);
      log(`装上了 <b class="r${it.rar}">${it.name}</b>（${RAR[it.rar-1]}，护符槽 ${worn.length + 1}/${slots}）`, "good");
      return;
    }
    const weakest = worn.reduce((a, b) => (b.val < a.val ? b : a), worn[0]);
    if(it.val > weakest.val){
      weakest.on = false;
      it.on = true;
      S.gear.push(it);
      log(`换上了 <b class="r${it.rar}">${it.name}</b>（${RAR[it.rar-1]}，替换 ${weakest.name}）`, "good");
      return;
    }
    const m = Math.ceil(it.val * 2);
    S.res.metal += m;
    log(`拆解 <span class="r${it.rar}">${it.name}</span>，得废金属 ${m}（护符槽已满且都比它强）`);
    return;
  }
  const cur = S.gear.find(g => g.slot === it.slot && g.on);
  if(!cur || it.val > cur.val){
    if(cur) cur.on = false;
    it.on = true;
    S.gear.push(it);
    log(`装备了 <b class="r${it.rar}">${it.name}</b>（${RAR[it.rar-1]}）`, "good");
  }else{
    const m = Math.ceil(it.val * 2);
    S.res.metal += m;
    log(`拆解 <span class="r${it.rar}">${it.name}</span>，得废金属 ${m}`);
  }
}

function rollRange(r){ return r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1)); }

/** 按权重抽一个（out 里所有物品都必须在允许阶层内） */
function pickWeighted(list, allowed){
  const pool = list.filter(x => Object.keys(x.out).every(k => itemTier(k) <= allowed));
  if(!pool.length) return null;
  let roll = Math.random() * pool.reduce((a, x) => a + x.w, 0);
  for(const it of pool){ if(roll < it.w) return it; roll -= it.w; }
  return pool[pool.length - 1];
}

/** 越级图纸：极小概率开出一个"不属于这个时代"的图纸（惊喜的核心）
 *  越级 = 装备代际超出当前阶段允许的工艺水平（阶段1只能石制，开出铁器/机械/火器图纸都算越级）
 */
function grantCrossBlueprint(src){
  const owned = S.bp || [];
  const cap = ageGearTier();
  /* 必须过滤掉没有 bp 的配方：否则会把 undefined 塞进图纸列表 */
  const pool = (typeof GEAR_RECIPES !== "undefined" ? GEAR_RECIPES : [])
    .filter(r => r.bp && (r.tier || 1) > cap && !owned.includes(r.bp));
  if(!pool.length) return false;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  S.bp.push(pick.bp);
  log(`📜✨ ${src}——你翻出一张「${pick.bp}」。`, "warn");
  log(`　${pick.mystery || ""}（这东西现在做不了，但记住它。）`, "warn");
  if(typeof showBigFind === "function") showBigFind(pick.bp, pick.mystery);
  return true;
}

/** 彩蛋触发（配置在 config.js） */
function trySurprise(){
  for(const s of SURPRISES){
    if(Math.random() < s.p){
      s.fn();
      log(s.msg, "warn");
      return `✦ ${s.msg}`;
    }
  }
  return null;
}

/** 开箱：tier = wood/bronze/silver/gold/relic，n = 个数 */
function openChest(tier, n){
  const cnt = Math.min(n, S.chests[tier] || 0);
  if(cnt <= 0){ log(`📦 没有${CHESTNAME[tier]}可开了。`); return; }

  S.chests[tier] -= cnt;
  S.stats.chestsOpened = (S.stats.chestsOpened || 0) + cnt;

  const allowed = chestMaxTier(tier);
  const mult = (CHEST_PRICE_HINT[tier] || 1) * (1 + Math.min(100, tagSum("chestBonus")) / 100);   /* v8.6 寻宝词条 */
  const out = [];
  let best = null;            /* 本次开出的最好东西（用于结果面板高亮） */

  for(let i = 0; i < cnt; i++){
    const line = [];   /* 本箱所见即所得的一串产出（对照小说：一箱倒出一堆） */

    /* 0) ★ 兽皮保底：作为叠加项，不再独占整箱（否则"只给兽皮"太抠） */
    const pity = pityPelt();
    if(pity){
      S.res.pelt = (S.res.pelt || 0) + pity;
      line.push(`🟤 ${itemName("pelt")}+${pity}`);
    }

    /* 1) 彩蛋：叠加 */
    const sp = trySurprise();
    if(sp) line.push(sp);

    /* 2) 本阶段图纸：叠加（小说里青铜箱 = 一批物资 + 设计图 同箱出现）
     *    v7.15：图纸概率随运势放大——大吉木箱 2%→5% */
    if(Math.random() < (BP_CHANCE[tier] || 0) * fortuneMul() && grantBlueprint("箱底翻出的图纸")){
      line.push("📜 获得一张图纸");
    }

    /* 3) 越级图纸：叠加（概率也随运势放大，封顶 ×2 防大吉遗迹箱失控） */
    const cross = BP_CROSS[tier];
    if(cross && Math.random() < cross * Math.min(2, fortuneMul()) &&
       grantCrossBlueprint("箱底压着一张不该出现在这个时代的图纸")){
      line.push("📜✨ 越级图纸！");
      best = { name:"越级图纸", rar:4 };
    }

    /* 4) 装备：34% 概率叠加 1 件（与物资不互斥） */
    if(Math.random() < 0.34){
      const it = genEquip(tier);
      line.push(`<span class="r${it.rar}">${it.name}</span>（${RAR[it.rar-1]}）`);
      if(!best || it.rar > best.rar) best = it;
      equipOrSalvage(it);
    }

    /* 5) ★ 物资筐（必出）：补给 + 材料 同时给，对应小说"一箱倒出一堆" */
    const sup = [];
    for(const k in SUPPLY_ROLL){
      if(!itemAllowed(k)) continue;
      const v = Math.ceil(rollRange(SUPPLY_ROLL[k]) * mult * 0.5);
      S.res[k] += v;
      sup.push(`${itemIcon(k)}${itemName(k)}+${v}`);
    }
    if(sup.length) line.push("🥫 " + sup.join("，"));

    const mat = [];
    for(const k in MATERIAL_ROLL){
      if(!itemAllowed(k)) continue;
      const v = Math.ceil(rollRange(MATERIAL_ROLL[k]) * mult * 0.5);
      S.res[k] += v;
      mat.push(`${itemIcon(k)}${itemName(k)}+${v}`);
    }
    const pick = pickWeighted(MATERIAL_EXTRA, allowed);
    if(pick){
      for(const k in pick.out){
        const v = rollRange(pick.out[k]);
        S.res[k] += v;
        mat.push(`${itemIcon(k)}${itemName(k)}+${v}`);
      }
    }
    /* ★ 白银箱及以上：额外掉 T3 加工品（v8.2 高档箱的"质"差异——不只是更多，还不同） */
    if(allowed >= 3){
      const crafted = ["copperWire","gunpowder","fuel","battery"].filter(k => itemAllowed(k) && itemTier(k) <= allowed);
      if(crafted.length){
        const k = crafted[Math.floor(Math.random() * crafted.length)];
        const v = Math.max(1, rollRange([1,3]));
        S.res[k] += v;
        mat.push(`${itemIcon(k)}${itemName(k)}+${v}`);
      }
    }
    if(mat.length) line.push("🪵 " + mat.join("，"));

    out.push(line.join("，"));
  }

  /* 结果面板 */
  const el = document.getElementById("openResult");
  if(el){
    const hi = best ? `<div style="color:var(--warn);margin-bottom:4px">✦ 最好的收获：<span class="r${best.rar}">${best.name}</span></div>` : "";
    el.innerHTML = `<div class="text-dim" style="margin-bottom:4px">打开了 ${cnt} 个${CHESTNAME[tier]}：</div>`
      + hi + out.slice(-10).join("<br>");
  }
  save();   /* ★ v7.16 开箱立即落库——开箱是重要操作，不等自动保存节流（跨浏览器丢箱教训） */
  invalidateUI();
  renderAll();
}

/* v8.12：装备代际表就绪后，构建公式化装备配方（gear.js 定义，此处调用） */
if(typeof buildFormulaGear === "function") buildFormulaGear();
