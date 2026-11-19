import type { HubConfig, ResolvedGame } from "./config.ts";

/** 안내 화면들. 사이트 iframe 안에서도, 단독으로도 보일 수 있다. */

export function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STYLE = `
  :root { --bg:#eef3ff; --ink:#1d2433; --ink-2:#5b6478; --primary:#4f6bff; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14161c; --ink:#eef0f6; --ink-2:#9aa1b2; --primary:#7d92ff; color-scheme: dark; } }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { background: var(--bg); color: var(--ink); display: grid; place-items: center; padding: 16px; text-align: center;
    font-family: "SUIT", "Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
  main { display: grid; justify-items: center; gap: 12px; max-width: 420px; }
  .eyebrow { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .16em; color: var(--primary); }
  h1 { margin: 0; font-size: clamp(26px, 6vmin, 40px); }
  p { margin: 0; color: var(--ink-2); line-height: 1.5; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
  .btn { display: inline-flex; align-items: center; min-height: 48px; padding: 0 22px; border-radius: 14px; border: 0;
    font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; background: var(--primary); color: #fff; }
  .btn.ghost { background: transparent; color: var(--primary); box-shadow: inset 0 0 0 1.5px var(--primary); }
`;

function layout(title: string, inner: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>${inner}</main></body>
</html>`;
}

/**
 * 부정 사용 안내 (Figma "06 게임 직접 접속 안내 (공통)", 394:991 · PC 394:1005 / 모바일 402:86).
 * 게임 주소를 직접 열었거나, 위블이 아닌 사이트가 게임을 띄웠을 때.
 * 이미지·글꼴은 public/_hub/ 에서 정적으로 나간다 (미들웨어를 거치지 않음).
 */
export function gatePage(config: HubConfig, game: ResolvedGame, opts: { newTab: boolean }): string {
  const href = `${config.siteUrl}/t/${encodeURIComponent(game.siteSlug)}`;
  const target = opts.newTab ? ` target="_blank" rel="noopener"` : "";
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>위블에서 만나요</title>
<link rel="preload" href="/_hub/fonts/SUIT-Variable.woff2" as="font" type="font/woff2" crossorigin>
<style>${GATE_STYLE}</style>
</head>
<body>
<header><img class="logo" src="/_hub/wibble-logo.png" alt="Wibble" width="720" height="179"></header>
<main class="content">
  <picture class="mascot">
    <source media="(min-width: 768px)" srcset="/_hub/wibble-gate-pc.svg" width="203" height="203">
    <img src="/_hub/wibble-gate-mobile.svg" alt="" width="152" height="152">
  </picture>
  <h1>위블에서 만나요</h1>
  <p class="body">이 테스트는 위블 공식 사이트에서만<br class="mobile-break"> 플레이할 수 있어요.</p>
  <a class="btn" href="${escapeHtml(href)}"${target}>위블에서 플레이하기</a>
</main>
<footer>© ${new Date().getFullYear()} Wibble</footer>
</body>
</html>`;
}

/** 값은 Figma 노드 그대로. 모바일(390) 기준, 768px부터 PC(1440) 값 */
const GATE_STYLE = `
  @font-face {
    font-family: "SUIT Variable";
    src: url("/_hub/fonts/SUIT-Variable.woff2") format("woff2-variations"), url("/_hub/fonts/SUIT-Variable.woff2") format("woff2");
    font-weight: 100 900;
    font-display: swap;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: max(48px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom));
    background: #f3f8ff;
    color: #1d2b45;
    font-family: "SUIT Variable", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-align: center;
    word-break: keep-all;
  }
  .logo { display: block; width: 120.656px; height: auto; }
  .content { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 342px; }
  .mascot, .mascot img { display: block; width: 152px; height: 152px; }
  h1 { margin: 16px 0 0; font-size: 24px; font-weight: 800; line-height: 1.3; letter-spacing: -0.6px; }
  .body { margin: 8px 0 0; color: #4a5a73; font-size: 16px; font-weight: 400; line-height: 1.6; }
  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin-top: 32px;
    padding: 16px 32px;
    border-radius: 12px;
    background: #1f73cc;
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.35;
    letter-spacing: -0.16px;
    text-decoration: none;
  }
  .btn:hover { background: #1a64b3; }
  .btn:focus-visible { outline: 3px solid #9cc7f5; outline-offset: 2px; }
  footer { color: #617088; font-size: 12px; font-weight: 500; line-height: 1.5; letter-spacing: -0.18px; }
  @media (min-width: 768px) {
    .logo { width: 152.844px; }
    .content { max-width: none; }
    .mascot, .mascot img { width: 203px; height: 203px; }
    h1 { margin-top: 20px; font-size: 38px; letter-spacing: -0.95px; }
    .body { margin-top: 0; font-size: 18px; line-height: 1.65; }
    .mobile-break { display: none; }
    .btn { width: auto; margin-top: 40px; }
  }
`;

/** 게임 서버 오류 등. 사이트 iframe 안에서 보이므로 다시 시도 + 사이트로 가기 */
export function errorPage(config: HubConfig, title: string, body: string): string {
  return layout(title, `
    <p class="eyebrow">WIBBLE</p>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(body)}</p>
    <div class="actions">
      <button class="btn" type="button" onclick="location.reload()">다시 시도</button>
      <a class="btn ghost" href="${escapeHtml(config.siteUrl)}" target="_top">위블 홈으로</a>
    </div>`);
}

export function notFoundPage(config: HubConfig): string {
  return layout("게임을 찾을 수 없어요", `
    <p class="eyebrow">404</p>
    <h1>게임을 찾을 수 없어요</h1>
    <p>주소가 바뀌었거나 더 이상 제공하지 않는 게임이에요.</p>
    <div class="actions"><a class="btn" href="${escapeHtml(config.siteUrl)}" target="_top">위블 홈으로</a></div>`);
}
