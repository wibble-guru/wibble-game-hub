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

/** 허용되지 않은 사이트가 게임을 띄웠을 때. 낯선 페이지 안이므로 새 탭으로 연다 */
export function blockedPage(config: HubConfig, game: ResolvedGame): string {
  const href = `${config.siteUrl}/t/${encodeURIComponent(game.siteSlug)}`;
  return layout("위블에서 만나요", `
    <p class="eyebrow">WIBBLE</p>
    <h1>위블에서 만나요</h1>
    <p>${escapeHtml(game.title)}은(는) 위블 사이트에서 플레이할 수 있어요.</p>
    <div class="actions"><a class="btn" href="${escapeHtml(href)}" target="_blank" rel="noopener">위블에서 플레이하기</a></div>`);
}

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
