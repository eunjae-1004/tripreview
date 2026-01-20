# 스크래핑 테스트 가이드

스크래핑 기능을 테스트하는 방법을 안내합니다.

## 테스트 방법

### 1. 로컬 환경에서 테스트

#### 방법 1: 테스트 스크립트 사용

```bash
# 환경 변수 설정
cp .env.example .env
# .env 파일에 DATABASE_URL 등 설정

# 기본 테스트 (네이버맵)
npm run test:scraper

# 특정 URL 테스트
npm run test:scraper https://map.naver.com/v5/entry/place/1234567890 "테스트 호텔"

# API 테스트
npm run test:api https://map.naver.com/v5/entry/place/1234567890 "테스트 호텔"
```

#### 방법 2: API를 통한 테스트

1. 서버 실행:
```bash
npm run dev
```

2. API 호출:
```bash
curl -X POST http://localhost:3000/api/admin/test/scrape \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: your-admin-password" \
  -d '{
    "url": "https://map.naver.com/v5/entry/place/1234567890",
    "companyName": "테스트 호텔"
  }'
```

### 2. 배포 환경에서 테스트

관리자 페이지에서 테스트하거나, API를 직접 호출할 수 있습니다.

#### 관리자 페이지 사용

1. Vercel 배포된 관리자 페이지 접속
2. 브라우저 개발자 도구 열기 (F12)
3. Console 탭에서 다음 코드 실행:

```javascript
fetch('https://your-railway-app.railway.app/api/admin/test/scrape', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-secret': 'your-admin-password'
  },
  body: JSON.stringify({
    url: 'https://map.naver.com/v5/entry/place/1234567890',
    companyName: '테스트 호텔'
  })
})
.then(res => res.json())
.then(data => console.log('결과:', data));
```

#### Postman 또는 curl 사용

```bash
curl -X POST https://your-railway-app.railway.app/api/admin/test/scrape \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: your-admin-password" \
  -d '{
    "url": "https://map.naver.com/v5/entry/place/1234567890",
    "companyName": "테스트 호텔"
  }'
```

## 테스트 결과 확인

### 1. 콘솔 로그 확인

테스트 실행 시 콘솔에 다음 정보가 출력됩니다:
- 브라우저 초기화 상태
- 페이지 접속 상태
- 발견된 리뷰 개수
- 저장된 리뷰 개수
- 오류 메시지 (있는 경우)

### 2. 데이터베이스 확인

```sql
-- 최근 저장된 리뷰 확인
SELECT * FROM reviews ORDER BY created_at DESC LIMIT 10;

-- 특정 기업의 리뷰 확인
SELECT * FROM reviews WHERE company_name = '테스트 호텔' ORDER BY review_date DESC;
```

### 3. 스크린샷 확인

테스트 실행 시 `test-screenshot.png` 파일이 생성됩니다.
이 파일을 통해 페이지가 제대로 로드되었는지 확인할 수 있습니다.

## 네이버맵 URL 찾기

1. 네이버맵 접속: https://map.naver.com
2. 검색창에 원하는 장소 검색
3. 장소 클릭
4. 주소창의 URL 복사
   - 형식: `https://map.naver.com/v5/entry/place/1234567890`
   - 또는: `https://map.naver.com/p/search/장소명`

## 문제 해결

### 리뷰를 찾을 수 없는 경우

1. **선택자 확인**
   - `test-screenshot.png` 파일 확인
   - 브라우저 개발자 도구로 실제 HTML 구조 확인
   - `server/src/services/scraper.js`의 `scrapeNaverMap` 메서드 수정

2. **페이지 로딩 대기**
   - 네이버맵은 동적 로딩을 사용하므로 대기 시간이 필요할 수 있습니다
   - `waitForTimeout` 값을 증가시킬 수 있습니다

3. **로그인 필요**
   - 일부 페이지는 로그인이 필요할 수 있습니다
   - 스크래핑 전에 로그인 처리가 필요할 수 있습니다

### 브라우저 초기화 실패

1. **Playwright 설치 확인**
   ```bash
   npx playwright install chromium
   ```

2. **환경 변수 확인**
   - `PLAYWRIGHT_BROWSERS_PATH` 설정 확인 (Railway 배포 시)

### 데이터베이스 연결 실패

1. **DATABASE_URL 확인**
   - `.env` 파일의 `DATABASE_URL` 확인
   - Railway 배포 시 환경 변수 확인

2. **데이터베이스 마이그레이션 확인**
   ```bash
   npm run migrate
   ```

## 실제 사이트 구조에 맞게 수정하기

각 사이트의 구조가 다르므로, 실제 HTML 구조를 확인하고 선택자를 수정해야 합니다.

### 1. 브라우저 개발자 도구 사용

1. Chrome/Edge에서 테스트할 페이지 열기
2. F12로 개발자 도구 열기
3. Elements 탭에서 리뷰 요소 찾기
4. 선택자 복사 (우클릭 → Copy → Copy selector)

### 2. 스크래퍼 코드 수정

`server/src/services/scraper.js` 파일에서 각 사이트별 메서드를 수정:

```javascript
async scrapeNaverMap(url) {
  // 실제 선택자로 변경
  const reviewElements = document.querySelectorAll('.실제선택자');
  // ...
}
```

### 3. 테스트 및 반복

1. 수정 후 테스트 실행
2. 결과 확인
3. 필요시 다시 수정

## 다음 단계

- [ ] 네이버맵 스크래핑 테스트 및 선택자 수정
- [ ] 카카오맵 스크래핑 구현
- [ ] 야놀자 스크래핑 구현
- [ ] 기타 사이트 스크래핑 구현
- [ ] 에러 처리 개선
- [ ] 로깅 시스템 개선
