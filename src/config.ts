import { GAMES, type GameEntry } from "./games.ts";

export type Env = Record<string, string | undefined>;

export type ResolvedGame = GameEntry & {
  /** 실제로 요청을 보낼 origin (UPSTREAM_{SLUG} 반영) */
  origin: string;
  /** 게임 프로젝트의 Vercel Deployment Protection 우회 값 (BYPASS_{SLUG}) */
  bypassSecret: string | null;
};

export type HubConfig = {
  /** 위블 사이트 주소. 직접 접속한 사람을 이쪽으로 보낸다 */
  siteUrl: string;
  /** 게임을 iframe으로 띄워도 되는 사이트 origin들 (허브 자신은 항상 허용) */
  allowedEmbedders: string[];
  /** 허브 첫 화면(게임 모아 보기) 로그인. 없으면 첫 화면은 사이트로 보낸다 */
  dashboard: { user: string; password: string } | null;
  upstreamTimeoutMs: number;
  games: Map<string, ResolvedGame>;
};

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** "court" -> "COURT", "dawn-visitor" -> "DAWN_VISITOR" */
export const envKey = (slug: string) => slug.toUpperCase().replace(/-/g, "_");

function toOrigin(value: string | undefined, label: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("http(s)만 가능");
    return url.origin;
  } catch (err) {
    console.error(`[hub] ${label} 값이 올바른 주소가 아니라 무시합니다: ${value}`, err);
    return null;
  }
}

export function loadConfig(env: Env): HubConfig {
  const siteUrl = toOrigin(env.SITE_URL, "SITE_URL") ?? "https://wibble.guru";

  const embedders = (env.ALLOWED_EMBEDDERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => toOrigin(s, "ALLOWED_EMBEDDERS"))
    .filter((s): s is string => s !== null);

  const games = new Map<string, ResolvedGame>();
  for (const game of GAMES) {
    if (!SLUG_PATTERN.test(game.slug)) {
      console.error(`[hub] 잘못된 게임 slug라 건너뜁니다: ${game.slug}`);
      continue;
    }
    const key = envKey(game.slug);
    const origin = toOrigin(env[`UPSTREAM_${key}`], `UPSTREAM_${key}`) ?? toOrigin(game.upstream, `${game.slug}.upstream`);
    if (!origin) continue;
    games.set(game.slug, { ...game, origin, bypassSecret: env[`BYPASS_${key}`] || null });
  }

  const timeout = Number(env.UPSTREAM_TIMEOUT_MS);

  return {
    siteUrl,
    allowedEmbedders: embedders.length > 0 ? embedders : [siteUrl],
    dashboard: env.HUB_USER && env.HUB_PASSWORD ? { user: env.HUB_USER, password: env.HUB_PASSWORD } : null,
    upstreamTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 10_000,
    games,
  };
}
