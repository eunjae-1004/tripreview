# Railway 배포 가이드

## 필수 환경 변수 설정

Railway 대시보드에서 다음 환경 변수를 설정해야 합니다:

### 1. Railway 대시보드에서 설정

1. Railway 프로젝트 페이지 접속
2. 서비스 선택
3. **Variables** 탭 클릭
4. 다음 변수들을 추가:

```
DATABASE_URL=postgresql://... (Railway PostgreSQL 서비스 연결 시 자동 생성)
ADMIN_PASSWORD=your_secure_password_here
NODE_ENV=production
PORT=8080 (Railway가 자동으로 설정하지만, 필요시 수동 설정 가능)
```

### 2. PostgreSQL 서비스 연결

1. Railway 프로젝트에서 **New** > **Database** > **Add PostgreSQL** 클릭
2. PostgreSQL 서비스가 생성되면 자동으로 `DATABASE_URL` 환경변수가 설정됩니다
3. PostgreSQL 서비스의 **Variables** 탭에서 `DATABASE_URL` 확인

### 3. 환경 변수 확인

배포 전에 다음 환경 변수가 설정되어 있는지 확인:

- ✅ `DATABASE_URL` - PostgreSQL 연결 문자열
- ✅ `ADMIN_PASSWORD` - API 인증 비밀번호
- ✅ `NODE_ENV` - `production`으로 설정
- ✅ `PORT` - Railway가 자동으로 설정 (보통 8080)

### 4. 배포 후 확인

1. **Deployments** 탭에서 배포 상태 확인
2. **Logs** 탭에서 서버 로그 확인
3. 다음 메시지가 보이면 성공:
   ```
   서버가 포트 8080에서 실행 중입니다.
   스케줄: 매주 월요일 오전 2시 자동 실행
   ```

### 5. Health Check

서버가 정상 실행 중인지 확인:

```bash
curl https://your-app.railway.app/health
```

응답: `{"status":"ok"}`

## 문제 해결

### 서버가 곧바로 종료되는 경우

1. **환경 변수 확인**: `DATABASE_URL`이 설정되어 있는지 확인
2. **로그 확인**: Railway Logs 탭에서 에러 메시지 확인
3. **PostgreSQL 연결 확인**: PostgreSQL 서비스가 정상 실행 중인지 확인

### Playwright 설치 실패

- Railway의 빌드 설정에서 Playwright 설치가 실패해도 서버는 계속 실행됩니다
- 스크래핑 기능만 사용할 수 없고, API는 정상 작동합니다

### 메모리 부족

- Railway 무료 플랜은 메모리가 제한적입니다
- Playwright 설치 시 메모리 부족이 발생할 수 있습니다
- 필요시 Railway 플랜 업그레이드 고려
