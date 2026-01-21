# Railway 네트워킹 문제 해결 가이드

## 문제

서버는 정상 실행 중이지만 요청이 서버에 도달하지 않습니다.

## 확인된 사항

✅ 서버가 포트 8080에서 실행 중
✅ Keep-Alive 메시지가 정상 출력됨
❌ API 요청이 로그에 나타나지 않음 (요청이 서버에 도달하지 않음)

## 가능한 원인

### 1. Railway Public Domain 설정 문제

Railway의 Public Domain이 제대로 설정되지 않았을 수 있습니다.

**확인 방법:**
1. Railway 대시보드 > 서비스 선택
2. Settings > Networking 섹션으로 이동
3. Public Networking 섹션 확인:
   - Public Domain이 설정되어 있는지
   - 도메인이 `tripreviewbackend-production.up.railway.app`인지

### 2. 포트 매핑 문제

Railway가 포트를 올바르게 매핑하지 않을 수 있습니다.

**확인 방법:**
1. Railway 대시보드 > Settings > Networking
2. Public Domain 옆에 포트 정보 확인
3. "→ Port 8080"으로 표시되어 있는지 확인

### 3. Railway 프록시 문제

Railway의 프록시/로드밸런서가 요청을 전달하지 않을 수 있습니다.

**해결 방법:**
1. 서버 재시작
2. 재배포

## 해결 방법

### 방법 1: Railway Networking 설정 확인

1. **Railway 대시보드 접속**
   - https://railway.app
   - `tripreview_backend` 프로젝트 선택

2. **Settings > Networking으로 이동**
   - 왼쪽 메뉴에서 "Settings" 클릭
   - "Networking" 섹션 찾기

3. **Public Networking 확인**
   - Public Domain이 설정되어 있는지 확인
   - 도메인이 올바른지 확인
   - 포트 매핑이 "Port 8080"인지 확인

4. **Public Domain이 없으면**
   - "+ Custom Domain" 또는 "+ Generate Domain" 클릭
   - Public Domain 생성

### 방법 2: 서버 재시작

1. Railway 대시보드 > 서비스 선택
2. Settings > Restart 클릭
3. 서버가 재시작될 때까지 대기
4. `/health` 엔드포인트 다시 테스트

### 방법 3: 재배포

1. Railway 대시보드 > Deployments
2. 최신 배포 클릭
3. "Redeploy" 버튼 클릭
4. 배포 완료 대기
5. `/health` 엔드포인트 다시 테스트

### 방법 4: Railway CLI로 직접 테스트

Railway CLI를 사용하여 서버에 직접 요청:

```bash
# Railway CLI 설치 (아직 안 했다면)
npm i -g @railway/cli

# 로그인
railway login

# 프로젝트 연결
railway link

# 서버에 직접 요청 테스트
railway run curl http://localhost:8080/health
```

## 확인 사항

### Railway 대시보드에서 확인

1. **Settings > Networking**
   - Public Domain: `tripreviewbackend-production.up.railway.app`
   - 포트: `8080`

2. **Settings > Deploy**
   - Custom Start Command: `npm start`
   - Healthcheck Path: (비어있어야 함 - 이미 비활성화함)

3. **Service 상태**
   - Active 상태인지 확인

## 다음 단계

1. **Railway Networking 설정 확인** - Public Domain이 올바르게 설정되어 있는지
2. **서버 재시작** - Settings > Restart 클릭
3. **브라우저에서 직접 테스트** - `https://tripreviewbackend-production.up.railway.app/health`
4. **Railway 로그 확인** - 요청이 도달하는지 확인

## 예상 결과

문제 해결 후:
- `/health` 엔드포인트가 정상 응답
- Railway 로그에 `[Healthcheck] 요청 수신` 메시지 표시
- API 요청이 정상 작동
