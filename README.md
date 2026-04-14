# Dynamic CIDS IPO Radar

Node.js + Express + SQLite + React(Vite) 기반 IPO 관련정보 대시보드입니다. 텔레그램 연동으로 데이터가 업데이트 되는 경우 알람이 발송됩니다.

## 1) 실행 방법

```bash
cd /Users/stevenshin/opencode/dynamic-cids-ipo-radar
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8787/api`

## 2) 기술 스택

- Backend: `express`, `axios`, `cheerio`, `better-sqlite3`
- Frontend: `react`, `vite`, `tailwindcss`
- DB: SQLite (`backend/data/ipo_radar.db`)

## 3) 디렉토리 구조

```text
dynamic-cids-ipo-radar/
  backend/
    src/
      collectors/
        baseCollector.js
        finutsCollector.js
      cidsEngine.js
      config.js
      db.js
      radarService.js
      scheduler.js
      server.js
      utils/
        parse.js
        time.js
    sql/init.sql
  frontend/
    src/
      api.js
      App.jsx
      main.jsx
      store.jsx
      index.css
    tailwind.config.js
    postcss.config.js
    vite.config.js
  docker-compose.yml
  package.json
```

## 4) 폴링/수집 안정성

- 기본 폴링: 설정값(`pollingHours`) 기준, 기본 24시간
- 수동 강제 갱신: 대시보드 상단 `강제 새로고침`
- 재시도: 최대 3회
  - 백오프: `1s -> 2s -> 4s`
  - 지터: `0~1s`
- 상태 저장: `fetch_logs`
  - HTTP 코드
  - 응답 길이
  - HTML 해시(md5)
  - 에러 메시지
- 조건부 요청:
  - 응답 헤더에 `ETag`/`Last-Modified`가 있으면 저장
  - 다음 요청에 `If-None-Match`/`If-Modified-Since` 적용
  - 헤더가 없으면 자동 비활성 유지

## 5) 상태 분류

- `정상 갱신`
- `접근 제한 의심` (403/429, 로그인/CAPTCHA 감지, 응답 길이 급감)
- `구조 변경 의심` (필수 테이블/헤더 미탐지)
- `파싱 실패`
- `소스 불일치` (리다이렉트 후 도메인 불일치)

구조 변경 의심 시 HTML 앞 2000자를 `fetch_logs.error_message`에 저장합니다.

## 6) Dynamic CIDS 수식

### 6-1. 공모시총 추정

`estimated_market_cap(억) = float_amount(억) / float_ratio`

`float_ratio`는 다음 입력을 모두 허용하고 0~1로 정규화:

- `20`
- `20%`
- `0.2`

### 6-2. Dynamic Anchor

- 최근 데이터 기반 AnchorNew 계산
- 최근 상장 30개 기준, 가중치 `w = max(상장수익률, 0) + 0.1`
- `AnchorNew = Σ(공모시총 × w) / Σ(w)`
- `AnchorFinal = 0.7 * AnchorNew + 0.3 * PrevAnchor`
- Clamp: `500 <= AnchorFinal <= 20000`
- 성과 데이터 부족 시 `PrevAnchor` 유지
- 기본 `PrevAnchor = 3000`

### 6-3. AdjustedR

`AdjustedR = R * (AnchorFinal / estimated_market_cap)^k`

- 기본 `k = 0.7` (설정 페이지에서 수정)

### 6-4. CIDS

- `CIDS = log10(AdjustedR)`
- `CIDS10`: 로버스트 퍼센타일(P5~P95) 기반 0~10 정규화 + clamp

### 6-5. 의사결정

- 기관경쟁률 미정: `⬜ 대기 / 수요예측 대기`
- `CIDS10 >= greenThreshold(기본 7)`: `🟩 초록 / 참가`
- `CIDS10 >= yellowThreshold(기본 6)`: `🟨 노랑 / 참가 고려`
- 그 외: `🟥 빨강 / 불참`

근거 3줄 자동 생성:

1. 기관경쟁률 원문 + 정규화값
2. 공모시총 vs AnchorFinal
3. CIDS10 vs 기준치

## 7) SQLite 스키마

`backend/sql/init.sql` 및 `backend/src/db.js`에서 동일 스키마 사용:

- `ipo_items`
- `fetch_logs`
- `anchors`
- `settings`

## 8) API

- `GET /api/health`
- `GET /api/status`
- `GET /api/items`
- `GET /api/logs?status=...`
- `GET /api/settings`
- `POST /api/settings`
- `POST /api/refresh`

## 9) Docker (선택)

```bash
docker compose up
```

개발 모드로 frontend/backend를 동시에 구동합니다.

## 10) 외부 공개 (조회 전용)

외부에 공개할 때는 백엔드를 조회 전용으로 구동하세요.

```bash
READ_ONLY=true \
ADMIN_KEY="your-strong-admin-key" \
CORS_ORIGIN="https://your-frontend-domain.com" \
npm run start -w backend
```

- `READ_ONLY=true`
  - 일반 사용자는 `POST /api/settings`, `POST /api/refresh` 호출이 차단됩니다.
- `ADMIN_KEY`
  - 운영자만 `x-admin-key` 헤더로 쓰기 API를 호출할 수 있습니다.
- `CORS_ORIGIN`
  - 허용할 프론트 도메인(쉼표 구분)만 설정하세요. 예: `https://a.com,https://b.com`

### Cloudflare Free 배포 (권장 순서)

아래 순서는 유료 기능 없이 Cloudflare Free + Tunnel로 공개하는 방법입니다.

1) 프론트 빌드

```bash
cd /Users/stevenshin/opencode/dynamic-cids-ipo-radar
npm install
npm run build
```

2) 운영자 키 생성

```bash
bash scripts/generate-admin-key.sh
```

3) Nginx 적용

- 템플릿: `ops/nginx/ipo-radar.conf`
- `radar.yourdomain.com` 과 프로젝트 경로를 본인 값으로 바꾼 뒤 적용

```bash
sudo cp ops/nginx/ipo-radar.conf /etc/nginx/sites-available/ipo-radar
sudo ln -s /etc/nginx/sites-available/ipo-radar /etc/nginx/sites-enabled/ipo-radar
sudo nginx -t && sudo systemctl reload nginx
```

4) 백엔드 조회 전용 실행

```bash
READ_ONLY=true \
ADMIN_KEY="your-strong-admin-key" \
CORS_ORIGIN="https://radar.yourdomain.com" \
PORT=8787 \
npm run start -w backend
```

5) Cloudflare Tunnel 생성/연결

```bash
cloudflared tunnel login
cloudflared tunnel create ipo-radar
cloudflared tunnel route dns ipo-radar radar.yourdomain.com
```

- 템플릿: `ops/cloudflared/config.example.yml`
- `credentials-file`, `hostname`을 본인 값으로 바꿔 `~/.cloudflared/config.yml`에 저장

```bash
cloudflared tunnel run ipo-radar
```

6) 동작 확인

- 공개 사용자: `POST /api/refresh`, `POST /api/settings`는 403
- 운영자: `x-admin-key` 헤더로만 쓰기 허용

운영자 강제 새로고침 예시:

```bash
curl -X POST "https://your-api-domain.com/api/refresh" \
  -H "x-admin-key: your-strong-admin-key"
```

운영자 설정 변경 예시:

```bash
curl -X POST "https://your-api-domain.com/api/settings" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your-strong-admin-key" \
  -d '{"kValue":0.7,"greenThreshold":7,"yellowThreshold":6,"pollingHours":24,"useDynamicAnchor":true}'
```

## 11) Vercel 배포 가이드

현재 구조(Express + SQLite + 폴링)는 백엔드가 상시 실행되어야 하므로, **Vercel에는 프론트만 배포**하고 백엔드는 별도 서버(Render/Railway/Fly/자체 VM)에 두는 구성이 가장 안정적입니다.

### 왜 백엔드를 Vercel에 바로 올리기 어려운가

- SQLite 파일 저장은 서버리스 환경에서 영속성이 보장되지 않습니다.
- 스케줄러(하루 1회 폴링)는 서버리스 함수의 상시 프로세스 모델과 맞지 않습니다.

### 권장 아키텍처

- Frontend: Vercel
- Backend(API + SQLite + scheduler): 별도 서버(조회 전용 모드 가능)

### 1) 프론트 환경변수 설정

프론트는 `VITE_API_BASE_URL`을 사용해 외부 API를 호출합니다.

- 예: `https://api.yourdomain.com`

Vercel Project Settings -> Environment Variables에 추가:

- `VITE_API_BASE_URL=https://api.yourdomain.com`

### 2) Vercel 배포

루트가 모노레포이므로 Vercel 설정:

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`

또는 CLI:

```bash
cd /Users/stevenshin/opencode/dynamic-cids-ipo-radar/frontend
vercel
```

### 3) 백엔드 CORS 설정

백엔드 실행 시 Vercel 도메인을 CORS에 허용합니다.

```bash
READ_ONLY=true \
ADMIN_KEY="your-strong-admin-key" \
CORS_ORIGIN="https://your-vercel-app.vercel.app" \
PORT=8787 \
npm run start -w backend
```

여러 도메인 허용 예시:

```bash
CORS_ORIGIN="https://your-vercel-app.vercel.app,https://radar.yourdomain.com"
```

### 4) 운영 포인트

- 공개 사용자는 조회만 가능(쓰기 API 차단)
- 운영자는 프론트 설정 탭에 admin key 입력 후 갱신/설정 변경 가능

### 5) Telegram 알림 채널 분기

텔레그램 알림은 기본적으로 `TELEGRAM_CHAT_ID` 하나로 보낼 수 있고, 아래 변수를 추가하면 메시지 종류별로 채널을 분리할 수 있습니다.

- `TELEGRAM_BOT_TOKEN`: 공통 봇 토큰
- `TELEGRAM_CHAT_ID`: 기본 fallback 채팅 ID
- `TELEGRAM_SIGNAL_CHAT_ID`: 신호 알림 전용 채팅/채널 ID
- `TELEGRAM_STATUS_CHAT_ID`: 시스템 점검(08:00 KST) 알림 전용 채팅/채널 ID

우선순위:

- 신호 알림: `TELEGRAM_SIGNAL_CHAT_ID` -> 없으면 `TELEGRAM_CHAT_ID`
- 상태 점검 알림: `TELEGRAM_STATUS_CHAT_ID` -> 없으면 `TELEGRAM_CHAT_ID`

공개 채널로 신호를 보내려면:

1) 해당 채널에 봇을 추가
2) 봇을 채널 관리자 권한으로 설정
3) 채널 ID 또는 `@channel_username`을 해당 env에 등록

## 12) Supabase CLI 빠른 시작

프로젝트에는 Supabase CLI 초기화와 마이그레이션 파일이 이미 준비되어 있습니다.

- `supabase/config.toml`
- `supabase/migrations/20260302064116_init_ipo_radar_schema.sql`

### 필요한 값

- `SUPABASE_PROJECT_REF`: Supabase Dashboard URL의 `https://supabase.com/dashboard/project/<project-ref>` 부분
- `SUPABASE_ACCESS_TOKEN`: Supabase Dashboard -> Account -> Access Tokens에서 발급

### 한 번에 링크+마이그레이션 적용

```bash
cd /Users/stevenshin/opencode/dynamic-cids-ipo-radar
SUPABASE_ACCESS_TOKEN="your-token" \
SUPABASE_PROJECT_REF="your-project-ref" \
bash scripts/supabase-bootstrap.sh
```

### 백엔드 실행용 키 (최신 방식)

- `SUPABASE_URL`: `https://<project-ref>.supabase.co`
- `SUPABASE_SECRET_KEY`: API Keys 페이지의 최신 Secret key (`sb_secret_...`)

호환성 때문에 `SUPABASE_SERVICE_ROLE_KEY`도 fallback으로 지원하지만, 최신 구성에서는 `SUPABASE_SECRET_KEY` 사용을 권장합니다.

```bash
SUPABASE_URL="https://dbwypfofgabgvkesvwpw.supabase.co" \
SUPABASE_SECRET_KEY="sb_secret_..." \
READ_ONLY=true \
ADMIN_KEY="your-admin-key" \
CORS_ORIGIN="https://frontend-smoky-sigma-93.vercel.app" \
npm run start -w backend
```
