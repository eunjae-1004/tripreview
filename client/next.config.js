/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 캐시 제어: 관리자 페이지는 항상 최신 버전을 보여주도록
  async headers() {
    return [
      {
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
