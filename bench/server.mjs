// Minimal static server for the benchmark. Two reasons not to reuse
// http-server: it cannot send the COOP/COEP headers that make the page
// cross-origin isolated (which raises performance.now() resolution from
// 100 µs to ~5 µs), and binding is explicit here. 127.0.0.1 only, no directory
// listings: the served root is the whole repository (see playwright.config.js).
// A multi-hour run keeps it open, so it also refuses foreign Host headers (DNS
// rebinding) and serves only the directories the harness page loads from.
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".map": "application/json",
};

const SERVED_DIRS = new Set(["bench", "dist", "node_modules"]);

export function startServer(root, port = 0) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    if (req.headers.host !== `127.0.0.1:${server.address().port}`) {
      res.writeHead(403).end();
      return;
    }
    // Resolve the raw path: URL parsing would normalise "../" away and hide
    // traversal attempts behind a 404.
    const rawPath = decodeURIComponent(req.url.split("?")[0]);
    const file = path.resolve(base, "." + rawPath);
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!SERVED_DIRS.has(path.relative(base, file).split(path.sep)[0])) {
      res.writeHead(404).end();
      return;
    }
    let stat;
    try {
      stat = statSync(file);
    } catch {
      res.writeHead(404).end();
      return;
    }
    if (!stat.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cache-Control": "no-store",
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: actual } = server.address();
      resolve({
        url: `http://127.0.0.1:${actual}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
