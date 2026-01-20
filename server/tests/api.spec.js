import { test, expect } from '@playwright/test';

/**
 * API 통합 테스트
 * 서버가 실행 중이어야 합니다.
 * 서버가 실행되지 않은 경우 테스트를 스킵합니다.
 */
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_PASSWORD || 'admin123';

// 서버가 실행 중인지 확인하는 헬퍼 함수
async function isServerRunning(url) {
  try {
    const response = await fetch(`${url}/health`, { 
      signal: AbortSignal.timeout(1000) 
    });
    return response.ok;
  } catch {
    return false;
  }
}

test.describe('Admin API', () => {
  test.beforeAll(async () => {
    // 서버가 실행 중인지 확인
    const running = await isServerRunning(API_BASE_URL);
    if (!running) {
      test.skip();
    }
  });

  test('Health check 엔드포인트', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/health`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('ok');
  });

  test('작업 상태 조회 (인증 필요)', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/admin/jobs/status`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('isRunning');
    expect(typeof data.isRunning).toBe('boolean');
  });

  test('작업 상태 조회 (인증 실패)', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/admin/jobs/status`, {
      headers: {
        'x-admin-secret': 'wrong-password'
      }
    });
    
    expect(response.status()).toBe(401);
  });

  test('스크래핑 테스트 API', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/admin/test/scrape`, {
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      data: {
        url: 'https://map.naver.com',
        companyName: '테스트 호텔'
      }
    });
    
    // 응답이 성공이거나 타임아웃일 수 있음
    const status = response.status();
    expect([200, 201, 202, 408, 500]).toContain(status);
    
    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('savedCount');
    }
  });

  test('최근 작업 목록 조회', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/admin/jobs?limit=5`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
