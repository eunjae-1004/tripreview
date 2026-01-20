# 테스트 파일 가이드

## 포털별 스크래핑 테스트

각 포털별로 개별 테스트를 실행할 수 있습니다:

- `test-naver-only.js` - 네이버맵 스크래핑 테스트 (companies 테이블의 모든 기업)
- `test-kakao-only.js` - 카카오맵 스크래핑 테스트
- `test-google-only.js` - 구글 스크래핑 테스트
- `test-yanolja-only.js` - 야놀자 스크래핑 테스트

### 사용법

```bash
# 네이버맵 테스트
node src/test/test-naver-only.js

# 카카오맵 테스트
node src/test/test-kakao-only.js

# 구글 테스트
node src/test/test-google-only.js

# 야놀자 테스트
node src/test/test-yanolja-only.js
```

## 유틸리티 스크립트

- `check-companies-status.js` - companies 테이블의 기업 현황 및 포털별 리뷰 수 확인
- `check-naver-reviews.js` - 네이버맵 리뷰 확인
- `check-yanolja-reviews.js` - 야놀자 리뷰 확인
- `add-companies.js` - 테스트용 기업 정보 추가

### 사용법

```bash
# 기업 현황 확인
node src/test/check-companies-status.js

# 네이버맵 리뷰 확인
node src/test/check-naver-reviews.js

# 야놀자 리뷰 확인
node src/test/check-yanolja-reviews.js

# 기업 추가
node src/test/add-companies.js
```

## 실제 운영 환경

실제 운영 환경에서는 `jobService.js`의 `runScrapingJob()` 메서드를 사용하여 모든 포털의 스크래핑을 일괄 실행합니다.
