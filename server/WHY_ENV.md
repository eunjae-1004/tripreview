# .env 파일이 필요한 이유

## 현재 코드에서 사용하는 환경 변수

### 1. **DATABASE_URL** (필수 - DB 저장 시)
```javascript
// server/src/db/connection.js
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,  // ← 여기서 사용
  ...
});
```
- **용도**: PostgreSQL 데이터베이스 연결
- **없으면**: DB 연결 실패 → 리뷰 저장 불가
- **현재 상태**: 없어도 스크래핑은 작동하지만, DB 저장은 실패

### 2. **ADMIN_PASSWORD** (필수 - API 보안)
```javascript
// server/src/routes/admin.js
if (adminSecret === process.env.ADMIN_PASSWORD) {  // ← 여기서 사용
  next();
}
```
- **용도**: 관리자 API 인증 비밀번호
- **없으면**: 기본값 없음 → API 인증 실패
- **현재 상태**: 없으면 관리자 API 사용 불가

### 3. **PORT** (선택)
```javascript
// server/src/index.js
const PORT = process.env.PORT || 3000;  // ← 기본값 3000
```
- **용도**: 서버 포트 번호
- **없으면**: 기본값 3000 사용 (문제 없음)

### 4. **NODE_ENV** (선택)
```javascript
// server/src/db/connection.js
ssl: process.env.NODE_ENV === 'production' ? ...  // ← SSL 설정
```
- **용도**: 환경 구분 (development/production)
- **없으면**: 기본값 없음 → production에서 SSL 설정 안 됨

### 5. **PLAYWRIGHT_BROWSERS_PATH** (선택)
```javascript
// server/src/services/scraper.js
const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
```
- **용도**: Playwright 브라우저 경로 (Railway 배포 시)
- **없으면**: 기본 경로 사용 (로컬에서는 문제 없음)

## 결론

### .env 파일이 **필수**인 경우:
1. ✅ **DB에 리뷰 저장**하려면 → `DATABASE_URL` 필요
2. ✅ **관리자 API 사용**하려면 → `ADMIN_PASSWORD` 필요
3. ✅ **Railway 배포** 시 → Railway가 자동으로 설정하지만, 로컬 테스트용으로는 필요

### .env 파일이 **선택**인 경우:
- ❌ 스크래핑만 테스트 (DB 저장 안 함) → 불필요
- ❌ API 사용 안 함 → 불필요

## 현재 상황

현재 테스트에서는:
- ✅ 스크래핑: **작동함** (10개 리뷰 추출 성공)
- ❌ DB 저장: **실패** (`DATABASE_URL` 없음)
- ❌ API 인증: **실패** (`ADMIN_PASSWORD` 없음)

## 해결 방법

### 옵션 1: .env 파일 생성 (DB 저장 필요 시)
```bash
cd server
# .env 파일 생성 후 다음 내용 추가:
DATABASE_URL=postgresql://user:password@localhost:5432/tripreview
ADMIN_PASSWORD=your_password
```

### 옵션 2: .env 없이 계속 사용 (스크래핑만 테스트)
- 스크래핑은 정상 작동
- DB 저장은 안 됨 (콘솔에만 출력)
- API는 사용 불가

### 옵션 3: Railway 배포 시
- Railway가 자동으로 환경 변수 설정
- 로컬 .env 파일 불필요
