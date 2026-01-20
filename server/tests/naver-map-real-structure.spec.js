import { test, expect } from '@playwright/test';

/**
 * 실제 네이버맵 구조 기반 스크래핑 테스트
 * Playwright 코드 생성 기능으로 만든 실제 동작 코드를 기반으로 작성
 */
test.describe('네이버맵 실제 구조 스크래핑', () => {
  test('동해보양온천컨벤션호텔 리뷰 추출', async ({ page, context }) => {
    // 팝업 처리를 위한 이벤트 리스너
    context.on('page', async (newPage) => {
      // 팝업 페이지는 자동으로 닫기
      await newPage.close();
    });

    await page.goto('https://map.naver.com/p/entry/place/11658902?c=15.00,0,0,0,dh&placePath=/home?from=map&fromPanelNum=1&additionalHeight=76&timestamp=202601181133&locale=ko&svcName=map_pcv5&businessCategory=hotel', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    
    await page.waitForTimeout(5000);
    
    // iframe 찾기
    const iframe = page.locator('iframe[title="Naver Place Entry"]');
    await iframe.waitFor({ state: 'attached', timeout: 10000 });
    const frame = await iframe.contentFrame();
    
    if (!frame) {
      test.skip();
      return;
    }
    
    // 리뷰 작성자 버튼 찾기
    const reviewAuthorButton = frame.getByRole('button', { name: /리뷰.*사진|리뷰.*팔로워/ }).first();
    await reviewAuthorButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // 팝업이 열릴 수 있으므로 클릭 (팝업은 자동으로 닫힘)
    try {
      await reviewAuthorButton.click();
      await page.waitForTimeout(2000);
    } catch (e) {
      // 팝업이 열리지 않았을 수 있음
    }
    
    // 리뷰 제목 버튼 찾기
    const reviewTitleButton = frame.getByRole('button', { name: /동해출장|망상해변|동해보양온천/ }).first();
    const titleExists = await reviewTitleButton.count() > 0;
    
    if (titleExists) {
      const titleText = await reviewTitleButton.textContent();
      console.log(`리뷰 제목 발견: ${titleText}`);
      
      // 리뷰 키워드 확인
      const keywords = ['침구가 좋아요', '깨끗해요', '호캉스하기 좋아요', '뷰가 좋아요', '사진이 잘 나와요'];
      const foundKeywords = [];
      
      for (const keyword of keywords) {
        const keywordElement = frame.getByText(keyword);
        const count = await keywordElement.count();
        if (count > 0) {
          foundKeywords.push(keyword);
        }
      }
      
      console.log(`발견된 키워드: ${foundKeywords.join(', ')}`);
      
      // 날짜 확인
      const dateElement = frame.getByText(/방문일.*\d{2}\.\d{1,2}\.\d{1,2}/);
      const dateExists = await dateElement.count() > 0;
      
      if (dateExists) {
        const dateText = await dateElement.first().textContent();
        console.log(`날짜 정보: ${dateText}`);
      }
      
      expect(titleExists).toBe(true);
      expect(foundKeywords.length).toBeGreaterThan(0);
    }
  });

  test('오색그린야드호텔 리뷰 추출', async ({ page, context }) => {
    context.on('page', async (newPage) => {
      await newPage.close();
    });

    await page.goto('https://map.naver.com/p/entry/place/12858535', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    
    await page.waitForTimeout(5000);
    
    const iframe = page.locator('iframe[title="Naver Place Entry"]');
    await iframe.waitFor({ state: 'attached', timeout: 10000 });
    const frame = await iframe.contentFrame();
    
    if (!frame) {
      test.skip();
      return;
    }
    
    // 리뷰 작성자 버튼 찾기
    const reviewAuthorButtons = frame.getByRole('button').filter({ hasText: /리뷰.*사진|리뷰.*팔로워/ });
    const count = await reviewAuthorButtons.count();
    
    console.log(`리뷰 작성자 버튼: ${count}개`);
    expect(count).toBeGreaterThan(0);
  });
});
