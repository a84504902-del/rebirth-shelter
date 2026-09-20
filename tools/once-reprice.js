/* 一次性脚本：按"现实中合理的耗时"给配方重新定价
 * 游戏 1 小时 = 现实 20 分钟（TIME_SCALE = 3）
 * 原则：简单加工几分钟，复杂工艺才需要等
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const RECIPE_HOURS = {
  plank: 0.5,      // 劈木料：现实 10 分钟
  rope: 0.25,      // 搓绳：现实 5 分钟
  jerky: 2,        // 熏制：现实 40 分钟（真的要熏）
  bait: 0.25,      // 切饵：现实 5 分钟
  medkit: 0.25,    // 包扎布：现实 5 分钟
  stim: 1,         // 熬药：现实 20 分钟
  ironChunk: 2,    // 熔炼：现实 40 分钟
  steel: 4,        // 炼钢：现实 1 小时 20 分
  leather: 3,      // 鞣皮：现实 1 小时
  copperWire: 1,   // 拉丝：现实 20 分钟
  gunpowder: 1     // 配药：现实 20 分钟
};

const GEAR_HOURS = {
  g_ironSpear: 1,   // 磨根钢管
  g_ironArmor: 2,   // 钉皮甲
  g_pickaxe: 1.5,
  g_crossbow: 3,    // 机械结构
  g_lamp: 1.5,
  g_smg: 6,         // 复杂武器，保留等待感
  g_gasMask: 4,
  g_coldSuit: 4,
  g_drySuit: 3,
  g_heatShell: 4,
  g_acidCloak: 3
};

function reprice(file, table){
  const p = path.join(ROOT, file);
  let s = fs.readFileSync(p, "utf8");
  let n = 0;
  for(const [id, h] of Object.entries(table)){
    const re = new RegExp('(\\{ id:"' + id + '",[\\s\\S]{0,240}?hours:)(\\d+(?:\\.\\d+)?)');
    if(!re.test(s)){ console.log("  ⚠️ 未匹配 " + id); continue; }
    s = s.replace(re, (m, a) => a + h);
    n++;
  }
  fs.writeFileSync(p, s);
  console.log("✅ " + file + " 重定价 " + n + " 项");
}

reprice("js/content/recipes.js", RECIPE_HOURS);
reprice("js/content/gear.js", GEAR_HOURS);
