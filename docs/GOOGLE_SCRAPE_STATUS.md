# 구글 리뷰 스크래핑 현재 상황 (미해결)

**작성일**: 2025-02-24  
**상태**: 문제 해결되지 않음. 내일 재진행 예정.

---

## 1. 겪고 있는 문제 요약

- **리뷰 기간 선택** 기능을 넣은 뒤부터 구글 리뷰 수집이 **이전처럼 정상 동작하지 않음**.
- 증상 예:
  - **전체** 선택 시: 날짜 조건 없이 끝까지 수집해야 하는데, 금방 끝나고 다음 기업으로 넘어감.
  - 화면이 **엄청 빨리** 스크롤되다가 **바로 종료**되는 느낌.
  - 리뷰가 **10건·20건 등 소량만** 수집되고 다음 기업으로 넘어가는 경우.

---

## 2. 현재 코드 상태 (scraper.js – 구글 부분)

### 2-1. 진입/기본값

- **파일**: `server/src/services/scraper.js`
- **함수**: `scrapeGoogle(companyName, dateFilter = 'week', ...)`
- **effectiveDateFilter**: `(dateFilter == null || dateFilter === '') ? 'all' : dateFilter`
- API 기본값: `dateFilter = 'week'` (admin 라우트 `req.body` 기본값)

### 2-2. 날짜 없는 리뷰

- **위치**: 리뷰 추출 루프 내, 날짜 파싱 직후 (약 4855~4864행)
- **동작**: 날짜를 못 찾아도 **항상 오늘 날짜로 넣고 수집** (건너뛰지 않음).
- **코드**:  
  `if (!date)` → `date = new Date().toISOString().split('T')[0]`, `reviewDate = new Date(date)`  
  → 리뷰 기간과 무관하게 **continue 없음**.

### 2-3. 날짜 기준 수집 중단 (일주일/2주만)

- **위치**: 같은 리뷰 루프 내 (약 4931~4944행)
- **isPeriodFilter**:  
  `effectiveDateFilter !== 'all' && (effectiveDateFilter === 'week' || '2weeks' || 'twoWeeks')`
- **동작**:  
  - **전체(`all`)**: `dateFilterStopRequested` 설정 안 함.  
  - **일주일/2주**: `reviewDate < cutoff`(7일/14일 이전)인 리뷰를 **처음 만나면**  
    `dateFilterStopRequested = true` → 해당 리뷰 for break → 스크롤 for도 break.

### 2-4. 스크롤 루프 종료 조건 (리뷰 기간과 무관하게 통일)

- **위치**: 스크롤 for 루프 끝 (약 5073~5086행)
- **상수**:  
  `maxScrollAttempts = 60`, `minScrollBeforeExit = 20`, `unchangedLimit = 12`, `scrollStuckLimit = 6`
- **종료 조건** (날짜 필터와 분리된 단일 세트):
  - **collectedFew**: `reviews.length <= 20`
  - **minForExit**: collectedFew ? 30 : 20  
  - **unchangedForExit**: collectedFew ? 18 : 12  
  - **exitByNoChange**:  
    `(scrollAttempt + 1 >= minForExit) && (noChangeCount >= unchangedForExit)`  
    → “최소 N번 스크롤 후, 연속 M번 신규 0건”이면 종료.
  - **exitByStuck**:  
    `scrollStuckCount >= 6` 이고  
    `scrollAttempt + 1 >= (collectedFew ? 22 : 15)`  
    → maxScroll > 0 인데 스크롤이 안 될 때만 stuck 카운트 증가 (아래 참고).

### 2-5. 스크롤/Stuck 처리

- **스크롤**: `#reviews` 안에서 scrollHeight 최대인 요소에 `scrollTop += 550` 등으로 조금씩 내림.  
  휠 3회(350px, 550ms 간격), 한 번 더 400px 스크롤.  
  `maxScroll <= 50` 이면 창/문서 스크롤 fallback 추가.
- **stuck 판단**:  
  `scrollResult.maxScroll > 0 && !scrollResult.scrolled` 일 때만 `scrollStuckCount++`.  
  `maxScroll === 0` 이면 stuck으로 보지 않음 (창 스크롤 fallback 사용 중).
- **추출 순서**: 역순(currentCount-1 → 0). 추출 전 스크롤 위치 저장, 추출 후 복원.

---

## 3. 이미 시도한 수정들 (요약)

1. **날짜 없을 때**:  
   전체가 아니면 `continue` 하던 것 → **제거**.  
   항상 오늘 날짜로 넣고 수집하도록 변경.
2. **날짜 기준 종료**:  
   `isPeriodFilter`에 `effectiveDateFilter !== 'all'` 명시.  
   전체일 때는 `dateFilterStopRequested` 설정 안 함.
3. **스크롤 종료 조건**:  
   `isAllDateFilter`로 전체/일주일을 나누던 것 → **제거**.  
   리뷰 기간과 무관하게 **한 세트**로 통일 (과거에 잘 되던 값으로 복원).
4. **Stuck**:  
   `maxScroll > 0` 일 때만 stuck으로 세어, maxScroll=0인 페이지가 stuck으로 빨리 끝나지 않도록 함.
5. **스크롤 속도**:  
   대기 시간 조정 (900ms, 550ms, 800ms 등).

**그럼에도** “전체일 때 끝나고 다음 기업으로 넘어감” / “빨리 스크롤되다 바로 종료” 등 **문제는 아직 해결되지 않은 상태**.

---

## 4. 의심되는 원인 (재개 시 확인할 것)

1. **실제 종료 사유**  
   - 콘솔에서 `[구글] 스크롤 중단(신규 없음)` vs `[구글] 스크롤 중단(스크롤 멈춤)`  
   - 그때의 `maxScroll`, `DOM리뷰=...`, `누적 ...개` 값을 확인해  
     “10개만 보여서 noChange로 끝나는지”, “스크롤이 안 돼서 stuck으로 끝나는지” 구분.

2. **DOM 10개 고정 (가상 스크롤)**  
   - 구글 UI가 보이는 구간만 DOM에 두고 스크롤해도 개수가 ~10개라면,  
     매 라운드 같은 10개만 추출 → addedThisRound=0 → noChangeCount만 증가 →  
     minForExit/unchangedForExit 도달 시 “신규 없음”으로 종료.  
   - 이 경우 **스크롤로 새 아이템이 DOM에 붙는지**, 또는 **다른 트리거(스크롤 위치/이벤트)**가 필요한지 확인 필요.

3. **스크롤 컨테이너/ maxScroll**  
   - `maxScroll`이 0 또는 매우 작게 나오는지.  
   - 0이면 stuck은 안 쌓이지만, 실제로는 “리스트가 더 안 내려와서” 신규 0으로 끝날 수 있음.  
   - `#reviews` 말고 **다른 요소**가 실제 스크롤 컨테이너인 페이지가 있는지 확인.

4. **dateFilter 전달**  
   - 클라이언트에서 **전체** 선택 시 `dateFilter: 'all'` 이 정확히 오는지.  
   - 서버 로그 `구글 여행 스크래핑 시작: ... (필터: all, ...)` 로 확인.

---

## 5. 참고 문서

- **리뷰 기간 로직 상세**: `docs/GOOGLE_DATE_FILTER.md`  
  (문서에는 예전에 “날짜 없으면 continue”라고 되어 있을 수 있으나, **현재 코드는 날짜 없어도 오늘로 넣고 수집**)
- **전체 조회 시 10건 멈춤 진단**: `docs/GOOGLE_DATE_FILTER.md` § 전체 조회 시 10건에서 멈추는 원인

---

## 6. 내일 재개 시 제안 순서

1. **실행 한 번** 하고 터미널/콘솔에서  
   - `[구글] 스크롤 중단(...)` 로그가 **신규 없음**인지 **스크롤 멈춤**인지,  
   - 그때 `maxScroll`, `DOM리뷰`, `누적 N개` 값을 **그대로** 기록.
2. **전체** 선택으로 한 기업만 돌렸을 때  
   - `필터: all` 로그가 나오는지 확인.
3. 위 4절 의심 원인에 따라  
   - DOM 개수 변화 여부,  
   - 스크롤되는 요소와 maxScroll,  
   - 필요 시 스크롤/대기 방식 변경 검토.

이 문서는 **현재 상태와 미해결 이슈**를 그대로 남겨 두었음.
