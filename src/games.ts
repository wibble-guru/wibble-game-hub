/**
 * game.wibble.guru/{slug}/ 아래로 연결할 게임 목록.
 * 게임을 추가할 때는 여기에 한 줄을 더하고, 필요하면 Vercel 환경 변수에 BYPASS_{SLUG}를 넣는다.
 *
 * - slug:     허브 경로 (/court/). 영문 소문자·숫자·하이픈
 * - siteSlug: 위블 사이트의 테스트 slug. 주소를 직접 연 사람을 https://wibble.guru/t/{siteSlug} 로 보낸다
 * - upstream: 게임 Vercel 프로젝트의 운영 주소 (origin만). 환경 변수 UPSTREAM_{SLUG}가 있으면 그 값을 쓴다
 */
export type GameEntry = {
  slug: string;
  title: string;
  siteSlug: string;
  upstream: string;
};

export const GAMES: GameEntry[] = [
  {
    slug: "court",
    title: "위블 법정",
    siteSlug: "court",
    upstream: "https://wibble-court-ten.vercel.app",
  },
];
