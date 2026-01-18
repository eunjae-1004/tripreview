# Trip Review Scraping Project

기업 리뷰 데이터를 수집하고 관리하는 프로젝트입니다.

## 프로젝트 구조

```
tripreview/
├── server/              # Railway 배포 (Express + Playwright)
│   ├── src/
│   │   ├── db/          # 데이터베이스 스키마 및 연결
│   │   ├── services/    # 스크래핑 및 작업 관리 서비스
│   │   ├── routes/      # API 라우트
│   │   └── index.js     # 서버 진입점
│   ├── package.json
│   └── railway.json
├── client/              # Vercel 배포 (Next.js)
│   ├── app/             # Next.js App Router
│   ├── package.json
│   └── vercel.json
└── README.md
```

## 기술 스택

### Server
- Express.js - RESTful API 서버
- PostgreSQL - 관계형 데이터베이스
- Playwright - 웹 스크래핑
- node-cron - 스케줄링 (매주 월요일 새벽 2시)

### Client
- Next.js 14 - React 프레임워크
- React 18 - UI 라이브러리
- TypeScript - 타입 안정성

## 데이터베이스 스키마

### companies (기업 정보)
- id: 일련번호
- company_name: 기업명
- type: 유형 (숙박시설, 음식점 등)
- is_member: 회원사 여부 (Y/N)
- address: 주소
- email: 이메일
- phone: 전화번호
- manager: 담당자

### reviews (리뷰 정보)
- id: 일련번호
- portal_url: 포털 주소 (네이버맵, 카카오맵, 아고다 등)
- company_name: 기업명
- review_date: 작성일자
- content: 내용
- rating: 평점
- nickname: 닉네임
- visit_keyword: 방문키워드
- review_keyword: 리뷰키워드
- visit_type: 방문구성 (혼자, 연인, 가족 등)
- emotion: 감정
- revisit_flag: 재방문 여부
- n_rating: 종합 분석 평점
- n_emotion: 종합 분석 감정
- n_char_count: 종합 분석 글자수
- UNIQUE(company_name, review_date, nickname) - 중복 방지

### scraping_jobs (작업 로그)
- id: 작업 ID
- status: 상태 (pending, running, completed, failed, stopped)
- started_at: 시작 시간
- completed_at: 완료 시간
- total_reviews: 전체 리뷰 수
- success_count: 성공 수
- error_count: 오류 수
- error_message: 오류 메시지

## 설정 방법

### 1. Railway 설정

1. **Railway 프로젝트 생성**
   - [Railway](https://railway.app)에서 새 프로젝트 생성
   - GitHub 저장소 연결

2. **PostgreSQL 애드온 추가**
   - 프로젝트에서 "New" → "Database" → "PostgreSQL" 선택
   - `DATABASE_URL` 환경 변수가 자동 생성됨

3. **환경 변수 설정**
   - `DATABASE_URL` (PostgreSQL 애드온에서 자동 생성)
   - `ADMIN_PASSWORD` (관리자 비밀번호, 예: `admin123`)
   - `JWT_SECRET` (JWT 토큰 비밀키, 랜덤 문자열)
   - `NODE_ENV=production`
   - `PORT=3000`
   - `PLAYWRIGHT_BROWSERS_PATH=/app/.playwright` (선택사항)

4. **Root Directory 설정**
   - Settings → Root Directory → `server`로 설정

5. **빌드 설정**
   - Railway는 `railway.json` 파일을 자동으로 인식
   - Playwright 브라우저가 자동으로 설치됨

### 2. Vercel 설정

1. **Vercel 프로젝트 생성**
   - [Vercel](https://vercel.com)에서 새 프로젝트 생성
   - GitHub 저장소 연결

2. **Root Directory 설정**
   - Settings → Root Directory → `client`로 설정

3. **환경 변수 설정**
   - `NEXT_PUBLIC_API_URL` (Railway 서버 URL, 예: `https://your-app.railway.app`)
   - `NEXT_PUBLIC_ADMIN_SECRET` (서버의 `ADMIN_PASSWORD`와 동일하게 설정)

### 3. 데이터베이스 초기화

Railway에서 데이터베이스가 생성된 후, Railway CLI를 사용하거나 Railway의 PostgreSQL 콘솔에서 스키마를 실행합니다.

**방법 1: Railway CLI 사용**
```bash
# Railway CLI 설치
npm i -g @railway/cli

# 로그인
railway login

# 프로젝트 연결
railway link

# 데이터베이스 연결 정보 확인
railway variables

# 로컬에서 마이그레이션 실행
cd server
npm install
npm run migrate
```

**방법 2: Railway PostgreSQL 콘솔 사용**
1. Railway 대시보드에서 PostgreSQL 애드온 클릭
2. "Query" 탭 선택
3. `server/src/db/schema.sql` 파일 내용 복사하여 실행

## 실행 방법

### 개발 환경

**Server:**
```bash
cd server
npm install
# .env 파일 생성 및 설정
npm run dev
```

**Client:**
```bash
cd client
npm install
# .env.local 파일 생성 및 설정
npm run dev
```

### 프로덕션 배포

**Railway (Server):**
- GitHub에 푸시하면 자동으로 배포됩니다
- 첫 배포 시 데이터베이스 마이그레이션을 수동으로 실행해야 합니다

**Vercel (Client):**
- GitHub에 푸시하면 자동으로 배포됩니다

## API 엔드포인트

### 관리자 API (인증 필요: `x-admin-secret` 헤더)

- `POST /api/admin/jobs/start` - 스크래핑 작업 시작
- `POST /api/admin/jobs/stop` - 스크래핑 작업 중지
- `GET /api/admin/jobs/status` - 현재 작업 상태 조회
- `GET /api/admin/jobs` - 최근 작업 목록 조회
- `GET /api/admin/jobs/:id` - 특정 작업 상세 조회

### 공개 API

- `GET /health` - 서버 상태 확인

## 기능

- ✅ 매주 월요일 새벽 2시 자동 스크래핑
- ✅ 관리자 페이지에서 수동 실행/중지 가능
- ✅ 스크래핑 진행 상황 실시간 확인
- ✅ 작업 이력 조회
- ✅ 중복 리뷰 방지 (기업명, 날짜, 닉네임 기준)

## 스크래핑 대상 사이트

현재 기본 구조만 구현되어 있으며, 각 사이트의 실제 구조에 맞게 스크래핑 로직을 수정해야 합니다:

- 네이버맵 (https://map.naver.com)
- 카카오맵 (https://map.kakao.com)
- 야놀자 (https://www.yanolja.com)
- 굿초이스 (https://www.goodchoice.kr)
- 구글 (https://www.google.com)
- 트립어드바이저 (https://www.tripadvisor.co.kr)
- 아고다 (https://www.agoda.com)

## 주의사항

1. **스크래핑 로직 커스터마이징 필요**
   - 각 사이트의 실제 HTML 구조에 맞게 `server/src/services/scraper.js` 파일의 스크래핑 메서드를 수정해야 합니다.

2. **기업 데이터 입력 필요**
   - 스크래핑을 실행하기 전에 `companies` 테이블에 기업 정보를 입력해야 합니다.
   - 각 기업의 포털 URL 정보도 함께 관리해야 합니다.

3. **로봇 정책 준수**
   - 각 사이트의 robots.txt를 확인하고 준수해야 합니다.
   - 적절한 딜레이와 User-Agent 설정이 필요합니다.

4. **인증 보안**
   - 현재는 간단한 헤더 기반 인증을 사용하고 있습니다.
   - 프로덕션 환경에서는 JWT 토큰 기반 인증을 구현하는 것을 권장합니다.

## 라이선스

ISC
