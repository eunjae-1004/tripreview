# Railway 배포 문제 해결 가이드

## 현재 문제

서버가 정상적으로 시작되지만 Railway가 SIGTERM을 보내서 종료시킵니다.

### 증상
```
✅ 서버가 포트 8080에서 실행 중입니다.
🌐 서버 준비 완료 - 요청 대기 중...
READY
Stopping Container
npm error signal SIGTERM
```

### 확인된 사항
- ✅ Healthcheck Path가 `/health`로 설정되어 있음
- ✅ Healthcheck Timeout이 300초로 설정되어 있음
- ❌ 로그에 Healthcheck 호출 메시지가 없음

## 가능한 원인

1. **Railway가 Healthcheck를 호출하지 않음**
   - Healthcheck Path가 설정되어 있어도 Railway가 호출하지 않을 수 있음
   - Railway의 내부 문제일 수 있음

2. **Healthcheck가 호출되었지만 응답이 늦음**
   - 서버 시작 후 Healthcheck가 즉시 호출되지 않을 수 있음
   - Healthcheck Timeout이 충분하지 않을 수 있음

3. **Railway의 다른 설정 문제**
   - Restart Policy 설정 문제
   - 다른 설정이 서버를 종료시키고 있을 수 있음

## 해결 방법

### 방법 1: Healthcheck 비활성화 테스트 (권장)

Healthcheck가 문제의 원인인지 확인하기 위해 일시적으로 비활성화:

1. **Railway 대시보드 접속**
   - Settings > Deploy > Healthcheck Path
   - Healthcheck Path 삭제 (비우기)

2. **배포 확인**
   - 배포 후 서버가 계속 실행되는지 확인
   - 로그에서 SIGTERM이 발생하지 않는지 확인

3. **결과 분석**
   - Healthcheck를 비활성화해도 종료되면 → 다른 원인
   - Healthcheck를 비활성화하면 정상 작동 → Healthcheck 문제

### 방법 2: Healthcheck Timeout 증가

1. **Railway 대시보드 접속**
   - Settings > Deploy > Healthcheck Timeout
   - 값 증가: 300 → 600 (10분)

2. **배포 확인**
   - 배포 후 서버가 계속 실행되는지 확인

### 방법 3: Railway 설정 확인

1. **Settings > Service 섹션 확인**
   - Restart Policy: "On Failure" 확인
   - Number of times to restart: 10 확인

2. **Settings > Deploy 섹션 확인**
   - Pre-deploy Command: `npm run migrate` 확인
   - Custom Start Command: `npm start` 확인
   - Healthcheck Path: `/health` 확인
   - Healthcheck Timeout: 300 확인

### 방법 4: 로그 상세 확인

1. **Railway 대시보드 > Deployments > 최신 배포 > Logs**
2. 다음 메시지 확인:
   - `[Healthcheck] 요청 수신` - Healthcheck가 호출되었는지 확인
   - `[Railway] READY 신호 전송 완료` - READY 신호 전송 확인
   - `⚠️ SIGTERM 신호 수신` - SIGTERM이 발생했는지 확인

3. **에러 메시지 확인**
   - 에러 메시지가 있는지 확인
   - 에러 메시지의 타임스탬프 확인

### 방법 5: Railway 지원팀 문의

위 방법으로 해결되지 않으면:
1. Railway 지원팀에 문의
2. 다음 정보 제공:
   - 프로젝트 이름: `tripreview_backend`
   - 문제: 서버가 정상 시작되지만 SIGTERM으로 종료됨
   - Healthcheck Path: `/health` 설정됨
   - Healthcheck Timeout: 300초
   - 로그: Healthcheck 호출 메시지 없음

## 추가 디버깅

### Healthcheck 수동 테스트

배포 후 다음 명령어로 Healthcheck를 테스트:

```bash
curl https://tripreviewbackend-production.up.railway.app/health
```

예상 응답:
```json
{
  "status": "ok",
  "message": "Trip Review Server is running",
  "timestamp": "2026-01-21T00:04:20.000Z",
  "uptime": 123.456,
  "port": 8080
}
```

### 서버 상태 확인

1. **Railway 대시보드 > Service 상태 확인**
   - "Active" 상태인지 확인
   - "Stopped" 상태면 문제 있음

2. **배포 상태 확인**
   - Deployments 탭에서 배포 상태 확인
   - "Success" 또는 "Failed" 확인

## 예방 조치

코드 레벨에서 이미 다음 조치를 취했습니다:

1. ✅ Healthcheck를 가장 먼저 등록 (서버 시작 전에도 응답 가능)
2. ✅ Healthcheck가 항상 200 응답 반환
3. ✅ Healthcheck 로깅 추가
4. ✅ READY 신호 즉시 전송
5. ✅ Railway 설정 파일에 Healthcheck 포함

## 다음 단계

1. **Healthcheck 비활성화 테스트** (가장 빠른 확인 방법)
2. **결과에 따라 추가 조치**
   - Healthcheck 문제면 → Railway 지원팀 문의 또는 다른 해결 방법 시도
   - 다른 원인이면 → 로그를 더 자세히 확인
