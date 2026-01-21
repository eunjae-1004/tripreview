# Vercel 환경 변수 설정 가이드

## 문제

"작업 시작 실패: 서버에 연결할 수 없습니다. API URL을 확인하세요: http://localhost:3000"

이 에러는 Vercel에 환경 변수가 설정되지 않아서 발생합니다.

## 해결 방법

### 1. Railway 서버 URL 확인

먼저 Railway 서버 URL을 확인하세요:

1. Railway 대시보드 접속: https://railway.app
2. `tripreview_backend` 프로젝트 선택
3. Settings > Networking 섹션으로 이동
4. Public Domain 확인 (예: `tripreviewbackend-production.up.railway.app`)

### 2. Vercel 환경 변수 설정

1. **Vercel 대시보드 접속**
   - https://vercel.com/dashboard
   - `tripreview` 프로젝트 선택

2. **Settings > Environment Variables로 이동**
   - 왼쪽 메뉴에서 "Settings" 클릭
   - "Environment Variables" 섹션 찾기

3. **환경 변수 추가**

   #### `NEXT_PUBLIC_API_URL`
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: Railway 서버 URL (예: `https://tripreviewbackend-production.up.railway.app`)
   - **Environment**: Production, Preview, Development 모두 선택
   - "Add" 클릭

   #### `NEXT_PUBLIC_ADMIN_SECRET`
   - **Name**: `NEXT_PUBLIC_ADMIN_SECRET`
   - **Value**: Railway의 `ADMIN_PASSWORD`와 동일한 값
   - **Environment**: Production, Preview, Development 모두 선택
   - "Add" 클릭

4. **Railway의 ADMIN_PASSWORD 확인**
   - Railway 대시보드 > `tripreview_backend` 프로젝트
   - Settings > Variables
   - `ADMIN_PASSWORD` 값 확인
   - 이 값과 Vercel의 `NEXT_PUBLIC_ADMIN_SECRET`이 동일해야 합니다

### 3. 배포 재실행

환경 변수를 추가한 후:

1. **자동 재배포**
   - Vercel이 자동으로 재배포를 시작할 수 있습니다
   - Deployments 탭에서 배포 상태 확인

2. **수동 재배포 (필요시)**
   - Deployments 탭에서 최신 배포 클릭
   - "Redeploy" 버튼 클릭

### 4. 확인

배포 완료 후:

1. **웹 페이지 접속**
   - Vercel에서 생성된 URL로 접속

2. **브라우저 콘솔 확인**
   - F12를 눌러 개발자 도구 열기
   - Console 탭에서 경고 메시지가 없는지 확인
   - `⚠️ NEXT_PUBLIC_API_URL이 설정되지 않았습니다` 메시지가 없어야 합니다

3. **작업 시작 테스트**
   - "작업 시작" 버튼 클릭
   - 성공 메시지가 표시되는지 확인

## 환경 변수 요약

| Vercel 환경 변수 | 값 예시 | 설명 |
|----------------|---------|------|
| `NEXT_PUBLIC_API_URL` | `https://tripreviewbackend-production.up.railway.app` | Railway 서버 URL |
| `NEXT_PUBLIC_ADMIN_SECRET` | Railway의 `ADMIN_PASSWORD`와 동일 | API 인증 비밀번호 |

## 문제 해결

### 여전히 "localhost:3000"을 사용하는 경우

1. **환경 변수가 제대로 설정되었는지 확인**
   - Vercel 대시보드 > Settings > Environment Variables
   - 변수가 Production 환경에 설정되어 있는지 확인

2. **재배포 확인**
   - 환경 변수를 추가한 후 재배포가 필요합니다
   - Deployments 탭에서 최신 배포 확인

3. **브라우저 캐시 클리어**
   - 브라우저 캐시를 클리어하고 페이지 새로고침

### "인증 실패" 에러가 발생하는 경우

- Vercel의 `NEXT_PUBLIC_ADMIN_SECRET`과 Railway의 `ADMIN_PASSWORD`가 일치하는지 확인
- 두 값이 정확히 동일해야 합니다 (공백, 대소문자 등 주의)

### CORS 에러가 발생하는 경우

- 서버의 CORS 설정은 이미 모든 도메인을 허용하도록 설정되어 있습니다
- Railway 로그에서 CORS 관련 에러가 있는지 확인

## 참고

- Vercel 환경 변수는 빌드 시점에 주입됩니다
- `NEXT_PUBLIC_` 접두사가 있는 변수만 클라이언트에서 접근 가능합니다
- 환경 변수를 변경한 후에는 재배포가 필요합니다
