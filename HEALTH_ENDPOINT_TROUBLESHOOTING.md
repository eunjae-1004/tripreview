# Health 엔드포인트 문제 해결 가이드

## 문제

`https://tripreviewbackend-production.up.railway.app/health` 엔드포인트가 정상 응답하지 않습니다.

## 가능한 원인

### 1. 서버가 실행되지 않음
- Railway 서버가 다운되었거나 크래시됨
- 서버가 시작 중이지만 아직 준비되지 않음

### 2. 포트 문제
- 서버가 다른 포트에서 실행 중
- Railway가 포트를 잘못 매핑

### 3. 라우팅 문제
- Health 엔드포인트가 제대로 등록되지 않음
- 미들웨어 순서 문제

### 4. Railway 프록시 문제
- Railway의 프록시/로드밸런서 문제
- 도메인 매핑 문제

## 확인 사항

### 1. Railway 대시보드에서 로그 확인

1. **Railway 대시보드 접속**
   - https://railway.app
   - `tripreview_backend` 프로젝트 선택

2. **Logs 탭 확인**
   - 왼쪽 메뉴에서 "Logs" 클릭
   - 최근 로그 확인

3. **확인할 메시지:**
   ```
   ✅ 서버가 포트 8080에서 실행 중입니다.
   🌐 서버 준비 완료 - 요청 대기 중...
   ```

4. **에러 메시지 확인:**
   - `PostgreSQL 연결 오류`
   - `포트가 이미 사용 중입니다`
   - `처리되지 않은 예외`
   - `메모리 부족`

### 2. 서버 상태 확인

1. **Railway 대시보드 > 서비스 선택**
2. **상태 확인**
   - "Active" 상태인지 확인
   - "Stopped" 또는 "Failed" 상태면 문제 있음

3. **서버 재시작**
   - Settings > Restart 클릭
   - 또는 Deployments 탭 > 최신 배포 > Redeploy

### 3. Healthcheck 요청이 로그에 있는지 확인

Railway 로그에서 다음 메시지 확인:
```
[Healthcheck] 요청 수신 - serverReady: true, uptime: X.XXX
[Healthcheck] 응답: {"status":"ok",...}
```

**요청이 로그에 없으면:**
- 요청이 서버에 도달하지 않음
- Railway 프록시 문제

**요청이 로그에 있으면:**
- 서버는 요청을 받았지만 응답하지 않음
- 코드 문제

### 4. 직접 포트 접속 테스트 (불가능)

Railway는 직접 포트 접속을 허용하지 않으므로, Public Domain을 통해서만 접근 가능합니다.

## 해결 방법

### 방법 1: 서버 재시작

1. Railway 대시보드 > 서비스 선택
2. Settings > Restart 클릭
3. 서버가 재시작될 때까지 대기 (약 1-2분)
4. `/health` 엔드포인트 다시 테스트

### 방법 2: 재배포

1. Railway 대시보드 > Deployments
2. 최신 배포 클릭
3. "Redeploy" 버튼 클릭
4. 배포 완료 대기
5. `/health` 엔드포인트 다시 테스트

### 방법 3: 환경 변수 확인

Railway 대시보드 > Variables에서 다음 확인:
- `DATABASE_URL` (선택사항이지만 권장)
- `ADMIN_PASSWORD` (필수)
- `NODE_ENV` (선택)
- `PORT` (Railway가 자동 설정)

### 방법 4: 로그에서 에러 확인

Railway 로그에서 에러 메시지를 찾아 원인 파악:
- 데이터베이스 연결 실패 → DATABASE_URL 확인
- 포트 충돌 → 서버 재시작
- 메모리 부족 → Railway 플랜 확인

## 예상 응답

정상 작동 시 `/health` 엔드포인트는 다음을 반환해야 합니다:

```json
{
  "status": "ok",
  "message": "Trip Review Server is running",
  "timestamp": "2026-01-21T10:04:39.000Z",
  "uptime": 123.456,
  "port": 8080
}
```

## 다음 단계

1. **Railway 로그 확인** - 정확한 에러 메시지 확인
2. **서버 재시작** - Settings > Restart 클릭
3. **재배포** - Deployments > Redeploy
4. **로그 공유** - 문제가 계속되면 Railway 로그의 최근 50줄 공유
