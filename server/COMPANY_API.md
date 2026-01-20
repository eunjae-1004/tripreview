# 기업 관리 API 가이드

기업 정보에 네이버맵 URL을 포함한 포털 URL을 추가하고 관리할 수 있는 API입니다.

## 데이터베이스 마이그레이션

기존 데이터베이스에 포털 URL 컬럼을 추가하려면:

```bash
npm run migrate:urls
```

## API 엔드포인트

### 1. 기업 목록 조회

```http
GET /api/admin/companies
Headers:
  x-admin-secret: your-admin-password
```

**응답 예시:**
```json
[
  {
    "id": 1,
    "company_name": "동해보양온천컨벤션호텔",
    "type": "숙박시설",
    "is_member": "Y",
    "address": "강원 동해시 동해대로",
    "email": "contact@hotel.com",
    "phone": "033-123-4567",
    "manager": "홍길동",
    "naver_url": "https://map.naver.com/p/entry/place/11658902",
    "kakao_url": null,
    "yanolja_url": null,
    "goodchoice_url": null,
    "google_url": null,
    "tripadvisor_url": null,
    "agoda_url": null,
    "created_at": "2026-01-18T00:00:00.000Z",
    "updated_at": "2026-01-18T00:00:00.000Z"
  }
]
```

### 2. 기업 정보 추가

```http
POST /api/admin/companies
Headers:
  Content-Type: application/json
  x-admin-secret: your-admin-password

Body:
{
  "companyName": "동해보양온천컨벤션호텔",
  "type": "숙박시설",
  "isMember": "Y",
  "address": "강원 동해시 동해대로",
  "email": "contact@hotel.com",
  "phone": "033-123-4567",
  "manager": "홍길동",
  "naverUrl": "https://map.naver.com/p/entry/place/11658902",
  "kakaoUrl": "https://map.kakao.com/...",
  "yanoljaUrl": "https://www.yanolja.com/...",
  "goodchoiceUrl": "https://www.goodchoice.kr/...",
  "googleUrl": "https://www.google.com/...",
  "tripadvisorUrl": "https://www.tripadvisor.co.kr/...",
  "agodaUrl": "https://www.agoda.com/..."
}
```

**필수 필드:**
- `companyName`: 기업명
- `type`: 유형 (숙박시설, 음식점 등)

**선택 필드:**
- `isMember`: 회원사 여부 (Y/N, 기본값: N)
- `address`: 주소
- `email`: 이메일
- `phone`: 전화번호
- `manager`: 담당자
- `naverUrl`: 네이버맵 URL
- `kakaoUrl`: 카카오맵 URL
- `yanoljaUrl`: 야놀자 URL
- `goodchoiceUrl`: 굿초이스 URL
- `googleUrl`: 구글 URL
- `tripadvisorUrl`: 트립어드바이저 URL
- `agodaUrl`: 아고다 URL

### 3. 기업 정보 수정

```http
PUT /api/admin/companies/:id
Headers:
  Content-Type: application/json
  x-admin-secret: your-admin-password

Body:
{
  "naverUrl": "https://map.naver.com/p/entry/place/11658902",
  "kakaoUrl": "https://map.kakao.com/..."
}
```

**응답 예시:**
```json
{
  "message": "기업 정보가 수정되었습니다.",
  "company": {
    "id": 1,
    "company_name": "동해보양온천컨벤션호텔",
    "naver_url": "https://map.naver.com/p/entry/place/11658902",
    ...
  }
}
```

## 사용 예시

### cURL 예시

```bash
# 기업 추가
curl -X POST http://localhost:3000/api/admin/companies \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: your-admin-password" \
  -d '{
    "companyName": "동해보양온천컨벤션호텔",
    "type": "숙박시설",
    "naverUrl": "https://map.naver.com/p/entry/place/11658902"
  }'

# 기업 목록 조회
curl -X GET http://localhost:3000/api/admin/companies \
  -H "x-admin-secret: your-admin-password"

# 기업 정보 수정
curl -X PUT http://localhost:3000/api/admin/companies/1 \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: your-admin-password" \
  -d '{
    "naverUrl": "https://map.naver.com/p/entry/place/11658902"
  }'
```

## 스크래핑 동작

기업 정보에 `naver_url`이 설정되어 있으면, 스크래핑 작업 실행 시 자동으로 해당 URL을 사용하여 리뷰를 수집합니다.

```bash
# 스크래핑 작업 시작
curl -X POST http://localhost:3000/api/admin/jobs/start \
  -H "x-admin-secret: your-admin-password"
```

스크래핑 작업은:
1. `companies` 테이블에서 `naver_url`이 있는 기업들을 조회
2. 각 기업의 네이버맵 URL로 스크래핑 실행
3. 수집한 리뷰를 `reviews` 테이블에 저장

## 네이버맵 URL 형식

네이버맵 URL은 다음과 같은 형식을 사용합니다:

```
https://map.naver.com/p/entry/place/{장소ID}
```

예시:
```
https://map.naver.com/p/entry/place/11658902
```

**참고:** 쿼리 파라미터(`?c=15.00,0,0,0,dh&placePath=/review&...`)는 자동으로 제거되어 정규화됩니다.
