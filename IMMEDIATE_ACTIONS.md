# 즉시 확인해야 할 사항

## 문제

`/health` 엔드포인트가 정상 응답하지 않습니다.

## 즉시 확인할 사항

### 1. Railway 대시보드에서 서버 상태 확인

1. **Railway 대시보드 접속**
   - https://railway.app
   - 로그인

2. **프로젝트 선택**
   - `tripreview_backend` 프로젝트 클릭

3. **서비스 상태 확인**
   - 서비스가 "Active" 상태인지 확인
   - "Stopped" 또는 "Failed" 상태면 "Start" 버튼 클릭

4. **Logs 탭 확인**
   - 왼쪽 메뉴에서 "Logs" 클릭
   - 최근 로그 확인

### 2. 확인할 로그 메시지

**정상 작동 시 보이는 메시지:**
```
✅ 서버가 포트 8080에서 실행 중입니다.
🌐 서버 준비 완료 - 요청 대기 중...
[Keep-Alive] 서버 실행 중 - uptime: X초
```

**문제가 있는 경우 보이는 메시지:**
```
❌ 처리되지 않은 예외: ...
PostgreSQL 연결 오류: ...
포트가 이미 사용 중입니다.
```

### 3. 서버 재시작

1. Railway 대시보드 > 서비스 선택
2. **Settings > Restart** 클릭
3. 서버가 재시작될 때까지 대기 (약 1-2분)
4. 로그에서 "서버가 포트 8080에서 실행 중입니다" 메시지 확인

### 4. 루트 경로 테스트

브라우저에서 다음도 테스트해보세요:

```
https://tripreviewbackend-production.up.railway.app/
```

예상 응답:
```json
{
  "status": "ok",
  "message": "Trip Review Server is running",
  "timestamp": "..."
}
```

## 다음 단계

1. **Railway 로그 확인** - 정확한 에러 메시지 확인
2. **서버 재시작** - Settings > Restart 클릭
3. **로그 공유** - 문제가 계속되면 Railway 로그의 최근 50줄을 공유해주세요
