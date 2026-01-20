# Railway 배포 문제 해결 가이드

## 현재 문제

로그에서 확인된 문제:
1. **DATABASE_URL 미설정**: `DATABASE_URL: 미설정`
2. **PORT가 3000으로 고정**: Railway가 자동으로 설정한 PORT를 사용해야 함
3. **서버가 SIGTERM으로 종료**: 환경 변수 누락으로 인한 문제

## 해결 방법

### 1. Railway에서 PostgreSQL 서비스 연결

1. Railway 대시보드 접속
2. 프로젝트 페이지에서 **"New"** 클릭
3. **"Database"** → **"Add PostgreSQL"** 선택
4. PostgreSQL 서비스가 생성되면 자동으로 `DATABASE_URL` 환경변수가 설정됩니다

### 2. 환경 변수 확인 및 설정

Railway 대시보드에서:

1. **서비스 선택** (tripreview_backend)
2. **"Variables"** 탭 클릭
3. 다음 환경 변수들이 설정되어 있는지 확인:

#### 필수 환경 변수:
- ✅ `DATABASE_URL`: PostgreSQL 서비스 연결 시 자동 생성됨
- ✅ `PORT`: Railway가 자동으로 설정 (수동 설정 불필요)
- ✅ `NODE_ENV`: `production`으로 설정
- ✅ `ADMIN_PASSWORD`: API 인증 비밀번호 (예: `your_secure_password`)

### 3. DATABASE_URL 확인 방법

1. Railway 대시보드에서 PostgreSQL 서비스 클릭
2. **"Variables"** 탭에서 `DATABASE_URL` 확인
3. 또는 **"Connect"** 탭에서 연결 정보 확인

### 4. 환경 변수 수동 설정 (필요한 경우)

만약 PostgreSQL 서비스가 연결되어 있지만 `DATABASE_URL`이 설정되지 않은 경우:

1. PostgreSQL 서비스의 **"Variables"** 탭에서 `DATABASE_URL` 복사
2. `tripreview_backend` 서비스의 **"Variables"** 탭으로 이동
3. **"New Variable"** 클릭
4. **Key**: `DATABASE_URL`
5. **Value**: PostgreSQL 서비스의 `DATABASE_URL` 값 붙여넣기
6. **"Add"** 클릭

### 5. 배포 후 확인

환경 변수 설정 후:

1. **"Deployments"** 탭에서 최신 배포 확인
2. **"Logs"** 탭에서 다음 메시지 확인:
   ```
   환경 변수 확인:
   - PORT: 8080 (또는 Railway가 설정한 포트)
   - NODE_ENV: production
   - DATABASE_URL: 설정됨
   서버가 포트 8080에서 실행 중입니다.
   ```

### 6. 데이터베이스 마이그레이션 실행

환경 변수 설정 후 데이터베이스 스키마를 생성해야 합니다:

**방법 1: Railway CLI 사용 (권장)**

```bash
# Railway CLI 설치
npm i -g @railway/cli

# 로그인
railway login

# 프로젝트 연결
railway link

# 환경 변수 확인
railway variables

# 마이그레이션 실행
cd server
railway run npm run migrate
```

**방법 2: Railway PostgreSQL 콘솔 사용**

1. Railway 대시보드에서 PostgreSQL 서비스 클릭
2. **"Data"** 탭 → **"Query"** 클릭
3. `server/src/db/schema.sql` 파일 내용을 복사하여 실행

## 문제 해결 체크리스트

- [ ] PostgreSQL 서비스가 Railway 프로젝트에 추가되어 있음
- [ ] `DATABASE_URL` 환경 변수가 설정되어 있음
- [ ] `NODE_ENV`가 `production`으로 설정되어 있음
- [ ] `ADMIN_PASSWORD`가 설정되어 있음
- [ ] 데이터베이스 마이그레이션이 실행되었음
- [ ] 서버 로그에서 "DATABASE_URL: 설정됨" 메시지 확인
- [ ] 서버가 정상적으로 실행 중임 (SIGTERM 없음)

## 추가 참고사항

- Railway는 `PORT` 환경변수를 자동으로 설정합니다. 코드에서 `process.env.PORT || 3000`을 사용하므로 Railway가 설정한 포트를 자동으로 사용합니다.
- `DATABASE_URL`이 설정되지 않으면 서버가 시작은 되지만, 데이터베이스 연결 시도 시 실패할 수 있습니다.
- Railway의 헬스체크가 실패하면 서버가 자동으로 재시작됩니다.
