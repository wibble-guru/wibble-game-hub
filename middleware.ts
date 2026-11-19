/**
 * Vercel Routing Middleware (Node.js 런타임). game.wibble.guru의 모든 요청이 여기를 지난다.
 * 실제 처리는 src/gateway.ts — 로컬에서는 scripts/dev.ts가 같은 함수를 띄운다.
 */
import { loadConfig } from "./src/config.ts";
import { handle } from "./src/gateway.ts";

const hubConfig = loadConfig(process.env);

export default function middleware(request: Request): Promise<Response> {
  return handle(request, hubConfig);
}

/** 안내 화면의 이미지·글꼴(public/_hub/)은 미들웨어를 거치지 않고 정적으로 나간다 */
export const config = { matcher: ["/((?!_hub/).*)"] };
