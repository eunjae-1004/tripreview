import type { Metadata } from 'next'
import './globals.css'

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
