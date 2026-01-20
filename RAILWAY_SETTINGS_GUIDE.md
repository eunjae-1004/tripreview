# Railway 설정 가이드

## 현재 문제점

1. **Healthcheck Path 미설정**: Railway가 서버가 준비되었는지 확인할 수 없음
2. **Build Command 복잡**: Playwright 설치가 빌드 실패 원인일 수 있음
3. **Pre-deploy Command**: migrate가 실패하면 배포가 중단됨

## Railway 대시보드에서 설정해야 할 항목

### 1. Settings > Deploy 섹션

#### Healthcheck Path 추가
- **설정 위치**: Settings > Deploy > Healthcheck Path
- **액션**: "+ Healthcheck Path" 버튼 클릭
- **값 입력**: `/health`
- **설명**: Railway가 배포 완료 전에 이 엔드포인트를 호출하여 서버가 준비되었는지 확인합니다.

#### Pre-deploy Command (선택사항)
- **현재 값**: `npm run migrate`
- **권장**: 그대로 유지하되, migrate가 실패해도 계속 진행되도록 migrate.js 수정됨

#### Custom Start Command
- **현재 값**: `npm start`
- **확인**: `server/railway.json`의 `startCommand`와 일치하는지 확인

### 2. Settings > Service 섹션

#### Restart Policy
- **현재 값**: "On Failure"
- **설명**: 서비스가 실패로 종료되면 자동으로 재시작합니다.

#### Number of times to restart
- **현재 값**: 10
- **설명**: 최대 10번까지 재시작을 시도합니다.

### 3. Settings > Builder 섹션

#### Custom Build Command
- **권장 값**: `npm install` (Playwright 설치 제거)
- **이유**: Playwright는 런타임에 필요하지 않을 수 있으며, 빌드 시간을 늘리고 실패 가능성을 높입니다.

### 4. Settings > Source 섹션

#### Root Directory
- **현재 값**: `/server`
- **확인**: 올바르게 설정되어 있습니다.

#### Branch connected to production
- **현재 값**: `main`
- **확인**: 올바르게 설정되어 있습니다.

## 수정된 파일

### `server/railway.json`
- Build Command에서 Playwright 설치 제거
- Healthcheck Path 추가 (`/health`)
- Healthcheck Timeout 설정 (100초)

## Railway 대시보드에서 직접 설정해야 할 항목

### 필수 설정
1. **Healthcheck Path**: `/health` 추가
   - Settings > Deploy > Healthcheck Path
   - "+ Healthcheck Path" 클릭 후 `/health` 입력

### 선택적 설정 (권장)
2. **Custom Build Command 수정** (이미 railway.json에 반영됨)
   - Settings > Builder > Custom Build Command
   - 값: `npm install` (Playwright 설치 제거)

## 확인 사항

배포 후 다음을 확인하세요:

1. **로그 확인**
   - Railway 대시보드 > Deployments > 최신 배포 > Logs
   - "서버가 포트 3000에서 실행 중입니다" 메시지 확인
   - 에러 메시지가 없는지 확인

2. **Healthcheck 확인**
   - 배포 완료 후 `https://tripreviewbackend-production.up.railway.app/health` 접속
   - `{"status":"ok",...}` 응답 확인

3. **서비스 상태**
   - Railway 대시보드 > Service 상태가 "Active"인지 확인

## 문제 해결

### 배포가 계속 실패하는 경우

1. **로그 확인**
   ```bash
   # Railway 대시보드에서 최신 배포의 로그 확인
   ```

2. **Healthcheck 비활성화 테스트**
   - Settings > Deploy > Healthcheck Path 삭제
   - 배포 후 수동으로 `/health` 엔드포인트 확인

3. **Pre-deploy Command 비활성화 테스트**
   - Settings > Deploy > Pre-deploy Command 비우기
   - 배포 후 수동으로 migrate 실행

4. **환경 변수 확인**
   - Settings > Variables
   - `DATABASE_URL`, `NODE_ENV`, `PORT` 등 확인
