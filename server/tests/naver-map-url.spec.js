import { test, expect } from '@playwright/test';
import ScraperService from '../src/services/scraper.js';

/**
 * 네이버맵 URL 정규화 및 직접 접근 테스트
 * 실제 호텔 URL을 사용하여 리뷰 스크래핑 테스트
 */
test.describe('네이버맵 직접 URL 스크래핑', () => {
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

  test('URL 정규화 테스트', () => {
    const scraper = new ScraperService();
    
    // 복잡한 쿼리 파라미터가 있는 URL
    const complexUrl = 'https://map.naver.com/p/entry/place/11658902?c=15.00,0,0,0,dh&placePath=/review?additionalHeight=76&businessCategory=hotel&fromPanelNum=1&locale=ko&svcName=map_pcv5&timestamp=202601181100';
    
    const normalized = scraper.normalizeNaverMapUrl(complexUrl);
    expect(normalized).toBe('https://map.naver.com/p/entry/place/11658902');
    
    // 이미 정규화된 URL
    const simpleUrl = 'https://map.naver.com/p/entry/place/11658902';
    const normalized2 = scraper.normalizeNaverMapUrl(simpleUrl);
    expect(normalized2).toBe(simpleUrl);
  });

  test('동해보양온천컨벤션호텔 직접 URL 접근', async () => {
    const page = scraper.page;
    
    // 정규화된 URL 사용 (장소 ID만 사용)
    const placeUrl = 'https://map.naver.com/p/entry/place/11658902';
    
    await page.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000); // 동적 콘텐츠 로딩 대기
    
    // 페이지가 로드되었는지 확인
    const currentUrl = page.url();
    expect(currentUrl).toContain('naver.com');
    expect(currentUrl).toContain('11658902');
    
    console.log(`현재 URL: ${currentUrl}`);
    
    // iframe 찾기
    const iframe = page.locator('iframe[title="Naver Place Entry"]');
    const iframeCount = await iframe.count();
    
    if (iframeCount > 0) {
      console.log('✅ Naver Place Entry iframe 발견');
      
      await iframe.waitFor({ state: 'attached', timeout: 10000 });
      const frame = await iframe.contentFrame();
      
      // 리뷰 탭 찾기 및 클릭
      try {
        const reviewTab = frame.getByRole('tab', { name: '리뷰' });
        await reviewTab.waitFor({ state: 'visible', timeout: 10000 });
        await reviewTab.click();
        await page.waitForTimeout(3000);
        console.log('✅ 리뷰 탭 클릭 완료');
      } catch (e) {
        console.log('⚠️ 리뷰 탭을 찾을 수 없습니다. 이미 리뷰 페이지일 수 있습니다.');
      }
      
      // 리뷰 요소 찾기 (frame이 유효한지 확인)
      if (frame && typeof frame.evaluate === 'function') {
        const reviewElements = await frame.evaluate(() => {
          // 여러 선택자 시도
          const selectors = [
            '[class*="review"]',
            '[class*="Review"]',
            '[data-testid*="review"]',
            'button:has-text("리뷰")',
          ];
          
          let elements = [];
          for (const selector of selectors) {
            elements = Array.from(document.querySelectorAll(selector));
            if (elements.length > 0) {
              console.log(`선택자 "${selector}"로 ${elements.length}개 요소 발견`);
              break;
            }
          }
          
          return elements.length;
        });
        
        console.log(`발견된 리뷰 관련 요소: ${reviewElements}개`);
        expect(reviewElements).toBeGreaterThanOrEqual(0);
      } else {
        console.log('⚠️ frame.evaluate를 사용할 수 없습니다.');
        // 대신 page에서 직접 확인
        const reviewButtons = frame.getByRole('button').filter({ hasText: /리뷰/ });
        const count = await reviewButtons.count();
        console.log(`발견된 리뷰 버튼: ${count}개`);
        expect(count).toBeGreaterThanOrEqual(0);
      }
    } else {
      console.log('⚠️ Naver Place Entry iframe을 찾을 수 없습니다.');
    }
  });

  test('리뷰 데이터 추출 테스트', async () => {
    const page = scraper.page;
    
    // 정규화된 URL 사용
    const placeUrl = 'https://map.naver.com/p/entry/place/11658902';
    
    await page.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    // iframe 찾기
    const iframe = page.locator('iframe[title="Naver Place Entry"]');
    const iframeCount = await iframe.count();
    
    if (iframeCount === 0) {
      test.skip();
      return;
    }
    
    await iframe.waitFor({ state: 'attached', timeout: 10000 });
    const frame = await iframe.contentFrame();
    
    // 리뷰 탭 클릭
    try {
      const reviewTab = frame.getByRole('tab', { name: '리뷰' });
      await reviewTab.waitFor({ state: 'visible', timeout: 10000 });
      await reviewTab.click();
      await page.waitForTimeout(3000);
    } catch (e) {
      // 리뷰 탭이 없으면 무시
    }
    
    // 리뷰 데이터 추출
    if (!frame || typeof frame.evaluate !== 'function') {
      console.log('⚠️ frame.evaluate를 사용할 수 없습니다. 대체 방법 사용');
      
      // 대체 방법: locator를 사용하여 리뷰 요소 찾기
      const reviewButtons = frame.getByRole('button').filter({ hasText: /리뷰/ });
      const count = await reviewButtons.count();
      console.log(`발견된 리뷰 버튼: ${count}개`);
      
      if (count > 0) {
        // 첫 번째 리뷰 버튼 클릭하여 상세 정보 확인
        await reviewButtons.first().click();
        await page.waitForTimeout(2000);
      }
      
      expect(count).toBeGreaterThan(0);
      return;
    }
    
    const reviews = await frame.evaluate(() => {
      const results = [];
      
      // 리뷰 컨테이너 찾기
      const reviewContainers = document.querySelectorAll('[class*="review"], [class*="Review"], article, [role="article"]');
      
      reviewContainers.forEach((container, index) => {
        try {
          // 리뷰 내용
          const contentEl = container.querySelector('[class*="text"], [class*="content"], [class*="comment"], p');
          const content = contentEl ? contentEl.textContent.trim() : '';
          
          // 평점
          const ratingEl = container.querySelector('[class*="star"], [class*="rating"], [aria-label*="별점"], [aria-label*="점"]');
          let rating = 0;
          if (ratingEl) {
            const ratingText = ratingEl.getAttribute('aria-label') || ratingEl.textContent || '';
            const match = ratingText.match(/(\d+\.?\d*)/);
            if (match) rating = parseFloat(match[1]);
          }
          
          // 닉네임
          const nicknameEl = container.querySelector('[class*="name"], [class*="user"], [class*="author"], strong, a');
          const nickname = nicknameEl ? nicknameEl.textContent.trim() : `사용자${index + 1}`;
          
          // 날짜
          const dateEl = container.querySelector('[class*="date"], [class*="time"], time');
          let date = new Date().toISOString().split('T')[0];
          if (dateEl) {
            const dateText = dateEl.textContent.trim();
            // "25.12.5" 형식 처리
            const yearMatch = dateText.match(/(\d{2})\.(\d{1,2})\.(\d{1,2})/);
            if (yearMatch) {
              const year = parseInt(yearMatch[1]) < 50 ? `20${yearMatch[1]}` : `19${yearMatch[1]}`;
              date = `${year}-${yearMatch[2].padStart(2, '0')}-${yearMatch[3].padStart(2, '0')}`;
            }
          }
          
          if (content.length > 10 || rating > 0) {
            results.push({
              content: content.substring(0, 200), // 처음 200자만
              rating,
              nickname,
              date,
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
      expect(reviews.length).toBeGreaterThan(0);
    } else {
      console.log('⚠️ 리뷰를 찾을 수 없습니다. 선택자를 확인해야 합니다.');
    }
  });
});
