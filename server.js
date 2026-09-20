/**
 * 重生避难所 · 本地存档服务
 * 用 Node 内置 SQLite 把存档写进 shelter.db（同目录）
 * 启动方式：双击「启动游戏.bat」，或 node server.js
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "shelter.db");

/* ---------- 数据库 ---------- */
const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS save (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    data       TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS save_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    data       TEXT    NOT NULL,
    day        REAL,
    wave       INTEGER,
    created_at TEXT    NOT NULL
  );
`);
console.log("[db] 数据库文件：" + DB_FILE);

const getSaveStmt = db.prepare("SELECT data, updated_at FROM save WHERE id = 1");
const putSaveStmt = db.prepare(
  "INSERT INTO save (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
);
const historyStmt = db.prepare("INSERT INTO save_history (data, day, wave, created_at) VALUES (?, ?, ?, ?)");
const historyCountStmt = db.prepare("SELECT COUNT(*) AS c FROM save_history");
let writer = null;   /* v8.8 当前写会话：{ sid, sstart, at } */

/* ---------- HTTP ---------- */
function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 8 * 1024 * 1024) reject(new Error("存档过大"));
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const client = req.socket.remoteAddress || "?";
  try {
    if (url.pathname === "/api/save" && req.method === "GET") {
      const row = getSaveStmt.get();
      /* v8.47 多设备诊断：每次读档都记一行（谁在何时读、读到多少天的档） */
      console.log(`[save] ${new Date().toLocaleTimeString()} GET /api/save ← ${client} → ${row ? "第 " + (Math.floor(JSON.parse(row.data).day || 0) + 1) + " 天" : "空档"}`);
      return send(res, 200, JSON.stringify({ ok: true, data: row ? row.data : null, updatedAt: row ? row.updated_at : null }));
    }
    if (url.pathname === "/api/save" && req.method === "POST") {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.res) return send(res, 400, JSON.stringify({ ok: false, error: "存档格式不对" }));
      /* ★ v8.8 单写者裁决：两个标签页/浏览器同时开着游戏时，后打开的接管写入权，
       *   旧会话的写入被拒绝（409）——杜绝"新档被旧标签页的内存覆盖"式回档。
       *   同一会话（含刷新，sessionStorage 的 sid 不变）永远放行；30 秒无写入视为会话已死，任何人可接管。 */
      const sid = parsed._sid || "", sstart = parsed._sstart || 0, nowMs = Date.now();
      if (writer && sid !== writer.sid && nowMs - writer.at < 30000 && sstart <= writer.sstart) {
        return send(res, 409, JSON.stringify({ ok: false, conflict: true, error: "另一个标签页正在运行游戏，本页已暂停接管" }));
      }
      writer = { sid, sstart, at: nowMs };
      const now = new Date().toISOString();
      putSaveStmt.run(raw, now);
      /* 每天首次写入时留一条历史快照（便于回滚） */
      const day = Math.floor(parsed.day || 0);
      const last = db.prepare("SELECT day FROM save_history ORDER BY id DESC LIMIT 1").get();
      if (!last || last.day !== day) {
        historyStmt.run(raw, day, parsed.wave || 1, now);
        const c = historyCountStmt.get().c;
        if (c > 60) db.exec("DELETE FROM save_history WHERE id NOT IN (SELECT id FROM save_history ORDER BY id DESC LIMIT 60)");
      }
      return send(res, 200, JSON.stringify({ ok: true, updatedAt: now }));
    }
    if (url.pathname === "/api/history" && req.method === "GET") {
      const rows = db.prepare("SELECT id, day, wave, created_at FROM save_history ORDER BY id DESC LIMIT 60").all();
      return send(res, 200, JSON.stringify({ ok: true, rows }));
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
      return send(res, 200, html, "text/html; charset=utf-8");
    }
    /* 静态资源：只允许 css / js / assets / README.md */
    if (req.method === "GET" && (/^\/(css|js|assets)\//.test(url.pathname) || url.pathname === "/README.md")) {
      const MIME = {
        ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8",
        ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8",
        ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
        ".webp":"image/webp", ".svg":"image/svg+xml", ".ico":"image/x-icon",
        ".woff2":"font/woff2", ".md":"text/markdown; charset=utf-8"
      };
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      const file = path.resolve(ROOT, rel);
      const ext = path.extname(file).toLowerCase();
      if (file.startsWith(ROOT + path.sep) && MIME[ext] && fs.existsSync(file) && fs.statSync(file).isFile()) {
        return send(res, 200, fs.readFileSync(file), MIME[ext]);
      }
    }
    /* ★ v8.48 多设备诊断页：任何设备打开 /diag，直接显示"服务是否可达 / 读到哪个库 / 库里有什么档" */
    if (url.pathname === "/diag") {
      let row = null, dbErr = null;
      try { row = getSaveStmt.get(); } catch (e) { dbErr = e.message; }
      const day = row ? Math.floor(JSON.parse(row.data).day || 0) + 1 : null;
      const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const html = `<!DOCTYPE html><html lang="zh"><meta charset="utf-8"><title>存档诊断</title>
<body style="font-family:system-ui;max-width:640px;margin:40px auto;background:#121418;color:#d8dbe2;line-height:1.8">
<h2 style="color:#e8d9b0">重生避难所 · 存档诊断</h2>
<ul>
<li>你的来源 IP：<b>${esc(client)}</b>${/^(127\.|::1|192\.168\.1\.2$)/.test(client) ? "（⚠️ 这是主机自己/回环——你是从主机上打开的本页）" : "（来自局域网其他设备 ✓）"}</li>
<li>服务运行的目录：<b>${esc(ROOT)}</b></li>
<li>数据库文件：<b>${esc(DB_FILE)}</b></li>
<li>数据库读取：${dbErr ? `<b style="color:#d95c5c">失败：${esc(dbErr)}</b>` : "<b style=\"color:#6dbf6d\">正常</b>"}</li>
<li>库中存档：${row ? `<b style="color:#6dbf6d">第 ${day} 天</b>（更新于 ${esc(row.updated_at)}）` : "<b style=\"color:#d95c5c\">空——这个库里没有任何存档！</b>"}</li>
</ul>
<p>判定：<br>
① 上面显示「第 N 天」且 N 很大 → 服务和数据库都正常，游戏首页就应该能读到档；若游戏仍是新档，按 <b>Ctrl+F5</b> 强刷后重试。<br>
② 显示「空」→ 这台服务读的不是你玩游戏那份 shelter.db（服务可能从别的目录启动了）。<br>
③ 这页都打不开 → 网络不通（防火墙/代理/AP隔离），和游戏无关。</p>
</body></html>`;
      return send(res, 200, html, "text/html; charset=utf-8");
    }
    return send(res, 404, JSON.stringify({ ok: false, error: "not found" }));
  } catch (e) {
    return send(res, 500, JSON.stringify({ ok: false, error: e.message }));
  }
});

server.listen(PORT, () => {
  const row = getSaveStmt.get();
  console.log("");
  console.log("  重生避难所 · 本地服务已启动");
  console.log("  游戏地址：http://localhost:" + PORT + "/");
  console.log("  存档位置：" + DB_FILE);
  console.log("  当前存档：" + (row ? "第 " + (Math.floor(JSON.parse(row.data).day || 0) + 1) + " 天（" + row.updated_at + "）" : "还没有（点游戏里的「开始新的一世」）"));
  console.log("");
  console.log("  玩完直接关掉这个黑窗口即可，存档已经写进数据库了。");
  console.log("");
});

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
