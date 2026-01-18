# 배포 가이드

이 문서는 Railway와 Vercel에 프로젝트를 배포하는 방법을 안내합니다.

## 사전 준비

1. **GitHub 저장소 생성**
   - GitHub에 새 저장소 생성
   - 로컬 프로젝트를 GitHub에 푸시

2. **Railway 계정 생성**
   - [Railway](https://railway.app) 가입
   - GitHub 계정 연동

3. **Vercel 계정 생성**
   - [Vercel](https://vercel.com) 가입
   - GitHub 계정 연동

## 1단계: GitHub에 코드 푸시

```bash
# Git 초기화 (아직 안 했다면)
git init

# 모든 파일 추가
git add .

# 커밋
git commit -m "Initial commit: Trip Review Scraping Project"

# GitHub 저장소 추가 (your-username/tripreview로 변경)
git remote add origin https://github.com/your-username/tripreview.git

# 메인 브랜치로 푸시
git branch -M main
git push -u origin main
```

## 2단계: Railway 배포 (Server)

### 2.1 프로젝트 생성

1. [Railway 대시보드](https://railway.app/dashboard) 접속
2. "New Project" 클릭
3. "Deploy from GitHub repo" 선택
4. `tripreview` 저장소 선택
5. "Deploy Now" 클릭

### 2.2 Root Directory 설정

1. 프로젝트 설정에서 "Settings" 탭 클릭
2. "Root Directory" 섹션에서 `server` 입력
3. "Save" 클릭

### 2.3 PostgreSQL 데이터베이스 추가

1. 프로젝트에서 "New" 버튼 클릭
2. "Database" → "Add PostgreSQL" 선택
3. 데이터베이스가 자동으로 생성되고 `DATABASE_URL` 환경 변수가 추가됨

### 2.4 환경 변수 설정

프로젝트 → "Variables" 탭에서 다음 환경 변수 추가:

```
ADMIN_PASSWORD=your-secure-password-here
JWT_SECRET=your-random-secret-key-here
NODE_ENV=production
PORT=3000
```

**보안 팁:**
- `ADMIN_PASSWORD`는 강력한 비밀번호로 설정
- `JWT_SECRET`은 랜덤 문자열 생성 (예: `openssl rand -base64 32`)

### 2.5 데이터베이스 마이그레이션 실행

배포 후 데이터베이스 스키마를 생성해야 합니다.

**방법 1: Railway CLI 사용 (권장)**

```bash
# Railway CLI 설치
npm i -g @railway/cli

# 로그인
railway login

# 프로젝트 연결
railway link

# 환경 변수 확인
railway variables

# 마이그레이션 실행
cd server
railway run npm run migrate
```

**방법 2: Railway PostgreSQL 콘솔 사용**

1. Railway 대시보드에서 PostgreSQL 서비스 클릭
2. "Data" 탭 → "Query" 클릭
3. `server/src/db/schema.sql` 파일 내용을 복사하여 실행

### 2.6 배포 확인

1. Railway 대시보드에서 서비스 클릭
2. "Settings" → "Networking"에서 생성된 URL 확인
3. 브라우저에서 `https://your-app.railway.app/health` 접속하여 확인

## 3단계: Vercel 배포 (Client)

### 3.1 프로젝트 생성

1. [Vercel 대시보드](https://vercel.com/dashboard) 접속
2. "Add New..." → "Project" 클릭
3. GitHub 저장소에서 `tripreview` 선택
4. "Import" 클릭

### 3.2 Root Directory 설정

1. "Configure Project" 화면에서
2. "Root Directory" 섹션에서 "Edit" 클릭
3. `client` 입력
4. "Continue" 클릭

### 3.3 환경 변수 설정

"Environment Variables" 섹션에서 다음 변수 추가:

```
NEXT_PUBLIC_API_URL=https://your-railway-app.railway.app
NEXT_PUBLIC_ADMIN_SECRET=your-secure-password-here
```

**중요:** `NEXT_PUBLIC_ADMIN_SECRET`은 Railway의 `ADMIN_PASSWORD`와 동일하게 설정해야 합니다.

### 3.4 배포 실행

1. "Deploy" 버튼 클릭
2. 배포 완료 대기 (약 2-3분)
3. 생성된 URL로 접속하여 확인

## 4단계: 배포 확인

### Server 확인

```bash
# Health check
curl https://your-railway-app.railway.app/health

# 예상 응답: {"status":"ok"}
```

### Client 확인

1. Vercel에서 생성된 URL로 접속
2. 관리자 페이지가 정상적으로 로드되는지 확인
3. "작업 시작" 버튼이 작동하는지 테스트

## 문제 해결

### Railway 배포 실패

1. **빌드 로그 확인**
   - Railway 대시보드 → "Deployments" → 실패한 배포 클릭
   - 로그 확인

2. **Playwright 설치 실패**
   - `railway.json`의 빌드 명령 확인
   - 필요시 수동으로 `npx playwright install chromium` 실행

3. **데이터베이스 연결 실패**
   - `DATABASE_URL` 환경 변수 확인
   - PostgreSQL 서비스가 실행 중인지 확인

### Vercel 배포 실패

1. **빌드 로그 확인**
   - Vercel 대시보드 → "Deployments" → 실패한 배포 클릭
   - 로그 확인

2. **Root Directory 오류**
   - Settings → General → Root Directory가 `client`로 설정되어 있는지 확인
   - `vercel.json`에 `rootDirectory`가 없는지 확인

3. **환경 변수 오류**
   - 모든 `NEXT_PUBLIC_` 접두사가 있는지 확인
   - Railway 서버 URL이 올바른지 확인

## 자동 배포

GitHub에 푸시하면 자동으로 배포됩니다:

- **Railway**: `main` 브랜치에 푸시 시 자동 배포
- **Vercel**: `main` 브랜치에 푸시 시 자동 배포

## 업데이트 배포

코드를 수정한 후:

```bash
git add .
git commit -m "Update: 설명"
git push origin main
```

Railway와 Vercel이 자동으로 새 버전을 배포합니다.
