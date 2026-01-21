import type { Metadata } from 'next'
import './globals.css'

// 동적 렌더링 강제 (캐시 방지)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Trip Review 관리자',
  description: '기업 리뷰 스크래핑 관리 시스템',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
