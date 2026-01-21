# Railway 포트 설정 문제 해결

## 문제

Railway Networking 설정에서 포트가 **3000**으로 설정되어 있지만, 서버는 **8080**에서 실행 중입니다.

## 원인

- Railway의 Public Domain이 포트 3000으로 매핑됨
- 서버는 포트 8080에서 실행 중 (Railway가 자동으로 설정)
- 포트 불일치로 인해 요청이 서버에 도달하지 않음

## 해결 방법

### 방법 1: Railway Networking에서 포트 변경 (권장)

1. **Railway 대시보드 접속**
   - https://railway.app
   - `tripreview_backend` 프로젝트 선택

2. **Settings > Networking으로 이동**
   - 왼쪽 메뉴에서 "Settings" 클릭
   - "Networking" 섹션 찾기

3. **Public Domain 편집**
   - Public Networking 섹션에서
   - `tripreviewbackend-production.up.railway.app` 옆의 **연필 아이콘(Edit)** 클릭
   - 포트를 **3000**에서 **8080**으로 변경
   - 저장

4. **서버 재시작**
   - Settings > Restart 클릭
   - 또는 자동으로 재시작될 수 있음

### 방법 2: 서버가 포트 3000에서 실행되도록 변경 (대안)

만약 Railway Networking 설정을 변경할 수 없다면, 서버가 포트 3000에서 실행되도록 변경할 수 있습니다. 하지만 Railway는 보통 PORT 환경 변수를 자동으로 설정하므로, 방법 1을 권장합니다.

## 확인 사항

변경 후 Railway Networking 설정에서:
- Public Domain: `tripreviewbackend-production.up.railway.app`
- 포트: **8080** (3000이 아님)

## 예상 결과

포트를 8080으로 변경한 후:
- `/health` 엔드포인트가 정상 응답
- API 요청이 정상 작동
- Railway 로그에 `[API] POST /api/admin/jobs/start` 메시지 표시
