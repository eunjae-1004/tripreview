# 구글 리뷰 기간 선택(일주일/2주) 로직

## 흐름 요약

1. **클라이언트** (`client/app/page.tsx`)
   - 리뷰 기간: `전체` | `일주일 간격` | `2주 간격`
   - API 호출 시 `dateFilter`: `'all'` | `'week'` | `'twoWeeks'` 로 전달

2. **jobService** (`server/src/services/jobService.js`)
   - `runScrapingJob(dateFilter, ...)` 인자 그대로 받음
   - 구글 호출: `scraper.scrapeByPortal(null, company_name, dateFilter, jobId, 'google')`
   - 즉, **일주일** → `'week'`, **2주** → `'twoWeeks'` 가 그대로 scrapeGoogle로 전달됨

3. **scraper – scrapeGoogle** (`server/src/services/scraper.js`)

### 3-1. 날짜를 못 구한 리뷰

- **`dateFilter === 'all'`**  
  - 날짜 없으면 **오늘 날짜**로 넣고 수집/저장
- **`dateFilter === 'week'` 또는 `'twoWeeks'`**  
  - 날짜 없으면 해당 리뷰는 **수집/저장 안 함** (`continue`)

### 3-2. 날짜 필터링 + 수집 종료 (최신순 가정)

구글 리뷰는 **최신순**으로 정렬되어 있으므로, **기준일(일주일/2주)보다 이전 날짜의 리뷰를 처음 만나는 순간 수집을 멈추고 종료**한다.  
(이후 리뷰는 모두 더 오래된 것이므로 스크롤을 계속할 필요 없음 → 시간 절약)

- **`dateFilter === 'all'`**  
  - 기간 제한 없음 → 스크롤/종료 조건만으로 계속 수집
- **`dateFilter === 'week'`**  
  - **기준일**: `today - 7`  
  - `reviewDate < (today - 7)` 인 리뷰를 **처음 만나면** 해당 리뷰는 넣지 않고 **수집 즉시 종료**
- **`dateFilter === 'twoWeeks'` 또는 `'2weeks'`**  
  - **기준일**: `today - 14`  
  - `reviewDate < (today - 14)` 인 리뷰를 **처음 만나면** 해당 리뷰는 넣지 않고 **수집 즉시 종료**

필터 적용 위치: 각 리뷰를 처리할 때 `reviewDate`와 기준일 비교 → 기준일 이전이면 `dateFilterStopRequested = true` 후 루프 break, 스크롤 루프도 종료.

## 수정 사항 (버그 픽스)

- 클라이언트는 **2주**일 때 `'twoWeeks'`를 보내는데, 구글 쪽에서는 `'2weeks'`만 비교하고 있어서 **2주 선택 시 날짜 필터가 적용되지 않던 문제** 수정.
- **일주일** 선택 시에도 기준을 14일이 아니라 **7일**로 사용하도록 수정.

이후 동작:

- **일주일 간격**: `reviewDate >= (오늘 - 7일)` 인 리뷰만 수집/저장
- **2주 간격**: `reviewDate >= (오늘 - 14일)` 인 리뷰만 수집/저장

---

## 전체 조회 시 10건에서 멈추는 원인 (진단)

일부 기업(예: 오색그린야드호텔)에서 **전체** 기간 선택 시 리뷰가 **10건에서만 수집되고 끝나는** 경우, 아래를 순서대로 의심할 수 있다.

### 1. 스크롤 컨테이너가 잘못됨 (maxScroll = 0)

- `#reviews` 또는 리뷰 아이템 부모 중 **scrollHeight가 가장 큰 요소**를 골라 그걸로 `scrollTop`을 올린다.
- 일부 페이지는 **실제 리스트가 다른 요소 안에** 있거나, **가상 스크롤**이라 선택한 요소의 `scrollHeight === clientHeight`(스크롤 여유 없음)일 수 있다.
- 그러면 **maxScroll = 0** 이 되어, 스크롤을 해도 위치가 변하지 않고 **scrollStuckCount**만 쌓여 **스크롤 멈춤 → 종료**가 된다.
- **로그**: `[구글 진단] 스크롤 N: ... maxScroll=0 ...` 이면 이 경우다.

### 2. DOM에 10개만 존재 (가상화)

- 구글이 **보이는 구간만** DOM에 두고, 스크롤 시 위아래만 바꾸는 구조면, `#reviews div.Svr5cf.bKhjM` 개수는 항상 ~10개일 수 있다.
- 스크롤이 **실제로는 되는데**(scrollTop 증가) **새 리뷰가 DOM에 안 붙으면** → 매 라운드 같은 10개만 보이고, **addedThisRound = 0** → **noChangeCount**만 쌓여 **신규 없음 → 종료**가 된다.
- **로그**: `스크롤 중단(신규 없음): ... DOM리뷰=10개` 이면 이 경우에 가깝다.

### 3. 적용한 대응

- **진단 로그**: 스크롤 루프에서 `scrollTop`, `maxScroll`, `scrollHeight`, `clientHeight`, `scrolled`, `DOM리뷰 수` 를 남겨, **스크롤이 안 되는지 / DOM이 10개로 고정인지** 구분할 수 있게 했다.
- **maxScroll ≤ 50 일 때**: 컨테이너 스크롤이 사실상 불가이므로 **창/문서 스크롤** (`window.scrollBy`, `documentElement.scrollTop`) 을 추가로 시도해, lazy load가 창 스크롤에 반응하는 페이지는 더 수집되도록 했다.
- **종료 시**: `스크롤 중단(신규 없음)` vs `스크롤 중단(스크롤 멈춤)` 과 **maxScroll 값**을 로그에 남겨, 10건 멈춤이 **스크롤 불가** 때문인지 **신규 0건** 때문인지 구분할 수 있다.
