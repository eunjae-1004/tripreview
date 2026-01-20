# 환경 변수 설정 가이드

## .env 파일 생성

`.env` 파일은 Git에 커밋되지 않습니다 (보안상의 이유). 각 환경에서 별도로 생성해야 합니다.

### 로컬 개발 환경

1. `.env.example` 파일을 복사하여 `.env` 파일 생성:

```bash
# Windows (PowerShell)
cd server
Copy-Item .env.example .env

# Linux/Mac
cd server
cp .env.example .env
```

2. `.env` 파일을 열어 실제 값으로 수정:

```env
# 데이터베이스 연결 (로컬 PostgreSQL)
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/tripreview

# 관리자 비밀번호 (API 인증용)
ADMIN_PASSWORD=your_secure_password

# 서버 포트
PORT=3000

# 환경
NODE_ENV=development
```

### Railway 배포 환경

Railway에서는 환경 변수를 대시보드에서 설정합니다:

1. Railway 프로젝트 페이지로 이동
2. "Variables" 탭 클릭
3. 다음 변수들을 추가:

```
DATABASE_URL=postgresql://... (Railway가 자동으로 생성)
ADMIN_PASSWORD=your_secure_password
NODE_ENV=production
PORT=3000 (Railway가 자동으로 설정)
```

### Vercel 배포 환경 (클라이언트)

Vercel에서는 환경 변수를 대시보드에서 설정합니다:

1. Vercel 프로젝트 페이지로 이동
2. "Settings" > "Environment Variables" 클릭
3. 다음 변수 추가:

```
NEXT_PUBLIC_API_URL=https://your-railway-app.railway.app
```

## 필수 환경 변수

### Server (Railway)

- `DATABASE_URL`: PostgreSQL 연결 문자열 (Railway가 자동 생성)
- `ADMIN_PASSWORD`: 관리자 API 인증 비밀번호
- `NODE_ENV`: `production` (배포 시)
- `PORT`: Railway가 자동으로 설정

### Client (Vercel)

- `NEXT_PUBLIC_API_URL`: 서버 API URL (예: `https://your-app.railway.app`)

## 보안 주의사항

⚠️ **중요**: `.env` 파일은 절대 Git에 커밋하지 마세요!

- `.gitignore`에 이미 포함되어 있습니다
- 실제 비밀번호는 각 환경에서만 설정하세요
- Railway와 Vercel에서는 대시보드를 통해 안전하게 설정하세요
