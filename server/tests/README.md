# Playwright 통합 테스트

이 디렉토리에는 Playwright를 사용한 통합 테스트가 포함되어 있습니다.

## 테스트 실행

### 모든 테스트 실행
```bash
npm test
```

### UI 모드로 실행 (시각적 디버깅)
```bash
npm run test:ui
```

### 헤드 모드로 실행 (브라우저 표시)
```bash
npm run test:headed
```

### 디버그 모드로 실행
```bash
npm run test:debug
```

### 테스트 리포트 보기
```bash
npm run test:report
```

## 테스트 종류

### 1. 스크래퍼 테스트 (`scraper.spec.js`)
- 브라우저 초기화 및 종료
- 네이버맵 페이지 접속
- 스크래핑 기능 테스트
- 텍스트 분석 기능 테스트
- 포털 URL 감지 테스트

### 2. API 테스트 (`api.spec.js`)
- Health check 엔드포인트
- 관리자 API 인증
- 작업 상태 조회
- 스크래핑 테스트 API

**참고:** API 테스트는 서버가 실행 중이어야 합니다. 서버가 실행되지 않은 경우 테스트가 스킵됩니다.

## 서버 실행 후 API 테스트

```bash
# 터미널 1: 서버 실행
npm run dev

# 터미널 2: 테스트 실행
npm test
```

## 테스트 결과

테스트 실행 후 다음 디렉토리에 결과가 저장됩니다:
- `test-results/` - 테스트 실행 결과 및 스크린샷
- `playwright-report/` - HTML 리포트

## 환경 변수

테스트 실행 시 다음 환경 변수를 설정할 수 있습니다:

```bash
# API URL 설정
API_URL=http://localhost:3000 npm test

# 관리자 비밀번호 설정
ADMIN_PASSWORD=your-password npm test
```

## CI/CD 통합

CI 환경에서는 자동으로 다음 설정이 적용됩니다:
- `retries: 2` - 실패 시 2회 재시도
- `workers: 1` - 단일 워커로 실행
- `forbidOnly: true` - `.only()` 사용 금지
