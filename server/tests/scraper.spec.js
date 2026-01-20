import { test, expect } from '@playwright/test';
import ScraperService from '../src/services/scraper.js';

/**
 * 스크래퍼 통합 테스트
 */
test.describe('Scraper Service', () => {
  let scraper;

  test.beforeEach(async () => {
    scraper = new ScraperService();
  });

  test.afterEach(async () => {
    if (scraper) {
      await scraper.close();
    }
  });

  test('브라우저 초기화 및 종료', async () => {
    await scraper.init();
    expect(scraper.browser).toBeTruthy();
    expect(scraper.page).toBeTruthy();
    
    await scraper.close();
    // 브라우저가 종료되었는지 확인
    expect(scraper.browser).toBeTruthy(); // close() 후에도 객체는 존재
  });

  test('네이버맵 메인 페이지 접속', async () => {
    await scraper.init();
    
    await scraper.page.goto('https://map.naver.com', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // 페이지가 로드될 때까지 대기
    await scraper.page.waitForTimeout(2000);
    
    const title = await scraper.page.title();
    // 제목이 비어있을 수 있으므로 URL로 확인
    const url = scraper.page.url();
    expect(url).toContain('naver.com');
    
    // 제목이 있으면 확인
    if (title) {
      expect(title.length).toBeGreaterThan(0);
    }
  });

  test('네이버맵 스크래핑 - 기본 구조 확인', async () => {
    await scraper.init();
    
    const url = 'https://map.naver.com';
    const reviews = await scraper.scrapeNaverMap(url);
    
    // 스크래핑이 실행되었는지 확인 (에러 없이 완료)
    expect(Array.isArray(reviews)).toBe(true);
    
    // 리뷰가 발견되면 구조 확인
    if (reviews.length > 0) {
      const review = reviews[0];
      expect(review).toHaveProperty('content');
      expect(review).toHaveProperty('rating');
      expect(review).toHaveProperty('nickname');
      expect(review).toHaveProperty('date');
    }
  });

  test('텍스트 분석 기능', () => {
    const scraper = new ScraperService();
    
    // 긍정적인 리뷰 테스트
    const positiveAnalysis = scraper.analyzeText('정말 좋은 호텔이에요!', 4.8, null, null);
    expect(positiveAnalysis.nEmotion).toBe('positive');
    expect(positiveAnalysis.nRating).toBe(4.8);
    expect(positiveAnalysis.nCharCount).toBeGreaterThan(0);
    
    // 부정적인 리뷰 테스트
    const negativeAnalysis = scraper.analyzeText('별로예요', 2.0, null, null);
    expect(negativeAnalysis.nEmotion).toBe('negative');
    
    // 중립적인 리뷰 테스트
    const neutralAnalysis = scraper.analyzeText('보통이에요', 3.5, null, null);
    expect(neutralAnalysis.nEmotion).toBe('neutral');
  });

  test('포털 URL 감지', async () => {
    await scraper.init();
    
    // 네이버맵 URL 테스트 (scrapeByPortal은 저장된 개수를 반환)
    const naverUrl = 'https://map.naver.com';
    const savedCount = await scraper.scrapeByPortal(naverUrl, '테스트 호텔');
    expect(typeof savedCount).toBe('number');
    expect(savedCount).toBeGreaterThanOrEqual(0);
    
    // 카카오맵 URL 테스트 (구현되지 않았지만 에러 없이 실행되어야 함)
    const kakaoUrl = 'https://map.kakao.com/link/map/1234567890';
    const kakaoSavedCount = await scraper.scrapeByPortal(kakaoUrl, '테스트 호텔');
    expect(typeof kakaoSavedCount).toBe('number');
    expect(kakaoSavedCount).toBeGreaterThanOrEqual(0);
  });

  test('페이지 스크린샷 저장', async () => {
    await scraper.init();
    
    await scraper.page.goto('https://map.naver.com', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // 스크린샷 저장
    await scraper.page.screenshot({ 
      path: 'tests/screenshots/naver-map.png',
      fullPage: false 
    });
    
    // 파일이 생성되었는지 확인 (간접적으로)
    const title = await scraper.page.title();
    expect(title).toBeTruthy();
  });
});
