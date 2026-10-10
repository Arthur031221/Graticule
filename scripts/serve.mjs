// A small static file server for the built playground (site/).
//
//   node scripts/serve.mjs [dir] [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "site");
const port = Number(process.argv[3] ?? process.env.PORT ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
  ".csv": "text/csv; charset=utf-8",
};

export function serve(dir = root, listenPort = port) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let path = normalize(join(dir, decodeURIComponent(url.pathname)));
      if (!path.startsWith(dir)) throw new Error("outside");
      if ((await stat(path)).isDirectory()) path = join(path, "index.html");
      res.writeHead(200, {
        "content-type": TYPES[extname(path)] ?? "application/octet-stream",
        "cache-control": "no-cache",
      });
      res.end(await readFile(path));
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((done) => server.listen(listenPort, () => done(server)));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("serve.mjs")) {
  await serve();
  console.log(`http://localhost:${port}/`);
}
