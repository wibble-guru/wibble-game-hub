/**
 * game.wibble.guru 게이트웨이. 모든 요청이 여기를 지난다.
 *
 *   /                 허브 첫 화면(게임 모아 보기, 로그인 필요) — 꺼져 있으면 위블 사이트로
 *   /robots.txt       검색 노출 막기
 *   /{slug}           -> /{slug}/ 로 이동 (상대 경로 에셋이 깨지지 않게)
 *   /{slug}/...       검사 -> 통과하면 게임 서버(upstream)에서 받아 그대로 전달
 *
 * 검사 (통과 못 하면 게임 서버까지 가지 않는다)
 *   - GET/HEAD 외의 메서드                       405
 *   - 없는 게임                                   주소창 직접 접속이면 사이트로, 아니면 404
 *   - 게임 화면을 주소창에서 직접 연 경우         403 부정 사용 안내 (위블에서 플레이하기 → 사이트 테스트 페이지)
 *   - 허용되지 않은 사이트가 iframe으로 띄운 경우  403 같은 안내 (버튼은 새 탭)
 *   - 다른 사이트가 에셋을 직접 가져가는 경우      403
 *
 * 게임 서버 쪽 오류
 *   - 응답 없음/시간 초과        502/504 안내 화면
 *   - 401/403 (보호 우회 설정 오류) 502 안내 화면 + 로그
 *   - 5xx                        502 안내 화면
 *   - 404 (화면 요청)            404 안내 화면
 * 그 밖에 예상하지 못한 오류도 500 안내 화면으로 끝낸다 (게이트웨이가 죽지 않게).
 */
import type { HubConfig, ResolvedGame } from "./config.ts";
import { dashboardPage } from "./dashboard.ts";
import { errorPage, gatePage, html, notFoundPage } from "./pages.ts";

type Fetch = (input: URL, init: RequestInit) => Promise<Response>;

/** 브라우저가 화면(HTML)을 받으려고 보내는 요청인지 */
const DOCUMENT_DESTS = new Set(["document", "iframe", "frame"]);

/** 게임 서버로 넘길 요청 헤더 (나머지는 버린다: 쿠키·인증·IP 등이 새지 않게) */
const FORWARD_REQUEST_HEADERS = ["accept", "accept-language", "user-agent", "if-none-match", "if-modified-since", "cache-control"];

/** 게임 서버 응답에서 버릴 헤더. fetch가 압축을 풀어 주므로 content-encoding/length도 버린다 */
const DROP_RESPONSE_HEADERS = [
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
  "x-frame-options",
  "content-security-policy",
  "set-cookie",
  "server",
  "x-vercel-id",
  "x-vercel-cache",
];

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

type Block = { reason: string; response: Response };

export async function handle(request: Request, config: HubConfig, fetchImpl: Fetch = fetch): Promise<Response> {
  try {
    return await route(request, config, fetchImpl);
  } catch (err) {
    console.error("[hub] 예상하지 못한 오류", err);
    return html(errorPage(config, "잠시 문제가 생겼어요", "조금 뒤에 다시 시도해 주세요."), 500, frameHeaders(config));
  }
}

async function route(request: Request, config: HubConfig, fetchImpl: Fetch): Promise<Response> {
  const url = new URL(request.url);

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  if (url.pathname === "/robots.txt") {
    return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  if (url.pathname === "/") return dashboardPage(request, config);

  const [, slug = "", ...restSegments] = url.pathname.split("/");
  const game = config.games.get(slug);
  const dest = request.headers.get("sec-fetch-dest");
  const isDocument = dest ? DOCUMENT_DESTS.has(dest) : (request.headers.get("accept") ?? "").includes("text/html");

  if (!game) {
    if (isTopLevel(request, dest)) return log(url, { reason: "unknown-game", response: Response.redirect(config.siteUrl, 302) });
    return isDocument
      ? html(notFoundPage(config), 404, frameHeaders(config))
      : new Response("Not Found", { status: 404 });
  }

  if (restSegments.length === 0) {
    return new Response(null, { status: 308, headers: { Location: `/${slug}/${url.search}` } });
  }

  const block = isDocument ? checkDocument(request, url, dest, game, config) : checkAsset(request);
  if (block) return log(url, block);

  return proxy(request, url, game, isDocument, config, fetchImpl);
}

/** 주소창에 직접 입력·북마크·새 탭 등 iframe이 아닌 최상위 화면 요청 */
function isTopLevel(request: Request, dest: string | null): boolean {
  if (dest) return dest === "document";
  // Sec-Fetch-*를 안 보내는 오래된 브라우저: 화면 요청인데 Referer도 없으면 직접 접속으로 본다
  return (request.headers.get("accept") ?? "").includes("text/html") && !request.headers.get("referer");
}

function checkDocument(request: Request, url: URL, dest: string | null, game: ResolvedGame, config: HubConfig): Block | null {
  if (isTopLevel(request, dest)) {
    return { reason: "direct-open", response: html(gatePage(config, game, { newTab: false }), 403, frameHeaders(config)) };
  }

  const refererOrigin = originOf(request.headers.get("referer"));
  // 허브 자신(첫 화면의 미리보기, 게임 안의 이동)은 허용. 다른 사이트의 iframe은 CSP frame-ancestors가 한 번 더 막는다
  const allowed = refererOrigin !== null && (refererOrigin === url.origin || config.allowedEmbedders.includes(refererOrigin));
  if (!allowed) {
    // 낯선 페이지 안에서도 안내가 보이도록 frame-ancestors는 붙이지 않는다
    return { reason: `foreign-embedder:${refererOrigin ?? "none"}`, response: html(gatePage(config, game, { newTab: true }), 403) };
  }
  return null;
}

function checkAsset(request: Request): Block | null {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return { reason: "cross-site-asset", response: new Response("Forbidden", { status: 403 }) };
  }
  return null;
}

async function proxy(
  request: Request,
  url: URL,
  game: ResolvedGame,
  isDocument: boolean,
  config: HubConfig,
  fetchImpl: Fetch,
): Promise<Response> {
  // 문자열로 붙여야 "/court//evil.com" 같은 경로가 다른 호스트로 새지 않는다
  const target = new URL(game.origin + url.pathname.slice(game.slug.length + 1) + url.search);
  if (target.origin !== game.origin) return new Response("Bad Request", { status: 400 });

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (game.bypassSecret) headers.set("x-vercel-protection-bypass", game.bypassSecret);

  const fail = (status: number, title: string, body: string) =>
    isDocument ? html(errorPage(config, title, body), status, frameHeaders(config)) : new Response(title, { status });

  let upstream: Response;
  try {
    upstream = await fetchImpl(target, {
      method: request.method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    console.error(`[hub] 게임 서버 ${timedOut ? "시간 초과" : "연결 실패"}: ${game.slug} ${target.pathname}`, err);
    return fail(timedOut ? 504 : 502, "게임을 불러오지 못했어요", "잠시 후 다시 시도해 주세요.");
  }

  if (upstream.status === 401 || upstream.status === 403) {
    console.error(`[hub] 게임 서버가 접근을 거부함 (${upstream.status}): ${game.slug} — BYPASS_${game.slug.toUpperCase()} 설정을 확인하세요`);
    return fail(502, "게임을 불러오지 못했어요", "잠시 후 다시 시도해 주세요.");
  }
  if (upstream.status >= 500) {
    console.error(`[hub] 게임 서버 오류 (${upstream.status}): ${game.slug} ${target.pathname}`);
    return fail(502, "게임을 불러오지 못했어요", "잠시 후 다시 시도해 주세요.");
  }
  if (upstream.status === 404 && isDocument) {
    return html(notFoundPage(config), 404, frameHeaders(config));
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const name of DROP_RESPONSE_HEADERS) responseHeaders.delete(name);
  for (const [name, value] of Object.entries(frameHeaders(config))) responseHeaders.set(name, value);

  // 게임 서버가 자기 주소로 보내는 이동은 허브 경로로 바꿔 준다
  const location = upstream.headers.get("location");
  if (location) {
    const next = new URL(location, target);
    if (next.origin === game.origin) responseHeaders.set("location", `/${game.slug}${next.pathname}${next.search}`);
  }

  const body = request.method === "HEAD" || NULL_BODY_STATUS.has(upstream.status) ? null : upstream.body;
  return new Response(body, { status: upstream.status, headers: responseHeaders });
}

/** 위블 사이트(와 허브 자신)만 iframe으로 띄울 수 있게 */
function frameHeaders(config: HubConfig): Record<string, string> {
  return {
    "content-security-policy": `frame-ancestors 'self' ${config.allowedEmbedders.join(" ")}`,
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
}

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** 막은 요청은 Vercel 로그에 남긴다 (IP 등 개인 정보는 남기지 않음) */
function log(url: URL, block: Block): Response {
  console.warn(JSON.stringify({ hub: "blocked", reason: block.reason, path: url.pathname, status: block.response.status }));
  return block.response;
}
