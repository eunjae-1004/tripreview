# 빠른 시작 가이드

## 1. GitHub에 코드 푸시

```bash
# Git 초기화 (처음 한 번만)
git init
git add .
git commit -m "Initial commit"

# GitHub 저장소 생성 후
git remote add origin https://github.com/your-username/tripreview.git
git branch -M main
git push -u origin main
```

## 2. Railway 배포 (5분)

1. **프로젝트 생성**
   - https://railway.app 접속
   - "New Project" → "Deploy from GitHub repo"
   - 저장소 선택 → "Deploy Now"

2. **Root Directory 설정**
   - Settings → Root Directory → `server` 입력

3. **PostgreSQL 추가**
   - "New" → "Database" → "Add PostgreSQL"

4. **환경 변수 설정**
   - Variables 탭에서 추가:
     ```
     ADMIN_PASSWORD=your-password
     JWT_SECRET=your-secret
     NODE_ENV=production
     PORT=3000
     ```

5. **데이터베이스 마이그레이션**
   ```bash
   npm i -g @railway/cli
   railway login
   railway link
   cd server
   railway run npm run migrate
   ```

6. **서버 URL 확인**
   - Settings → Networking → 생성된 URL 복사

## 3. Vercel 배포 (3분)

1. **프로젝트 생성**
   - https://vercel.com 접속
   - "Add New..." → "Project"
   - 저장소 선택 → "Import"

2. **Root Directory 설정**
   - Configure Project → Root Directory → `client` 입력

3. **환경 변수 설정**
   ```
   NEXT_PUBLIC_API_URL=https://your-railway-app.railway.app
   NEXT_PUBLIC_ADMIN_SECRET=your-password (Railway의 ADMIN_PASSWORD와 동일)
   ```

4. **배포**
   - "Deploy" 클릭

## 완료! 🎉

이제 관리자 페이지에서 스크래핑 작업을 관리할 수 있습니다.
