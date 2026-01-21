# 관리자 인증 시스템 상세 설명

## 개요

이 프로젝트는 간단한 비밀번호 기반 인증 시스템을 사용합니다. 클라이언트(웹 페이지)에서 서버(Railway)로 API 요청을 보낼 때, 비밀번호를 헤더에 포함시켜 인증합니다.

## 인증 흐름

```
[클라이언트 (Vercel)]                    [서버 (Railway)]
     │                                         │
     │  1. API 요청 (헤더에 비밀번호 포함)      │
     ├────────────────────────────────────────>│
     │  x-admin-secret: "my-secret-password"  │
     │                                         │
     │                                         │ 2. 비밀번호 검증
     │                                         │    - 헤더의 x-admin-secret
     │                                         │    - 환경 변수 ADMIN_PASSWORD
     │                                         │    - 두 값이 일치하는지 확인
     │                                         │
     │  3. 응답                                │
     │  <──────────────────────────────────────┤
     │  ✅ 성공 (200 OK) 또는                  │
     │  ❌ 실패 (401 인증 실패)                 │
```

## 코드 분석

### 서버 측 (Railway) - `server/src/routes/admin.js`

```javascript
// 관리자 인증 미들웨어
const authenticateAdmin = (req, res, next) => {
  // 1. 클라이언트가 보낸 헤더에서 비밀번호 추출
  const adminSecret = req.headers['x-admin-secret'];
  
  // 2. 환경 변수 ADMIN_PASSWORD와 비교
  if (adminSecret === process.env.ADMIN_PASSWORD) {
    // 3. 일치하면 다음 미들웨어로 진행 (API 실행)
    next();
  } else {
    // 4. 일치하지 않으면 401 에러 반환
    res.status(401).json({ error: '인증 실패' });
  }
};

// 모든 관리자 API 라우트에 인증 적용
router.use(authenticateAdmin);
```

**동작 방식:**
1. 클라이언트가 API 요청을 보낼 때 `x-admin-secret` 헤더에 비밀번호를 포함
2. 서버는 이 헤더 값을 읽어서 `process.env.ADMIN_PASSWORD`와 비교
3. 일치하면 API 실행, 일치하지 않으면 401 에러 반환

### 클라이언트 측 (Vercel) - `client/app/page.tsx`

```javascript
// 환경 변수에서 비밀번호 읽기
const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || 'admin123';

// API 요청 시 헤더에 비밀번호 포함
const response = await fetch(`${API_URL}/api/admin/jobs/start`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-secret': ADMIN_SECRET,  // ← 여기서 비밀번호 전송
  },
  body: JSON.stringify({ ... }),
});
```

**동작 방식:**
1. Vercel 환경 변수 `NEXT_PUBLIC_ADMIN_SECRET`에서 비밀번호 읽기
2. API 요청 시 `x-admin-secret` 헤더에 비밀번호 포함
3. 서버로 전송

## 왜 두 값이 동일해야 하는가?

### 비교 과정

```
클라이언트가 보낸 값:  NEXT_PUBLIC_ADMIN_SECRET
                        ↓
                   x-admin-secret 헤더
                        ↓
서버가 받은 값:    req.headers['x-admin-secret']
                        ↓
서버가 비교하는 값: process.env.ADMIN_PASSWORD
                        ↓
                    일치? → ✅ API 실행
                    불일치? → ❌ 401 에러
```

### 예시

**올바른 설정:**
```
Railway (서버):
  ADMIN_PASSWORD = "my-secret-123"

Vercel (클라이언트):
  NEXT_PUBLIC_ADMIN_SECRET = "my-secret-123"

결과: ✅ 인증 성공
```

**잘못된 설정:**
```
Railway (서버):
  ADMIN_PASSWORD = "my-secret-123"

Vercel (클라이언트):
  NEXT_PUBLIC_ADMIN_SECRET = "wrong-password"

결과: ❌ 401 인증 실패
```

## 환경 변수 설정 방법

### Railway (서버) 설정

1. **Railway 대시보드 접속**
   - https://railway.app
   - `tripreview_backend` 프로젝트 선택

2. **Settings > Variables로 이동**
   - 왼쪽 메뉴에서 "Settings" 클릭
   - "Variables" 섹션 찾기

3. **`ADMIN_PASSWORD` 추가**
   - **Name**: `ADMIN_PASSWORD`
   - **Value**: 원하는 비밀번호 (예: `my-secure-password-2024`)
   - **참고**: 강력한 비밀번호를 사용하세요 (최소 16자, 대소문자, 숫자, 특수문자 포함)

4. **저장 및 재배포**
   - 변수 추가 후 Railway가 자동으로 재배포합니다

### Vercel (클라이언트) 설정

1. **Vercel 대시보드 접속**
   - https://vercel.com/dashboard
   - `tripreview` 프로젝트 선택

2. **Settings > Environment Variables로 이동**
   - 왼쪽 메뉴에서 "Settings" 클릭
   - "Environment Variables" 섹션 찾기

3. **`NEXT_PUBLIC_ADMIN_SECRET` 추가**
   - **Name**: `NEXT_PUBLIC_ADMIN_SECRET`
   - **Value**: Railway의 `ADMIN_PASSWORD`와 **정확히 동일한 값**
   - **Environment**: Production, Preview, Development 모두 선택
   - **중요**: Railway의 `ADMIN_PASSWORD`와 완전히 일치해야 합니다

4. **저장 및 재배포**
   - 변수 추가 후 Vercel이 자동으로 재배포합니다

## 보안 고려사항

### 현재 시스템의 한계

1. **비밀번호가 클라이언트에 노출됨**
   - `NEXT_PUBLIC_` 접두사가 있는 변수는 브라우저에서 접근 가능
   - 누구나 브라우저 개발자 도구에서 비밀번호를 볼 수 있음

2. **단순한 비밀번호 비교**
   - JWT 토큰이나 OAuth 같은 고급 인증 시스템이 아님

### 개선 방안 (향후)

1. **JWT 토큰 기반 인증**
   - 클라이언트에서 로그인 API 호출
   - 서버가 JWT 토큰 발급
   - 이후 요청에 토큰 포함

2. **OAuth 2.0**
   - Google, GitHub 등 소셜 로그인 사용

3. **API 키 로테이션**
   - 주기적으로 비밀번호 변경

### 현재 시스템에서 할 수 있는 보안 조치

1. **강력한 비밀번호 사용**
   - 최소 32자 이상
   - 대소문자, 숫자, 특수문자 포함
   - 예: `MyS3cur3P@ssw0rd!2024#Admin`

2. **HTTPS 사용**
   - Railway와 Vercel 모두 HTTPS를 기본 제공
   - 네트워크 전송 중 비밀번호 암호화

3. **환경 변수 보호**
   - Railway와 Vercel의 환경 변수는 암호화되어 저장됨
   - 대시보드 접근 권한 관리

## 문제 해결

### "인증 실패" 에러가 발생하는 경우

1. **두 값이 정확히 일치하는지 확인**
   ```
   Railway:  ADMIN_PASSWORD = "my-password-123"
   Vercel:   NEXT_PUBLIC_ADMIN_SECRET = "my-password-123"
   ```
   - 공백, 대소문자, 특수문자까지 정확히 일치해야 합니다

2. **환경 변수가 설정되었는지 확인**
   - Railway: Settings > Variables에서 `ADMIN_PASSWORD` 확인
   - Vercel: Settings > Environment Variables에서 `NEXT_PUBLIC_ADMIN_SECRET` 확인

3. **재배포 확인**
   - 환경 변수를 변경한 후 재배포가 필요합니다
   - Railway와 Vercel 모두 재배포 확인

4. **브라우저 콘솔 확인**
   - F12를 눌러 개발자 도구 열기
   - Console 탭에서 에러 메시지 확인
   - Network 탭에서 요청 헤더 확인

### 디버깅 방법

**서버 로그 확인 (Railway):**
```
[API] POST /api/admin/jobs/start - 2026-01-21T00:15:11.172Z
[API] Headers: { 'x-admin-secret': '설정됨', ... }
```

**클라이언트 로그 확인 (브라우저 콘솔):**
```javascript
[API] 작업 시작 요청: https://tripreviewbackend-production.up.railway.app/api/admin/jobs/start
[API] Admin Secret: 설정됨
[API] 응답 상태: 401 Unauthorized  // ← 인증 실패
```

## 요약

1. **Railway의 `ADMIN_PASSWORD`**: 서버가 기대하는 비밀번호
2. **Vercel의 `NEXT_PUBLIC_ADMIN_SECRET`**: 클라이언트가 보내는 비밀번호
3. **두 값이 일치해야 함**: 서버가 클라이언트를 인증하기 위해
4. **비밀번호는 헤더로 전송**: `x-admin-secret` 헤더 사용
5. **일치하면 API 실행, 불일치하면 401 에러**

## 다음 단계

1. Railway에서 `ADMIN_PASSWORD` 설정
2. Vercel에서 `NEXT_PUBLIC_ADMIN_SECRET`을 동일한 값으로 설정
3. 재배포
4. 테스트
