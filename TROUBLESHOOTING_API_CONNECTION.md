# API 연결 문제 해결 가이드

## 문제

"작업 시작 실패: 서버에 연결할 수 없습니다. API URL을 확인하세요: https://tripreviewbackend-production.up.railway.app"

API URL은 올바르게 설정되었지만 서버에 연결할 수 없는 경우입니다.

## 확인 사항

### 1. Railway 서버가 실행 중인지 확인

1. **Railway 대시보드 접속**
   - https://railway.app
   - `tripreview_backend` 프로젝트 선택

2. **서비스 상태 확인**
   - 서비스가 "Active" 상태인지 확인
   - "Stopped" 상태면 "Start" 버튼 클릭

3. **로그 확인**
   - "Logs" 탭 클릭
   - 다음 메시지가 보이는지 확인:
     ```
     ✅ 서버가 포트 8080에서 실행 중입니다.
     🌐 서버 준비 완료 - 요청 대기 중...
     ```
   - 에러 메시지가 있는지 확인

### 2. Healthcheck 엔드포인트 테스트

브라우저에서 직접 접속하여 서버가 응답하는지 확인:

```
https://tripreviewbackend-production.up.railway.app/health
```

**예상 응답:**
```json
{
  "status": "ok",
  "message": "Trip Review Server is running",
  "timestamp": "2026-01-21T00:15:11.172Z",
  "uptime": 123.456,
  "port": 8080
}
```

**문제가 있는 경우:**
- 페이지가 로드되지 않음 → 서버가 실행되지 않음
- "Connection refused" → 서버가 다운됨
- "404 Not Found" → URL이 잘못됨

### 3. 브라우저 콘솔 확인

1. **개발자 도구 열기**
   - F12 키 누르기
   - 또는 우클릭 > "검사"

2. **Console 탭 확인**
   - 에러 메시지 확인:
     ```
     [API] 작업 시작 요청: https://tripreviewbackend-production.up.railway.app/api/admin/jobs/start
     [API] 네트워크 에러: Failed to fetch
     ```

3. **Network 탭 확인**
   - "Network" 탭 클릭
   - "작업 시작" 버튼 클릭
   - `/api/admin/jobs/start` 요청 확인
   - 상태 코드 확인:
     - `200 OK` → 성공
     - `401 Unauthorized` → 인증 실패
     - `CORS error` → CORS 문제
     - `Failed to fetch` → 연결 실패

### 4. CORS 문제 확인

CORS 에러가 발생하는 경우:

**에러 메시지:**
```
Access to fetch at 'https://...' from origin 'https://...' has been blocked by CORS policy
```

**해결 방법:**
- 서버의 CORS 설정이 이미 모든 도메인을 허용하도록 설정되어 있습니다
- Railway 로그에서 CORS 관련 에러 확인

### 5. Railway 로그에서 API 요청 확인

Railway 대시보드 > Logs 탭에서 다음 메시지 확인:

```
[API] POST /api/admin/jobs/start - 2026-01-21T00:15:11.172Z
[API] Headers: { 'x-admin-secret': '설정됨', ... }
```

**요청이 로그에 없으면:**
- 요청이 서버에 도달하지 않음
- 네트워크 문제 또는 Railway 서버 다운

**요청이 로그에 있으면:**
- 서버는 요청을 받았지만 처리 중 문제 발생
- 로그의 에러 메시지 확인

## 해결 방법

### 방법 1: Railway 서버 재시작

1. Railway 대시보드 > 서비스 선택
2. "Settings" > "Restart" 클릭
3. 서버가 재시작될 때까지 대기
4. 다시 테스트

### 방법 2: 환경 변수 확인

Railway에서 다음 환경 변수가 설정되어 있는지 확인:

- `DATABASE_URL` - PostgreSQL 연결
- `ADMIN_PASSWORD` - API 인증
- `NODE_ENV` - `production`

### 방법 3: Railway 서버 URL 확인

1. Railway 대시보드 > Settings > Networking
2. Public Domain 확인
3. Vercel의 `NEXT_PUBLIC_API_URL`과 일치하는지 확인

### 방법 4: 수동 테스트

터미널에서 직접 API 테스트:

```bash
# Healthcheck 테스트
curl https://tripreviewbackend-production.up.railway.app/health

# API 테스트 (ADMIN_PASSWORD를 실제 값으로 변경)
curl -X POST https://tripreviewbackend-production.up.railway.app/api/admin/jobs/start \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_ADMIN_PASSWORD" \
  -d '{"dateFilter": "week"}'
```

## 일반적인 문제와 해결책

### 문제 1: "Failed to fetch"

**원인:**
- 서버가 실행되지 않음
- 네트워크 연결 문제
- Railway 서버 다운

**해결:**
1. Railway 대시보드에서 서버 상태 확인
2. 로그에서 에러 메시지 확인
3. 서버 재시작

### 문제 2: "401 Unauthorized"

**원인:**
- `ADMIN_PASSWORD`와 `NEXT_PUBLIC_ADMIN_SECRET`이 일치하지 않음

**해결:**
1. Railway의 `ADMIN_PASSWORD` 확인
2. Vercel의 `NEXT_PUBLIC_ADMIN_SECRET` 확인
3. 두 값이 정확히 일치하는지 확인

### 문제 3: "CORS error"

**원인:**
- CORS 설정 문제 (하지만 이미 모든 도메인 허용으로 설정됨)

**해결:**
- Railway 로그 확인
- 서버 재시작

### 문제 4: "Connection refused"

**원인:**
- Railway 서버가 다운됨
- 포트 문제

**해결:**
1. Railway 대시보드에서 서버 상태 확인
2. 서버 재시작

## 다음 단계

1. **Railway 서버 상태 확인**
   - 서버가 "Active" 상태인지
   - 로그에 에러가 없는지

2. **Healthcheck 테스트**
   - 브라우저에서 `/health` 엔드포인트 접속
   - 정상 응답 확인

3. **브라우저 콘솔 확인**
   - 정확한 에러 메시지 확인
   - Network 탭에서 요청 상태 확인

4. **Railway 로그 확인**
   - API 요청이 도달하는지 확인
   - 에러 메시지 확인

## 디버깅 정보 수집

문제 해결을 위해 다음 정보를 수집하세요:

1. **브라우저 콘솔 에러**
   - F12 > Console 탭의 에러 메시지

2. **Network 탭 정보**
   - F12 > Network 탭
   - `/api/admin/jobs/start` 요청의 상태 코드

3. **Railway 로그**
   - Railway 대시보드 > Logs 탭의 최근 로그

4. **서버 상태**
   - Railway 대시보드에서 서버가 "Active"인지 확인
