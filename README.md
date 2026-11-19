# 위블 게임 허브 (game.wibble.guru)

게임마다 저장소·Vercel 프로젝트는 따로 두고, `game.wibble.guru/{slug}/` 하나의 주소로 묶는 게이트웨이.
모든 요청이 [`src/gateway.ts`](src/gateway.ts)를 지나며 검사를 통과한 것만 게임 서버에서 받아 전달합니다.
(Vercel Routing Middleware — [`middleware.ts`](middleware.ts), Node.js 런타임, 프레임워크 없음)

```
위블 사이트 ──iframe──▶ game.wibble.guru/court/ ──검사──▶ wibble-court 프로젝트 (보호됨, 우회 헤더로만 접근)
```

## 처리 규칙

| 요청 | 결과 |
|---|---|
| 위블 사이트(`ALLOWED_EMBEDDERS`)의 iframe | 게임 서버에서 받아 전달 |
| 게임 화면을 주소창에서 직접 열기 | `{SITE_URL}/t/{siteSlug}` 로 이동 |
| 다른 사이트가 iframe으로 띄움 | 403 "위블에서 만나요" 안내 (+ CSP `frame-ancestors`로 브라우저가 한 번 더 막음) |
| 다른 사이트가 에셋(js·css·이미지)을 가져감 | 403 |
| 없는 게임 | 직접 접속은 사이트로, iframe은 404 안내 |
| `/court` | `/court/` 로 이동 (상대 경로 에셋용) |
| GET/HEAD 외 | 405 |
| 게임 서버 응답 없음 / 시간 초과 | 502 / 504 안내 (다시 시도 · 위블 홈) |
| 게임 서버 401·403 (보호 우회 설정 오류) | 502 안내 + 로그 |
| 게임 서버 5xx | 502 안내 |
| 그 밖의 예외 | 500 안내 |

- 게임 서버로는 `accept`, `user-agent` 등 필요한 헤더만 보냅니다. 쿠키·인증 헤더는 보내지 않습니다.
- 막은 요청은 Vercel 로그에 `{"hub":"blocked","reason":...}`로 남습니다. IP는 남기지 않습니다.
- `robots.txt`는 전부 막고, 모든 응답에 `X-Robots-Tag: noindex`를 붙입니다.

## 허브 첫 화면 (게임 모아 보기)

`HUB_USER`·`HUB_PASSWORD`가 있으면 `/`에서 로그인 후 모든 게임을 사이트처럼 띄워 볼 수 있습니다.
(모바일·PC 16:9, 테마 전환, 결과 로그) 값이 없으면 `/`는 위블 사이트로 보냅니다.

게임은 허브 주소에서 보낸 `init`도 받아야 하므로, 각 게임의 `VITE_ALLOWED_HOST_ORIGINS`에
`https://wibble.guru,https://game.wibble.guru` 를 넣어 주세요.

## 게임 추가

1. [`src/games.ts`](src/games.ts)에 `{ slug, title, siteSlug, upstream }` 한 줄 추가
2. 게임 프로젝트에서 Deployment Protection을 켜고 우회 값을 허브 환경 변수 `BYPASS_{SLUG}`에 넣기 (아래)
3. 위블 콘텐츠 서버의 `gameUrl`을 `https://game.wibble.guru/{slug}/` 로 (끝의 `/` 필수)

## Vercel 설정

**허브 프로젝트**
- 이 저장소를 Import (Framework: Other, 설정 그대로). 도메인 `game.wibble.guru` 연결
- 환경 변수: `.env.example` 참고 (`SITE_URL`, `ALLOWED_EMBEDDERS`, `HUB_USER`, `HUB_PASSWORD`, `BYPASS_{SLUG}`)

**게임 프로젝트 (예: wibble-court)** — `*.vercel.app` 으로 허브를 건너뛰고 들어오는 것을 막기
1. Settings → Deployment Protection → **Vercel Authentication: Standard Protection** (모든 플랜 가능)
   → 게임 프로젝트의 `vercel.app` 주소는 로그인한 팀원만 열림
2. 같은 화면 **Protection Bypass for Automation** 에서 값을 만들어 허브의 `BYPASS_COURT`에 넣기
   → 허브만 `x-vercel-protection-bypass` 헤더로 게임 서버에 접근
3. 게임 프로젝트에는 커스텀 도메인을 붙이지 않기 (커스텀 도메인은 Standard Protection 대상이 아님)

## 로컬 개발

```bash
pnpm install
cp .env.example .env.local   # UPSTREAM_COURT=http://localhost:4173 등
pnpm dev                     # http://localhost:4400
pnpm test                    # 게이트웨이 규칙 테스트
pnpm typecheck
```

게임 쪽은 `pnpm build && pnpm preview` (4173)로 운영 빌드를 띄워 연결하면 됩니다.
