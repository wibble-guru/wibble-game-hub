/**
 * 로컬 개발 서버: Vercel 미들웨어와 같은 handle()을 Node http 서버로 띄운다.
 *   pnpm dev   (.env.local을 읽음, 기본 포트 4400)
 */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { loadConfig } from "../src/config.ts";
import { handle } from "../src/gateway.ts";

const port = Number(process.env.PORT ?? 4400);
const config = loadConfig(process.env);

createServer(async (req, res) => {
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
