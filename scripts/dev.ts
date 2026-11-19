/**
 * 로컬 개발 서버: Vercel 미들웨어와 같은 handle()을 Node http 서버로 띄운다.
 *   pnpm dev   (.env.local을 읽음, 기본 포트 4400)
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { loadConfig } from "../src/config.ts";
import { handle } from "../src/gateway.ts";

const port = Number(process.env.PORT ?? 4400);
const config = loadConfig(process.env);

const PUBLIC_DIR = resolve(import.meta.dirname, "../public");
const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  // Vercel에서는 미들웨어 matcher가 /_hub/를 빼고 public/에서 정적으로 내보낸다. 로컬도 똑같이
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (pathname.startsWith("/_hub/")) {
    const file = resolve(PUBLIC_DIR, "." + pathname);
    if (!file.startsWith(PUBLIC_DIR + sep)) return void res.writeHead(400).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("Not Found");
    }
    return;
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) for (const v of value) headers.append(name, v);
  }
  const request = new Request(`http://${req.headers.host ?? `localhost:${port}`}${req.url ?? "/"}`, {
    method: req.method,
    headers,
  });
  const response = await handle(request, config);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res);
  else res.end();
}).listen(port, () => {
  console.log(`hub: http://localhost:${port}`);
  for (const g of config.games.values()) console.log(`  /${g.slug}/ -> ${g.origin}${g.bypassSecret ? " (bypass)" : ""}`);
  console.log(`  embedders: ${config.allowedEmbedders.join(", ")} · dashboard: ${config.dashboard ? "on" : "off"}`);
});
