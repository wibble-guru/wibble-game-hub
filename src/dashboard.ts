import { createHash, timingSafeEqual } from "node:crypto";
import type { HubConfig } from "./config.ts";
import { escapeHtml, html } from "./pages.ts";

/**
 * 허브 첫 화면: 모든 게임을 위블 사이트처럼 iframe으로 띄워 확인한다 (ready -> init -> result 규약 흉내).
 * HUB_USER/HUB_PASSWORD가 있을 때만 열리고, HTTP Basic 로그인을 거친다. 없으면 위블 사이트로 보낸다.
 */
export function dashboardPage(request: Request, config: HubConfig): Response {
  if (!config.dashboard) return Response.redirect(config.siteUrl, 302);

  if (!isAuthorized(request.headers.get("authorization"), config.dashboard)) {
    return new Response("로그인이 필요합니다", {
      status: 401,
      headers: {
        "www-authenticate": 'Basic realm="wibble games", charset="UTF-8"',
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const games = [...config.games.values()].map((g) => ({ slug: g.slug, title: g.title, siteSlug: g.siteSlug }));
  // <script> 안에 넣으므로 </script> 가 끼지 않게 < 를 이스케이프
  const gamesJson = JSON.stringify(games).replace(/</g, "\\u003c");

  // 함수로 넘겨야 값 안의 "$&" 같은 문자열이 치환 패턴으로 해석되지 않는다
  const page = PAGE.replace("__GAMES__", () => gamesJson)
    .replace("__SITE_JSON__", () => JSON.stringify(config.siteUrl).replace(/</g, "\\u003c"))
    .replace("__SITE_TEXT__", () => escapeHtml(config.siteUrl));
  return html(page, 200, {
    "content-security-policy": "frame-ancestors 'none'",
    "x-robots-tag": "noindex",
  });
}

const digest = (s: string) => createHash("sha256").update(s).digest();

function isAuthorized(header: string | null, creds: { user: string; password: string }): boolean {
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  // 길이 차이로 정보가 새지 않게 해시를 비교
  const userOk = timingSafeEqual(digest(decoded.slice(0, sep)), digest(creds.user));
  const passOk = timingSafeEqual(digest(decoded.slice(sep + 1)), digest(creds.password));
  return userOk && passOk;
}

const PAGE = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>위블 게임 허브</title>
<style>
  :root { --bg:#f4f5f8; --surface:#fff; --ink:#1d2433; --ink-2:#5b6478; --line:#dbe2f3; --primary:#4f6bff; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111318; --surface:#1b1e25; --ink:#eef0f6; --ink-2:#9aa1b2; --line:#2a2f3a; --primary:#7d92ff; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif; }
  header { padding: 16px; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
  header h1 { margin: 0; font-size: 18px; }
  header p { margin: 0; color: var(--ink-2); }
  .wrap { display: grid; grid-template-columns: 220px 1fr; min-height: calc(100dvh - 58px); }
  nav { border-right: 1px solid var(--line); padding: 12px; display: grid; align-content: start; gap: 4px; }
  nav button { text-align: left; padding: 10px 12px; border-radius: 10px; border: 0; background: transparent; color: var(--ink); font: inherit; cursor: pointer; }
  nav button[aria-current="true"] { background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); font-weight: 700; }
  nav small { display: block; color: var(--ink-2); }
  section { padding: 16px; display: grid; gap: 12px; align-content: start; min-width: 0; }
  .bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .bar label { display: inline-flex; gap: 6px; align-items: center; }
  .bar button, .bar select, .bar a { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); text-decoration: none; cursor: pointer; }
  .stage { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
  .stage figure { margin: 0; display: grid; gap: 6px; min-width: 0; }
  .stage figure.mobile { flex: 0 1 351px; }
  .stage figure.desktop { flex: 1 1 480px; }
  .stage figcaption { color: var(--ink-2); font-size: 12px; }
  /* 게임은 사이트와 같은 실제 크기로 그리고, 화면에 맞게 축소만 한다 (게임의 미디어 쿼리가 실제와 같게) */
  .screen { position: relative; width: 100%; overflow: hidden; border-radius: 14px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
  .screen iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; display: block; }
  pre { margin: 0; padding: 12px; border-radius: 10px; background: #1d2433; color: #cfe; max-height: 180px; overflow: auto; white-space: pre-wrap; }
  @media (max-width: 720px) { .wrap { grid-template-columns: 1fr; } nav { border-right: 0; border-bottom: 1px solid var(--line); grid-auto-flow: column; overflow-x: auto; } }
</style>
</head>
<body>
<header>
  <h1>위블 게임 허브</h1>
  <p>사이트(__SITE_TEXT__)처럼 게임을 띄워 확인합니다. 결과가 오면 아래 로그에 표시돼요.</p>
</header>
<div class="wrap">
  <nav id="games" aria-label="게임 목록"></nav>
  <section>
    <div class="bar">
      <label>테마 <select id="theme"><option value="default">default</option><option value="horror">horror</option></select></label>
      <label>화면 <select id="view"><option value="both">모바일 + PC</option><option value="mobile">모바일</option><option value="desktop">PC 16:9</option></select></label>
      <button id="reload" type="button">처음부터</button>
      <a id="site-link" target="_blank" rel="noopener">사이트에서 열기 ↗</a>
    </div>
    <div class="stage" id="stage"></div>
    <pre id="log" aria-live="polite"></pre>
  </section>
</div>
<script>
  const GAMES = __GAMES__;
  const SITE = __SITE_JSON__;
  const $ = (s) => document.querySelector(s);
  let current = GAMES[0];

  // 위블 사이트의 실제 게임 영역 크기
  //   모바일: 375×812 기기에서 좌우 여백 12px·상단 76px을 뺀 크기
  //   PC: 1200px 컨테이너에서 좌우 여백 24px을 뺀 16:9 (넓은 화면 기준 최대)
  const VIEWPORTS = [
    { id: "mobile", label: "모바일", w: 351, h: 736 },
    { id: "desktop", label: "PC 16:9", w: 1152, h: 648 },
  ];

  // 미리보기 칸 너비에 맞춰 iframe을 축소 (확대는 하지 않음)
  const fit = new Map();
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const item = fit.get(entry.target);
      if (!item) continue;
      const scale = Math.min(1, entry.contentRect.width / item.v.w);
      item.frame.style.transform = "scale(" + scale + ")";
      item.cap.textContent = item.v.label + " " + item.v.w + "×" + item.v.h + (scale < 1 ? " · " + Math.round(scale * 100) + "%" : "");
    }
  });

  function log(msg) {
    $("#log").textContent = new Date().toLocaleTimeString() + " " + msg + "\\n" + $("#log").textContent;
  }

  function renderNav() {
    $("#games").replaceChildren(...GAMES.map((g) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-current", String(g === current));
      b.append(g.title);
      const s = document.createElement("small");
      s.textContent = "/" + g.slug + "/";
      b.append(s);
      b.onclick = () => { current = g; renderNav(); load(); };
      return b;
    }));
  }

  function load() {
    if (!current) { $("#stage").textContent = "등록된 게임이 없어요 (src/games.ts)"; return; }
    $("#site-link").href = SITE + "/t/" + encodeURIComponent(current.siteSlug);
    const view = $("#view").value;
    observer.disconnect();
    fit.clear();
    const frames = VIEWPORTS.filter((v) => view === "both" || view === v.id);
    $("#stage").replaceChildren(...frames.map((v) => {
      const fig = document.createElement("figure");
      fig.className = v.id;
      const screen = document.createElement("div");
      screen.className = "screen";
      screen.style.aspectRatio = v.w + " / " + v.h;
      screen.style.maxWidth = v.w + "px";
      const f = document.createElement("iframe");
      f.width = v.w;
      f.height = v.h;
      f.title = current.title + " · " + v.label;
      f.allow = "autoplay; fullscreen; clipboard-write; web-share";
      f.src = "/" + current.slug + "/?run=" + Date.now();
      const cap = document.createElement("figcaption");
      screen.append(f);
      fig.append(screen, cap);
      fit.set(screen, { frame: f, cap, v });
      observer.observe(screen);
      return fig;
    }));
    log("[" + current.slug + "] 불러오는 중 (theme=" + $("#theme").value + ")");
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const frame = [...document.querySelectorAll("iframe")].find((f) => f.contentWindow === event.source);
    const data = event.data;
    if (!frame || !data || data.source !== "psytest-game") return;
    if (data.type === "ready") {
      frame.contentWindow.postMessage({ source: "psytest-host", type: "init", slug: current.siteSlug, theme: $("#theme").value }, location.origin);
    } else if (data.type === "result") {
      log("[" + frame.title + "] 결과 " + data.resultId + " → 사이트라면 /t/" + current.siteSlug + "/result/" + data.resultId);
    }
  });

  $("#reload").onclick = load;
  $("#theme").onchange = load;
  $("#view").onchange = load;
  renderNav();
  load();
</script>
</body>
</html>`;
