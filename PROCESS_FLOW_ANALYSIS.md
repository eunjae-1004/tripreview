# 전체 프로세스 흐름 분석

## 1. 프론트엔드 → 백엔드 API 호출

**파일**: `client/app/page.tsx`

```
사용자 클릭 "지금 실행"
  ↓
handleStart() 실행
  ↓
POST /api/admin/jobs/start
  - Body: { dateFilter, companyName, portals }
  - Header: x-admin-secret
```

## 2. 백엔드 API 라우트

**파일**: `server/src/routes/admin.js`

```
POST /api/admin/jobs/start
  ↓
인증 확인 (authenticateAdmin)
  ↓
jobService.runScrapingJob(dateFilter, companyName, portals) 호출 (비동기)
  ↓
즉시 응답 반환 (작업은 백그라운드에서 실행)
```

## 3. 작업 서비스 (JobService)

**파일**: `server/src/services/jobService.js`

```
runScrapingJob()
  ↓
1. DB에서 job 생성 (scraping_jobs 테이블)
2. 브라우저 초기화 (scraper.init())
3. companies 테이블에서 기업 목록 조회
   - companyName이 있으면: 특정 기업만 조회
   - companyName이 없으면: 전체 기업 조회
  ↓
각 기업별로 포털별 스크래핑 실행:
  for (company of companies) {
    if (portals.includes('naver')) {
      scraper.scrapeByPortal(naver_url, company_name, dateFilter, jobId, 'naver')
    }
    if (portals.includes('kakao')) {
      scraper.scrapeByPortal(null, company_name, dateFilter, jobId, 'kakao')
    }
    ...
  }
  ↓
작업 완료 후 상태 업데이트
```

## 4. 스크래퍼 서비스 (ScraperService)

**파일**: `server/src/services/scraper.js`

### 4.1 scrapeByPortal() 메서드

```
scrapeByPortal(portalUrl, companyName, dateFilter, jobId, portalType)
  ↓
portalType에 따라 적절한 스크래퍼 호출:
  - 'naver' → scrapeNaverMap(companyName, dateFilter, jobId, 'naver', true)
    (saveImmediately=true: 즉시 저장 방식)
  - 'kakao' → scrapeKakaoMap(companyName, dateFilter)
  - 'yanolja' → scrapeYanolja(companyName, dateFilter)
  - 'google' → scrapeGoogle(companyName, dateFilter)
  - 'agoda' → scrapeAgoda(companyName, dateFilter, agodaUrl)
  ↓
스크래퍼가 reviews 배열 반환
  ↓
[네이버맵인 경우]
  - "이미 즉시 저장되었으므로 통계만 업데이트"
  - reviews.length를 savedCount로 반환
  - return savedCount

[다른 포털인 경우]
  - reviews 배열을 순회하며 하나씩 저장
  - saveReview() 호출
  - 저장 성공 개수 카운트
  - return savedCount
```

### 4.2 scrapeNaverMap() 메서드 (즉시 저장 방식)

```
scrapeNaverMap(companyName, dateFilter, jobId, portalType, saveImmediately=true)
  ↓
네이버맵 검색 페이지로 이동
  ↓
리뷰 목록 추출 (더보기 버튼 클릭)
  ↓
각 리뷰 추출 루프:
  for (i = 0; i < maxReviews; i++) {
    리뷰 데이터 추출 (nickname, content, rating, date, keywords 등)
    ↓
    [즉시 저장 방식이 활성화된 경우]
      if (saveImmediately && companyName && date) {
        날짜 필터링 확인
        ↓
        if (shouldSave) {
          saveReview() 호출 (즉시 DB 저장)
          ↓
          if (saved) {
            reviews.push(reviewData) // 통계용
            로그: "✅ [네이버맵 즉시 저장 성공]"
          } else {
            reviews.push(reviewData) // 통계용 (중복/실패)
            로그: "⚠️ [네이버맵 즉시 저장 실패/중복]"
          }
        } else {
          reviews.push(reviewData) // 통계용 (날짜 필터링)
        }
      } else {
        reviews.push(reviewData) // 기존 방식: 배열에만 추가
      }
  }
  ↓
reviews 배열 반환
```

### 4.3 saveReview() 메서드

```
saveReview({ portalUrl, companyName, reviewDate, content, rating, ... })
  ↓
DB 연결 확인 (pool)
  ↓
INSERT INTO reviews (...) VALUES (...)
  ON CONFLICT (company_name, review_date, nickname, portal_url) DO NOTHING
  ↓
if (rowCount === 1) {
  return true  // 새로 저장됨
} else {
  return false // 중복이거나 저장 실패
}
```

## 5. 데이터베이스 저장

**테이블**: `reviews`

```
INSERT INTO reviews (
  portal_url, company_name, review_date, content, rating, nickname,
  visit_keyword, review_keyword, visit_type, emotion, revisit_flag,
  n_rating, n_emotion, n_char_count, title, additional_info
) VALUES (...)
ON CONFLICT (company_name, review_date, nickname, portal_url) DO NOTHING
```

---

## 🔴 발견된 문제점

### 문제 1: 네이버맵 즉시 저장 개수 추적 누락

**위치**: `scraper.js` - `scrapeNaverMap()` 메서드

**문제**:
- 즉시 저장할 때 실제 저장 성공 개수를 추적하지 않음
- `reviews` 배열에만 추가하고 있음
- `scrapeByPortal()`에서 `reviews.length`를 `savedCount`로 반환하는데, 실제 저장 개수가 아님

**영향**:
- 실제로 저장된 개수와 반환된 개수가 다를 수 있음
- 통계가 부정확함

**해결 방법**:
- `scrapeNaverMap()`에서 실제 저장 성공 개수를 카운트하고 반환
- `scrapeByPortal()`에서 네이버맵인 경우 실제 저장 개수를 사용

### 문제 2: 네이버맵 저장 개수 반환 로직 오류

**위치**: `scraper.js` - `scrapeByPortal()` 메서드 (5373-5383줄)

**문제**:
```javascript
if (portalType === 'naver' || (portalUrl && portalUrl.includes('naver.com'))) {
  console.log(`[저장] 네이버맵은 즉시 저장 방식으로 이미 저장되었습니다. 통계만 업데이트합니다.`);
  let savedCount = 0;
  for (const review of reviews) {
    savedCount++;  // ❌ 실제 저장 개수가 아니라 추출 개수
  }
  return savedCount;
}
```

**해결 방법**:
- `scrapeNaverMap()`에서 실제 저장 성공 개수를 반환하도록 수정
- `scrapeByPortal()`에서 그 값을 사용

---

## 수정 계획

1. `scrapeNaverMap()`에서 실제 저장 성공 개수를 카운트하고 반환
2. `scrapeByPortal()`에서 네이버맵인 경우 실제 저장 개수를 사용
3. 저장 실패/중복 로그 개선
