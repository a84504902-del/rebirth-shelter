/* ============================================================
 * config.js — 全部静态配置与数据表
 * 想改数值/加内容，基本只改这个文件
 * ============================================================ */
"use strict";

const SAVE_KEY = "rebirth_shelter_v5";
const GAME_VERSION = "1.0.0";   /* ★ v1.0.0 正式版 */
const DAY_SEC = 86400;          /* 游戏内 1 天 = 86400 游戏秒；1 游戏时 = 现实 1 小时（速度=1 时） */
const SAVE_FILE_HINT = "游戏目录下的 shelter.db";

/* ------------------------------------------------------------
 * 时间流速：现实 1 秒 = 游戏 TIME_SCALE 秒（这是 1× 档的基准）
 *   24 = 1 现实小时 = 1 游戏天（挂机 3 小时 ≈ 撑到第 3 天首灾）
 *   原 3 太慢：挂机 3 小时只走 0.37 天，玩家"啥也没发生"的体感就源于此。
 * 实际流速 = TIME_SCALE × S.timeMul（HUD 里有 1×/2×/4×/8× 档位）。
 * ------------------------------------------------------------ */
const TIME_SCALE = 24;

/* 速档选项（现实小时 → 游戏天/现实小时）*/
const SPEED_OPTS = [1, 2, 4, 8];
const SPEED_DEFAULT = 2;          /* 默认 2×：挂机 1 现实小时 ≈ 2 游戏天 */

/* 新手期：这几天无野兽、无天灾，开局发放新手大礼包
 * ★ 礼包里带第一张储物箱图纸 + 升级材料：第一局就教会玩家"图纸→升级"这个机制，
 *   同时直接解决新手期爆仓（储物箱 Lv.1 容量 7000，够撑一个多月） */
const NEWBIE_DAYS = 3;
const NEWBIE_GIFT = {
  res:    { wood:80, stone:50, metal:30, food:20, water:20, plank:6, rope:2,
            pelt:4, meat:6, bait:6 },
  chests: { wood:3, bronze:1 },
  bps:    ["箱柜图纸"]
};

/* 走 http/https 访问（双击「启动游戏.bat」，或从局域网其他设备访问主机）→ 走数据库存档
 * ★ v8.49 修复：原来额外要求 hostname 必须是 localhost/127.0.0.1，
 *   导致从局域网另一台电脑用 http://192.168.1.x:8787 打开时被判成"单机模式"，
 *   无视数据库存档、只读本地 localStorage（表现为"打开就是新档"）。 */
const SERVER_MODE = (location.protocol === "http:" || location.protocol === "https:");

/* ---------- 周边资源点（要探索才发现） ----------
 * tier   : 需要达到的阶段才会出现在探索池里
 * threat : ★ 威胁值——明码显示给玩家，与战力对比决定"能不能去"
 * y      : 每小时产出
 * danger : 每小时遭遇野兽的概率（会再乘以档位系数）
 * chest  : 每小时搜到箱子的概率（箱子是物资主来源，别调太低）
 * ct     : 该地点产出的箱子等级（越危险的地方，箱子越好）
 */
const SPOTS = {
  /* ===== T1 求生期 =====
   * v8 设计原则（用户拍板）：越高级（危险）的地点，品类越丰富、产量越厚——
   * 基础三样（木/石/金属）到处都产，特色品是附加；"一地一种特产"报废了低级地。
   *
   * ★ v9 威胁曲线（数值模型推导，见 tools/model-check.js）：
   *   战力锚点 = 开局2 → 石斧17 → 铁矛82 → 机械222 → 火器602
   *   威胁带   = 新手1~2 / 进阶20~40 / 工业45~80 / 能源110~160
   *   要求：阶段锚点战力 ÷ 带宽上限 ∈ [0.8, 1.5]（可达但需成长）；
   *         带内按产出价值排序；跨带单调不降。 */
  junk:    { tier:1, threat:1,   name:"门口杂物堆", icon:"🏚️", y:{wood:2, metal:1, stone:1},          danger:0.03, chest:0.45, ct:"wood",   desc:"就在家门口，翻翻总能捡到点什么——勉强糊口的起步地" },
  /* pelt 少量产出：林子里有动物活动的痕迹——兽皮除陷阱、打猎之外的第三条来源 */
  forest:  { tier:1, threat:2,   name:"后山树林",   icon:"🌲", y:{wood:6, stone:1, metal:0.5, pelt:0.08}, danger:0.05, chest:0.35, ct:"wood",   desc:"建材木料的主力，林子里也散落着废弃物件；偶尔捡到动物褪下的皮毛" },
  river:   { tier:1, threat:2,   name:"上游河湾",   icon:"🏞️", y:{water:5, food:1, wood:2},          danger:0.05, chest:0.30, ct:"wood",   desc:"干净的水源，岸边常有漂流木和搁浅的物资" },
  quarry:  { tier:1, threat:2,   name:"碎石坡",     icon:"🪨", y:{stone:8, wood:2, metal:0.5},        danger:0.08, chest:0.30, ct:"wood",   desc:"石头是加固工事的命根子，坡下也有散落的木料" },
  station: { tier:1, threat:20,  name:"旧加油站",   icon:"⛽", y:{metal:8, wood:4, stone:4, water:2}, danger:0.15, chest:0.60, ct:"bronze", desc:"金属零件和油品，建材也不少——有野狗出没，但值得冒险" },
  market:  { tier:1, threat:40,  name:"废弃超市",   icon:"🏪", y:{food:6, water:6, cloth:0.3, wood:3, stone:3, metal:2}, danger:0.20, chest:0.90, ct:"bronze", desc:"整排货架和仓储间——吃的喝的建材全有，物资最集中的地方，风险也最高" },
  trail:   { tier:1, threat:65,  name:"兽径",       icon:"🦌", y:{food:5, pelt:0.3, wood:2, stone:2, metal:2}, danger:0.30, chest:0.40, ct:"bronze", desc:"野兽出没，猎物也出没——得有把像样的家伙才敢来" },

  /* ===== T2 工业期（第 3 灾后解锁）——矿点同样是"基础+特产"，阶段 1 时高阶矿被过滤，只出基础 */
  coalSeam:   { tier:2, threat:45,  name:"露头煤层", icon:"⬛", y:{coal:3, stone:4, wood:2, metal:1},       danger:0.15, chest:0.45, ct:"bronze", desc:"黑得发亮，烧起来能到很高的温度；矿区的建材也顺手采" },
  ironMine:   { tier:2, threat:60,  name:"铁矿洞",   icon:"⛰️", y:{ironOre:3, stone:5, wood:2, metal:1},   danger:0.18, chest:0.50, ct:"bronze", desc:"洞壁上一层暗红的锈迹，这就是铁" },
  copperMine: { tier:2, threat:80,  name:"铜矿脉",   icon:"🟧", y:{copperOre:2.5, stone:4, wood:2, metal:1}, danger:0.20, chest:0.50, ct:"bronze", desc:"石头缝里嵌着绿色的锈，铜的味道" },

  /* ===== T3 能源期（第 5 灾后解锁） ===== */
  sulfurPit:  { tier:3, threat:110, name:"硫磺坑",   icon:"🟡", y:{sulfur:2, stone:4, wood:2, metal:2},   danger:0.28, chest:0.50, ct:"silver", desc:"空气里全是臭鸡蛋味，脚下是黄色的结晶" },
  niterBed:   { tier:3, threat:135, name:"硝石床",   icon:"⚪", y:{niter:2, stone:4, wood:2, metal:2},    danger:0.30, chest:0.50, ct:"silver", desc:"白霜一样的东西糊在岩壁上" },
  oilField:   { tier:3, threat:160, name:"废弃油田", icon:"🛢️", y:{oil:2, stone:4, wood:2, metal:3},      danger:0.35, chest:0.60, ct:"silver", desc:"磕头机早就停了，但地下还有东西在渗出来" }
};

/* ---------- ★ 威胁判定（挂机游戏的安全保险丝） ----------
 * 核心原则：玩家永远不应该在不知情的情况下走进必死的局。
 * 公式：战力 ÷ 威胁 = 比值 → 五档。同一套判定将来直接复用到遗迹与怪物群。
 *
 *   轻松 ≥1.5×：野兽远远躲着，遭遇也必赢
 *   稳妥 ≥1.1×：偶有遭遇，稳赢
 *   吃力 ≥0.8×：可能受伤，但不会更糟
 *   危险 ≥0.5×：可能重伤，自动撤离
 *   送死 < 0.5×：UI 锁住入口，除非开启激进模式
 */
const THREAT_TIERS = [
  { key:"easy",    name:"轻松", ratio:1.5, cls:"ok",   dangerMul:0.3, win:1.0,  note:"野兽远远躲着你" },
  { key:"safe",    name:"稳妥", ratio:1.1, cls:"ok",   dangerMul:0.6, win:1.0,  note:"偶有遭遇，稳赢" },
  { key:"hard",    name:"吃力", ratio:0.8, cls:"warn", dangerMul:1.0, win:0.55, note:"可能受伤，但不会更糟" },
  { key:"risky",   name:"危险", ratio:0.5, cls:"warn", dangerMul:1.2, win:0.30, note:"可能重伤，会自动撤离" },
  { key:"suicide", name:"送死", ratio:0,   cls:"bad",  dangerMul:1.5, win:0.10, note:"去了就回不来" }
];
const THREAT_WOUND = { hard:"light", risky:"heavy", suicide:"dying" };  /* 战败时受的伤势等级 */
const RANGED_TIER_BONUS = 1.3;   /* 远程压制词条：判定时视为战力 +30%（远程武器让你敢去更险的地方） */
const AGGRESSIVE_REWARD = 0.5;   /* 激进模式：产出 +50%，但允许前往送死档地点 */

/* ---------- 判定辅助（遗迹/怪物群将来复用同一套） ---------- */

/** 某地点的威胁值 */
/** ★ 威胁动态化（v8.6）：地点有效威胁 = 基础值 × (1 + 0.15×(阶段-1))
 *  世界随时间恶化——玩家"曾经轻松"的地方会重新变得危险，与战力成长互相追逐。 */
function spotThreat(id){
  const s = SPOTS[id];
  if(!s) return 1;
  const dyn = 1 + 0.15 * ((S.age || 1) - 1);
  return Math.max(1, Math.round(s.threat * dyn));
}

/** 有效战力（远程压制词条：判定时视为 +30%） */
function effAtk(){
  const bonus = (typeof hasTag === "function" && hasTag("ranged")) ? RANGED_TIER_BONUS : 1;
  return atk() * bonus;
}

/** 通用威胁判定 → { ratio, tier } */
function assessThreat(threat){
  const ratio = effAtk() / Math.max(1, threat);
  for(const t of THREAT_TIERS) if(ratio >= t.ratio) return { ratio, tier: t };
  return { ratio, tier: THREAT_TIERS[THREAT_TIERS.length - 1] };
}

/** 地点判定 */
function assessSpot(id){ return assessThreat(spotThreat(id)); }

/** 送死档拦截：未开启激进模式时不允许前往 */
function spotBlocked(id){
  const a = assessSpot(id);
  return a.tier.key === "suicide" && !(typeof S !== "undefined" && S && S.aggressive);
}

/** 想去某处、达到目标档位需要多少战力（给玩家明确的成长目标） */
function needAtkFor(id, wantTier){
  const tier = THREAT_TIERS.find(t => t.key === (wantTier || "safe")) || THREAT_TIERS[1];
  const bonus = (typeof hasTag === "function" && hasTag("ranged")) ? RANGED_TIER_BONUS : 1;
  return Math.ceil(spotThreat(id) * tier.ratio / bonus);
}

/* 探索发现顺序（按阶段分批：阶段推进时把下一批并入待发现池） */
const SPOTQUEUE_BY_AGE = {
  1: ["quarry", "river", "market", "station", "trail"],
  2: ["ironMine", "copperMine", "coalSeam"],
  3: ["sulfurPit", "niterBed", "oilField"]
};
/* 兼容旧引用 */
const SPOTQUEUE = SPOTQUEUE_BY_AGE[1];

/** 某阶段可探索发现的地点清单 */
function spotsForAge(age){
  const all = SPOTQUEUE_BY_AGE[age] || [];
  return all.filter(id => !S.found.includes(id) && !S.queue.includes(id));
}

/* 探索周边：每次探索成批搬回物资箱（发现新地点时同样搬） */
const EXPLORE_CHEST_WOOD = [2, 3];   /* 每次固定带回 2~3 个木箱 */
const EXPLORE_CHEST_IRON = 0.25;     /* 另有 25% 概率多一个铁箱 */
const EXPLORE_IRON_ATK   = 40;       /* 战力达标才能撬开上锁的储物间 */
const EXPLORE_BP_CHANCE  = 0.18;     /* 每次探索有 18% 概率翻到一张图纸 */

/* 保底：连续这么多小时没拿到任何箱子，主角一定会带回来一个 */
const DRY_CHEST_HOURS = 12;

/* ---------- 每日抽签（v7.13：今日运势） ----------
 * 每个游戏日早上自动抽一签，全天生效，只影响"采集收成"（不影响箱子/制作/探索）。
 * 期望 ≈ 1.13（略正），抽签整体不亏、还有盼头；凶级温和，不给硬惩罚。 */
const FORTUNES = [
  { name:"大吉", mul:2.5, p:4,  cls:"warn", msg:"出门就撞见好东西——今天干啥都顺，放手去干！" },
  { name:"中吉", mul:1.6, p:12, cls:"good", msg:"手脚麻利，收获比平时厚实。" },
  { name:"小吉", mul:1.2, p:24, cls:"good", msg:"风调雨顺的一天，稳中有升。" },
  { name:"平",   mul:1.0, p:40, cls:"",     msg:"平常的一天。平常，就是好日子。" },
  { name:"凶",   mul:0.8, p:15, cls:"bad",  msg:"诸事不顺，采集时总差点运气——今天少出远门。" },
  { name:"大凶", mul:0.6, p:5,  cls:"bad",  msg:"今天万事不利，老天爷在收租——省着点用，明天再拼。" }
];
function rollFortune(){
  let r = Math.random() * FORTUNES.reduce((a, f) => a + f.p, 0);
  for(let i = 0; i < FORTUNES.length; i++){ if(r < FORTUNES[i].p) return i; r -= FORTUNES[i].p; }
  return FORTUNES.length - 1;
}

/* ---------- 图纸的阶段归属（v8.1：掉落按阶段分层） ----------
 * 用户拍板："同一个难度出同一个难度的图纸才合理，偶尔出一个高一级的图纸是惊喜。"
 * 旧逻辑全图纸均匀随机，阶段 1 会掉"拉丝/冷库/特化披风"这类远期废纸。
 * 映射：配方 tier 1~3 直取；装备按"能造的阶段"（v8.19）；储物档 1~5 → 1~3，6 档起按"对应阶段"（v8.18）；槽位图纸按解锁顺序 1~3。 */
/** 装备代际 → 掉落阶段：阶段 n 的工艺上限是 ageGearTier() = 2n-1，反解 n = ceil((t+1)/2)。
 *  v8.19：旧实现把 T4+ 全压成 tier3，于是阶段 3 的池子里混着 T20 的远期废纸，
 *  真正能造的（T7~T11）反而被稀释——战力长期提不动的原因之一。 */
function gearTierStage(t){
  const n = Math.ceil(((t || 1) + 1) / 2);
  const maxStage = (typeof AGES !== "undefined" && AGES.length) ? AGES.length : 12;
  return Math.max(1, Math.min(maxStage, n));
}
function bpTierOf(bp){
  const rec = (typeof RECIPES !== "undefined") && RECIPES.find(r => r.bp === bp);
  if(rec) return Math.min(3, Math.max(1, rec.tier || 1));
  const g = (typeof GEAR_RECIPES !== "undefined") && GEAR_RECIPES.find(r => r.bp === bp);
  if(g) return gearTierStage(g.tier || 1);
  const st = (typeof STORAGE_TIERS !== "undefined") && STORAGE_TIERS.find(t => t.bp === bp);
  if(st) return st.tier || Math.min(3, Math.max(1, st.lv));   /* v8.18：6 档起 tier = 对应阶段 */
  const sl = (typeof CRAFT_SLOT_BPS !== "undefined") && CRAFT_SLOT_BPS.find(s => s.bp === bp);
  if(sl) return Math.min(3, CRAFT_SLOT_BPS.indexOf(sl) + 1);
  return 2;   /* 未知图纸按中期处理 */
}

/* ---------- 避难所设施 ---------- */
/* ---------- 避难所材质升级链（v7.11，替代抽象 Lv1-10） ----------
 * 每升一级 = 换一种房子。数字等级 1~5 保留（存档/设施门槛/重生逻辑全兼容），
 * 界面只显示具名材质，并直接标明"下一级是什么"。防御按档跳跃。 */
const HOUSE_TIERS = [
  null,
  { name:"茅草屋",     icon:"🛖", def:20,  cost:null,                          note:"几根木棍加一层草，勉强算个家" },
  { name:"木屋",       icon:"🏚️", def:40,  cost:{wood:150, rope:2},            note:"真正的屋顶，雨点打不进来了" },
  { name:"石屋",       icon:"🏠", def:80,  cost:{stone:260, wood:100},         note:"石墙又厚又凉，酸雨也拿它没办法" },
  { name:"混凝土居所", icon:"🏢", def:150, cost:{ironChunk:12, stone:300},     note:"旧世界的做法：钢筋进混凝土，天灾开始讲道理" },
  { name:"钢铁避难所", icon:"🏰", def:300, cost:{steel:8, ironChunk:24},       note:"它已经不是房子了，是堡垒" },
  { name:"合金避难所", icon:"🗼", def:500, cost:{steel:15, copperWire:8, battery:4}, note:"电力驱动的新结构——这座避难所，已经有了城市的雏形" }
];
/* ★ v8.6 公式段：第 7~12 档由公式生成（def ×1.8/档、材料前档 ×2.2）——"无限升级"的主体。
 *   l 超出预生成范围时 houseTier 按公式即时兜底，材质链没有终点。 */
const HOUSE_NAME_POOL = ["钛合金堡垒", "复合材料要塞", "纳米结构基地", "幽能框架", "深渊城塞", "方舟结构"];
/* v8.12 材质链没有终点：预生成到 20 档，超出部分公式即时兜底（命名循环 + 罗马数字） */
const ROMAN_SUF = ["", "·Ⅱ", "·Ⅲ", "·Ⅳ", "·Ⅴ", "·Ⅵ", "·Ⅶ", "·Ⅷ", "·Ⅸ", "·Ⅹ"];
(function generateHouseTiers(){
  let prev = HOUSE_TIERS[6];
  for(let n = 7; n <= 20; n++){
    const def = Math.round(prev.def * 1.8);
    const cost = {};
    for(const k in prev.cost) cost[k] = Math.ceil(prev.cost[k] * 2.2);
    const round = Math.floor((n - 7) / HOUSE_NAME_POOL.length);
    const nm = (HOUSE_NAME_POOL[(n - 7) % HOUSE_NAME_POOL.length]) + (round > 0 ? (ROMAN_SUF[round] || ("+" + round)) : "");
    HOUSE_TIERS.push({ name: nm, icon: "🗼", def, cost, note: "数字在长，家也在长" });
    prev = HOUSE_TIERS[n];
  }
})();
function houseTier(l){
  const n = Math.max(1, Math.floor(l || 1));
  if(n < HOUSE_TIERS.length) return HOUSE_TIERS[n];
  /* 超出预生成：公式即时兜底（理论上限外仍可升，材质链没有终点） */
  const top = HOUSE_TIERS[HOUSE_TIERS.length - 1];
  const over = n - (HOUSE_TIERS.length - 1);
  const round = Math.floor((n - 7) / HOUSE_NAME_POOL.length);
  const nm = (HOUSE_NAME_POOL[(n - 7) % HOUSE_NAME_POOL.length]) + (round > 0 ? (ROMAN_SUF[round] || ("+" + round)) : "");
  const cost = {};                                   /* v8.12：超预生成段的材料同样 ×2.2 递推 */
  for(const k in top.cost) cost[k] = Math.ceil(top.cost[k] * Math.pow(2.2, over));
  return { name: nm, icon: top.icon, def: Math.round(top.def * Math.pow(1.8, over)), cost, note: "数字在长，家也在长" };
}

const BLDCFG = [
  { id:"house",     name:"避难所",     icon:"🛖", max:30,  base:{}, house:true,
    eff:l=>{ const t = houseTier(l); const nx = HOUSE_TIERS[l + 1];
      return `【${t.name}】防御 +${t.def} ｜ 火力 +${Math.round(t.def * 0.06)} · ${t.note}` + (nx ? `　→ 下一级：${nx.icon} ${nx.name}（防御 +${nx.def} · 火力 +${Math.round(nx.def * 0.06)}）` : "　→ 已是堡垒，可继续公式延伸"); } },
  { id:"snare",     name:"捕猎陷阱",   icon:"🪤", max:10, base:{wood:60, rope:1},               eff:l=>`放诱饵捕猎：每小时 ${(SNARE_RATE*l*100).toFixed(0)}% 触发，猎物带肉/兽皮，${Math.round(SNARE_CHEST*100)}% 概率拖着箱子回来` },
  { id:"bench",     name:"工作台",     icon:"🛠️", max:5,  base:{wood:100, stone:40, rope:1},    eff:l=>`把材料加工成成品（木板/绳索/熏肉/铁块…），高级配方需要图纸；Lv.${l} 台子加成 ×${(1+(l-1)*0.25).toFixed(2)}（v8.25：材料加工还随避难所材质档每档 ×2，与采集同源）` },
  { id:"forge",     name:"装备加工台",   icon:"⚒️", max:2,  base:{ironChunk:6, wood:100, stone:60}, req:2, reqPerLv:[2, 7],
    eff:l=>l < 2 ? `解锁「粗制·XX」系列装备——没有图纸也能打（性能 ×0.6，材料 ×1.2）→ 升到 Lv.2 解锁精修（需钛合金堡垒）`
                 : `高级装备加工台：解锁「精修·XX」——把粗制装精修为完全体（补差价材料，持图纸再减半）` },
  { id:"generator", name:"发电机",     icon:"🔌", max:3,  base:{}, power:true, req:5, eff:l=>powerEffText(l) },

  /* ===== v8.13 攻击建筑（用户："避难所只有防御，没有攻击手段说不过去"）=====
   *  火力与战力分工：战力管"能去哪里探索"，火力管"守家反击"（天灾削弱 / 野兽反击）。
   *  避难所材质链本身也自带火力（houseFire = 防御 ×0.06，随材质档 ×1.8 递推）。 */
  { id:"turret",    name:"火力塔",     icon:"🔥", max:10, base:{wood:150, stone:120, metal:80}, req:3,
    eff:l=>`火力 +${45 * l}（天灾来袭时主动开火削弱灾势，也用来打退野兽）` },
  { id:"fortify",   name:"加固工事",   icon:"🧱", max:20, base:{wood:60, stone:60},              eff:l=>`防御 +${60*l}（抵御天灾与野兽）` },
  { id:"traps",     name:"陷阱网",     icon:"🕸️", max:10, base:{wood:120, stone:120, metal:60}, eff:l=>`防御 +${15*l}，野兽袭击损失 -${8*l}%` },
  /* ===== 防灾子系统（v8.5，对齐小说"每场天灾有专属建造命题"）=====
   * 一次建成永久生效；mitTag/mitCut = 对应天灾强度减免，与抗性装备叠加（乘法）。
   * req = 避难所档位：防酸涂层随时可建、保温/排水要木屋、地下室要石屋、密封要混凝土。 */
  { id:"coat",       name:"防酸涂层", icon:"🧪", max:1, base:{stone:80, cloth:4},          req:1, mitTag:"hazard:acid",      mitCut:0.25, eff:()=>`酸雨强度 -25%（酸性腐蚀拿刷过涂层的屋顶没办法）` },
  { id:"insulation", name:"保温夹层", icon:"🧊", max:1, base:{stone:120, cloth:8},         req:2, mitTag:"hazard:cold",      mitCut:0.25, eff:()=>`寒潮强度 -25%（夹层锁住炉火的热气）` },
  { id:"drain",      name:"排水系统", icon:"🌊", max:1, base:{stone:150, wood:80},         req:2, mitTag:"hazard:flood",     mitCut:0.25, eff:()=>`洪水强度 -25%（渠水再大也灌不进门槛）` },
  { id:"basement",   name:"地下室",   icon:"🕳️", max:1, base:{stone:250, ironChunk:8},     req:3, mitTag:"hazard:heat",      mitCut:0.25, eff:()=>`高温强度 -25%（地表烧成炉子时，全家转移地下）` },
  { id:"seal",       name:"密封舱门", icon:"🚪", max:1, base:{ironChunk:12, steel:4},      req:4, mitTag:"hazard:radiation", mitCut:0.3,  eff:()=>`辐射尘强度 -30%（门一关，外面的一切都被挡住）` },
  { id:"storage",   name:"储物箱",     icon:"📦", max:30, base:{wood:180, stone:80},            eff:l=>storageEffText(l), needBp:l=>storageBpOf(l + 1) },
  { id:"collector", name:"雨水收集器", icon:"💧", max:10, base:{metal:220, stone:100},          req:3, eff:l=>`水 +${5*l}/天（雨水的馈赠）` },
  { id:"farm",      name:"农田",       icon:"🌾", max:10, base:{wood:400, metal:200, stone:200}, req:4,
    eff:l=>`口粮 +${10*l}/天——粮食自给，从此不用为吃饭排班，人力全投建设与冒险（v8.4：旧值 +3/天被宝箱经济碾碎，毫无意义）` }
];
const COST_K = 1.6;            /* 升级花费每级乘数 */

/* ---------- 储物箱：容量按图纸逐档解锁 ----------
 * storage 设施等级 = 已解锁档位；升级时额外检查是否持有该档图纸
 * 用户拍板：容量提升本身也要是惊喜，所以每档都要一张图纸
 *
 * ★ v8.18（用户："不能白送容量，每个阶段放出新的存储设备，得制作出来才能用，也要有图纸"）：
 *   1~5 档沿用原设定；6 档起公式生成（见 content/maps.js 的 buildStorageTiers）——
 *   每档对应一个阶段（lv6 → 阶段 4），容量 ×2.0（与采集产量同源），
 *   材料 = 当代加工品 + 该阶段主导材料，图纸同样只在对应阶段掉落。
 */
const STORAGE_MAX = 30;                 /* 储物箱最高档位（v8.46：20→30，maps.js 按此自动生成 6~30 档；容量每档 ×2） */
/* ★ v8.50 制作补完工限流：装备类（要 roll 词条/词缀）每 tick 最多补做多少份，
 *   剩余进度保留在 c.prog 分帧消化——防止离线巨量进度一口气补完卡死主线程。
 *   材料类不需要限流（纯算术批量入库，几十万份也是毫秒级）。 */
const CRAFT_GEAR_CATCHUP = 50;
const STORAGE_TIERS = [
  { lv:0, name:"露天堆放",   cap:2500,   note:"物资就那么摞在屋角",                        tier:1 },
  { lv:1, name:"木箱柜",     cap:7000,   note:"总算有了个能锁上的地方",   bp:"木箱柜图纸",   tier:1, cost:{plank:6, rope:2} },
  { lv:2, name:"分类货架",   cap:18000,  note:"分门别类，找起来快多了",   bp:"分类货架图纸",   tier:1, cost:{plank:12, ironChunk:4} },
  { lv:3, name:"干燥储藏室", cap:45000,  note:"生肉腐坏减缓",             bp:"干燥储藏室图纸", tier:2, cost:{plank:20, ironChunk:10, stone:40}, spoil:0.7 },
  { lv:4, name:"冷藏库",     cap:120000, note:"腐坏大幅减缓",             bp:"冷藏库图纸",   tier:3, cost:{ironChunk:20, copper:8, plank:30},  spoil:0.35 },
  { lv:5, name:"地下仓库",   cap:300000, note:"几乎不腐坏，受灾损失再降 20%", bp:"地下仓库图纸", tier:3, cost:{steel:20, ironChunk:30, copperWire:10}, spoil:0.1 }
];
const STORAGE_BP = STORAGE_TIERS.filter(t => t.bp).map(t => t.bp);   /* 储物图纸（6 档起由 maps.js 追加） */
/* v8.23：仓储满载的惩罚从"扣存量"改为"新采的堆不下"——
 *   超出容量的部分不再每天损失；代价转移到采集端（只有 1/4 进仓），挂机一夜不会被搬空。 */
const OVERFLOW_GATHER_MUL = 0.25;

/* 储物箱辅助 */
/** v8.11：档位一律夹在 [0, 最高档] —— 越界（如彩蛋顶到 6 档）时取最高档，
 *  绝不回退到最低档（旧实现 `|| STORAGE_TIERS[0]` 会显示"露天堆放 2500 容量"的假象）。 */
function storageTier(n){
  const top = STORAGE_TIERS[STORAGE_TIERS.length - 1].lv;
  const k = Math.max(0, Math.min(top, Math.floor(n || 0)));
  return STORAGE_TIERS.find(t => t.lv === k) || STORAGE_TIERS[STORAGE_TIERS.length - 1];
}
function storageCap(n){ return storageTier(n).cap; }
function storageBpOf(n){ return storageTier(n).bp || null; }
function storageSpoilMul(n){ return storageTier(n).spoil || 1; }

/* ---------- 发电链（v8.7，对齐小说：柴油发电机 → 生物发电机 → 温差发电机） ----------
 * 电力等级 p 的全局效果：采集产量 +4%×p、制作速度 +8%×p——能源期从"数字"变成"体感"。
 * 每档有独立的日耗料（dailyFacilityTick 结算），断料停转、加成失效。 */
const POWER_TIERS = [
  null,
  { name:"柴油发电机", icon:"🔌", cost:{ironChunk:20, copperWire:6, steel:4},  consume:{fuel:2},          note:"烧油发电——能源期的起点" },
  { name:"生物发电机", icon:"🧬", cost:{steel:8, copperWire:10, battery:2},   consume:{fuel:1, meat:3},  note:"烧有机质——油料吃紧时靠它续命" },
  { name:"温差发电机", icon:"🌡️", cost:{steel:15, copperWire:15, battery:4},  consume:{coal:4},          note:"利用地热与气温的落差，安静但吃煤" }
];
function powerTier(n){ return POWER_TIERS[Math.min(3, Math.max(0, n || 0))]; }
function powerLv(){ return (S && S.bld && S.bld.generator) || 0; }
function powerOn(){ return powerLv() > 0 && S.powerOn !== false; }
function powerEffText(l){
  if(l <= 0) return "建造后解锁电力：采集 +4%/级，制作速度 +8%/级（需持续供料，断料停转）";
  const t = POWER_TIERS[l];
  const eat = Object.entries(t.consume).map(([k, v]) => itemName(k) + "×" + v + "/天").join(" + ");
  return `当前「${t.name}」：采集 +${4 * l}%、制作速度 +${8 * l}%｜日耗 ${eat}${t.note ? "｜" + t.note : ""}`;
}
/** v8.2 跳档凭证：升级到 targetLv 档，只要持有"该档或更高档"的任一储物图纸即可
 *  （用户痛点：手里攥着冷库图纸却被"货架图纸"卡死——高档图纸是低档的通行证） */
function storageBpOk(targetLv){
  if(targetLv <= 0) return true;
  for(let i = targetLv; i < STORAGE_TIERS.length; i++){
    const bp = STORAGE_TIERS[i].bp;
    if(bp && (S.bp || []).includes(bp)) return true;
  }
  return false;
}
/** 容量显示：万 / 亿 分级，别让玩家数零（v8.18） */
function fmtCap(n){
  const v = Math.round(n || 0);
  if(v >= 1e8) return (v / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  if(v >= 1e4) return (v / 1e4).toFixed(1).replace(/\.0$/, "") + "万";
  return String(v);
}
function storageEffText(n){
  const t = storageTier(n);
  const parts = [`仓储容量 ${fmtCap(t.cap)}`];
  if(n > 0) parts.push(`受灾损失 -${Math.min(40, 8 * n)}%`);
  if(t.spoil) parts.push(`腐坏 ×${t.spoil}`);
  /* v8.18：把"下一档是什么、要哪张图纸"写在面板上——每阶段的存储设备是明确目标 */
  const nx = STORAGE_TIERS.find(x => x.lv === n + 1);
  if(nx) parts.push(`下一档「${nx.name}」${fmtCap(nx.cap)}${nx.bp ? "（需 " + nx.bp + "）" : ""}`);
  return parts.join("，") + (t.note ? `　（${t.note}）` : "");
}

/* ---------- 背包（外出携带上限） ----------
 * 决定"一次外出能带回多少"：背包越大，一次搬回的箱子越多
 * 升级不占时段，在工作台面板花材料解锁
 */
const BAG_LEVELS = [
  { lv:0, name:"布兜",   carry:[2,3] },
  { lv:1, name:"背篓",   carry:[4,5],   cost:{plank:6, rope:3} },
  { lv:2, name:"登山包", carry:[6,8],   cost:{leather:4, rope:5, plank:8} },
  { lv:3, name:"驮架",   carry:[9,12],  cost:{leather:8, ironChunk:10, rope:8} }
];

/* ---------- 生死阶梯（挂机游戏的核心安全设计） ----------
 * 健康 → 受伤 → 重伤 → 濒死 → 死亡
 * ★ 离线期间永不死亡：致命结算一律降级为"重伤 + 损失部分收获"
 */
const WOUND = {
  none:  { name:"健康", icon:"💚", mul:1,    desc:"" },
  light: { name:"受伤", icon:"🩸", mul:0.5,  desc:"效率减半（休息一个时段或用绷带可恢复）" },
  heavy: { name:"重伤", icon:"🚑", mul:0.3,  desc:"效率大降，必须休息（或用绷带）" },
  dying: { name:"濒死", icon:"💀", mul:0.15, desc:"撑不了多久了，立刻用绷带或休息！" }
};
const WOUND_ORDER = ["none", "light", "heavy", "dying"];
const DYING_HOURS = 24;        /* 濒死倒计时（游戏小时）：在线时倒数，归零即死亡 */
const WOUND_REST_HEAL = 1;     /* 休息一个时段 → 降一级 */
const MEDKIT_HEAL = 2;         /* 用一份绷带 → 降两级 */

/* ---------- 重生（死亡不是失败，是第二幕） ---------- */
const REBIRTH_KEEP_BLD = 0.5;  /* 死后每个设施随机保留约一半等级（避难所保底茅草屋） */
const REBIRTH_BONUS = {        /* 每重生一世叠加的初始加成 */
  wood: 60, stone: 40, metal: 30, food: 10, water: 10
};
const REBIRTH_FOREWARN = 1;    /* 每重生一世，天灾预告提前量 +1 天（前世记忆） */

/* ---------- 辅助：背包 ---------- */
function bagLevel(){ return (typeof S !== "undefined" && S) ? (S.bagLv || 0) : 0; }
function bagCfg(){ return BAG_LEVELS.find(b => b.lv === bagLevel()) || BAG_LEVELS[0]; }
function bagCarryRange(){ return bagCfg().carry; }
function bagNextCfg(){ return BAG_LEVELS.find(b => b.lv === bagLevel() + 1) || null; }

/* ---------- 辅助：生死 ---------- */
function woundLevel(){ return (typeof S !== "undefined" && S) ? (S.wound || "none") : "none"; }
function woundIdx(){ return Math.max(0, WOUND_ORDER.indexOf(woundLevel())); }
function woundInfo(){ return WOUND[woundLevel()] || WOUND.none; }
function woundMul(){ return woundInfo().mul; }
function isDying(){ return woundLevel() === "dying"; }

/* ---------- 捕猎陷阱（前期箱子的重要来源，不占主角时段） ----------
 * ★ 死锁防线：绳索←兽皮←陷阱←绳索。
 *   为此兽皮必须有"不依赖陷阱"的来源（打赢野兽剥皮），且陷阱不能耗太多绳索。
 */
const SNARE_RATE  = 0.05;      /* 每级每小时的触发概率 */
const SNARE_CHEST = 0.28;      /* 触发时额外带箱子的概率 */
const SNARE_NOBAIT_RATE = 0.4; /* 没有诱饵时：仍会有猎物撞上，但只有 40% 效率 */
const SNARE_LOOT = [           /* 触发时的猎物产出（权重） */
  { w:50, out:{ meat:[2,4] } },
  { w:28, out:{ pelt:[1,2] } },
  { w:14, out:{ bone:[1,2] } },
  { w: 8, out:{ scale:[1,1] } }
];

/* ---------- 兽皮保底：堵死绳索死锁的最后一道防线 ----------
 * 一旦"兽皮 0 + 绳索 0 + 没有陷阱"，开箱子必定给兽皮（否则永远造不出陷阱）。
 */
const PITY_PELT = 3;
function pityPelt(){
  /* 判据是"兽皮够不够搓一根绳索"，而不是"是不是 0"——
   * 否则采集给的零点几张皮会把保底抵消掉，玩家仍卡着。 */
  const rope = (typeof recipeById === "function") ? recipeById("rope") : null;
  const need = (rope && rope.in && rope.in.pelt) || 2;
  if((S.res.pelt || 0) >= need) return 0;
  if((S.res.rope || 0) > 0) return 0;
  if((S.bld && S.bld.snare || 0) > 0) return 0;
  return PITY_PELT;
}

/* ---------- 野外遭遇野兽：打赢的战利品 ----------
 * ★ 兽皮的第二条来源（不依赖陷阱）——打死野兽当然能剥皮。
 *   轻松/稳妥档野兽直接跑掉，只有真的动手了才有皮。
 */
function winBeastLoot(){
  return { meat: randRange([2, 4]), pelt: randRange([1, 2]) };
}

/* ---------- 生肉会腐坏：有熏肉房/储藏柜才囤得住 ---------- */
const MEAT_SPOIL_PER_DAY = 0.35;   /* 每天腐坏比例，储藏柜每级 -3% */

/* ---------- 资源元信息（显示用） ---------- */
const RESNAME = { wood:"木材", stone:"石料", metal:"金属", food:"口粮", water:"水" };
const RESSHORT = { wood:"木", stone:"石", metal:"铁", food:"粮", water:"水" };

/* ---------- 生存消耗 ---------- */
const SATE_DECAY = 40;         /* 饱食度每天下降 */
const HYDRO_DECAY = 50;        /* 水分每天下降 */
const BITE_RESTORE = 40;       /* 每次进食/饮水恢复量 */

/* ---------- 制作：与外出完全并行的第二条轨道 ----------
 * ★ 核心规则：制作不占用日程。主角出门采集/探索时，制作照常推进，互不耽误。
 *   - 不排制作时段 → 常规速度 ×1（外出完全不受影响，这是默认状态）
 *   - 排「制作」时段 → 留守加速 ×2.5（代价：那半天不出门）
 *   取舍保留（想快就得牺牲半天外出），但"不排就等于没做"的焦虑没有了。
 * 制作种类：开局只会 2 种（木板、绳索），其余全部靠图纸解锁。
 */
const CRAFT_IDLE_RATE  = 1.0;    /* 外出时：常规速度（不耽误） */
const CRAFT_FOCUS_MUL  = 2.5;    /* 留守制作时段：加速 */

/* ---------- 制作槽位：同时能开几条制作线 ----------
 * ★ 这是制作线的成长主线：开局只能同时做 2 种，靠图纸一条条解锁到 5 条。
 *   每条线独立推进，互不干扰——比如同时"熏肉 + 搓绳 + 炼铁"。
 */
const CRAFT_SLOT_BASE = 2;                       /* 开局 2 条线 */
const CRAFT_SLOT_MAX  = 5;                       /* 上限 5 条线 */
const CRAFT_SLOT_BPS = [                         /* 每拥有一张，槽位 +1（按序解锁） */
  { bp:"并行作业手册", note:"学会了分头干活——同时进行的制作 +1 条" },
  { bp:"流水线图纸",   note:"把工序拆开摆成一排——制作线 +1 条" },
  { bp:"量产线图纸",   note:"旧世界的流水作业法——制作线 +1 条" }
];
/** 当前可用的制作槽位数 */
function craftSlotMax(){
  let n = CRAFT_SLOT_BASE;
  for(const s of CRAFT_SLOT_BPS) if((S.bp || []).includes(s.bp)) n++;
  return Math.min(CRAFT_SLOT_MAX, n);
}
/** 下一张槽位图纸（还没拿到的第一张） */
function nextSlotBp(){
  return CRAFT_SLOT_BPS.find(s => !(S.bp || []).includes(s.bp)) || null;
}

/* ---------- v8.25 制作速度：跟材质档同源，别让制作线在后期变成死机制 ----------
 * 旧版：速度只由工作台（上限 ×2.0）与电力（×1.24）决定，恒定 ×2.48；
 *       而采集倍率随材质档 ×2/档，house 18 时已 ×2048 —— 相差 800 倍，
 *       制作线日产能（炼钢 149/天）在「换图直采成品」（6 万/天）面前形同虚设。
 * 现在分两条线：
 *   · 材料加工：速度 ×2^(house-7)，与采集同源 —— 工作台不再是瓶颈，
 *     真正的上限回到"原料供应"（原料本身要占主角度时间去采）。
 *   · 装备 / 粗制 / 精修：总速度上限 ×8 —— 打装备仍要花点时间，保留手感。 */
const CRAFT_TIER_K = 2.0;             /* 材料加工速度随材质档 ×2/档 */
const CRAFT_GEAR_SPEED_MAX = 8;       /* 装备类总速度上限（含工作台与电力加成） */
/** 台子与电力带来的基础速度（不含材质档） */
function craftBaseSpeed(){
  const bench = (S && S.bld && S.bld.bench) || 0;
  let s = bench > 0 ? (1 + (bench - 1) * 0.25) : 1;
  if(powerOn()) s *= 1 + 0.08 * powerLv();
  return s;
}
/** 材质档速度倍率（house 7 起，每档 ×2） */
function craftTierMul(){
  const h = (S && S.bld && S.bld.house) || 1;
  return Math.pow(CRAFT_TIER_K, Math.max(0, h - 7));
}
/** 某条配方的实际制作速度（倍数）；装备类受总上限约束 */
function craftSpeed(rec){
  const s = craftBaseSpeed() * craftTierMul();
  return (rec && rec.kind === "gear") ? Math.min(s, CRAFT_GEAR_SPEED_MAX) : s;
}
/** 速度显示（大数用"万"，免得一屏 0） */
function fmtSpeed(x){
  if(!(x > 0)) return "1";
  if(x >= 10000) return (Math.round(x / 1000) / 10) + "万";
  if(x >= 100) return String(Math.round(x));
  return String(Math.round(x * 100) / 100);
}
/** 制作速度一览（工作台面板用） */
function craftSpeedText(){
  const mat = craftSpeed({ kind: "mat" });
  const gear = craftSpeed({ kind: "gear" });
  return `材料加工 ×${fmtSpeed(mat)}　装备 ×${fmtSpeed(gear)}${gear < mat ? "（已到上限）" : ""}`;
}

/* ---------- 时间与体力 ---------- */
const SEG_HOURS = { am:[6,12], pm:[12,18], night:[18,6] }; /* 上午/下午/夜间 */
const STAM_GATHER = 28;        /* 采集一段消耗体力（v7.14 调平：两段采集 + 睡眠须能长期稳态，见下） */
const STAM_EXPLORE = 15;
const STAM_CRAFT = 20;         /* 专心制作一个时段消耗体力 */
const STAM_REST = 45;
const STAM_SLEEP = 65;         /* v7.14：50→65。旧值下两段采集(-70) > 睡眠(+50)，体力天天净跌，
                                  几天后永远挂在"疲劳 ×0.6"上——用户反馈"上午就把体力耗完了"。
                                  新稳态：100 → -28-28 → 44 → 睡 +65 → 满，纯白天采集永不断档；
                                  夜间提灯出工（额外 -28 且不睡觉）仍会疲劳，保留取舍。 */
const TIRED_BELOW = 25;        /* 体力低于此值：产出 ×0.6 */
const TIRED_MUL = 0.6;

/* ---------- 天灾：按序列推进，间隔随强度联动（v8.6，对应小说"周期性刷新 + 提前预告"） ---------- */
const DIS_GAP = 7;                    /* 基础间隔（第 20 场前恒定） */
/* ★ 灾间间隔联动（INV-8）：强度指数段（w≥20）间隔同源递增——
 *   保证每场灾之间"刚好够但需要全力建设"的窗口永远存在。 */
function disGapAt(w){
  return w < 20 ? DIS_GAP : Math.ceil(DIS_GAP * Math.pow(1.35, (w - 19) / 2));
}
const FIRST_DISASTER_DAY = NEWBIE_DAYS;  /* 新手期结束即首灾 */
const DIS_DECAY_NOTE = 1;             /* 提前多少天发出预警 */
const DIS_TYPES = [
  { name:"酸雨",   mult:1.00, tag:"hazard:acid",      tip:"酸性腐蚀屋顶与存粮——加固工事、储藏柜最有价值" },
  { name:"寒潮",   mult:1.05, tag:"hazard:cold",      tip:"严寒考验保温——避难所档位与口粮储备是重点" },
  { name:"洪水",   mult:1.10, tag:"hazard:flood",     tip:"洪水冲击地基——加固工事等级决定成败" },
  { name:"高温",   mult:1.15, tag:"hazard:heat",      tip:"地表无法生存——需要隔热与地下空间（后期解锁）" },
  { name:"兽潮",   mult:1.20, tag:"",                 tip:"兽群冲击围墙——围墙与陷阱网是硬需求" },
  { name:"辐射尘", mult:1.25, tag:"hazard:radiation", tip:"污染物资与水源——密封与储备决定损失" }
];
const HAZARD_MITIGATION = 0.3;   /* 带对应抗性装备时，该场天灾的强度视为 -30% */
const TOOL_BONUS = 0.25;         /* 精良工具：采集产量 +25% */
const RANGED_DODGE = 0.5;        /* 远程压制：遭遇野兽时半数概率全身而退 */
const LIGHT_TAG = "light";       /* 照明：夜间也能出工 */
/* 首灾是"教学灾"：强度调低，保证"准备了就能活"。
 * ★ v8.44 天灾强度双轨制（用户问"灾难强度和装备强度合理吗"，拉表分析结论：
 *   旧曲线纯线性 50+70×(w-1)，而护甲是 ×1.8/代——wave 26 之后天灾彻底失去威胁
 *   （防御余量 ×14843），天灾沦为白送奖励）：
 *   强度 = max( 旧线性, 当代护甲中值 × 1.2 )
 *   - 前期（wave ≤ 16）线性占优 → 数值完全不变，保持原有生存压力；
 *   - 每进入新阶段（wave 17/23/29…官方阶段表 5+(n-3)×6）强度跳升到当代装备档，
 *     形成有预告的"换装墙"——穿上一代甲扛不住，做出当代甲 + 工事就能稳扛；
 *   - age 12 之后每 12 场灾 +1 代（灾变深化），到 T24 封顶，endgame 仍有缓慢爬升。 */
const DIS_INTENSITY_BASE = 50, DIS_INTENSITY_STEP = 70;
const DIS_GEAR_RATIO = 1.2;       /* 锚定系数：抵满 50% 战力削弱后 ≈ 需要半件当代甲 + 基建 */
const DIS_ARMOR_MID = t => t <= 3 ? [33, 90, 240][t - 1] : Math.round(185 * Math.pow(1.8, t - 3));
const DIS_WAVE_AGE = w => w < 3 ? 1 : Math.max(1, Math.min(12, Math.floor(3 + (w - 5) / 6)));
const DIS_WAVE_TIER = w => {
  const age = DIS_WAVE_AGE(w);
  let t = age <= 3 ? age : Math.min(24, 2 * age - 3);
  if(age >= 12) t = Math.min(24, t + Math.floor((w - DIS_AGE_WAVE(12)) / 12));   /* 灾变深化 */
  return Math.max(1, t);
};
const DIS_AGE_WAVE = n => n <= 3 ? [1, 3, 5][n - 1] : 5 + (n - 3) * 6;
const DIS_INTENSITY = w => Math.max(30, Math.max(
  DIS_INTENSITY_BASE + (w - 1) * DIS_INTENSITY_STEP,                 /* 旧线性（前期基准，不变） */
  Math.round(DIS_ARMOR_MID(DIS_WAVE_TIER(w)) * DIS_GEAR_RATIO)       /* v8.44 装备代际锚定（后期接管） */
));

/* ---------- 野兽 ---------- */
const BEAST_GAP_MIN = 4, BEAST_GAP_MAX = 8;   /* 新手期结束后，每隔几天来一次 */
const BEAST_STRENGTH = w => 30 + w*15;
const ENCOUNTER_STRENGTH = w => 15 + w*8;
const DIS_LOSS = 0.3, BEAST_LOSS = 0.2;

/* ★ v8.12 战力 × 天灾（用户："攻击力没有跟天灾难度挂钩"）：
 *  主角带着武器主动出击、清理灾变前哨——每 1 点战力抵减 0.5 点天灾强度，
 *  但最多砍掉一半（避难所是主场，战力是减伤而非免灾）。
 *  成长意义：装备代际 ×1.8 远快于强度线性 +70/场，战力因此成为一条真实的减伤曲线。 */
const ATK_DIS_CUT = 0.35;         /* 每 1 点守家总攻抵减的强度（v8.13c：0.5→0.35，避免一叠加就顶满上限） */
const ATK_DIS_CAP = 0.5;          /* 守家总攻最多砍掉强度的比例（护住避难所主场地位） */

/* ---------- 掉落与装备 ---------- */
const RAR = ["普通", "精良", "稀有", "传说"];
const MULT = { 1:1, 2:1.6, 3:2.4, 4:4 };
const AFFIX = { 1:[""], 2:["加固的","轻便的","磨利的"], 3:["猎手的","守卫者的","丰收的"], 4:["末世传奇·","灾变纪元·"] };
const SLOTNAME = { weapon:"武器", armor:"护甲", talisman:"护符" };

/* 箱子等级（材质链，与小说一致）：来源由地点危险度决定 */
const CHESTNAME = { wood:"木箱", bronze:"青铜箱", silver:"白银箱", gold:"黄金箱", relic:"遗迹箱" };
/* 物资倍率（v8.2 拉开）：旧值 silver 2.4 只有 bronze(1.6) 的 1.5 倍，但获取难度 ×3
 * （青铜：威胁30~55 地点；白银：威胁110~150 的硫磺坑/硝石床/油田）——负体验。
 * 新值按"危险溢价"每档 ×2 拉开。 */
const CHEST_PRICE_HINT = { wood:1, bronze:2, silver:4, gold:8, relic:12 };

/* 开箱彩蛋：概率 p，触发后执行 fn（在 state.js 里用） */
const SURPRISE_CFG = [
  { id:"canned",  p:0.05, msg:"箱底藏着一整箱军用罐头！口粮大丰收", gain:{food:[25,40]} },
  { id:"tablets", p:0.03, msg:"发现一套旧世界净水药片！水大丰收",     gain:{water:[25,40]} },
  { id:"blueprint", p:0.02, msg:"箱底压着半张旧世界图纸！随机设施直接升 1 级" },
  { id:"rustykey",  p:0.01, msg:"一根生锈的钥匙……上面刻着：给重生的你。（密码箱 +1）" }
];

/* ---------- 开箱构成 ---------- */
/* 本次开箱：装备 34% / 补给 33% / 材料 33%（在 loot.js 里按此比例判定） */

/* 补给：口粮/水/生肉/诱饵（箱子是挂机物资的主要来源，给得实在） */
const SUPPLY_ROLL   = { food:[8,15], water:[8,15], meat:[3,7], bait:[2,5] };

/* 材料：木/石/废金属
 * ★ 箱子只给"顺手翻到的一点建材"，不再是建材来源——建材是采集的活。
 *   箱子的核心价值是它独有的东西：口粮水（只能靠箱子）、装备、图纸、稀有材料。
 *   一箱材料约 28 容量 ≈ 半天采集量，箱子和采集从此各司其职、不互相碾压。 */
const MATERIAL_ROLL = { wood:[10,25], stone:[6,15], metal:[4,10] };
const MATERIAL_EXTRA = [
  { w:30, out:{ cloth:[1,3] } },        /* T1 */
  { w:26, out:{ pelt:[1,3] } },
  { w:18, out:{ bone:[1,3] } },
  { w:12, out:{ scale:[1,2] } },
  { w:10, out:{ ironChunk:[1,2] } },    /* T2 */
  { w: 8, out:{ copper:[1,2] } },
  { w: 7, out:{ coal:[2,4] } },
  { w: 6, out:{ ironOre:[2,4] } },
  { w: 5, out:{ copperOre:[2,3] } },
  { w: 4, out:{ steel:[1,2] } },
  { w: 5, out:{ sulfur:[1,2] } },       /* T3 */
  { w: 5, out:{ niter:[1,2] } },
  { w: 4, out:{ oil:[1,2] } }
];

/* 常规图纸掉落（本阶段内的图纸）：木箱也要能出图纸，否则新手期拿不到储物箱图纸 */
const BP_CHANCE = { wood:0.02, bronze:0.03, silver:0.06, gold:0.12, relic:0.25 };

/* ★ 越级图纸掉落（跨时代惊喜）：图纸可以越级，成品装备不行 */
const BP_CROSS = { wood:0.003, bronze:0.015, silver:0.02, gold:0.025, relic:0.15 };

