"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

function startStaticServer(root, port, spa = true) {
  root = path.resolve(root);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        );
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      const target = path.resolve(root, "." + pathname);
      const relative = path.relative(root, target);
      if (
        relative.startsWith(".." + path.sep) ||
        relative === ".." ||
        path.isAbsolute(relative)
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      const candidates = [target, path.join(target, "index.html")];
      if (!path.extname(target)) candidates.push(target + ".html");
      if (spa && !path.extname(target))
        candidates.push(path.join(root, "index.html"));
      const file = candidates.find((candidate) => {
        try {
          return fs.statSync(candidate).isFile();
        } catch {
          return false;
        }
      });
      if (!file) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      fs.readFile(file, (err, content) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
        });
        res.end(req.method === "HEAD" ? undefined : content);
      });
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}
module.exports = { startStaticServer };
