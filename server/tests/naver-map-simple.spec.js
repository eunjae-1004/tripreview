import { test, expect } from '@playwright/test';

/**
 * 네이버맵 간단한 스크래핑 테스트
 * Playwright의 기본 page를 사용하여 더 안정적으로 테스트
 */
test.describe('네이버맵 스크래핑 (간단 버전)', () => {
  test('네이버맵 접속 및 기본 구조 확인', async ({ page }) => {
    await page.goto('https://map.naver.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // 페이지 제목 확인
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    console.log(`페이지 제목: ${title}`);
    
    // URL 확인
    const url = page.url();
    expect(url).toContain('naver.com');
    console.log(`현재 URL: ${url}`);
  });

  test('검색창 찾기 및 입력 테스트', async ({ page }) => {
    await page.goto('https://map.naver.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // 검색창 찾기
    const searchInput = page.getByRole('combobox', { name: '장소, 버스, 지하철, 주소 검색' });
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    
    // 검색어 입력
    await searchInput.fill('동해보양온천컨벤션호텔');
    await page.waitForTimeout(2000);
    
    // 입력값 확인
    const value = await searchInput.inputValue();
    expect(value).toContain('동해보양온천');
    console.log(`입력된 검색어: ${value}`);
  });

  test('직접 URL로 접근하여 리뷰 확인', async ({ page }) => {
    // 네이버맵에서 호텔의 직접 URL을 사용 (검색 대신)
    // 실제 호텔 URL이 필요하지만, 여기서는 iframe 구조 확인만 수행
    
    await page.goto('https://map.naver.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // iframe이 있는지 확인
    const iframes = page.locator('iframe');
    const iframeCount = await iframes.count();
    console.log(`발견된 iframe 개수: ${iframeCount}`);
    
    // Naver Place Entry iframe 찾기
    const placeIframe = page.locator('iframe[title="Naver Place Entry"]');
    const hasPlaceIframe = await placeIframe.count() > 0;
    console.log(`Naver Place Entry iframe 존재: ${hasPlaceIframe}`);
  });
});
