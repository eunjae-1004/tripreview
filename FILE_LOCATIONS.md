# 프로젝트 파일 위치 가이드

## 프로젝트 루트
```
D:\Website\cursor\tripreview\
```

## 주요 디렉토리 구조

### 1. Server (Railway 배포)
```
server/
├── .env                    # 환경 변수 파일 (로컬에서 생성 필요)
├── .env.example            # 환경 변수 예제 파일
├── .gitignore             # Git 무시 파일
├── package.json           # 서버 의존성 및 스크립트
├── railway.json           # Railway 배포 설정
├── Procfile               # Railway 실행 명령
├── playwright.config.js   # Playwright 테스트 설정
│
├── src/
│   ├── index.js          # 서버 진입점 (Express 서버)
│   │
│   ├── db/
│   │   ├── connection.js        # PostgreSQL 연결
│   │   ├── schema.sql            # 데이터베이스 스키마
│   │   ├── migrate.js            # 마이그레이션 스크립트
│   │   ├── migrate-add-urls.js   # URL 컬럼 추가 마이그레이션
│   │   └── migrations/
│   │       └── 001_add_portal_urls.sql
│   │
│   ├── services/
│   │   ├── scraper.js     # 스크래핑 서비스 (Playwright)
│   │   └── jobService.js  # 작업 관리 서비스
│   │
│   ├── routes/
│   │   └── admin.js       # 관리자 API 라우트
│   │
│   └── test/
│       ├── scraper-test.js              # 스크래퍼 테스트
│       ├── test-api.js                  # API 테스트
│       ├── test-companies.js            # 기업 스크래핑 테스트
│       ├── test-companies-detailed.js   # 상세 스크래핑 테스트
│       ├── test-registered-companies.js # 등록된 기업 테스트
│       └── test-with-api.js             # API를 통한 테스트
│
└── tests/
    ├── scraper.spec.js              # Playwright 통합 테스트
    ├── api.spec.js                  # API 통합 테스트
    ├── naver-map-scraper.spec.js    # 네이버맵 스크래퍼 테스트
    ├── naver-map-url.spec.js        # 네이버맵 URL 테스트
    └── naver-map-real-structure.spec.js # 실제 구조 테스트
```

### 2. Client (Vercel 배포)
```
client/
├── .gitignore
├── package.json
├── next.config.js
├── tsconfig.json
├── vercel.json
│
└── app/
    ├── layout.tsx      # 루트 레이아웃
    ├── page.tsx        # 메인 페이지
    ├── globals.css     # 전역 스타일
    └── page.module.css # 페이지 스타일
```

## 중요 파일 위치

### 환경 변수 파일
- **로컬**: `server/.env` (직접 생성 필요)
- **예제**: `server/.env.example`
- **설정 가이드**: `server/ENV_SETUP.md`

### 데이터베이스
- **스키마**: `server/src/db/schema.sql`
- **연결**: `server/src/db/connection.js`
- **마이그레이션**: `server/src/db/migrate.js`

### 스크래핑
- **메인 스크래퍼**: `server/src/services/scraper.js`
- **작업 관리**: `server/src/services/jobService.js`

### API
- **서버 진입점**: `server/src/index.js`
- **관리자 API**: `server/src/routes/admin.js`

### 테스트
- **스크래퍼 테스트**: `server/src/test/test-companies.js`
- **Playwright 테스트**: `server/tests/`

### 문서
- **README**: `README.md`
- **배포 가이드**: `DEPLOY.md`
- **테스트 가이드**: `server/TEST_GUIDE.md`
- **환경 변수 가이드**: `server/ENV_SETUP.md`
- **기업 API 가이드**: `server/COMPANY_API.md`

## .env 파일 생성 위치

### 로컬 개발
```
server/.env
```

### Railway 배포
- Railway 대시보드에서 환경 변수 설정
- 로컬 `.env` 파일 불필요

### Vercel 배포 (클라이언트)
- Vercel 대시보드에서 환경 변수 설정
- 로컬 `.env` 파일 불필요

## Git 무시 파일

### 루트 `.gitignore`
```
D:\Website\cursor\tripreview\.gitignore
```

### Server `.gitignore`
```
D:\Website\cursor\tripreview\server\.gitignore
```

## 현재 작업 디렉토리
```
D:\Website\cursor\tripreview
```
