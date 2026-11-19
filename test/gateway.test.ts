import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.ts";
import { handle } from "../src/gateway.ts";

const HUB = "https://game.wibble.guru";
const SITE = "https://wibble.guru";
const UPSTREAM = "https://court-upstream.example";

const config = loadConfig({
  SITE_URL: SITE,
  ALLOWED_EMBEDDERS: SITE,
  UPSTREAM_COURT: UPSTREAM,
  BYPASS_COURT: "secret-123",
  HUB_USER: "admin",
  HUB_PASSWORD: "pw",
  UPSTREAM_TIMEOUT_MS: "50",
});

type Call = { url: URL; init: RequestInit };

function fakeUpstream(respond: (url: URL) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = async (url: URL, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url);
  };
  return { calls, fetchImpl };
}

const ok = () => fakeUpstream(() => new Response("<html>game</html>", { headers: { "content-type": "text/html", "content-encoding": "br", "x-frame-options": "DENY" } }));

/** 위블 사이트 iframe 안에서 게임 화면을 여는 요청 */
const iframeHeaders = (referer: string | null = `${SITE}/t/court`) => ({
  "sec-fetch-dest": "iframe",
  "sec-fetch-site": "same-site",
  accept: "text/html",
  ...(referer ? { referer } : {}),
});

const req = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  new Request(HUB + path, { method, headers });

describe("허용되는 요청", () => {
  it("위블 사이트 iframe → 게임 서버로 전달, 보호 우회 헤더 추가", async () => {
    const up = ok();
    const res = await handle(req("/court/?run=1", iframeHeaders()), config, up.fetchImpl);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "<html>game</html>");
    assert.equal(up.calls[0].url.href, `${UPSTREAM}/?run=1`);
    assert.equal(new Headers(up.calls[0].init.headers).get("x-vercel-protection-bypass"), "secret-123");
  });

  it("응답 헤더: 압축·X-Frame-Options 제거, frame-ancestors 설정", async () => {
    const res = await handle(req("/court/", iframeHeaders()), config, ok().fetchImpl);
    assert.equal(res.headers.get("content-encoding"), null);
    assert.equal(res.headers.get("x-frame-options"), null);
    assert.equal(res.headers.get("content-security-policy"), `frame-ancestors 'self' ${SITE}`);
  });

  it("쿠키·인증 헤더는 게임 서버로 보내지 않는다", async () => {
    const up = ok();
    await handle(req("/court/", { ...iframeHeaders(), cookie: "a=b", authorization: "Bearer x" }), config, up.fetchImpl);
    const sent = new Headers(up.calls[0].init.headers);
    assert.equal(sent.get("cookie"), null);
    assert.equal(sent.get("authorization"), null);
  });

  it("게임 안의 에셋 요청 (same-origin) → 전달", async () => {
    const up = fakeUpstream(() => new Response("js", { headers: { "content-type": "text/javascript" } }));
    const res = await handle(req("/court/assets/index.js", { "sec-fetch-dest": "script", "sec-fetch-site": "same-origin" }), config, up.fetchImpl);
    assert.equal(res.status, 200);
    assert.equal(up.calls[0].url.href, `${UPSTREAM}/assets/index.js`);
  });

  it("허브 첫 화면의 미리보기(자기 origin) iframe → 전달", async () => {
    const res = await handle(req("/court/", iframeHeaders(`${HUB}/`)), config, ok().fetchImpl);
    assert.equal(res.status, 200);
  });

  it("304는 본문 없이 그대로", async () => {
    const up = fakeUpstream(() => new Response(null, { status: 304, headers: { etag: '"1"' } }));
    const res = await handle(req("/court/", { ...iframeHeaders(), "if-none-match": '"1"' }), config, up.fetchImpl);
    assert.equal(res.status, 304);
    assert.equal(res.body, null);
  });

  it("게임 서버의 자기 주소 이동은 허브 경로로 바꾼다", async () => {
    const up = fakeUpstream(() => new Response(null, { status: 308, headers: { location: `${UPSTREAM}/next/?a=1` } }));
    const res = await handle(req("/court/old", iframeHeaders()), config, up.fetchImpl);
    assert.equal(res.headers.get("location"), "/court/next/?a=1");
  });
});

describe("막는 요청", () => {
  it("게임 화면을 주소창에서 직접 열면 사이트의 테스트 페이지로", async () => {
    const up = ok();
    const res = await handle(req("/court/", { "sec-fetch-dest": "document", "sec-fetch-site": "none", accept: "text/html" }), config, up.fetchImpl);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), `${SITE}/t/court`);
    assert.equal(up.calls.length, 0, "게임 서버까지 가지 않는다");
  });

  it("Sec-Fetch가 없는 오래된 브라우저 + Referer 없음 → 직접 접속으로 보고 사이트로", async () => {
    const res = await handle(req("/court/", { accept: "text/html" }), config, ok().fetchImpl);
    assert.equal(res.status, 302);
  });

  it("다른 사이트가 iframe으로 띄우면 403 안내 화면", async () => {
    const up = ok();
    const res = await handle(req("/court/", iframeHeaders("https://evil.example/page")), config, up.fetchImpl);
    assert.equal(res.status, 403);
    assert.match(await res.text(), /위블에서 만나요/);
    assert.equal(up.calls.length, 0);
  });

  it("Referer 없는 iframe 요청도 403", async () => {
    const res = await handle(req("/court/", iframeHeaders(null)), config, ok().fetchImpl);
    assert.equal(res.status, 403);
  });

  it("다른 사이트에서 에셋을 가져가면 403", async () => {
    const res = await handle(req("/court/assets/index.js", { "sec-fetch-dest": "script", "sec-fetch-site": "cross-site" }), config, ok().fetchImpl);
    assert.equal(res.status, 403);
  });

  it("GET/HEAD 외 메서드는 405", async () => {
    const res = await handle(req("/court/", iframeHeaders(), "POST"), config, ok().fetchImpl);
    assert.equal(res.status, 405);
  });

  it("없는 게임: 직접 접속은 사이트로, iframe은 404 화면", async () => {
    const direct = await handle(req("/nope/", { "sec-fetch-dest": "document" }), config, ok().fetchImpl);
    assert.equal(direct.status, 302);
    assert.equal(direct.headers.get("location"), `${SITE}/`);
    const framed = await handle(req("/nope/", iframeHeaders()), config, ok().fetchImpl);
    assert.equal(framed.status, 404);
  });

  it("경로로 다른 호스트를 노려도 게임 서버 origin을 벗어나지 않는다", async () => {
    const up = ok();
    await handle(req("/court//evil.example/x", iframeHeaders()), config, up.fetchImpl);
    assert.equal(up.calls[0].url.origin, UPSTREAM);
  });
});

describe("주소 정리", () => {
  it("/court → /court/ (쿼리 유지)", async () => {
    const res = await handle(req("/court?x=1", iframeHeaders()), config, ok().fetchImpl);
    assert.equal(res.status, 308);
    assert.equal(res.headers.get("location"), "/court/?x=1");
  });

  it("robots.txt는 전부 막기", async () => {
    const res = await handle(req("/robots.txt"), config, ok().fetchImpl);
    assert.match(await res.text(), /Disallow: \//);
  });
});

describe("게임 서버 오류", () => {
  it("응답이 없으면 504 안내 화면", async () => {
    const up = fakeUpstream((url) => new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("t"), { name: "TimeoutError" })), 5) && void url));
    const res = await handle(req("/court/", iframeHeaders()), config, up.fetchImpl);
    assert.equal(res.status, 504);
    assert.match(await res.text(), /다시 시도/);
  });

  it("연결 실패면 502", async () => {
    const up = fakeUpstream(() => Promise.reject(new TypeError("fetch failed")));
    const res = await handle(req("/court/", iframeHeaders()), config, up.fetchImpl);
    assert.equal(res.status, 502);
  });

  it("보호 우회 설정 오류(401)는 502로 숨긴다", async () => {
    const up = fakeUpstream(() => new Response("login", { status: 401 }));
    const res = await handle(req("/court/", iframeHeaders()), config, up.fetchImpl);
    assert.equal(res.status, 502);
    assert.doesNotMatch(await res.text(), /login/);
  });

  it("5xx면 502 안내 화면", async () => {
    const up = fakeUpstream(() => new Response("boom", { status: 500 }));
    const res = await handle(req("/court/", iframeHeaders()), config, up.fetchImpl);
    assert.equal(res.status, 502);
  });

  it("화면 404는 허브 404 화면", async () => {
    const up = fakeUpstream(() => new Response("nf", { status: 404 }));
    const res = await handle(req("/court/missing", iframeHeaders()), config, up.fetchImpl);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /게임을 찾을 수 없어요/);
  });

  it("fetch가 예상 못 한 예외를 던져도 502 화면으로 끝난다", async () => {
    const up = fakeUpstream(() => {
      throw new Error("unexpected");
    });
    const res = await handle(req("/court/", iframeHeaders()), config, up.fetchImpl);
    assert.equal(res.status, 502);
  });
});

describe("허브 첫 화면", () => {
  const basic = (u: string, p: string) => ({ authorization: "Basic " + Buffer.from(`${u}:${p}`).toString("base64") });

  it("로그인 없으면 401", async () => {
    const res = await handle(req("/"), config, ok().fetchImpl);
    assert.equal(res.status, 401);
    assert.match(res.headers.get("www-authenticate") ?? "", /Basic/);
  });

  it("틀린 비밀번호 401, 맞으면 게임 목록", async () => {
    assert.equal((await handle(req("/", basic("admin", "nope")), config, ok().fetchImpl)).status, 401);
    const res = await handle(req("/", basic("admin", "pw")), config, ok().fetchImpl);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /"slug":"court"/);
  });

  it("HUB_PASSWORD가 없으면 첫 화면은 사이트로", async () => {
    const res = await handle(req("/"), loadConfig({ SITE_URL: SITE }), ok().fetchImpl);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), `${SITE}/`);
  });
});
