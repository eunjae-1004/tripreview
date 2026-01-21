# Railway Healthcheck 문제 해결 가이드

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

## 원인

Railway가 Healthcheck를 호출하지 않거나, Healthcheck Path가 설정되지 않아서 Railway가 서버를 종료시키고 있습니다.

## 해결 방법

### 방법 1: Railway 대시보드에서 Healthcheck Path 설정 (필수)

1. **Railway 대시보드 접속**
   - https://railway.app 접속
   - `tripreview_backend` 프로젝트 선택

2. **Settings > Deploy 섹션으로 이동**
   - 왼쪽 메뉴에서 "Settings" 클릭
   - "Deploy" 섹션 찾기

3. **Healthcheck Path 추가**
   - "Healthcheck Path" 섹션 찾기
   - "+ Healthcheck Path" 버튼 클릭
   - 값 입력: `/health`
   - 저장

4. **Healthcheck Timeout 확인 (선택사항)**
   - 기본값: 30초
   - 필요시 더 길게 설정 (최대 300초)

### 방법 2: Healthcheck 비활성화 (임시 해결책)

만약 Healthcheck Path를 설정해도 문제가 계속되면:

1. **Settings > Deploy > Healthcheck Path 삭제**
   - Healthcheck Path를 삭제하면 Railway가 Healthcheck를 수행하지 않습니다
   - 서버는 계속 실행되지만, 배포 완료 확인이 없습니다

2. **수동으로 서버 상태 확인**
   - 배포 후 `https://tripreviewbackend-production.up.railway.app/health` 접속
   - `{"status":"ok",...}` 응답 확인

### 방법 3: Railway 설정 확인

1. **Settings > Service 섹션**
   - "Restart Policy": "On Failure" 확인
   - "Number of times to restart": 10 확인

2. **Settings > Deploy 섹션**
   - "Pre-deploy Command": `npm run migrate` 확인
   - "Custom Start Command": `npm start` 확인
   - "Healthcheck Path": `/health` 확인 (설정되어 있는지)

## 로그 확인

배포 후 로그에서 다음을 확인하세요:

1. **Healthcheck 호출 확인**
   ```
   [Healthcheck] 요청 수신 - serverReady: true, uptime: X.XXX
   [Healthcheck] 응답: {"status":"ok",...}
   ```

2. **서버 시작 확인**
   ```
   ✅ 서버가 포트 8080에서 실행 중입니다.
   🌐 서버 준비 완료 - 요청 대기 중...
   ```

3. **SIGTERM 신호 확인**
   - SIGTERM이 발생하면 "⚠️ SIGTERM 신호 수신" 메시지가 출력됩니다
   - 이 메시지가 없이 종료되면 Railway가 강제 종료한 것입니다

## 추가 디버깅

### Healthcheck 엔드포인트 수동 테스트

배포 후 다음 명령어로 Healthcheck를 테스트할 수 있습니다:

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

### Railway 로그 확인

1. Railway 대시보드 > Deployments
2. 최신 배포 클릭
3. "Logs" 탭 확인
4. Healthcheck 관련 메시지 확인

## 예방 조치

코드 레벨에서 이미 다음 조치를 취했습니다:

1. ✅ Healthcheck가 항상 200 응답 반환
2. ✅ Healthcheck 로깅 추가
3. ✅ 서버 시작 시 즉시 Healthcheck 준비 완료
4. ✅ Railway 설정 파일에 Healthcheck Path 포함

하지만 **Railway 대시보드에서도 Healthcheck Path를 설정해야 합니다**.

## 참고

- Railway 문서: https://docs.railway.app/deploy/healthchecks
- `server/railway.json` 파일에 Healthcheck 설정이 있어도, Railway 대시보드에서도 설정해야 할 수 있습니다.
