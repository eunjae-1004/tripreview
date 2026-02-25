# 로컬에서 작업 화면(브라우저) 보면서 디버그하기

디버그 모드에서 **PLAYWRIGHT_HEADED=1**을 설정하고, **로컬 주소**로 서버·클라이언트를 실행하는 방법입니다.

---

## 0. 인증 실패가 나올 때 (로컬)

**"오류: 인증 실패"** 가 나오면, 서버와 클라이언트의 **비밀번호가 같아야** 합니다.

- **서버**: 환경 변수 `ADMIN_PASSWORD`  
- **클라이언트**: 환경 변수 `NEXT_PUBLIC_ADMIN_SECRET` (없으면 기본값 `admin123`)

**로컬에서 맞추는 방법:**

1. **서버** 실행 시 비밀번호 지정 (PowerShell):
   ```powershell
   cd server
   $env:ADMIN_PASSWORD="admin123"
   npm run dev:headed
   ```
   또는 `server` 폴더에 `.env` 파일을 만들고 한 줄 추가:
   ```
   ADMIN_PASSWORD=admin123
   ```
2. **클라이언트**는 기본값이 `admin123`이므로 별도 설정 없이 실행해도 됩니다.  
   다른 비밀번호를 쓰려면 클라이언트 실행 전에:
   ```powershell
   $env:NEXT_PUBLIC_ADMIN_SECRET="여기에_서버와_같은_값"
   ```

---

## 1. 터미널 두 개 준비

- **터미널 1**: 서버 실행 (API + 스크래핑)
- **터미널 2**: 클라이언트 실행 (관리자 페이지)

---

## 2. 터미널 1 – 서버 실행 (PLAYWRIGHT_HEADED=1)

**포트 3000이 이미 사용 중이면** 먼저 아래 중 하나로 정리한 뒤 서버를 실행하세요.

### 포트 3000 비우기 (이미 서버가 떠 있을 때)

**방법 A – npm 스크립트 (권장):**

```powershell
cd server
npm run stop
```

**방법 B – 수동 (PowerShell):**

```powershell
netstat -ano | findstr :3000
# 마지막 숫자(PID) 확인 후
taskkill /PID <PID번호> /F
```

---

### 서버 실행

**가장 간단한 방법 (Windows/Mac/Linux 공통):**

```powershell
cd server
npm install
npm run dev:headed
```

- `npm run dev:headed` 가 자동으로 `PLAYWRIGHT_HEADED=1` 을 넣고 서버를 띄웁니다.
- 서버는 **포트 3000**에서 실행됩니다.
- 로그에 `서버가 포트 3000에서 실행 중입니다` 가 보이면 정상입니다.

**수동으로 환경 변수 설정해서 실행하려면:**

- Windows (PowerShell): `cd server` → `$env:PLAYWRIGHT_HEADED="1"; node src/index.js`
- Mac/Linux: `cd server` → `PLAYWRIGHT_HEADED=1 node src/index.js`

---

## 3. 터미널 2 – 클라이언트 실행 (로컬 API 주소 사용)

관리자 페이지를 **로컬 서버(API)**에 연결하려면 `NEXT_PUBLIC_API_URL`을 로컬 주소로 맞춥니다.  
서버가 3000을 쓰므로, 클라이언트는 **다른 포트**(예: 3001)에서 띄웁니다.

### Windows (PowerShell)

```powershell
cd client
$env:NEXT_PUBLIC_API_URL="http://localhost:3000"
npm run dev:local
```

한 줄로:

```powershell
cd client; $env:NEXT_PUBLIC_API_URL="http://localhost:3000"; npm run dev:local
```

### Windows (CMD)

```cmd
cd client
set NEXT_PUBLIC_API_URL=http://localhost:3000
npm run dev:local
```

### Mac / Linux (Bash)

```bash
cd client
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run dev:local
```

- `dev:local` 스크립트가 포트 **3001**에서 Next.js를 띄웁니다 (서버 3000과 겹치지 않음).
- 관리자 페이지는 **http://localhost:3001** 로 열립니다.

---

## 4. 브라우저에서 할 일

1. **http://localhost:3001** 로 접속합니다.
2. **디버그: 단계마다 클릭하여 진행** 을 체크합니다.
3. **지금 실행** 을 누릅니다.
4. 같은 PC에 **Chromium 창(작업 화면)** 이 뜨고, 단계마다 **다음 단계** 클릭으로 진행할 수 있습니다.

---

## 5. 요약 표

| 구분        | 터미널 1 (서버)              | 터미널 2 (클라이언트)                          |
|-------------|-----------------------------|-----------------------------------------------|
| 폴더        | `server`                    | `client`                                      |
| 환경 변수   | `PLAYWRIGHT_HEADED=1`       | `NEXT_PUBLIC_API_URL=http://localhost:3000`   |
| 실행 명령   | `npm run dev:headed`        | `npm run dev:local` (환경변수 설정 후)        |
| 접속 주소   | API: http://localhost:3000  | 페이지: http://localhost:3001                 |

---

## 6. 주의사항

- **PLAYWRIGHT_HEADED=1** 은 **서버를 실행하는 터미널**에서만 설정하면 됩니다.
- **배포 환경(Railway 등)** 에서는 이 환경 변수를 쓰지 않아야 합니다. (설정해도 디스플레이가 없어 창은 안 보이고, 필요하면 자동으로 headless로 동작합니다.)
- 로컬에서도 **배포된 URL**로 접속하면 작업이 Railway에서 돌아가므로, 브라우저 창은 **로컬 주소(http://localhost:3001)** 로 접속했을 때만 보입니다.
