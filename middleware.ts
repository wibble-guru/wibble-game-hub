/**
 * Vercel Routing Middleware (Node.js 런타임). game.wibble.guru의 모든 요청이 여기를 지난다.
 * 실제 처리는 src/gateway.ts — 로컬에서는 scripts/dev.ts가 같은 함수를 띄운다.
 */
import { loadConfig } from "./src/config.ts";
import { handle } from "./src/gateway.ts";

const config = loadConfig(process.env);

export default function middleware(request: Request): Promise<Response> {
  return handle(request, config);
}
