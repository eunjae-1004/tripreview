#!/bin/bash

# 배포 준비 스크립트
# 이 스크립트는 배포 전 확인 사항을 체크합니다.

echo "🚀 Trip Review 프로젝트 배포 준비"
echo "=================================="
echo ""

# Git 저장소 확인
if [ ! -d ".git" ]; then
  echo "❌ Git 저장소가 초기화되지 않았습니다."
  echo "다음 명령어를 실행하세요:"
  echo "  git init"
  echo "  git add ."
  echo "  git commit -m 'Initial commit'"
  exit 1
fi

echo "✅ Git 저장소 확인 완료"

# GitHub 원격 저장소 확인
if ! git remote | grep -q origin; then
  echo "⚠️  GitHub 원격 저장소가 설정되지 않았습니다."
  echo "다음 명령어로 추가하세요:"
  echo "  git remote add origin https://github.com/your-username/tripreview.git"
  echo ""
fi

# 필수 파일 확인
echo ""
echo "📁 필수 파일 확인 중..."

files=(
  "server/package.json"
  "server/src/index.js"
  "server/src/db/schema.sql"
  "client/package.json"
  "client/app/page.tsx"
  ".gitignore"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file (누락)"
  fi
done

echo ""
echo "📋 배포 체크리스트:"
echo ""
echo "Railway (Server):"
echo "  [ ] Railway 계정 생성 및 GitHub 연동"
echo "  [ ] 새 프로젝트 생성 및 저장소 연결"
echo "  [ ] Root Directory를 'server'로 설정"
echo "  [ ] PostgreSQL 애드온 추가"
echo "  [ ] 환경 변수 설정 (ADMIN_PASSWORD, JWT_SECRET, NODE_ENV, PORT)"
echo "  [ ] 데이터베이스 마이그레이션 실행"
echo ""
echo "Vercel (Client):"
echo "  [ ] Vercel 계정 생성 및 GitHub 연동"
echo "  [ ] 새 프로젝트 생성 및 저장소 연결"
echo "  [ ] Root Directory를 'client'로 설정"
echo "  [ ] 환경 변수 설정 (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_ADMIN_SECRET)"
echo ""
echo "자세한 내용은 DEPLOY.md 파일을 참조하세요."
echo ""
