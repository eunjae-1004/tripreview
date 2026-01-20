import { test, expect } from '@playwright/test';
import ScraperService from '../src/services/scraper.js';

/**
 * 네이버맵 실제 구조 기반 스크래퍼 테스트
 * Playwright 코드 생성 기능으로 만든 실제 동작 코드를 기반으로 작성
 */
test.describe('네이버맵 실제 구조 스크래핑', () => {
  let scraper;

  test.beforeEach(async () => {
    scraper = new ScraperService();
    await scraper.init();
  });

  test.afterEach(async () => {
    if (scraper) {
      await scraper.close();
    }
  });

  test('동해보양온천컨벤션호텔 검색 및 리뷰 접근', async ({ page: testPage }) => {
    // ScraperService의 page 대신 Playwright의 page 사용
    const page = testPage || scraper.page;
    
    // 네이버맵 접속
    await page.goto('https://map.naver.com/p?c=15.00,0,0,0,dh', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // 페이지가 닫히지 않았는지 확인
    expect(page.url()).toContain('naver.com');
    
    // 검색창 찾기 및 클릭
    const searchBox = page.getByRole('combobox', { name: '네이버지도 검색' });
    await searchBox.waitFor({ state: 'visible', timeout: 15000 });
    await searchBox.click();
    await page.waitForTimeout(1000);
    
    // 검색어 입력
    const searchInput = page.getByRole('combobox', { name: '장소, 버스, 지하철, 주소 검색' });
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await searchInput.clear();
    await searchInput.fill('동해보양온천컨벤션호텔');
    await page.waitForTimeout(2000);
    
    // Enter 키 대신 검색 버튼 클릭 시도
    try {
      await searchInput.press('Enter');
    } catch (e) {
      // 검색 버튼 클릭 시도
      const searchButton = page.getByRole('button', { name: /검색/ }).first();
      if (await searchButton.isVisible().catch(() => false)) {
        await searchButton.click();
      }
    }
    
    // 검색 결과 선택
    await page.getByRole('combobox', { name: '장소, 버스, 지하철, 주소 검색' }).click();
    await page.getByRole('option', { name: '장소 호텔 동해보양온천컨벤션호텔 강원 동해시 동해대로' }).getByRole('strong').click();
    
    // iframe 찾기 및 리뷰 탭 클릭
    const iframe = page.locator('iframe[title="Naver Place Entry"]');
    await iframe.waitFor({ state: 'attached' });
    
    const frame = await iframe.contentFrame();
    await frame.getByRole('tab', { name: '리뷰' }).click();
    
    // 리뷰가 로드될 때까지 대기
    await page.waitForTimeout(2000);
    
    // 리뷰 요소 확인
    const reviewButtons = frame.getByRole('button').filter({ hasText: /리뷰/ });
    const count = await reviewButtons.count();
    
    expect(count).toBeGreaterThan(0);
    console.log(`발견된 리뷰 버튼: ${count}개`);
  });

  test('리뷰 데이터 추출', async () => {
    const page = scraper.page;
    
    // 네이버맵 접속 및 검색
    await page.goto('https://map.naver.com/p?c=15.00,0,0,0,dh', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // 검색창 클릭
    const searchBox = page.getByRole('combobox', { name: '네이버지도 검색' });
    await searchBox.waitFor({ state: 'visible', timeout: 10000 });
    await searchBox.click();
    await page.waitForTimeout(500);
    
    const searchInput = page.getByRole('combobox', { name: '장소, 버스, 지하철, 주소 검색' });
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    await searchInput.fill('동해보양온천컨벤션호텔');
    await page.waitForTimeout(1000);
    await searchInput.press('Enter');
    await page.waitForTimeout(2000);
    
    // 검색 결과 선택
    try {
      await page.getByRole('option', { name: /동해보양온천컨벤션호텔/ }).first().click({ timeout: 10000 });
    } catch (e) {
      // 검색 결과가 자동으로 선택되었을 수 있음
      console.log('검색 결과 자동 선택됨 또는 다른 방식으로 접근 필요');
    }
    await page.waitForTimeout(3000);
    
    // iframe 및 리뷰 탭
    const iframe = page.locator('iframe[title="Naver Place Entry"]');
    await iframe.waitFor({ state: 'attached' });
    const frame = await iframe.contentFrame();
    await frame.getByRole('tab', { name: '리뷰' }).click();
    await page.waitForTimeout(3000);
    
    // 리뷰 데이터 추출
    const reviews = await frame.evaluate(() => {
      const results = [];
      
      // 리뷰 컨테이너 찾기 (실제 구조에 맞게 수정 필요)
      const reviewElements = document.querySelectorAll('[class*="review"], [class*="Review"], [data-testid*="review"]');
      
      reviewElements.forEach((el, index) => {
        try {
          // 리뷰 내용
          const contentEl = el.querySelector('[class*="text"], [class*="content"], [class*="comment"]');
          const content = contentEl ? contentEl.textContent.trim() : '';
          
          // 평점 (별점)
          const ratingEl = el.querySelector('[class*="star"], [class*="rating"], [aria-label*="별점"]');
          let rating = 0;
          if (ratingEl) {
            const ratingText = ratingEl.getAttribute('aria-label') || ratingEl.textContent || '';
            const match = ratingText.match(/(\d+\.?\d*)/);
            if (match) rating = parseFloat(match[1]);
          }
          
          // 닉네임
          const nicknameEl = el.querySelector('[class*="name"], [class*="user"], [class*="author"]');
          const nickname = nicknameEl ? nicknameEl.textContent.trim() : `사용자${index + 1}`;
          
          // 날짜
          const dateEl = el.querySelector('[class*="date"], [class*="time"]');
          let date = new Date().toISOString().split('T')[0];
          if (dateEl) {
            const dateText = dateEl.textContent.trim();
            const dateMatch = dateText.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
            if (dateMatch) {
              date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
            }
          }
          
          // 방문 키워드 (예: "혼자", "연인", "가족")
          const visitTypeEl = el.querySelector('[class*="visit"], [class*="type"]');
          const visitType = visitTypeEl ? visitTypeEl.textContent.trim() : null;
          
          // 리뷰 키워드 (예: "침구가 좋아요", "깨끗해요")
          const keywordEls = el.querySelectorAll('[class*="keyword"], [class*="tag"]');
          const keywords = Array.from(keywordEls).map(el => el.textContent.trim()).filter(Boolean);
          
          if (content || rating > 0) {
            results.push({
              content,
              rating,
              nickname,
              date,
              visitType,
              keywords: keywords.length > 0 ? keywords.join(', ') : null,
            });
          }
        } catch (err) {
          console.error(`리뷰 ${index} 파싱 오류:`, err);
        }
      });
      
      return results;
    });
    
    console.log(`추출된 리뷰: ${reviews.length}개`);
    if (reviews.length > 0) {
      console.log('첫 번째 리뷰 샘플:', JSON.stringify(reviews[0], null, 2));
    }
    
    expect(reviews.length).toBeGreaterThan(0);
  });
});
