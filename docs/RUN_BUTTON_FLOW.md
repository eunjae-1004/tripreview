# "지금 실행" 버튼 클릭 시 진행 단계

## 1. 클라이언트 (client/app/page.tsx)

1. **handleStart()** 호출
   - 포털 선택 검증 (최소 1개)
   - `setLoading(true)`, 메시지 초기화
   - **POST** `{API_URL}/api/admin/jobs/start`
     - Body: `{ dateFilter, companyName, portals }`
     - Header: `x-admin-secret`
   - 응답이 성공(200)이면 "시작 요청 완료" 메시지 표시
   - 약 1초 후 `fetchStatus()`, `fetchRecentJobs()` 호출해 상태 갱신
   - 실패 시 에러 메시지 표시 (네트워크/서버 오류 등)

2. **상태 폴링**
   - 초기 로드 및 **5초마다** `fetchStatus()` → `GET /api/admin/jobs/status`
   - `isRunning`, `currentJob`, `progress` 로 UI 갱신 (실행 중/대기 중, 진행 한 줄 등)

---

## 2. 서버 API (server/src/routes/admin.js)

1. **POST /api/admin/jobs/start**
   - `authenticateAdmin`: `x-admin-secret` 검증
   - `jobService.getIsRunning()` → 이미 실행 중이면 400
   - Body 검증: `dateFilter`, `companyName`, `portals`
   - **비동기 실행**: `jobService.runScrapingJob(dateFilter, companyName, portals).catch(...)`
   - **즉시 200 응답** (실제 스크래핑은 백그라운드)

---

## 3. 작업 서비스 (server/src/services/jobService.js) — runScrapingJob()

실제 진행 순서:

| 순서 | 단계 | 설명 |
|------|------|------|
| 1 | 중복 체크 | `isRunning`이면 "이미 실행 중인 작업이 있습니다." throw |
| 2 | 플래그 설정 | `isRunning = true`, `cancelRequested = false` |
| 3 | DB 검사 | `requirePool()` — DB 없으면 throw (이때 **finally 미실행** 가능 → 상태 꼬임) |
| 4 | 작업 생성 | `createJob()` — INSERT 후 `job` 반환, `this.currentJob = job` |
| 5 | 스크래퍼 생성 | `new ScraperService()`, `this.scraper = scraper` |
| 6 | try 블록 진입 | |
| 7 | 상태 업데이트 | `updateJobStatus(job.id, 'running', { startedAt })` |
| 8 | 브라우저 초기화 | `scraper.init()` (Playwright) |
| 9 | 기업 목록 조회 | `companies` 테이블 (전체 또는 특정 기업) |
| 10 | 기업×포털 루프 | 각 기업별로 선택된 포털(naver, kakao, yanolja, agoda, google) 스크래핑 |
| 11 | 완료/실패/중지 | `updateJobStatus(job.id, 'completed'|'failed'|'stopped')`, `scraper.close()` |
| 12 | finally | `isRunning = false`, `currentJob = null`, `scraper = null` 등 정리 |

**문제 가능 지점**

- **3번에서 throw** (예: DB 연결 없음): `job` 미생성, `currentJob`은 계속 `null`, `finally`가 실행되지 않아 **`isRunning`만 true**로 남음.
- 그 상태에서 사용자가 **작업중지**를 누르면 서버는 `stopJob()`에서 `this.currentJob`이 `null`인데 `this.currentJob.id`를 참조하려다 **"Cannot read properties of null (reading 'id')"** 발생할 수 있음 (과거 코드 또는 guard 미처리 경로).

---

## 4. "작업중지" 버튼 클릭 시

1. **클라이언트**: **POST** `/api/admin/jobs/stop` → 응답에 따라 "스크래핑 작업이 중지되었습니다." 또는 `data.error` 표시
2. **서버 stopJob()**
   - `!this.isRunning || !this.currentJob` 이면 **"실행 중인 작업이 없습니다."** throw
   - 그 외: `this.currentJob.id`로 에러 메시지 추가 및 상태를 `stopped`로 업데이트
   - **오류 원인**: `isRunning`은 true인데 `currentJob`이 null인 경우(위 3번 실패 시) guard가 있어도, 또는 guard 전에 다른 코드에서 `currentJob.id`를 참조하면 null 참조 에러 발생

---

## 5. 요약

- **지금 실행**: 클릭 → POST /jobs/start → 백그라운드에서 runScrapingJob (DB 작업 생성 → 브라우저 초기화 → 기업/포털 스크래핑) → 5초마다 status로 진행 상황 표시.
- **아무것도 실행되지 않을 때**: DB 오류 등으로 3~4번 단계 전에 실패하면 `currentJob`이 null인 채 `isRunning`만 true로 남을 수 있음.
- **작업중지 시 "Cannot read properties of null (reading 'id')"**: 서버에서 `currentJob`이 null인데 `currentJob.id`를 참조하는 경로가 있기 때문. `runScrapingJob` 초기 실패 시에도 항상 정리되도록 하고, `stopJob`에서 null을 안전하게 처리해야 함.
