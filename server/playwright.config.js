import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 테스트 설정
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* 테스트 실행 시 최대 시간 (60초) */
  timeout: 60 * 1000,
  expect: {
    /* expect assertions의 타임아웃 (5초) */
    timeout: 5000
  },
  /* 테스트를 병렬로 실행 */
  fullyParallel: true,
  /* CI에서 실패 시 재시도 */
  forbidOnly: !!process.env.CI,
  /* CI에서만 실패한 테스트 재시도 */
  retries: process.env.CI ? 2 : 0,
  /* 병렬 실행할 워커 수 */
  workers: process.env.CI ? 1 : undefined,
  /* 리포트 설정 */
  reporter: 'html',
  /* 공유 설정 */
  use: {
    /* 기본 타임아웃 (액션, 네비게이션 등) */
    actionTimeout: 0,
    /* 테스트 실패 시 스크린샷 저장 */
    screenshot: 'only-on-failure',
    /* 테스트 실패 시 비디오 저장 */
    video: 'retain-on-failure',
    /* 트레이스 저장 (디버깅용) */
    trace: 'on-first-retry',
  },

  /* 프로젝트 설정 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* 웹 서버 실행 (필요시) */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
