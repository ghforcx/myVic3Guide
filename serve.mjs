// Vicdata 本地资料库静态服务器（无依赖，Node 18+）
// 用法: node serve.mjs   （默认端口 8737，被占用时自动向后找）
// 带缓存协商（ETag/304）：代码层可廉价复验，内容层长缓存，重复访问近乎秒开。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = import.meta.dirname;
const BASE_PORT = 8737;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function cacheControl(rel) {
  // 内容层（图标/数据分块/地图资源）稳定不变 -> 长缓存；代码层（app/*.js 等）-> 每次廉价复验
  if (rel === "assets/map/flatmap__2.jpg") return "no-cache"; // 本地已换格式/缩图，改为协商缓存
  if (rel.startsWith("assets/") || rel.startsWith("versions/")) return "public, max-age=86400";
  return "no-cache";
}

function serve(req, res) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/\/+$/, "");
  } catch {
    res.writeHead(400); res.end("Bad request"); return;
  }
  if (rel === "" || rel === "/") rel = "/index.html";
  const segs = rel.split("/").filter((s) => s && s !== "." && s !== "..");
  const file = path.join(ROOT, ...segs);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }
  let stat;
  try { stat = fs.statSync(file); } catch { res.writeHead(404); res.end("Not found"); return; }
  if (!stat.isFile()) { res.writeHead(404); res.end("Not found"); return; }

  const etag = `W/"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
  const relFromRoot = path.relative(ROOT, file).replace(/\\/g, "/");
  const headers = {
    "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": cacheControl(relFromRoot),
    ETag: etag,
    "Last-Modified": stat.mtime.toUTCString(),
  };
  const inm = req.headers["if-none-match"];
  const ims = req.headers["if-modified-since"];
  if ((inm && inm === etag) || (!inm && ims && new Date(ims).getTime() >= Math.round(stat.mtimeMs / 1000) * 1000)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

function listen(port) {
  const srv = http.createServer(serve);
  srv.on("error", () => {
    if (port < BASE_PORT + 20) listen(port + 1);
    else { console.error("8737~8757 端口都被占用了，无法启动。"); process.exit(1); }
  });
  srv.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/?lang=zh-Hans`;
    console.log("==========================================");
    console.log("  Vicdata 本地资料库已启动");
    console.log("  " + url);
    console.log("  关闭本窗口即停止服务；浏览器里可收藏该地址");
    console.log("  （后台正在预热文件缓存，几十秒内首次点击更快）");
    console.log("==========================================");
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    }
    prewarm();
  });
}

// 开机后第一次访问前，把全部文件读进操作系统文件缓存，避免杀软/磁盘冷读拖慢首屏
async function prewarm() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) files.push(p);
    }
  };
  try {
    walk(ROOT);
    const CONC = 16;
    let i = 0;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (i < files.length) {
        const f = files[i++];
        try { const fh = await fs.promises.open(f, "r"); await fh.readFile(); await fh.close(); } catch {}
      }
    }));
    console.log("文件缓存预热完成。");
  } catch {}
}

listen(BASE_PORT);
