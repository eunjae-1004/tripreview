import { chromium } from 'playwright';
import { pool } from '../db/connection.js';

/**
 * 텍스트를 한국어로 번역하는 함수
 * @param {string} text - 번역할 텍스트
 * @returns {Promise<string>} 번역된 텍스트
 */
async function translateToKorean(text) {
  if (!text || text.trim().length === 0) {
    return text;
  }
  
  // 이미 한국어가 포함되어 있으면 번역하지 않음
  if (/[가-힣]/.test(text)) {
    return text;
  }
  
  // Google Translate API를 사용한 번역
  // 환경 변수에 GOOGLE_TRANSLATE_API_KEY가 있으면 사용
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    // API 키가 없으면 원문 반환
    return text;
  }
  
  try {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: text,
        target: 'ko',
        source: 'en',
      }),
    });
    
    const data = await response.json();
    if (data.data && data.data.translations && data.data.translations.length > 0) {
      return data.data.translations[0].translatedText;
    }
  } catch (error) {
    console.error('번역 실패:', error.message);
  }
  
  // 번역 실패 시 원문 반환
  return text;
}

/**
 * 스크래핑 서비스 클래스
 * 각 포털 사이트에서 리뷰 데이터를 수집합니다.
 */
class ScraperService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * 브라우저 초기화
   */
  async init() {
    const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
    this.browser = await chromium.launch({
      headless: true,
      ...(browserPath && { executablePath: browserPath }),
    });
    
    // User-Agent 및 브라우저 컨텍스트 설정 (봇 차단 방지 및 일관된 결과)
    // 참고: launchPersistentContext를 사용하면 프로필을 저장할 수 있지만, 현재는 일반 launch 사용
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      locale: 'ko-KR', // 한국어 설정
      timezoneId: 'Asia/Seoul', // 한국 시간대
      viewport: { width: 1280, height: 800 }, // 일관된 뷰포트 크기 (사용자 예제 참고)
      extraHTTPHeaders: {
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7', // 한국어 우선
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });
    
    this.page = await context.newPage();
    
    // 추가 헤더 설정 (봇 감지 방지)
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    });
  }

  /**
   * 브라우저 종료
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * 리뷰 데이터 저장
   */
  async saveReview(reviewData) {
    const {
      portalUrl,
      companyName,
      reviewDate,
      content,
      rating,
      nickname,
      visitKeyword,
      reviewKeyword,
      visitType,
      emotion,
      revisitFlag,
      nRating,
      nEmotion,
      nCharCount,
      title,
      additionalInfo,
    } = reviewData;

    try {
      // reviewDate 안전 변환
      // - Date 객체라도 Invalid Date면 toISOString()이 터지므로 검증 필요
      // - 문자열도 YYYY-MM-DD 형태인지 검증
      let reviewDateStr = null;

      const isValidDateObj = (d) => d instanceof Date && !Number.isNaN(d.getTime());
      const normalizeDateStr = (s) => {
        if (!s) return null;
        const t = String(s).trim();
        if (!t) return null;
        // 허용: YYYY-MM-DD
        const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const dt = new Date(t);
        if (Number.isNaN(dt.getTime())) return null;
        return t;
      };

      if (isValidDateObj(reviewDate)) {
        reviewDateStr = reviewDate.toISOString().split('T')[0];
      } else if (typeof reviewDate === 'string') {
        reviewDateStr = normalizeDateStr(reviewDate);
      } else if (reviewDate !== null && reviewDate !== undefined) {
        // 숫자 타임스탬프 등 들어오는 경우 방어
        const dt = new Date(reviewDate);
        if (!Number.isNaN(dt.getTime())) {
          reviewDateStr = dt.toISOString().split('T')[0];
        }
      }

      // 날짜가 유효하지 않으면 저장 스킵 (안정성)
      if (!reviewDateStr) {
        console.log(
          `⚠️ 리뷰 저장 스킵: 유효하지 않은 reviewDate (portal="${portalUrl}", company="${companyName}", nickname="${nickname}", reviewDate="${reviewDate}")`
        );
        return false;
      }

      // rating 값 검증 및 제한 (NUMERIC(3,2)는 최대 9.99까지만 허용)
      let safeRating = rating;
      if (safeRating !== null && safeRating !== undefined) {
        safeRating = parseFloat(safeRating);
        if (isNaN(safeRating) || safeRating < 0) {
          safeRating = null;
        } else if (safeRating >= 10) {
          safeRating = 9.99; // NUMERIC(3,2) 제한에 맞춤
        } else if (safeRating > 9.99) {
          safeRating = 9.99;
        }
      }

      // nRating 값도 검증 및 제한
      let safeNRating = nRating;
      if (safeNRating !== null && safeNRating !== undefined) {
        safeNRating = parseFloat(safeNRating);
        if (isNaN(safeNRating) || safeNRating < 0) {
          safeNRating = null;
        } else if (safeNRating >= 10) {
          safeNRating = 9.99; // NUMERIC(3,2) 제한에 맞춤
        } else if (safeNRating > 9.99) {
          safeNRating = 9.99;
        }
      }

      const result = await pool.query(
        `INSERT INTO reviews (
          portal_url, company_name, review_date, content, rating, nickname,
          visit_keyword, review_keyword, visit_type, emotion, revisit_flag,
          n_rating, n_emotion, n_char_count, title, additional_info
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (company_name, review_date, nickname, portal_url) DO NOTHING`,
        [
          portalUrl,
          companyName,
          reviewDateStr,
          content,
          safeRating,
          nickname,
          visitKeyword,
          reviewKeyword,
          visitType,
          emotion,
          revisitFlag || false,
          safeNRating,
          nEmotion,
          nCharCount,
          title || null,
          additionalInfo || null,
        ]
      );
      // rowCount가 1이면 새로 삽입됨, 0이면 중복으로 인해 삽입되지 않음
      if (result.rowCount === 0) {
        // 중복 확인을 위해 실제 DB에서 확인
        const checkResult = await pool.query(
          `SELECT id FROM reviews 
           WHERE company_name = $1 AND review_date = $2 AND nickname = $3 AND portal_url = $4`,
          [companyName, reviewDateStr, nickname, portalUrl]
        );
        if (checkResult.rows.length > 0) {
          // 실제로 중복인 경우
          console.log(`[디버깅] 중복 확인: DB에 이미 존재하는 리뷰 (ID: ${checkResult.rows[0].id})`);
          return false;
        } else {
          // 중복이 아닌데 저장이 안 된 경우 (다른 문제)
          console.error('⚠️ 리뷰 저장 실패: 중복이 아닌데 저장되지 않음');
          console.error('  저장 시도 데이터:', {
            portalUrl,
            companyName,
            reviewDate: reviewDateStr,
            nickname,
            contentLength: content?.length || 0,
          });
          // 실제 INSERT를 다시 시도해보기 (에러 확인)
          try {
            const retryResult = await pool.query(
              `INSERT INTO reviews (
                portal_url, company_name, review_date, content, rating, nickname,
                visit_keyword, review_keyword, visit_type, emotion, revisit_flag,
                n_rating, n_emotion, n_char_count
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [
                portalUrl,
                companyName,
                reviewDateStr,
                content,
                rating || null,
                nickname,
                visitKeyword,
                reviewKeyword,
                visitType,
                emotion,
                revisitFlag || false,
                nRating,
                nEmotion,
                nCharCount,
              ]
            );
            console.log('  재시도 결과:', retryResult.rowCount > 0 ? '성공' : '실패');
            return retryResult.rowCount > 0;
          } catch (retryError) {
            console.error('  재시도 에러:', retryError.message);
            return false;
          }
        }
      }
      return result.rowCount > 0;
    } catch (error) {
      console.error('리뷰 저장 실패:', error);
      console.error('저장 시도한 데이터:', { 
        portalUrl, 
        companyName, 
        reviewDate: reviewDate instanceof Date ? reviewDate.toISOString().split('T')[0] : reviewDate,
        nickname, 
        content: content?.substring(0, 50),
        errorMessage: error.message,
        errorStack: error.stack
      });
      return false;
    }
  }

  /**
   * 기업 정보 저장
   */
  async saveCompany(companyData) {
    const { 
      companyName, 
      type, 
      isMember, 
      address, 
      email, 
      phone, 
      manager,
      naverUrl,
      kakaoUrl,
      yanoljaUrl,
      goodchoiceUrl,
      googleUrl,
      tripadvisorUrl,
      agodaUrl
    } = companyData;

    try {
      await pool.query(
        `INSERT INTO companies (
          company_name, type, is_member, address, email, phone, manager,
          naver_url, kakao_url, yanolja_url, goodchoice_url, google_url, tripadvisor_url, agoda_url
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (company_name) DO UPDATE SET
           naver_url = COALESCE(EXCLUDED.naver_url, companies.naver_url),
           kakao_url = COALESCE(EXCLUDED.kakao_url, companies.kakao_url),
           yanolja_url = COALESCE(EXCLUDED.yanolja_url, companies.yanolja_url),
           goodchoice_url = COALESCE(EXCLUDED.goodchoice_url, companies.goodchoice_url),
           google_url = COALESCE(EXCLUDED.google_url, companies.google_url),
           tripadvisor_url = COALESCE(EXCLUDED.tripadvisor_url, companies.tripadvisor_url),
           agoda_url = COALESCE(EXCLUDED.agoda_url, companies.agoda_url),
           updated_at = CURRENT_TIMESTAMP`,
        [
          companyName, 
          type, 
          isMember, 
          address, 
          email, 
          phone, 
          manager,
          naverUrl || null,
          kakaoUrl || null,
          yanoljaUrl || null,
          goodchoiceUrl || null,
          googleUrl || null,
          tripadvisorUrl || null,
          agodaUrl || null
        ]
      );
      return true;
    } catch (error) {
      console.error('기업 정보 저장 실패:', error);
      return false;
    }
  }

  /**
   * 텍스트 분석 (간단한 버전)
   * 실제로는 AI API를 사용하거나 더 복잡한 분석 로직이 필요합니다.
   */
  analyzeText(content, rating, visitKeyword, reviewKeyword) {
    // 간단한 분석 로직 (실제로는 더 정교한 분석 필요)
    const charCount = content ? content.length : 0;
    
    // 평점 기반 감정 분석 (간단 버전)
    let emotion = 'neutral';
    if (rating >= 4.5) emotion = 'positive';
    else if (rating <= 2.5) emotion = 'negative';
    
    return {
      nRating: rating || 0,
      nEmotion: emotion,
      nCharCount: charCount,
    };
  }

  /**
   * 네이버맵 URL 정규화
   * 쿼리 파라미터를 제거하고 기본 URL만 사용
   */
  normalizeNaverMapUrl(url) {
    try {
      const urlObj = new URL(url);
      // 장소 ID 추출
      const placeIdMatch = urlObj.pathname.match(/\/place\/(\d+)/);
      if (placeIdMatch) {
        const placeId = placeIdMatch[1];
        // 기본 URL만 반환 (쿼리 파라미터 제거)
        return `https://map.naver.com/p/entry/place/${placeId}`;
      }
      return url;
    } catch (e) {
      return url;
    }
  }

  /**
   * 네이버맵 스크래핑 (기업명으로 검색)
   * @param {string} companyName - 기업명 (검색어로 사용)
   * @param {string} dateFilter - 'all' (전체) 또는 'week' (일주일 간격)
   */
  async scrapeNaverMap(companyName, dateFilter = 'week', jobId = null, portalType = 'naver', saveImmediately = false) {
    let actualSavedCount = 0; // 실제 저장 성공 개수 추적
    try {
      console.log(`네이버맵 스크래핑 시작: "${companyName}" 검색 (필터: ${dateFilter}, 즉시 저장: ${saveImmediately ? '활성화' : '비활성화'})`);
      
      // 네이버 검색 페이지로 이동
      const searchUrl = `https://search.naver.com/search.naver?&query=${encodeURIComponent(companyName)}`;
      console.log(`네이버 검색 페이지로 이동: ${searchUrl}`);
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page.waitForTimeout(5000); // 검색 결과 로딩 대기
      
      // 더보기 버튼 클릭하여 네이버맵 페이지로 이동
      console.log('더보기 버튼 찾는 중...');
      const moreButtonSelector = '#place-main-section-root > section:nth-child(1) > div > div:nth-child(5) > a';
      const moreButton = this.page.locator(moreButtonSelector);
      
      try {
        await moreButton.waitFor({ state: 'visible', timeout: 10000 });
        const buttonHref = await moreButton.getAttribute('href').catch(() => null);
        
        if (buttonHref) {
          // 상대 경로인 경우 절대 경로로 변환
          let naverMapUrl = buttonHref;
          if (buttonHref.startsWith('/')) {
            naverMapUrl = `https://map.naver.com${buttonHref}`;
          } else if (!buttonHref.startsWith('http')) {
            naverMapUrl = `https://map.naver.com/${buttonHref}`;
          }
          
          console.log(`더보기 버튼 클릭하여 네이버맵 페이지로 이동: ${naverMapUrl}`);
          await moreButton.click({ timeout: 5000 });
          await this.page.waitForTimeout(3000); // 페이지 이동 대기
          
          // URL이 변경되었는지 확인
          const currentUrl = this.page.url();
          if (!currentUrl.includes('map.naver.com')) {
            // 클릭으로 이동하지 않은 경우 직접 이동
            console.log(`클릭으로 이동하지 않아 직접 이동: ${naverMapUrl}`);
            await this.page.goto(naverMapUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await this.page.waitForTimeout(5000);
          } else {
            console.log(`네이버맵 페이지로 이동 완료: ${currentUrl}`);
          }
        } else {
          console.log('⚠️ 더보기 버튼의 href를 찾을 수 없습니다. 검색 결과에서 네이버맵 링크를 찾는 중...');
          // 대체 방법: 검색 결과에서 네이버맵 링크 찾기
          const mapLink = await this.page.locator('a[href*="map.naver.com"]').first();
          const mapLinkCount = await mapLink.count();
          if (mapLinkCount > 0) {
            const mapUrl = await mapLink.getAttribute('href');
            if (mapUrl) {
              let naverMapUrl = mapUrl;
              if (mapUrl.startsWith('/')) {
                naverMapUrl = `https://map.naver.com${mapUrl}`;
              } else if (!mapUrl.startsWith('http')) {
                naverMapUrl = `https://map.naver.com/${mapUrl}`;
              }
              console.log(`네이버맵 링크 발견, 이동: ${naverMapUrl}`);
              await this.page.goto(naverMapUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
              await this.page.waitForTimeout(5000);
            }
          } else {
            console.log('⚠️ 네이버맵 링크를 찾을 수 없습니다. 이 기업의 스크래핑을 건너뜁니다.');
            return [];
          }
        }
      } catch (e) {
        console.log(`⚠️ 더보기 버튼을 찾을 수 없습니다: ${e.message}`);
        console.log('⚠️ 검색 결과에서 네이버맵 링크를 찾는 중...');
        // 대체 방법: 검색 결과에서 네이버맵 링크 찾기
        const mapLink = await this.page.locator('a[href*="map.naver.com"]').first();
        const mapLinkCount = await mapLink.count();
        if (mapLinkCount > 0) {
          const mapUrl = await mapLink.getAttribute('href');
          if (mapUrl) {
            let naverMapUrl = mapUrl;
            if (mapUrl.startsWith('/')) {
              naverMapUrl = `https://map.naver.com${mapUrl}`;
            } else if (!mapUrl.startsWith('http')) {
              naverMapUrl = `https://map.naver.com/${mapUrl}`;
            }
            console.log(`네이버맵 링크 발견, 이동: ${naverMapUrl}`);
            await this.page.goto(naverMapUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await this.page.waitForTimeout(5000);
          } else {
            console.log('⚠️ 네이버맵 링크를 찾을 수 없습니다. 이 기업의 스크래핑을 건너뜁니다.');
            return [];
          }
        } else {
          console.log('⚠️ 네이버맵 링크를 찾을 수 없습니다. 이 기업의 스크래핑을 건너뜁니다.');
          return [];
        }
      }
      
      // 네이버맵 페이지 로딩 대기
      await this.page.waitForTimeout(3000);

      // iframe 찾기 (네이버맵은 iframe을 사용)
      let frame = this.page;
      const iframeLocator = this.page.locator('iframe[title="Naver Place Entry"]');
      
      try {
        await iframeLocator.waitFor({ state: 'attached', timeout: 5000 });
        frame = await iframeLocator.contentFrame();
        
        // 리뷰 탭 클릭 (있는 경우)
        try {
          await frame.getByRole('tab', { name: '리뷰' }).click({ timeout: 3000 });
          await this.page.waitForTimeout(2000);
        } catch (e) {
          // 리뷰 탭이 없으면 무시 (이미 리뷰 페이지일 수 있음)
          console.log('리뷰 탭을 찾을 수 없습니다. 현재 페이지에서 진행합니다.');
        }
        
        // 최신순 정렬 클릭
        try {
          console.log('최신순 정렬 버튼 찾는 중...');
          const latestSortButton = frame.locator('a.place_btn_option:has-text("최신순")');
          const sortButtonCount = await latestSortButton.count();
          if (sortButtonCount > 0) {
            const isVisible = await latestSortButton.isVisible().catch(() => false);
            if (isVisible) {
              await latestSortButton.scrollIntoViewIfNeeded();
              await this.page.waitForTimeout(500);
              await latestSortButton.click({ timeout: 5000 });
              await this.page.waitForTimeout(2000); // 정렬 후 리스트 새로고침 대기
              console.log('✅ 최신순 정렬 적용 완료');
            }
          } else {
            console.log('⚠️ 최신순 정렬 버튼을 찾을 수 없습니다.');
          }
        } catch (e) {
          console.log(`⚠️ 최신순 정렬 실패: ${e.message}`);
        }
      } catch (e) {
        // iframe이 없으면 메인 페이지에서 진행
        console.log('iframe을 찾을 수 없습니다. 메인 페이지에서 진행합니다.');
        frame = this.page;
      }

      // 네이버맵 리뷰 섹션 찾기
      // 여러 가능한 선택자 시도
      let reviews = [];
      
      // frame이 유효한지 확인
      if (frame && typeof frame.evaluate === 'function') {
        reviews = await frame.evaluate(() => {
        const results = [];
        
        // 네이버맵 리뷰 선택자 (실제 구조에 맞게 수정 필요)
        // 일반적인 네이버맵 리뷰 구조
        const selectors = [
          '.list_evaluation li', // 리뷰 리스트
          '.review_item', 
          '[class*="review"]',
          '[class*="Review"]',
          '.comment_list li',
        ];

        let reviewElements = [];
        for (const selector of selectors) {
          reviewElements = document.querySelectorAll(selector);
          if (reviewElements.length > 0) {
            console.log(`선택자 "${selector}"로 ${reviewElements.length}개 요소 발견`);
            break;
          }
        }

        // 리뷰 데이터 추출
        reviewElements.forEach((el, index) => {
          try {
            // 평점 찾기 (aria-label에서 별점 정보 추출)
            const ratingEl = el.querySelector('[class*="star"], [class*="rating"], [aria-label*="별점"], [aria-label*="점"]');
            let rating = 0;
            if (ratingEl) {
              const ratingText = ratingEl.getAttribute('aria-label') || ratingEl.textContent || '';
              const match = ratingText.match(/(\d+\.?\d*)/);
              if (match) rating = parseFloat(match[1]);
            }

            // 리뷰 내용 찾기
            const contentEl = el.querySelector('[class*="comment"], [class*="text"], [class*="content"], .review_text, .content, [data-testid*="review-text"]');
            const content = contentEl ? contentEl.textContent.trim() : '';

            // 닉네임 찾기
            const nicknameEl = el.querySelector('[class*="name"], [class*="user"], [class*="author"], .nickname, [data-testid*="user-name"]');
            const nickname = nicknameEl ? nicknameEl.textContent.trim() : `사용자${index + 1}`;

            // 날짜 찾기
            const dateEl = el.querySelector('[class*="date"], [class*="time"], .date, .time, [data-testid*="date"]');
            let date = new Date().toISOString().split('T')[0];
            if (dateEl) {
              const dateText = dateEl.textContent.trim();
              // 날짜 파싱 (예: "2024.01.15", "25.12.5.금", "1개월 전" 등)
              // "25.12.5.금" 형식 처리 (2025년 12월 5일)
              const yearMatch = dateText.match(/(\d{2})\.(\d{1,2})\.(\d{1,2})/);
              if (yearMatch) {
                const year = parseInt(yearMatch[1]) < 50 ? `20${yearMatch[1]}` : `19${yearMatch[1]}`;
                date = `${year}-${yearMatch[2].padStart(2, '0')}-${yearMatch[3].padStart(2, '0')}`;
              } else {
                const dateMatch = dateText.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
                if (dateMatch) {
                  date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
                }
              }
            }

            // 방문 키워드 찾기 (예: "혼자", "연인", "가족")
            const visitTypeEl = el.querySelector('[class*="visit"], [class*="type"], button:has-text("혼자"), button:has-text("연인"), button:has-text("가족")');
            const visitType = visitTypeEl ? visitTypeEl.textContent.trim() : null;

            // 리뷰 키워드 찾기 (예: "침구가 좋아요", "깨끗해요")
            const keywordEls = el.querySelectorAll('[class*="keyword"], [class*="tag"], button:has-text("좋아요"), button:has-text("깨끗")');
            const keywords = Array.from(keywordEls).map(el => el.textContent.trim()).filter(Boolean);
            const reviewKeyword = keywords.length > 0 ? keywords.join(', ') : null;

            // 재방문 여부 (예: "9번째 방문")
            const revisitText = el.textContent || '';
            const revisitMatch = revisitText.match(/(\d+)번째\s*방문/);
            const revisitFlag = revisitMatch ? true : false;

            if (content || rating > 0) {
              results.push({
                content,
                rating,
                nickname,
                date,
                visitKeyword: visitType,
                reviewKeyword: reviewKeyword,
                visitType: visitType,
                emotion: null,
                revisitFlag: revisitFlag,
              });
            }
          } catch (err) {
            console.error(`리뷰 ${index} 파싱 오류:`, err);
          }
        });

        return results;
      });
      } else {
        // frame.evaluate를 사용할 수 없는 경우, locator를 사용하여 직접 추출
        console.log('⚠️ frame.evaluate를 사용할 수 없습니다. locator 방식으로 리뷰 추출 시도합니다.');
        
        try {
          // 날짜 필터링 설정
          let filterDate = null;
          let filterDateStr = null;
          
          if (dateFilter === 'week') {
            // 오늘 기준 일주일 전까지
            const today = new Date();
            filterDate = new Date(today);
            filterDate.setDate(today.getDate() - 7);
            filterDateStr = filterDate.toISOString().split('T')[0];
            console.log(`날짜 필터: ${filterDateStr} ~ ${today.toISOString().split('T')[0]}`);
          } else if (dateFilter === 'twoWeeks') {
            // 오늘 기준 2주 전까지
            const today = new Date();
            filterDate = new Date(today);
            filterDate.setDate(today.getDate() - 14);
            filterDateStr = filterDate.toISOString().split('T')[0];
            console.log(`날짜 필터: ${filterDateStr} ~ ${today.toISOString().split('T')[0]}`);
          } else {
            // 전체 리뷰 (필터링 없음)
            console.log('날짜 필터: 전체 (필터링 없음)');
          }
          
          // 페이지 단위로 리뷰 수집 (요청하신 순서대로)
          let naverNoDateSkipCount = 0;
          let processedReviewIndex = 0; // 처리된 리뷰 인덱스 (페이지가 바뀌어도 유지)
          let shouldStop = false; // 날짜 필터링으로 인한 종료 플래그
          
          while (!shouldStop) {
            // 현재 페이지의 리뷰 개수 확인
            await this.page.waitForTimeout(1000); // 페이지 로딩 대기
            const reviewItems = frame.locator('ul#_review_list > li.place_apply_pui');
            const currentPageReviewCount = await reviewItems.count();
            
            if (currentPageReviewCount === 0) {
              console.log('현재 페이지에 리뷰가 없습니다.');
              break;
            }
            
            console.log(`[네이버맵] 현재 페이지 리뷰 개수: ${currentPageReviewCount}개 (처리 시작 인덱스: ${processedReviewIndex})`);
            
            // 현재 페이지의 리뷰 추출
            for (let i = processedReviewIndex; i < currentPageReviewCount; i++) {
              // 진행 상황 로그 (10개마다)
              if (i === 0 || (i + 1) % 10 === 0) {
                console.log(`[네이버맵] 리뷰 추출 진행 중: ${i + 1}번째 리뷰 처리 중...`);
              }
              
              try {
                // 리뷰 컨테이너 찾기
                const container = reviewItems.nth(i);
                
                // 스크롤하여 리뷰가 보이도록 함
                try {
                  await container.scrollIntoViewIfNeeded();
                  await this.page.waitForTimeout(300); // 스크롤 후 안정화 대기
                } catch (e) {
                  // 스크롤 실패는 무시하고 계속 진행
                }
              
              // 리뷰 내용 찾기 (컨테이너 전체 텍스트)
              const allText = await container.textContent().catch(() => '');
              
              // 컨테이너가 비어있으면 건너뜀
              if (!allText || allText.trim().length < 10) {
                continue;
              }
              
              // 닉네임 추출 (사용자 제공 선택자 사용)
              // 선택자: .pui__NMi-Dp
              let nickname = `사용자${i + 1}`;
              try {
                const nicknameElement = container.locator('.pui__NMi-Dp').first();
                const nicknameCount = await nicknameElement.count();
                if (nicknameCount > 0) {
                  const nicknameText = await nicknameElement.textContent().catch(() => '');
                  if (nicknameText && nicknameText.trim().length > 0) {
                    nickname = nicknameText.trim();
                  }
                }
              } catch (e) {
                // 닉네임 찾기 실패 - 대체 방법 시도
                try {
                  const nameElements = container.locator('div.pui__q2fg8o.pui__A7NplK > a.pui__hvyFHZ > div.pui__JiVbY3 > span > span').first();
                  const nameCount = await nameElements.count();
                  if (nameCount > 0) {
                    const nameText = await nameElements.textContent().catch(() => '');
                    if (nameText && nameText.trim().length > 0) {
                      nickname = nameText.trim();
                    }
                  }
                } catch (e2) {
                  // 대체 방법도 실패
                }
              }
              
              // 평점 추출 (개선된 방법)
              let rating = 0;
              
              // 1. aria-label에서 별점 추출
              try {
                const starElements = container.locator('[class*="star"], [aria-label*="별점"], [aria-label*="점"]');
                const starCount = await starElements.count();
                if (starCount > 0) {
                  const ariaLabel = await starElements.first().getAttribute('aria-label').catch(() => '');
                  const ratingMatch = ariaLabel.match(/(\d+\.?\d*)/);
                  if (ratingMatch) {
                    rating = parseFloat(ratingMatch[1]);
                  }
                }
              } catch (e) {
                // aria-label 추출 실패
              }
              
              // 2. 텍스트에서 평점 추출 (aria-label이 없는 경우)
              if (rating === 0) {
                const ratingMatch = allText.match(/(\d+\.?\d*)\s*점|별점[:\s]*(\d+\.?\d*)/);
                if (ratingMatch) {
                  rating = parseFloat(ratingMatch[1] || ratingMatch[2] || '0');
                }
              }
              
              // 3. 별점 아이콘 개수로 추정 (최후의 수단)
              if (rating === 0) {
                try {
                  const filledStars = container.locator('[class*="star"][class*="fill"], [class*="star"][class*="active"]');
                  const starCount = await filledStars.count();
                  if (starCount > 0 && starCount <= 5) {
                    rating = starCount;
                  }
                } catch (e) {
                  // 별점 개수 추출 실패
                }
              }
              
              // 날짜 추출 (사용자 제공 선택자 사용)
              // 선택자: .pui__gfuUIT time
              let date = null;
              let reviewDate = null;
              let skippedNoDate = false;

              const parseNaverRelativeOrPartialDate = (raw) => {
                if (!raw) return null;
                let t = String(raw).trim();
                if (!t) return null;

                // "방문일", "작성일" 같은 접두사 제거
                t = t.replace(/^(방문일|작성일|리뷰일)\s*:?\s*/i, '').trim();

                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                // 상대 표현: 오늘/어제 (공백 무시)
                if (t.includes('오늘')) {
                  return { dateStr: today.toISOString().split('T')[0], dateObj: today };
                }
                if (t.includes('어제')) {
                  const d = new Date(today);
                  d.setDate(d.getDate() - 1);
                  return { dateStr: d.toISOString().split('T')[0], dateObj: d };
                }

                // 상대 표현: N일 전 / N주 전 / N개월 전 (공백 허용)
                const relMatch = t.match(/(\d+)\s*(일|주|개월)\s*전/);
                if (relMatch) {
                  const n = parseInt(relMatch[1], 10);
                  const unit = relMatch[2];
                  const d = new Date(today);
                  if (unit === '일') d.setDate(d.getDate() - n);
                  if (unit === '주') d.setDate(d.getDate() - n * 7);
                  if (unit === '개월') d.setMonth(d.getMonth() - n);
                  return { dateStr: d.toISOString().split('T')[0], dateObj: d };
                }

                // "MM.DD.요일" 또는 "M.D.요일" 형태(연도 없음, 요일 포함) → 올해로 가정
                // 예: "1.12.월" → 2026-01-12
                const mdWeekdayMatch = t.match(/(\d{1,2})\.(\d{1,2})\.(월|화|수|목|금|토|일)/);
                if (mdWeekdayMatch) {
                  const month = mdWeekdayMatch[1].padStart(2, '0');
                  const day = mdWeekdayMatch[2].padStart(2, '0');
                  const monthNum = parseInt(month, 10);
                  const dayNum = parseInt(day, 10);
                  
                  // 월과 일 유효성 검증
                  if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
                    const year = String(today.getFullYear());
                    const dateStr = `${year}-${month}-${day}`;
                    const d = new Date(dateStr);
                    // 만약 미래 날짜로 파싱되면 작년으로 보정 (예: 1월에 12.31. 같은 케이스)
                    if (d > today) {
                      const prevYear = String(today.getFullYear() - 1);
                      const prevStr = `${prevYear}-${month}-${day}`;
                      return { dateStr: prevStr, dateObj: new Date(prevStr) };
                    }
                    // Date 객체 유효성 검증
                    if (!Number.isNaN(d.getTime()) && 
                        d.getFullYear() == year && 
                        d.getMonth() + 1 == monthNum && 
                        d.getDate() == dayNum) {
                      return { dateStr, dateObj: d };
                    }
                  }
                }
                
                // "MM.DD." 또는 "M.D." 형태(연도 없음, 요일 없음) → 올해로 가정
                // "MM." 형태(일자 없음) → 1일로 가정
                const mdMatch = t.match(/(\d{1,2})\.(\d{1,2})?\.?$/);
                if (mdMatch) {
                  const month = mdMatch[1].padStart(2, '0');
                  // 일자가 없으면 1일로 기본값 설정
                  const day = mdMatch[2] ? mdMatch[2].padStart(2, '0') : '01';
                  const monthNum = parseInt(month, 10);
                  const dayNum = parseInt(day, 10);
                  
                  // 월과 일 유효성 검증
                  if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
                    const year = String(today.getFullYear());
                    const dateStr = `${year}-${month}-${day}`;
                    const d = new Date(dateStr);
                    // 만약 미래 날짜로 파싱되면 작년으로 보정 (예: 1월에 12.31. 같은 케이스)
                    if (d > today) {
                      const prevYear = String(today.getFullYear() - 1);
                      const prevStr = `${prevYear}-${month}-${day}`;
                      return { dateStr: prevStr, dateObj: new Date(prevStr) };
                    }
                    // Date 객체 유효성 검증
                    if (!Number.isNaN(d.getTime()) && 
                        d.getFullYear() == year && 
                        d.getMonth() + 1 == monthNum && 
                        d.getDate() == dayNum) {
                      return { dateStr, dateObj: d };
                    }
                  }
                }
                
                // "MM" 형태(연도와 일자 없음) → 올해 MM월 1일로 가정
                const monthOnlyMatch = t.match(/^(\d{1,2})$/);
                if (monthOnlyMatch) {
                  const month = monthOnlyMatch[1].padStart(2, '0');
                  const monthNum = parseInt(month, 10);
                  if (monthNum >= 1 && monthNum <= 12) {
                    const year = String(today.getFullYear());
                    const dateStr = `${year}-${month}-01`;
                    const d = new Date(dateStr);
                    if (d > today) {
                      const prevYear = String(today.getFullYear() - 1);
                      const prevStr = `${prevYear}-${month}-01`;
                      return { dateStr: prevStr, dateObj: new Date(prevStr) };
                    }
                    return { dateStr, dateObj: d };
                  }
                }

                // "YYYY.MM.DD" 또는 "YY.MM.DD" 형태
                // "YYYY.MM" 또는 "YY.MM" 형태(일자 없음) → 1일로 가정
                // 주의: "25.12.15"는 "2025-12-15"를 의미 (25 = 2025년)
                // 주의: "1.12.월"은 "MM.DD.요일" 형식이므로 이 패턴에서 제외 (위에서 이미 처리됨)
                // 요일이 포함된 경우는 위의 "MM.DD.요일" 패턴에서 처리되므로 여기서는 제외
                if (!t.match(/[월화수목금토일]/)) {
                  const ymdMatch = t.match(/(\d{4}|\d{2})\.(\d{1,2})(?:\.(\d{1,2}))?\.?/);
                  if (ymdMatch) {
                    let year = ymdMatch[1];
                    let month = ymdMatch[2].padStart(2, '0');
                    // 일자가 없으면 1일로 기본값 설정
                    let day = ymdMatch[3] ? ymdMatch[3].padStart(2, '0') : '01';
                    
                    // 2자리 연도 처리: "25" → "2025"
                    if (year.length === 2) {
                      const yearNum = parseInt(year, 10);
                      // 0-50은 2000-2050, 51-99는 1951-1999로 해석
                      year = yearNum < 50 ? `20${year}` : `19${year}`;
                    }
                    
                    // 날짜 유효성 검증: 월은 1-12, 일은 1-31 범위
                    const monthNum = parseInt(month, 10);
                    const dayNum = parseInt(day, 10);
                    
                    // 만약 첫 번째 숫자가 4자리인데 월 범위를 벗어나면, 순서가 잘못된 것일 수 있음
                    // 예: "2026.25.12" → 실제로는 "25.12.XX" 형식일 수 있음
                    if (ymdMatch[1].length === 4 && (monthNum > 12 || dayNum > 31)) {
                      // 순서가 잘못되었을 가능성: "2026.25.12" → "25.12.XX"로 재해석
                      const altMatch = t.match(/(\d{2})\.(\d{1,2})\.(\d{1,2})\.?/);
                      if (altMatch) {
                        const altYear = altMatch[1];
                        const altMonth = altMatch[2].padStart(2, '0');
                        const altDay = altMatch[3].padStart(2, '0');
                        const altYearNum = parseInt(altYear, 10);
                        const altMonthNum = parseInt(altMonth, 10);
                        const altDayNum = parseInt(altDay, 10);
                        
                        if (altMonthNum >= 1 && altMonthNum <= 12 && altDayNum >= 1 && altDayNum <= 31) {
                          const finalYear = altYearNum < 50 ? `20${altYear}` : `19${altYear}`;
                          const dateStr = `${finalYear}-${altMonth}-${altDay}`;
                          const d = new Date(dateStr);
                          if (!Number.isNaN(d.getTime()) && 
                              d.getFullYear() == finalYear && 
                              d.getMonth() + 1 == altMonthNum && 
                              d.getDate() == altDayNum) {
                            return { dateStr, dateObj: d };
                          }
                        }
                      }
                      return null; // 잘못된 날짜 형식
                    }
                    
                    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
                      return null; // 잘못된 날짜 형식
                    }
                    
                    const dateStr = `${year}-${month}-${day}`;
                    const d = new Date(dateStr);
                    // Date 객체 유효성 검증
                    if (!Number.isNaN(d.getTime()) && 
                        d.getFullYear() == year && 
                        d.getMonth() + 1 == monthNum && 
                        d.getDate() == dayNum) {
                      return { dateStr, dateObj: d };
                    }
                  }
                }

                // "YYYY-MM-DD" 또는 "YY-MM-DD" 형태
                // "YYYY-MM" 또는 "YY-MM" 형태(일자 없음) → 1일로 가정
                const ymdDashMatch = t.match(/(\d{4}|\d{2})-(\d{1,2})(?:-(\d{1,2}))?/);
                if (ymdDashMatch) {
                  let year = ymdDashMatch[1];
                  if (year.length === 2) {
                    year = parseInt(year) < 50 ? `20${year}` : `19${year}`;
                  }
                  const month = ymdDashMatch[2].padStart(2, '0');
                  // 일자가 없으면 1일로 기본값 설정
                  const day = ymdDashMatch[3] ? ymdDashMatch[3].padStart(2, '0') : '01';
                  
                  // 날짜 유효성 검증
                  const monthNum = parseInt(month, 10);
                  const dayNum = parseInt(day, 10);
                  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
                    return null; // 잘못된 날짜 형식 (예: "2026-25-12")
                  }
                  
                  const dateStr = `${year}-${month}-${day}`;
                  const d = new Date(dateStr);
                  // Date 객체 유효성 검증
                  if (!Number.isNaN(d.getTime()) && 
                      d.getFullYear() == year && 
                      d.getMonth() + 1 == monthNum && 
                      d.getDate() == dayNum) {
                    return { dateStr, dateObj: d };
                  }
                }

                // "YYYY/MM/DD" 또는 "YY/MM/DD" 형태
                // "YYYY/MM" 또는 "YY/MM" 형태(일자 없음) → 1일로 가정
                const ymdSlashMatch = t.match(/(\d{4}|\d{2})\/(\d{1,2})(?:\/(\d{1,2}))?/);
                if (ymdSlashMatch) {
                  let year = ymdSlashMatch[1];
                  if (year.length === 2) {
                    year = parseInt(year) < 50 ? `20${year}` : `19${year}`;
                  }
                  const month = ymdSlashMatch[2].padStart(2, '0');
                  // 일자가 없으면 1일로 기본값 설정
                  const day = ymdSlashMatch[3] ? ymdSlashMatch[3].padStart(2, '0') : '01';
                  const dateStr = `${year}-${month}-${day}`;
                  const d = new Date(dateStr);
                  if (!Number.isNaN(d.getTime())) {
                    return { dateStr, dateObj: d };
                  }
                }

                return null;
              };
              
              try {
                // 날짜 추출을 위한 다양한 선택자 시도
                const dateSelectors = [
                  container.locator('.pui__gfuUIT time').first(),
                  container.locator('time').first(),
                  container.locator('[datetime]').first(),
                  container.locator('.pui__gfuUIT').first(),
                ];

                for (const selector of dateSelectors) {
                  if (date) break;
                  const cnt = await selector.count().catch(() => 0);
                  if (!cnt) continue;

                  // 1) datetime 속성에서 추출 (가장 정확)
                  const datetime = await selector.getAttribute('datetime').catch(() => '');
                  if (datetime) {
                    try {
                      const d = new Date(datetime);
                      if (!Number.isNaN(d.getTime())) {
                        date = d.toISOString().split('T')[0];
                        reviewDate = d;
                        break;
                      }
                    } catch (e) {
                      // datetime 파싱 실패, 다음 방법 시도
                    }
                  }

                  // 2) 텍스트에서 상대/부분 날짜 파싱
                  const dateText = await selector.textContent().catch(() => '');
                  if (dateText) {
                    const rel = parseNaverRelativeOrPartialDate(dateText);
                    if (rel) {
                      date = rel.dateStr;
                      reviewDate = rel.dateObj;
                      break;
                    }

                    // 3) 정규식 패턴으로 날짜 추출
                    const datePatterns = [
                      /(\d{4})\.(\d{1,2})\.(\d{1,2})\.?/,  // YYYY.MM.DD
                      /(\d{2})\.(\d{1,2})\.(\d{1,2})\.?/,  // YY.MM.DD
                      /(\d{4})-(\d{1,2})-(\d{1,2})/,       // YYYY-MM-DD
                      /(\d{2})-(\d{1,2})-(\d{1,2})/,       // YY-MM-DD
                      /(\d{4})\/(\d{1,2})\/(\d{1,2})/,     // YYYY/MM/DD
                      /(\d{2})\/(\d{1,2})\/(\d{1,2})/,     // YY/MM/DD
                    ];

                    for (const pattern of datePatterns) {
                      const dateMatch = dateText.match(pattern);
                      if (!dateMatch) continue;
                      let year, month, day;
                      if (dateMatch[1].length === 4) {
                        year = dateMatch[1];
                      } else {
                        year = parseInt(dateMatch[1]) < 50 ? `20${dateMatch[1]}` : `19${dateMatch[1]}`;
                      }
                      month = dateMatch[2].padStart(2, '0');
                      day = dateMatch[3].padStart(2, '0');
                      
                      // 날짜 유효성 검증: 월은 1-12, 일은 1-31 범위여야 함
                      const monthNum = parseInt(month, 10);
                      const dayNum = parseInt(day, 10);
                      if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
                        // 잘못된 날짜 형식 (예: "2026-25-12" 같은 경우)
                        if (i < 5) {
                          console.log(`[네이버맵] 잘못된 날짜 형식 스킵: "${dateText}" → ${year}-${month}-${day} (월: ${monthNum}, 일: ${dayNum})`);
                        }
                        continue; // 다음 패턴 시도
                      }
                      
                      const dateStr = `${year}-${month}-${day}`;
                      const d = new Date(dateStr);
                      // Date 객체가 유효한지 확인 (예: 2월 30일 같은 경우)
                      if (!Number.isNaN(d.getTime()) && 
                          d.getFullYear() == year && 
                          d.getMonth() + 1 == monthNum && 
                          d.getDate() == dayNum) {
                        date = dateStr;
                        reviewDate = d;
                        break;
                      } else if (i < 5) {
                        console.log(`[네이버맵] 날짜 유효성 검증 실패: "${dateText}" → ${dateStr} (Date 객체: ${d.toISOString()})`);
                      }
                    }

                    if (date) break;
                  }
                }

                // 마지막 fallback: 컨테이너 전체 텍스트에서 날짜 추출
                if (!date) {
                  const containerText = await container.textContent().catch(() => '');
                  if (containerText) {
                    const rel2 = parseNaverRelativeOrPartialDate(containerText);
                    if (rel2) {
                      date = rel2.dateStr;
                      reviewDate = rel2.dateObj;
                    }
                  }
                }
              } catch (e) {
                // 날짜 찾기 실패 (에러는 무시하고 계속 진행)
                console.log(`[네이버맵] 날짜 추출 중 에러 (무시): ${e.message}`);
              }
              
              // 날짜가 없으면 오늘 날짜로 설정 (즉시 저장 방식에서는 저장하도록)
              if (!date) {
                if (saveImmediately) {
                  // 즉시 저장 방식에서는 날짜가 없어도 저장 (오늘 날짜로)
                  date = new Date().toISOString().split('T')[0];
                  reviewDate = new Date();
                  if (i < 5) {
                    console.log(`[네이버맵] 날짜 없음 - 오늘 날짜로 저장: nickname="${nickname}"`);
                  }
                } else {
                  // 기존 방식: 날짜가 없으면 스킵
                  skippedNoDate = true;
                }
              }

              if (skippedNoDate) {
                // 날짜가 없으면 해당 리뷰는 건너뜀 (기존 방식)
                naverNoDateSkipCount++;
                if (naverNoDateSkipCount <= 5) {
                  // 날짜 추출을 시도한 모든 텍스트를 로깅
                  let debugText = '';
                  try {
                    const timeText = await container.locator('time').first().textContent().catch(() => '');
                    const gfuText = await container.locator('.pui__gfuUIT').first().textContent().catch(() => '');
                    debugText = `time="${timeText}", .pui__gfuUIT="${gfuText}"`;
                  } catch (e) {
                    debugText = `(텍스트 추출 실패)`;
                  }
                  console.log(
                    `⚠️ [네이버맵] 날짜 파싱 실패로 리뷰 스킵 (샘플 ${naverNoDateSkipCount}/5): nickname="${nickname}", ${debugText}`
                  );
                }
                continue;
              }
              
              // 날짜 필터링: week 또는 twoWeeks 모드일 때 필터링
              // 최신순으로 정렬되어 있으므로, 필터 범위를 벗어난 날짜를 만나면 이후 모든 리뷰도 범위를 벗어남
              if ((dateFilter === 'week' || dateFilter === 'twoWeeks') && filterDate && reviewDate) {
                if (reviewDate < filterDate) {
                  // 필터 범위를 벗어난 날짜를 만남
                  console.log(`[네이버맵] 날짜 필터 범위를 벗어남: ${date} < ${filterDateStr}`);
                  console.log(`[네이버맵] 최신순 정렬이므로 이후 모든 리뷰도 범위를 벗어남. 자료수집 종료.`);
                  shouldStop = true;
                  break; // 루프 종료
                }
              }
              
              // visit_type 추출 (사용자 제공 선택자 사용) - content 추출 전에 먼저 추출
              // 선택자: div.pui__-0Ter1 > a > span:nth-child(1)
              let visitType = null;
              try {
                const visitTypeElement = container.locator('div.pui__-0Ter1 > a > span:nth-child(1)').first();
                const visitTypeCount = await visitTypeElement.count();
                if (visitTypeCount > 0) {
                  visitType = await visitTypeElement.textContent().catch(() => '');
                  if (visitType) {
                    visitType = visitType.trim();
                  }
                }
              } catch (e) {
                // visit_type 찾기 실패
              }
              
              // n_emotion 추출 (사용자 제공 선택자 사용) - content 추출 전에 먼저 추출
              // 선택자: div.pui__-0Ter1 > a > span:nth-child(2)
              let emotion = null;
              try {
                const emotionElement = container.locator('div.pui__-0Ter1 > a > span:nth-child(2)').first();
                const emotionCount = await emotionElement.count();
                if (emotionCount > 0) {
                  emotion = await emotionElement.textContent().catch(() => '');
                  if (emotion) {
                    emotion = emotion.trim();
                  }
                }
              } catch (e) {
                // emotion 찾기 실패
              }
              
              // 리뷰 내용 추출 (사용자 제공 선택자 사용)
              // 선택자: .pui__vn15t2 a (실제 리뷰 본문)
              let content = '';
              try {
                // 먼저 "더보기" 버튼이 있는지 확인하고 클릭
                // 사용자 제공 선택자: a.pui__wFzIYl:has-text("더보기")
                const moreButton = container.locator('a.pui__wFzIYl:has-text("더보기")').first();
                const hasMoreButton = await moreButton.count() > 0;
                
                if (hasMoreButton) {
                  try {
                    const isVisible = await moreButton.isVisible().catch(() => false);
                    if (isVisible) {
                      await moreButton.scrollIntoViewIfNeeded();
                      await this.page.waitForTimeout(500);
                      await moreButton.click({ timeout: 5000 });
                      await this.page.waitForTimeout(500); // 펼쳐지는 애니메이션 대기
                      console.log(`리뷰 ${i + 1} 더보기 버튼 클릭 완료`);
                    }
                  } catch (e) {
                    console.log(`리뷰 ${i + 1} 더보기 버튼 클릭 실패: ${e.message}`);
                  }
                }
                
                // 리뷰 내용 추출 (사용자 제공 선택자: .pui__vn15t2 a)
                const contentElement = container.locator('.pui__vn15t2 a').first();
                const contentCount = await contentElement.count();
                if (contentCount > 0) {
                  // innerText로 가져와서 더 정확한 텍스트 추출
                  content = await contentElement.innerText().catch(() => '');
                  if (!content || content.trim().length === 0) {
                    // innerText가 실패하면 textContent 시도
                    content = await contentElement.textContent().catch(() => '');
                  }
                  content = content.trim();
                  
                  // "더보기", "접기" 버튼 텍스트 제거
                  content = content.replace(/더보기|접기/g, '').trim();
                } else {
                  // 대체 방법: div.pui__vn15t2에서 직접 추출
                  const contentElementAlt = container.locator('div.pui__vn15t2').first();
                  const contentCountAlt = await contentElementAlt.count();
                  if (contentCountAlt > 0) {
                    let rawContent = await contentElementAlt.textContent().catch(() => '');
                    
                    if (rawContent) {
                      // content 패턴 분석 및 정리
                      let cleanedContent = rawContent.trim();
                      
                      // 1. nickname 제거
                      if (nickname && nickname !== `사용자${i + 1}`) {
                        const nicknamePattern = new RegExp(nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'v?\\s*', 'g');
                        cleanedContent = cleanedContent.replace(nicknamePattern, '');
                      }
                      
                      // 2. 팔로우 관련 텍스트 제거
                      cleanedContent = cleanedContent.replace(/\d+팔로우/g, '');
                      
                      // 3. "이전", "다음" 제거
                      cleanedContent = cleanedContent.replace(/이전|다음/g, '');
                      
                      // 4. "여행" 키워드 제거
                      cleanedContent = cleanedContent.replace(/여행/g, '');
                      
                      // 5. visit_type 제거
                      if (visitType) {
                        const visitTypePattern = new RegExp(visitType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                        cleanedContent = cleanedContent.replace(visitTypePattern, '');
                      }
                      
                      // 6. emotion 제거
                      if (emotion) {
                        const emotionPattern = new RegExp(emotion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                        cleanedContent = cleanedContent.replace(emotionPattern, '');
                      }
                      
                      // 7. "동영상" 키워드 제거
                      cleanedContent = cleanedContent.replace(/동영상/g, '');
                      
                      // 8. "더보기", "접기" 버튼 텍스트 제거
                      cleanedContent = cleanedContent.replace(/더보기|접기/g, '');
                      
                      // 9. 연속된 공백 정리
                      cleanedContent = cleanedContent.replace(/\s+/g, ' ').trim();
                      
                      content = cleanedContent;
                    }
                  }
                }
              } catch (e) {
                // 리뷰 내용 찾기 실패
                console.log(`리뷰 ${i + 1} 내용 추출 실패: ${e.message}`);
              }
              
              // review_keyword 추출 (사용자 제공 선택자 사용)
              // 선택자: #_review_list > li:nth-child(4) > div.pui__HLNvmI > span:nth-child(1), span:nth-child(2) 등
              // 각 span을 개별적으로 추출
              // 먼저 "펼쳐보기" 버튼이 있으면 클릭하여 모든 키워드 표시
              const keywords = [];
              try {
                // "펼쳐보기" 버튼 클릭 (키워드 펼치기)
                const keywordMoreButton = container.locator('a.pui__jhpEyP.pui__ggzZJ8[data-pui-click-code="keywordmore"]').first();
                const keywordMoreButtonCount = await keywordMoreButton.count();
                if (keywordMoreButtonCount > 0) {
                  try {
                    const isVisible = await keywordMoreButton.isVisible().catch(() => false);
                    if (isVisible) {
                      await keywordMoreButton.scrollIntoViewIfNeeded();
                      await this.page.waitForTimeout(500);
                      await keywordMoreButton.click({ timeout: 5000 });
                      await this.page.waitForTimeout(1000); // 키워드 펼쳐지는 시간 대기
                    }
                  } catch (e) {
                    // 펼쳐보기 버튼 클릭 실패는 무시하고 계속 진행
                  }
                }
                
                const keywordContainer = container.locator('div.pui__HLNvmI').first();
                const keywordContainerCount = await keywordContainer.count();
                if (keywordContainerCount > 0) {
                  // span 요소들을 개별적으로 추출
                  let spanIndex = 1;
                  while (true) {
                    try {
                      const spanElement = keywordContainer.locator(`span:nth-child(${spanIndex})`);
                      const spanCount = await spanElement.count();
                      if (spanCount === 0) {
                        break; // 더 이상 span이 없으면 종료
                      }
                      
                      const spanText = await spanElement.textContent().catch(() => '');
                      if (spanText && spanText.trim().length > 0) {
                        const trimmedText = spanText.trim();
                        // "펼쳐보기", "접기" 같은 버튼 텍스트는 제외
                        if (trimmedText !== '펼쳐보기' && trimmedText !== '접기' && trimmedText !== '더보기') {
                          keywords.push(trimmedText);
                        }
                      }
                      spanIndex++;
                    } catch (e) {
                      // span 추출 실패 시 종료
                      break;
                    }
                  }
                }
              } catch (e) {
                // review_keyword 찾기 실패
              }
              
              // 재방문 여부 (인증 수단 및 방문 횟수)
              // 사용자 제공 선택자: .pui__gfuUIT:has-text("방문")
              let revisitFlag = false;
              try {
                // 방문 횟수 추출 (예: "1번째 방문", "3번째 방문")
                const visitCountElement = container.locator('.pui__gfuUIT:has-text("방문")').first();
                const visitCountCount = await visitCountElement.count();
                if (visitCountCount > 0) {
                  const visitCountText = await visitCountElement.textContent().catch(() => '');
                  if (visitCountText) {
                    const revisitMatch = visitCountText.match(/(\d+)번째\s*방문/);
                    if (revisitMatch) {
                      revisitFlag = true;
                    }
                  }
                } else {
                  // 대체 방법: 컨테이너 내에서 인증 정보 찾기
                  const certText = allText.match(/인증\s*수단|영수증|(\d+)번째\s*방문/);
                  if (certText) {
                    revisitFlag = true;
                  }
                }
              } catch (e) {
                // 인증 정보 찾기 실패
              }
              
              // 리뷰 데이터가 유효한지 확인
              // emotion 값을 visit_keyword에 저장 (네이버에는 emotion 값이 없는 것 같으므로)
              // emotion이 있으면 visit_keyword에 저장
              const visitKeyword = emotion || null;
              
              if (content.trim().length > 10 || rating > 0 || keywords.length > 0 || nickname !== `사용자${i + 1}`) {
                const reviewData = {
                  content: content.trim() || allText.substring(0, 200) || `리뷰 ${i + 1}`,
                  rating,
                  nickname: nickname.trim(),
                  date,
                  visitKeyword: visitKeyword, // emotion 값을 visit_keyword에 저장
                  reviewKeyword: keywords.length > 0 ? keywords.join(', ') : null,
                  visitType: visitType,
                  emotion: null, // 네이버에는 emotion 값이 없으므로 null
                  revisitFlag,
                };
                
                // 즉시 저장 방식이 활성화된 경우 즉시 저장
                if (saveImmediately && companyName) {
                  // date가 없어도 저장 시도 (날짜 파싱 실패한 경우도 저장)
                  if (!date) {
                    if (i < 5) {
                      console.log(`[네이버맵] 즉시 저장 시도: date가 없지만 저장 시도 (리뷰 ${i + 1})`);
                    }
                    // date가 없으면 오늘 날짜로 저장
                    date = new Date().toISOString().split('T')[0];
                    reviewDate = new Date();
                  }
                  
                  try {
                    // 날짜 필터링 확인
                    let shouldSave = true;
                    if ((dateFilter === 'week' || dateFilter === 'twoWeeks') && reviewDate && filterDate) {
                      if (reviewDate < filterDate) {
                        // 필터 범위를 벗어난 날짜를 만남
                        console.log(`[네이버맵] 날짜 필터 범위를 벗어남: ${date} < ${filterDateStr}`);
                        console.log(`[네이버맵] 최신순 정렬이므로 이후 모든 리뷰도 범위를 벗어남. 자료수집 종료.`);
                        shouldSave = false;
                        shouldStop = true; // 루프 종료 플래그 설정
                      }
                    }
                    
                    if (shouldSave) {
                      if (i < 3) {
                        console.log(`[네이버맵] 즉시 저장 시도: companyName="${companyName}", date="${date}", nickname="${reviewData.nickname}"`);
                      }
                      const analysis = this.analyzeText(
                        reviewData.content,
                        rating,
                        reviewData.visitKeyword,
                        reviewData.reviewKeyword
                      );
                      
                      const saved = await this.saveReview({
                        portalUrl: '네이버맵',
                        companyName,
                        reviewDate: date,
                        content: reviewData.content,
                        rating: rating || null,
                        nickname: reviewData.nickname,
                        visitKeyword: reviewData.visitKeyword || null,
                        reviewKeyword: reviewData.reviewKeyword || null,
                        visitType: reviewData.visitType || null,
                        emotion: reviewData.emotion || null,
                        revisitFlag: reviewData.revisitFlag || false,
                        nRating: analysis.nRating,
                        nEmotion: analysis.nEmotion,
                        nCharCount: analysis.nCharCount,
                        title: null,
                        additionalInfo: null,
                      });
                      
                      if (saved) {
                        actualSavedCount++; // 실제 저장 성공 개수 증가
                        // 저장 성공 시에만 reviews 배열에 추가 (통계용)
                        reviews.push(reviewData);
                        if (actualSavedCount <= 10 || actualSavedCount % 50 === 0) {
                          console.log(`✅ [네이버맵 즉시 저장 성공] ${actualSavedCount}번째: ${reviewData.nickname} - date: ${date}`);
                        }
                      } else {
                        // 중복이거나 저장 실패한 경우에도 통계용으로 추가
                        reviews.push(reviewData);
                        if (reviews.length <= 5) {
                          console.log(`⚠️ [네이버맵 즉시 저장 실패/중복] ${reviews.length}번째: ${reviewData.nickname} - date: ${date}`);
                        }
                      }
                    } else {
                      // 날짜 필터링으로 스킵된 경우
                      reviews.push(reviewData);
                      // shouldStop이 true이면 루프 종료
                      break;
                    }
                  } catch (saveError) {
                    console.error(`[네이버맵] 리뷰 ${i + 1} 즉시 저장 실패:`, saveError.message);
                    console.error(`[네이버맵] 저장 실패 상세:`, saveError);
                    // 저장 실패해도 통계용으로 추가
                    reviews.push(reviewData);
                  }
                } else {
                  // 기존 방식: 배열에 추가만 함
                  reviews.push(reviewData);
                  
                  // 즉시 저장이 비활성화된 이유 로그 (처음 5개만)
                  if (reviews.length <= 5) {
                    if (!saveImmediately) {
                      console.log(`[네이버맵] 즉시 저장 비활성화 - 배열에만 추가 (리뷰 ${i + 1})`);
                    } else if (!companyName) {
                      console.log(`[네이버맵] 즉시 저장 스킵: companyName 없음 (리뷰 ${i + 1})`);
                    }
                  }
                  
                }
              }
              } catch (err) {
                console.error(`리뷰 ${i + 1} 추출 오류:`, err.message);
              }
              
              // 날짜 필터링으로 종료해야 하는 경우
              if (shouldStop) {
                break;
              }
            }
            
            // 날짜 필터링으로 종료해야 하는 경우
            if (shouldStop) {
              break;
            }
            
            // 현재 페이지의 모든 리뷰를 수집했으면 더보기 버튼 클릭하여 다음 페이지 로드
            processedReviewIndex = currentPageReviewCount; // 처리된 인덱스 업데이트
            
            // 리뷰 목록을 더 불러오는 더보기 버튼 찾기
            const loadMoreButton = frame.locator('div.NSTUp > div > a, div.place_section.k1QQ5 div.NSTUp > div > a').first();
            const loadMoreCount = await loadMoreButton.count();
            
            if (loadMoreCount > 0) {
              try {
                const isVisible = await loadMoreButton.isVisible().catch(() => false);
                if (isVisible) {
                  await loadMoreButton.scrollIntoViewIfNeeded();
                  await this.page.waitForTimeout(1000);
                  await loadMoreButton.click({ timeout: 5000 });
                  await this.page.waitForTimeout(3000); // 새 리뷰 로딩 대기
                  console.log(`[네이버맵] 더보기 버튼 클릭 - 다음 페이지 로드 중...`);
                  
                  // 새 리뷰가 로드될 때까지 대기
                  await this.page.waitForTimeout(2000);
                } else {
                  console.log('[네이버맵] 더보기 버튼이 보이지 않습니다.');
                  break; // 더 이상 리뷰가 없음
                }
              } catch (e) {
                console.log(`[네이버맵] 더보기 버튼 클릭 실패: ${e.message}`);
                break; // 더보기 버튼 클릭 실패 시 종료
              }
            } else {
              console.log('[네이버맵] 더보기 버튼이 없습니다. 모든 리뷰 수집 완료.');
              break; // 더 이상 리뷰가 없음
            }
          }
          
          console.log(`[네이버맵] 리뷰 추출 완료: 총 ${reviews.length}개 리뷰 추출됨, ${actualSavedCount}개 저장 성공`);

          if (naverNoDateSkipCount > 0) {
            console.log(`⚠️ [네이버맵] 날짜 파싱 실패로 스킵된 리뷰: ${naverNoDateSkipCount}개`);
          }
          
          if (shouldStop) {
            console.log(`[네이버맵] 날짜 필터링 범위를 벗어나 자료수집을 종료했습니다.`);
          }
        } catch (e) {
          console.log('리뷰 추출 실패:', e.message);
          console.error('리뷰 추출 실패 상세:', e);
        }
      }

      console.log(`✅ 네이버맵 스크래핑 완료: ${reviews.length}개 리뷰 발견`);
      if (reviews.length === 0) {
        console.log('⚠️ 네이버맵에서 리뷰를 찾지 못했습니다. 선택자나 페이지 구조가 변경되었을 수 있습니다.');
      }
      
      // 즉시 저장 방식인 경우 실제 저장 개수를 reviews 배열에 메타데이터로 추가
      if (saveImmediately) {
        // reviews 배열에 실제 저장 개수를 저장 (scrapeByPortal에서 사용)
        reviews._actualSavedCount = actualSavedCount;
        console.log(`[네이버맵] 실제 저장 개수: ${actualSavedCount}개 (추출: ${reviews.length}개)`);
      }
      
      return reviews;
    } catch (error) {
      console.error('네이버맵 스크래핑 실패:', error);
      // 디버깅을 위해 스크린샷 저장
      try {
        await this.page.screenshot({ path: 'naver-error.png' });
      } catch (e) {
        // 스크린샷 실패는 무시
      }
      return [];
    }
  }

  /**
   * 카카오맵 URL 정규화
   * @param {string} url - 카카오맵 URL
   * @returns {string} 정규화된 URL
   */
  normalizeKakaoMapUrl(url) {
    try {
      const urlObj = new URL(url);
      // 카카오맵 URL 형식: https://place.map.kakao.com/{장소ID}
      // 또는 https://map.kakao.com/link/map/{장소ID}
      const placeIdMatch = urlObj.pathname.match(/\/(\d+)/);
      if (placeIdMatch) {
        const placeId = placeIdMatch[1];
        // 기본 URL만 반환 (쿼리 파라미터 제거)
        return `https://place.map.kakao.com/${placeId}`;
      }
      return url;
    } catch (e) {
      return url;
    }
  }

  /**
   * 카카오맵 스크래핑 (company_name으로 검색)
   * @param {string} companyName - 기업명 (검색어로 사용)
   * @param {string} dateFilter - 'all' (전체) 또는 'week' (일주일 간격)
   */
  async scrapeKakaoMap(companyName, dateFilter = 'week', jobId = null, portalType = 'kakao', saveImmediately = false) {
    let actualSavedCount = 0; // 실제 저장 성공 개수 추적
    try {
      console.log(`카카오맵 스크래핑 시작: "${companyName}" 검색 (필터: ${dateFilter}, 즉시 저장: ${saveImmediately ? '활성화' : '비활성화'})`);
      
      // 카카오맵 메인 페이지로 이동
      await this.page.goto('https://map.kakao.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page.waitForTimeout(3000); // 페이지 로딩 대기
      
      // 검색 입력상자에 기업명 입력
      console.log('검색 입력상자에 기업명 입력 중...');
      const searchInput = this.page.locator('#search\\.keyword\\.query');
      await searchInput.waitFor({ state: 'visible', timeout: 10000 });
      await searchInput.fill(companyName);
      await this.page.waitForTimeout(1000);
      
      // 검색 실행 (Enter 키 사용하여 DimmedLayer 문제 우회)
      console.log('검색 실행 중 (Enter 키 사용)...');
      await searchInput.press('Enter');
      await this.page.waitForTimeout(5000); // 검색 결과 로딩 대기
      
      // 첫 번째 기업의 기업 ID 추출
      console.log('첫 번째 기업의 기업 ID 추출 중...');
      await this.page.waitForTimeout(3000); // 검색 결과 로딩 대기
      
      // 기업 ID 추출 (JavaScript로 직접 추출)
      const placeId = await this.page.evaluate(() => {
        // 여러 방법으로 첫 번째 기업 ID 찾기
        const firstItem = document.querySelector('#info\\.search\\.place\\.list > li:first-child');
        if (firstItem) {
          // 1. data-id 속성 확인
          const dataId = firstItem.getAttribute('data-id');
          if (dataId) return dataId;
          
          // 2. data-id 속성 (다른 형식)
          const dataId2 = firstItem.getAttribute('data-placeid');
          if (dataId2) return dataId2;
          
          // 3. href에서 추출 (모든 링크 확인)
          const links = firstItem.querySelectorAll('a');
          for (const link of links) {
            const href = link.getAttribute('href');
            if (href) {
              // /place/8458713 또는 /8458713 형식
              const match = href.match(/\/place\/(\d+)/) || href.match(/\/(\d+)/);
              if (match) return match[1];
            }
          }
          
          // 4. onclick 이벤트에서 추출
          const onclick = firstItem.getAttribute('onclick');
          if (onclick) {
            const match = onclick.match(/(\d+)/);
            if (match) return match[1];
          }
        }
        
        // 5. 전체 검색 결과에서 첫 번째 숫자 ID 찾기
        const allItems = document.querySelectorAll('#info\\.search\\.place\\.list > li');
        for (const item of allItems) {
          const dataId = item.getAttribute('data-id') || item.getAttribute('data-placeid');
          if (dataId) return dataId;
          
          const links = item.querySelectorAll('a');
          for (const link of links) {
            const href = link.getAttribute('href');
            if (href) {
              const match = href.match(/\/place\/(\d+)/) || href.match(/\/(\d+)/);
              if (match) return match[1];
            }
          }
        }
        
        return null;
      });
      
      if (!placeId) {
        console.log('⚠️ 기업 ID를 찾을 수 없습니다. 이 기업의 스크래핑을 건너뜁니다.');
        // 디버깅을 위해 검색 결과 구조 확인
        const debugInfo = await this.page.evaluate(() => {
          const firstItem = document.querySelector('#info\\.search\\.place\\.list > li:first-child');
          if (firstItem) {
            return {
              html: firstItem.outerHTML.substring(0, 500),
              dataId: firstItem.getAttribute('data-id'),
              dataPlaceId: firstItem.getAttribute('data-placeid'),
              hrefs: Array.from(firstItem.querySelectorAll('a')).map(a => a.getAttribute('href'))
            };
          }
          return null;
        });
        console.log('디버깅 정보:', JSON.stringify(debugInfo, null, 2));
        return [];
      }
      
      console.log(`기업 ID 추출 성공: ${placeId}`);
      
      // 후기 페이지로 직접 이동: https://place.map.kakao.com/{기업ID}#review
      const reviewUrl = `https://place.map.kakao.com/${placeId}#review`;
      console.log(`후기 페이지로 직접 이동: ${reviewUrl}`);
      await this.page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page.waitForTimeout(5000); // 페이지 로딩 대기
      
      // #review로 직접 이동했으므로 후기 버튼 클릭은 불필요
      // URL에 #review가 포함되어 있는지 확인
      const currentUrl = this.page.url();
      if (!currentUrl.includes('#review')) {
        console.log('⚠️ 후기 페이지로 이동하지 못했습니다. 이 기업의 스크래핑을 건너뜁니다.');
        return [];
      }
      
      console.log(`후기 페이지로 이동 완료: ${currentUrl}`);

      // 날짜 필터링 설정
      let filterDate = null;
      let filterDateStr = null;
      
      if (dateFilter === 'week') {
        const today = new Date();
        filterDate = new Date(today);
        filterDate.setDate(today.getDate() - 7);
        filterDateStr = filterDate.toISOString().split('T')[0];
        console.log(`날짜 필터: ${filterDateStr} ~ ${today.toISOString().split('T')[0]}`);
      } else if (dateFilter === 'twoWeeks') {
        const today = new Date();
        filterDate = new Date(today);
        filterDate.setDate(today.getDate() - 14);
        filterDateStr = filterDate.toISOString().split('T')[0];
        console.log(`날짜 필터: ${filterDateStr} ~ ${today.toISOString().split('T')[0]}`);
      } else {
        console.log('날짜 필터: 전체 (필터링 없음)');
      }

      const reviews = [];
      
      try {
        // 무한 스크롤로 리뷰 로드 (페이지를 내리면 더 많은 리뷰가 나타남)
        console.log('무한 스크롤로 리뷰 로드 중...');
        
        let lastReviewCount = 0;
        let noChangeCount = 0;
        const maxScrollAttempts = 5; // 테스트 기간 동안 5번 스크롤
        
        // 초기 리뷰 개수 확인
        const reviewListSelector = '#mainContent > div.main_detail > div.detail_cont > div.section_comm.section_review > div.group_review > ul > li';
        const initialReviewItems = this.page.locator(reviewListSelector);
        lastReviewCount = await initialReviewItems.count();
        console.log(`초기 리뷰 개수: ${lastReviewCount}개`);
        
        // 스크롤하여 더 많은 리뷰 로드
        for (let scrollAttempt = 0; scrollAttempt < maxScrollAttempts; scrollAttempt++) {
          // 페이지 하단으로 스크롤
          await this.page.keyboard.press('End');
          await this.page.waitForTimeout(3000); // 리뷰 로딩 대기
          
          // 리뷰 개수 재확인
          const currentReviewItems = this.page.locator(reviewListSelector);
          const currentCount = await currentReviewItems.count();
          
          if (currentCount > lastReviewCount) {
            console.log(`스크롤 (${scrollAttempt + 1}번째) - 리뷰: ${lastReviewCount}개 → ${currentCount}개 ✅`);
            lastReviewCount = currentCount;
            noChangeCount = 0;
          } else {
            noChangeCount++;
            if (noChangeCount >= 2) {
              console.log(`리뷰 개수가 변하지 않아 스크롤을 중단합니다.`);
              break;
            }
          }
        }
        
        // 최종 리뷰 개수 확인
        const reviewItems = this.page.locator(reviewListSelector);
        const reviewCount = await reviewItems.count();
        console.log(`최종 리뷰 개수: ${reviewCount}개`);
        
        // 리뷰 데이터 추출
        for (let i = 0; i < reviewCount; i++) {
          try {
            // 리뷰 아이템 선택자: li:nth-child(i+1)
            const reviewItem = this.page.locator(`${reviewListSelector}:nth-child(${i + 1})`);
            
            // 작성자 추출 (리뷰어 이름, 은 삭제하고 이름만)
            let nickname = `사용자${i + 1}`;
            try {
              const nicknameElement = reviewItem.locator('div > div.area_reviewer > div > div.wrap_user > a > span');
              const nicknameCount = await nicknameElement.count();
              if (nicknameCount > 0) {
                const nicknameText = await nicknameElement.textContent().catch(() => '');
                if (nicknameText && nicknameText.trim().length > 0) {
                  let trimmed = nicknameText.trim();
                  // "리뷰어 이름, " 또는 "리뷰어 이름," 제거
                  trimmed = trimmed.replace(/^리뷰어\s*이름\s*,?\s*/i, '').trim();
                  // "리뷰어 이름" 같은 라벨 텍스트 제외
                  if (trimmed !== '리뷰어 이름' && trimmed.length > 0) {
                    nickname = trimmed;
                  }
                }
              }
            } catch (e) {
              // 닉네임 찾기 실패
            }
            
            // 별점 평균 추출 (숫자만)
            let rating = 0;
            try {
              const ratingElement = reviewItem.locator('div > div.area_reviewer > div > div.wrap_user > div > ul > li:nth-child(2)');
              const ratingCount = await ratingElement.count();
              if (ratingCount > 0) {
                const ratingText = await ratingElement.textContent().catch(() => '');
                if (ratingText) {
                  // 숫자만 추출 (예: "4.5", "5", "3.2" 등)
                  const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
                  if (ratingMatch) {
                    rating = parseFloat(ratingMatch[1]);
                  }
                }
              }
            } catch (e) {
              // 평점 추출 실패
            }
            
            // 작성일자 추출
            let date = null;
            let reviewDate = null;
            try {
              const dateElement = reviewItem.locator('div > div.area_review > div > div.review_detail > div.info_grade > span.txt_date');
              const dateCount = await dateElement.count();
              if (dateCount > 0) {
                const dateText = await dateElement.textContent().catch(() => '');
                if (dateText) {
                  // 날짜 패턴 파싱
                  const datePatterns = [
                    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/,
                    /(\d{2})\.(\d{1,2})\.(\d{1,2})/,
                  ];
                  
                  for (const pattern of datePatterns) {
                    const dateMatch = dateText.match(pattern);
                    if (dateMatch) {
                      let year, month, day;
                      
                      if (dateMatch[1].length === 4) {
                        year = dateMatch[1];
                        month = dateMatch[2].padStart(2, '0');
                        day = dateMatch[3].padStart(2, '0');
                      } else {
                        year = parseInt(dateMatch[1]) < 50 ? `20${dateMatch[1]}` : `19${dateMatch[1]}`;
                        month = dateMatch[2].padStart(2, '0');
                        day = dateMatch[3].padStart(2, '0');
                      }
                      
                      date = `${year}-${month}-${day}`;
                      reviewDate = new Date(date);
                      break;
                    }
                  }
                }
              }
            } catch (e) {
              // 날짜 찾기 실패
            }
            
            // 날짜가 없으면 오늘 날짜 사용
            if (!date) {
              date = new Date().toISOString().split('T')[0];
              reviewDate = new Date();
            }
            
            // 날짜 필터링: week 또는 twoWeeks 모드일 때 필터링
            if ((dateFilter === 'week' || dateFilter === 'twoWeeks') && filterDate && reviewDate && reviewDate < filterDate) {
              continue;
            }
            
            // 리뷰 내용 추출 (더보기 버튼 클릭 포함)
            let content = '';
            try {
              // 내용의 더보기 버튼 클릭
              const contentMoreButton = reviewItem.locator('div > div.area_review > div > div.review_detail > div.wrap_review > a > p > span');
              const hasMoreButton = await contentMoreButton.count() > 0;
              
              if (hasMoreButton) {
                try {
                  const isVisible = await contentMoreButton.isVisible().catch(() => false);
                  if (isVisible) {
                    await contentMoreButton.scrollIntoViewIfNeeded();
                    await this.page.waitForTimeout(500);
                    await contentMoreButton.click({ timeout: 5000 });
                    await this.page.waitForTimeout(2000); // 내용 로딩 대기
                  }
                } catch (e) {
                  // 더보기 버튼 클릭 실패
                }
              }
              
              // 리뷰 내용 추출
              const contentElement = reviewItem.locator('div > div.area_review > div > div.review_detail > div.wrap_review > a > p');
              const contentCount = await contentElement.count();
              if (contentCount > 0) {
                content = await contentElement.textContent().catch(() => '');
                if (content) {
                  // 더보기 버튼 텍스트 제거
                  content = content.replace(/더보기/g, '').trim();
                }
              }
            } catch (e) {
              // 리뷰 내용 찾기 실패
            }
            
            // 좋아요 갯수 추출 (review_keyword로 저장)
            let likeCountText = null;
            try {
              const likeElement = reviewItem.locator('div > div.area_review > div > div.review_unit > button > span.txt_btn');
              const likeElementCount = await likeElement.count();
              if (likeElementCount > 0) {
                const likeText = await likeElement.textContent().catch(() => '');
                if (likeText) {
                  // 숫자만 추출
                  const numberMatch = likeText.match(/(\d+)/);
                  if (numberMatch) {
                    likeCountText = numberMatch[1];
                  }
                }
              }
            } catch (e) {
              // 좋아요 갯수 찾기 실패
            }
            
            // visit_type, emotion은 카카오맵에서 제공하지 않을 수 있음
            const visitType = null;
            const emotion = null;
            const keywords = [];
            
            // 좋아요 갯수를 review_keyword로 저장
            if (likeCountText) {
              keywords.push(`좋아요 ${likeCountText}`);
            }
            
            // 재방문 여부
            let revisitFlag = false;
            try {
              const allText = await reviewItem.textContent().catch(() => '');
              const certText = allText.match(/인증\s*수단|영수증|(\d+)번째\s*방문/);
              if (certText) {
                revisitFlag = true;
              }
            } catch (e) {
              // 인증 정보 찾기 실패
            }
            
            // emotion 값을 visit_keyword에 저장
            const visitKeyword = emotion || null;
            
            // 리뷰 데이터가 유효한지 확인
            if (content.trim().length > 10 || rating > 0 || nickname !== `사용자${i + 1}`) {
              const reviewData = {
                content: content.trim() || '',
                rating,
                nickname: nickname.trim(),
                date,
                visitKeyword: visitKeyword,
                reviewKeyword: keywords.length > 0 ? keywords.join(', ') : null,
                visitType: visitType,
                emotion: null, // 카카오맵도 emotion을 visit_keyword에 저장하므로 null
                revisitFlag,
              };
              
              // 즉시 저장 방식이 활성화된 경우 즉시 저장
              if (saveImmediately && companyName) {
                // date가 없어도 저장 시도
                if (!date) {
                  date = new Date().toISOString().split('T')[0];
                  reviewDate = new Date();
                }
                try {
                  // 날짜 필터링 확인
                  let shouldSave = true;
                  if ((dateFilter === 'week' || dateFilter === 'twoWeeks') && reviewDate) {
                    const today = new Date();
                    const filterDate = new Date(today);
                    filterDate.setDate(today.getDate() - (dateFilter === 'week' ? 7 : 14));
                    if (reviewDate < filterDate) {
                      shouldSave = false;
                    }
                  }
                  
                  if (shouldSave) {
                    const analysis = this.analyzeText(
                      reviewData.content,
                      rating,
                      reviewData.visitKeyword,
                      reviewData.reviewKeyword
                    );
                    
                    const saved = await this.saveReview({
                      portalUrl: '카카오맵',
                      companyName,
                      reviewDate: date,
                      content: reviewData.content,
                      rating: rating || null,
                      nickname: reviewData.nickname,
                      visitKeyword: reviewData.visitKeyword || null,
                      reviewKeyword: reviewData.reviewKeyword || null,
                      visitType: reviewData.visitType || null,
                      emotion: reviewData.emotion || null,
                      revisitFlag: reviewData.revisitFlag || false,
                      nRating: analysis.nRating,
                      nEmotion: analysis.nEmotion,
                      nCharCount: analysis.nCharCount,
                      title: null,
                      additionalInfo: null,
                    });
                    
                    if (saved) {
                      actualSavedCount++;
                      reviews.push(reviewData);
                      if (actualSavedCount <= 10 || actualSavedCount % 50 === 0) {
                        console.log(`✅ [카카오맵 즉시 저장 성공] ${actualSavedCount}번째: ${reviewData.nickname} - date: ${date}`);
                      }
                    } else {
                      reviews.push(reviewData);
                    }
                  } else {
                    reviews.push(reviewData);
                  }
                } catch (saveError) {
                  console.error(`[카카오맵] 리뷰 ${i + 1} 즉시 저장 실패:`, saveError.message);
                  reviews.push(reviewData);
                }
              } else {
                // 기존 방식: 배열에 추가만 함
                reviews.push(reviewData);
              }
            }
          } catch (err) {
            console.error(`리뷰 ${i + 1} 추출 오류:`, err.message);
          }
        }
        
        console.log(`카카오맵 스크래핑 완료: ${reviews.length}개 리뷰 발견`);
        if (saveImmediately) {
          console.log(`[카카오맵] 즉시 저장 완료: ${actualSavedCount}개 리뷰 저장 성공 (추출: ${reviews.length}개)`);
          reviews._actualSavedCount = actualSavedCount;
        }
      } catch (e) {
        console.log('리뷰 추출 실패:', e.message);
      }

      return reviews;
    } catch (error) {
      console.error('카카오맵 스크래핑 실패:', error);
      // 디버깅을 위해 스크린샷 저장
      try {
        await this.page.screenshot({ path: 'kakao-error.png' });
      } catch (e) {
        // 스크린샷 실패는 무시
      }
      return [];
    }
  }

  /**
   * 야놀자 URL 정규화
   * @param {string} url - 야놀자 URL
   * @returns {string} 정규화된 URL
   */
  normalizeYanoljaUrl(url) {
    try {
      const urlObj = new URL(url);
      // 야놀자 URL 형식: https://www.yanolja.com/pension/{숙소ID}
      // 또는 https://www.yanolja.com/hotel/{숙소ID}
      // 쿼리 파라미터 제거하고 기본 URL만 반환
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch (e) {
      return url;
    }
  }

  /**
   * 야놀자 스크래핑 (company_name으로 검색)
   * @param {string} companyName - 기업명 (검색어로 사용)
   * @param {string} dateFilter - 'all' (전체) 또는 'week' (일주일 간격)
   */
  async scrapeYanolja(companyName, dateFilter = 'week', jobId = null, portalType = 'yanolja', saveImmediately = false) {
    let actualSavedCount = 0; // 실제 저장 성공 개수 추적
    try {
      console.log(`야놀자 스크래핑 시작: "${companyName}" 검색 (필터: ${dateFilter}, 즉시 저장: ${saveImmediately ? '활성화' : '비활성화'})`);
      
      // 야놀자 검색 페이지로 이동
      const searchUrl = `https://nol.yanolja.com/results?keyword=${encodeURIComponent(companyName)}`;
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page.waitForTimeout(5000); // 검색 결과 로딩 대기
      
      // 첫 번째 검색 결과의 링크 추출
      console.log('첫 번째 검색 결과 찾는 중...');
      let detailUrl = null;
      
      try {
        // JavaScript로 직접 추출 (야놀자 검색 결과에서 /stay/domestic/ 링크 찾기)
        detailUrl = await this.page.evaluate(() => {
          // 첫 번째 숙소 링크 찾기 (/stay/domestic/ 형식)
          const links = document.querySelectorAll('a[href*="/stay/domestic/"]');
          if (links.length > 0) {
            const href = links[0].getAttribute('href');
            if (href) {
              if (href.startsWith('/')) {
                return `https://nol.yanolja.com${href}`;
              } else if (href.startsWith('http')) {
                return href;
              }
            }
          }
          return null;
        });
        
        if (!detailUrl) {
          // 다른 형식의 링크도 시도
          const allLinks = this.page.locator('a[href*="/stay/"]');
          const linkCount = await allLinks.count();
          if (linkCount > 0) {
            const href = await allLinks.first().getAttribute('href');
            if (href) {
              if (href.startsWith('/')) {
                detailUrl = `https://nol.yanolja.com${href}`;
              } else if (href.startsWith('http')) {
                detailUrl = href;
              }
            }
          }
        }
      } catch (e) {
        console.log('검색 결과 링크 추출 실패:', e.message);
      }
      
      if (!detailUrl) {
        console.log('⚠️ 검색 결과를 찾을 수 없습니다. 이 기업의 스크래핑을 건너뜁니다.');
        return [];
      }
      
      // 상세 페이지로 이동
      console.log(`상세 페이지로 이동: ${detailUrl}`);
      await this.page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page.waitForTimeout(5000); // 페이지 로딩 대기

      const reviews = [];
      
      try {
        // 전체보기 버튼 클릭
        console.log('전체보기 버튼 찾는 중...');
        
        try {
          // 제공된 선택자 사용 (더 간단한 선택자도 시도)
          const reviewButtonSelectors = [
            'body > div.mx-auto.min-h-screen.max-w-mobile-size.shadow-2.pc\\:min-w-pc-with-swiper-btn.pc\\:max-w-none.pc\\:shadow-none > div.mx-auto.pt-52.pc\\:w-pc-size.pc\\:pt-174 > div.relative.block.gap-40.pc\\:flex > section.min-w-0.flex-1 > div.px-16.pb-8.pc\\:px-0.pc\\:pt-20 > div > div.py-6.pc\\:py-16 > section > div.px-12.pc\\:px-20 > div > button',
            'button:has-text("전체보기")',
            'button:has-text("리뷰보기")',
            'button:has-text("리뷰")',
            '[class*="review"] button',
          ];
          
          let reviewButtonClicked = false;
          for (const selector of reviewButtonSelectors) {
            try {
              const reviewButton = this.page.locator(selector);
              const buttonCount = await reviewButton.count();
              if (buttonCount > 0) {
                const isVisible = await reviewButton.first().isVisible().catch(() => false);
                if (isVisible) {
                  await reviewButton.first().scrollIntoViewIfNeeded();
                  await this.page.waitForTimeout(1000);
                  await reviewButton.first().click({ timeout: 5000 });
                  await this.page.waitForTimeout(5000); // 리뷰 섹션 로딩 대기 (시간 증가)
                  console.log('전체보기 버튼 클릭 완료');
                  reviewButtonClicked = true;
                  break;
                }
              }
            } catch (e) {
              // 다음 선택자 시도
              continue;
            }
          }
          
          if (!reviewButtonClicked) {
            console.log('⚠️ 전체보기 버튼을 찾을 수 없습니다. 현재 페이지에서 진행합니다.');
          }
        } catch (e) {
          console.log('전체보기 버튼 클릭 실패:', e.message);
        }

        // 최신작성순 선택 (정렬)
        console.log('최신작성순 선택 중...');
        try {
          const sortButton = this.page.locator('#__next > section > div > div:nth-child(6) > div.css-40d0ex > button');
          const sortButtonCount = await sortButton.count();
          if (sortButtonCount > 0) {
            const isVisible = await sortButton.first().isVisible().catch(() => false);
            if (isVisible) {
              await sortButton.first().scrollIntoViewIfNeeded();
              await this.page.waitForTimeout(1000);
              await sortButton.first().click({ timeout: 5000 });
              await this.page.waitForTimeout(3000); // 정렬 후 리뷰 로딩 대기
              console.log('최신작성순 선택 완료');
            }
          }
        } catch (e) {
          console.log('최신작성순 선택 실패:', e.message);
        }

        // 무한 스크롤로 리뷰 로드
        console.log('무한 스크롤로 리뷰 로드 중...');
        
        let lastReviewCount = 0;
        let noChangeCount = 0;
        const maxScrollAttempts = 50; // 스크롤 시도 횟수 증가
        
        // 초기 리뷰 개수 확인 (야놀자 리뷰 선택자)
        // 리뷰 리스트 컨테이너: #__next > section > div > div.css-1js0bc8
        const reviewListSelector = '#__next > section > div > div.css-1js0bc8 > div';
        let reviewItems = this.page.locator(reviewListSelector);
        lastReviewCount = await reviewItems.count();
        
        if (lastReviewCount === 0) {
          console.log('⚠️ 리뷰를 찾을 수 없습니다.');
          return [];
        }
        
        console.log(`리뷰 선택자 발견: "${reviewListSelector}" (${lastReviewCount}개)`);
        
        console.log(`초기 리뷰 개수: ${lastReviewCount}개`);
        
        // 스크롤하여 더 많은 리뷰 로드
        for (let scrollAttempt = 0; scrollAttempt < maxScrollAttempts; scrollAttempt++) {
          // 다양한 스크롤 방식 시도
          try {
            // 1. 마지막 리뷰 아이템으로 스크롤 (가장 효과적)
            const lastReviewItem = this.page.locator(`${reviewListSelector}:last-child`);
            const lastItemCount = await lastReviewItem.count();
            if (lastItemCount > 0) {
              await lastReviewItem.scrollIntoViewIfNeeded();
              await this.page.waitForTimeout(500);
            }
            
            // 2. JavaScript로 점진적 스크롤 (무한 스크롤 트리거)
            await this.page.evaluate(() => {
              const scrollHeight = document.documentElement.scrollHeight;
              const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
              const windowHeight = window.innerHeight;
              
              // 현재 위치에서 조금씩 스크롤 다운
              window.scrollTo({
                top: currentScroll + windowHeight * 0.8,
                behavior: 'smooth'
              });
            });
            await this.page.waitForTimeout(1000);
            
            // 3. 페이지 하단으로 완전히 스크롤
            await this.page.evaluate(() => {
              window.scrollTo(0, document.body.scrollHeight);
            });
            await this.page.waitForTimeout(1000);
            
            // 4. End 키로 페이지 하단으로 스크롤
            await this.page.keyboard.press('End');
            await this.page.waitForTimeout(1000);
            
            // 5. 리뷰 컨테이너가 있으면 해당 컨테이너로 스크롤
            const reviewContainer = this.page.locator('#__next > section > div > div.css-1js0bc8');
            const containerCount = await reviewContainer.count();
            if (containerCount > 0) {
              await reviewContainer.last().scrollIntoViewIfNeeded();
              await this.page.waitForTimeout(1000);
            }
            
            // 6. 스크롤 이벤트 트리거 (무한 스크롤 활성화)
            await this.page.evaluate(() => {
              window.dispatchEvent(new Event('scroll'));
              window.dispatchEvent(new Event('scrollend'));
            });
            await this.page.waitForTimeout(1000);
            
          } catch (scrollError) {
            // 스크롤 에러는 무시하고 계속 진행
          }
          
          // 리뷰 로딩 대기 (더 긴 대기 시간)
          await this.page.waitForTimeout(3000);
          
          // 리뷰 개수 재확인
          reviewItems = this.page.locator(reviewListSelector);
          const currentCount = await reviewItems.count();
          
          if (currentCount > lastReviewCount) {
            console.log(`스크롤 (${scrollAttempt + 1}번째) - 리뷰: ${lastReviewCount}개 → ${currentCount}개 ✅`);
            lastReviewCount = currentCount;
            noChangeCount = 0;
          } else {
            noChangeCount++;
            // 연속으로 5번 변하지 않으면 중단 (더 많은 기회 제공)
            if (noChangeCount >= 5) {
              console.log(`리뷰 개수가 ${noChangeCount}번 연속 변하지 않아 스크롤을 중단합니다.`);
              break;
            }
          }
        }
        
        // 최종 리뷰 개수 확인
        reviewItems = this.page.locator(reviewListSelector);
        const reviewCount = await reviewItems.count();
        console.log(`최종 리뷰 개수: ${reviewCount}개`);
        
        // 리뷰 데이터 추출
        for (let i = 0; i < reviewCount; i++) {
          try {
            // 각 리뷰 아이템: #__next > section > div > div.css-1js0bc8 > div:nth-child(i+1)
            const reviewItem = this.page.locator(`${reviewListSelector}:nth-child(${i + 1})`);
            
            // rating 추출 (별표로 표시, 숫자로 계산 필요)
            // 절대 경로: #__next > section > div > div.css-1js0bc8 > div:nth-child(1) > div:nth-child(2) > div > div.css-1toaz2b > div:nth-child(1) > div.css-1mdp7n
            let rating = 0;
            try {
              // 절대 경로로 rating 요소 찾기 (리뷰 인덱스만 동적)
              const ratingAbsoluteSelector = `#__next > section > div > div.css-1js0bc8 > div:nth-child(${i + 1}) > div:nth-child(2) > div > div.css-1toaz2b > div:nth-child(1) > div.css-1mdp7n`;
              const ratingElement = this.page.locator(ratingAbsoluteSelector);
              const ratingCount = await ratingElement.count();
              
              if (ratingCount > 0) {
                // SVG 별표 요소 찾기
                const starElements = ratingElement.locator('svg');
                const starCount = await starElements.count();
                
                if (starCount > 0) {
                  // 채워진 별표 개수 확인
                  let filledStars = 0;
                  for (let j = 0; j < starCount; j++) {
                    const star = starElements.nth(j);
                    
                    // SVG의 clip-rule 속성 확인 (빈 별표는 clip-rule="evenodd"가 있음)
                    const svgClipRule = await star.getAttribute('clip-rule').catch(() => '');
                    
                    // path 요소의 fill 속성 확인
                    const pathElements = star.locator('path');
                    const pathCount = await pathElements.count();
                    
                    if (pathCount > 0) {
                      // 첫 번째 path의 속성 확인
                      const firstPath = pathElements.first();
                      const fill = await firstPath.getAttribute('fill').catch(() => '');
                      const fillRule = await firstPath.getAttribute('fill-rule').catch(() => '');
                      const pathClipRule = await firstPath.getAttribute('clip-rule').catch(() => '');
                      
                      // 빈 별표 판별: clip-rule="evenodd"가 있으면 빈 별표
                      if (svgClipRule === 'evenodd' || pathClipRule === 'evenodd') {
                        // 빈 별표는 카운트하지 않음
                        continue;
                      }
                      
                      // 채워진 별표 판별
                      // fill="currentColor"이거나 fill이 none이 아니고 transparent가 아닌 경우
                      if (fill === 'currentColor' || (fill && fill !== 'none' && fill !== 'transparent' && fill !== '')) {
                        filledStars++;
                      }
                    } else {
                      // path가 없으면 일단 채워진 것으로 간주
                      filledStars++;
                    }
                  }
                  
                  rating = filledStars;
                } else {
                  // SVG가 아닌 경우 숫자로 추출 시도
                  const ratingText = await ratingElement.first().textContent().catch(() => '');
                  const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
                  if (ratingMatch) {
                    rating = parseFloat(ratingMatch[1]);
                  }
                }
              } else {
                // 절대 경로로 찾지 못한 경우 상대 경로로 시도
                const ratingSelectors = [
                  'div:nth-child(2) > div > div.css-1toaz2b > div:nth-child(1) > div.css-1mdp7n',
                  'div:nth-child(1) > div:nth-child(2) > div > div.css-1toaz2b > div:nth-child(1) > div.css-1mdp7n',
                  '[class*="css-1mdp7n"]',
                ];
                
                for (const selector of ratingSelectors) {
                  const ratingElement = reviewItem.locator(selector);
                  const ratingCount = await ratingElement.count();
                  if (ratingCount > 0) {
                    const starElements = ratingElement.locator('svg');
                    const starCount = await starElements.count();
                    if (starCount > 0) {
                      // 채워진 별표 개수 확인
                      let filledStars = 0;
                      for (let j = 0; j < starCount; j++) {
                        const star = starElements.nth(j);
                        
                        // SVG의 clip-rule 속성 확인 (빈 별표는 clip-rule="evenodd"가 있음)
                        const svgClipRule = await star.getAttribute('clip-rule').catch(() => '');
                        
                        // path 요소의 fill 속성 확인
                        const pathElements = star.locator('path');
                        const pathCount = await pathElements.count();
                        
                        if (pathCount > 0) {
                          // 첫 번째 path의 속성 확인
                          const firstPath = pathElements.first();
                          const fill = await firstPath.getAttribute('fill').catch(() => '');
                          const pathClipRule = await firstPath.getAttribute('clip-rule').catch(() => '');
                          
                          // 빈 별표 판별: clip-rule="evenodd"가 있으면 빈 별표
                          if (svgClipRule === 'evenodd' || pathClipRule === 'evenodd') {
                            // 빈 별표는 카운트하지 않음
                            continue;
                          }
                          
                          // 채워진 별표 판별
                          // fill="currentColor"이거나 fill이 none이 아니고 transparent가 아닌 경우
                          if (fill === 'currentColor' || (fill && fill !== 'none' && fill !== 'transparent' && fill !== '')) {
                            filledStars++;
                          }
                        } else {
                          // path가 없으면 일단 채워진 것으로 간주
                          filledStars++;
                        }
                      }
                      
                      rating = filledStars;
                      break;
                    }
                  }
                }
              }
            } catch (e) {
              // 평점 추출 실패
            }
            
            // review_date 추출
            // 절대 경로: #__next > section > div > div.css-1js0bc8 > div:nth-child(1) > div:nth-child(2) > div > div.css-1toaz2b > div:nth-child(1) > div.css-1ivchjf
            // 상대 경로: div:nth-child(2) > div > div.css-1toaz2b > div:nth-child(1) > div.css-1ivchjf
            let date = null;
            let reviewDate = null;
            try {
              const dateSelectors = [
                'div:nth-child(2) > div > div.css-1toaz2b > div:nth-child(1) > div.css-1ivchjf',
                'div:nth-child(1) > div:nth-child(2) > div > div.css-1toaz2b > div:nth-child(1) > div.css-1ivchjf',
                'div > div > div.css-1toaz2b > div:nth-child(1) > div.css-1ivchjf',
                '[class*="css-1ivchjf"]', // 클래스 직접 사용
              ];
              
              for (const selector of dateSelectors) {
                const dateElement = reviewItem.locator(selector);
                const dateCount = await dateElement.count();
                if (dateCount > 0) {
                  const dateText = await dateElement.first().textContent().catch(() => '');
                  if (dateText && dateText.trim().length > 0) {
                    // 날짜 패턴 파싱
                    const datePatterns = [
                      /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/,
                      /(\d{2})\.(\d{1,2})\.(\d{1,2})/,
                    ];
                    
                    for (const pattern of datePatterns) {
                      const dateMatch = dateText.match(pattern);
                      if (dateMatch) {
                        let year, month, day;
                        
                        if (dateMatch[1].length === 4) {
                          year = dateMatch[1];
                          month = dateMatch[2].padStart(2, '0');
                          day = dateMatch[3].padStart(2, '0');
                        } else {
                          year = parseInt(dateMatch[1]) < 50 ? `20${dateMatch[1]}` : `19${dateMatch[1]}`;
                          month = dateMatch[2].padStart(2, '0');
                          day = dateMatch[3].padStart(2, '0');
                        }
                        
                        date = `${year}-${month}-${day}`;
                        reviewDate = new Date(date);
                        break;
                      }
                    }
                    
                    if (date) break;
                  }
                }
              }
            } catch (e) {
              // 날짜 찾기 실패
            }
            
            // 날짜가 없으면 오늘 날짜 사용
            if (!date) {
              date = new Date().toISOString().split('T')[0];
              reviewDate = new Date();
            }
            
            // 날짜 필터링
            if (dateFilter === 'week') {
              const today = new Date();
              const oneWeekAgo = new Date(today);
              oneWeekAgo.setDate(today.getDate() - 7);
              if (reviewDate && reviewDate < oneWeekAgo) {
                continue;
              }
            }
            
            // content 추출 (더보기 버튼 클릭 필요)
            // 절대 경로: #__next > section > div > div.css-1js0bc8 > div:nth-child(1) > div:nth-child(2) > div > div:nth-child(3) > div.css-1kpa3g > p
            // 더보기 버튼: #__next > section > div > div.css-1js0bc8 > div:nth-child(1) > div:nth-child(2) > div > div:nth-child(3) > div.css-1z0es1i > div > button
            let content = '';
            try {
              // 절대 경로로 더보기 버튼과 content 선택자 정의 (리뷰 인덱스만 동적)
              const moreButtonAbsoluteSelector = `#__next > section > div > div.css-1js0bc8 > div:nth-child(${i + 1}) > div:nth-child(2) > div > div:nth-child(3) > div.css-1z0es1i > div > button`;
              const contentAbsoluteSelector = `#__next > section > div > div.css-1js0bc8 > div:nth-child(${i + 1}) > div:nth-child(2) > div > div:nth-child(3) > div.css-1kpa3g > p`;
              
              // 더보기 버튼이 있는지 확인하고 클릭 (있는 경우에만)
              const moreButton = this.page.locator(moreButtonAbsoluteSelector);
              const moreButtonCount = await moreButton.count();
              
              if (moreButtonCount > 0) {
                // 버튼이 보이는지 확인
                const isVisible = await moreButton.first().isVisible({ timeout: 2000 }).catch(() => false);
                if (isVisible) {
                  // 스크롤하여 버튼이 보이도록 함
                  await moreButton.first().scrollIntoViewIfNeeded();
                  await this.page.waitForTimeout(500);
                  
                  // JavaScript로 직접 클릭 시도 (DimmedLayer 문제 우회)
                  try {
                    await moreButton.first().click({ timeout: 3000 });
                  } catch (clickError) {
                    // Playwright click 실패 시 JavaScript로 직접 클릭
                    await this.page.evaluate((selector) => {
                      const button = document.querySelector(selector);
                      if (button) {
                        button.click();
                      }
                    }, moreButtonAbsoluteSelector);
                  }
                  // 클릭 후 내용이 확장될 시간 대기
                  await this.page.waitForTimeout(1500);
                }
              }
              
              // 절대 경로로 리뷰 내용 추출 (리뷰 인덱스만 동적)
              const contentElement = this.page.locator(contentAbsoluteSelector);
              const contentCount = await contentElement.count();
              
              if (contentCount > 0) {
                content = await contentElement.first().textContent().catch(() => '');
                if (content) {
                  content = content.trim();
                  // "더보기" 버튼 텍스트 제거
                  content = content.replace(/더보기/g, '').trim();
                }
              }
              
              // 절대 경로로 찾지 못한 경우 상대 경로로 시도
              if (!content || content.length === 0) {
                const contentSelectors = [
                  'div:nth-child(2) > div > div:nth-child(3) > div.css-1kpa3g > p',
                  'div:nth-child(1) > div:nth-child(2) > div > div:nth-child(3) > div.css-1kpa3g > p',
                  'div > div > div:nth-child(3) > div.css-1kpa3g > p',
                  '[class*="css-1kpa3g"] p',
                ];
                
                for (const selector of contentSelectors) {
                  const contentElement = reviewItem.locator(selector);
                  const contentCount = await contentElement.count();
                  if (contentCount > 0) {
                    content = await contentElement.first().textContent().catch(() => '');
                    if (content && content.trim().length > 0) {
                      content = content.trim();
                      content = content.replace(/더보기/g, '').trim();
                      break;
                    }
                  }
                }
              }
            } catch (e) {
              // 리뷰 내용 찾기 실패
            }
            
            // nickname 추출
            // 절대 경로: #__next > section > div > div.css-1js0bc8 > div:nth-child(2) > div:nth-child(3) > div > div.css-1toaz2b > div:nth-child(3) > div > p:nth-child(1) > span:nth-child(1)
            // 상대 경로: div:nth-child(2) > div:nth-child(3) > div > div.css-1toaz2b > div:nth-child(3) > div > p:nth-child(1) > span:nth-child(1)
            let nickname = `사용자${i + 1}`;
            try {
              const nicknameSelectors = [
                'div:nth-child(2) > div:nth-child(3) > div > div.css-1toaz2b > div:nth-child(3) > div > p:nth-child(1) > span:nth-child(1)',
                'div:nth-child(1) > div:nth-child(3) > div > div.css-1toaz2b > div:nth-child(3) > div > p:nth-child(1) > span:nth-child(1)',
                'div > div:nth-child(3) > div > div.css-1toaz2b > div:nth-child(3) > div > p:nth-child(1) > span:nth-child(1)',
                'p:nth-child(1) > span:nth-child(1)', // 더 간단한 선택자
              ];
              
              for (const selector of nicknameSelectors) {
                const nicknameElement = reviewItem.locator(selector);
                const nicknameCount = await nicknameElement.count();
                if (nicknameCount > 0) {
                  const nicknameText = await nicknameElement.first().textContent().catch(() => '');
                  if (nicknameText && nicknameText.trim().length > 0) {
                    nickname = nicknameText.trim();
                    break;
                  }
                }
              }
            } catch (e) {
              // 닉네임 찾기 실패
            }
            
            // visit_type 추출
            // 절대 경로: #__next > section > div > div.css-1js0bc8 > div:nth-child(2) > div:nth-child(3) > div > div.css-1toaz2b > div:nth-child(3) > div > p:nth-child(1) > span.css-2bwu0q
            // 상대 경로: div:nth-child(2) > div:nth-child(3) > div > div.css-1toaz2b > div:nth-child(3) > div > p:nth-child(1) > span.css-2bwu0q
            let visitType = null;
            try {
              const visitTypeSelectors = [
                'div:nth-child(2) > div:nth-child(3) > div > div.css-1toaz2b > div:nth-child(3) > div > p:nth-child(1) > span.css-2bwu0q',
                'div:nth-child(1) > div:nth-child(3) > div > div.css-1toaz2b > div:nth-child(3) > div > p:nth-child(1) > span.css-2bwu0q',
                'div > div:nth-child(3) > div > div.css-1toaz2b > div:nth-child(3) > div > p:nth-child(1) > span.css-2bwu0q',
                'span.css-2bwu0q', // 클래스 직접 사용
              ];
              
              for (const selector of visitTypeSelectors) {
                const visitTypeElement = reviewItem.locator(selector);
                const visitTypeCount = await visitTypeElement.count();
                if (visitTypeCount > 0) {
                  const visitTypeText = await visitTypeElement.first().textContent().catch(() => '');
                  if (visitTypeText && visitTypeText.trim().length > 0) {
                    visitType = visitTypeText.trim();
                    break;
                  }
                }
              }
            } catch (e) {
              // visit_type 찾기 실패
            }
            
            // emotion은 없음
            const emotion = null;
            
            // review_keyword는 없음
            const keywords = [];
            
            // 재방문 여부
            let revisitFlag = false;
            try {
              const allText = await reviewItem.textContent().catch(() => '');
              if (allText && (allText.includes('재방문') || allText.includes('다시') || allText.includes('2번째'))) {
                revisitFlag = true;
              }
            } catch (e) {
              // 재방문 정보 찾기 실패
            }
            
            // 리뷰 데이터가 유효한지 확인 (content가 없어도 nickname이나 visitType이 있으면 저장)
            if (content.trim().length > 10 || rating > 0 || (nickname !== `사용자${i + 1}` && nickname.trim().length > 0)) {
              const reviewData = {
                content: content.trim() || '',
                rating,
                nickname: nickname.trim(),
                date,
                visitKeyword: emotion || null,
                reviewKeyword: keywords.length > 0 ? keywords.join(', ') : null,
                visitType: visitType,
                emotion: null,
                revisitFlag,
              };
              
              // 즉시 저장 방식이 활성화된 경우 즉시 저장
              if (saveImmediately && companyName) {
                // date가 없어도 저장 시도
                if (!date) {
                  date = new Date().toISOString().split('T')[0];
                  reviewDate = new Date();
                }
                try {
                  // 날짜 필터링 확인
                  let shouldSave = true;
                  if ((dateFilter === 'week' || dateFilter === 'twoWeeks') && reviewDate) {
                    const today = new Date();
                    const filterDate = new Date(today);
                    filterDate.setDate(today.getDate() - (dateFilter === 'week' ? 7 : 14));
                    if (reviewDate < filterDate) {
                      shouldSave = false;
                    }
                  }
                  
                  if (shouldSave) {
                    const analysis = this.analyzeText(
                      reviewData.content,
                      rating,
                      reviewData.visitKeyword,
                      reviewData.reviewKeyword
                    );
                    
                    const saved = await this.saveReview({
                      portalUrl: '야놀자',
                      companyName,
                      reviewDate: date,
                      content: reviewData.content,
                      rating: rating || null,
                      nickname: reviewData.nickname,
                      visitKeyword: reviewData.visitKeyword || null,
                      reviewKeyword: reviewData.reviewKeyword || null,
                      visitType: reviewData.visitType || null,
                      emotion: reviewData.emotion || null,
                      revisitFlag: reviewData.revisitFlag || false,
                      nRating: analysis.nRating,
                      nEmotion: analysis.nEmotion,
                      nCharCount: analysis.nCharCount,
                      title: null,
                      additionalInfo: null,
                    });
                    
                    if (saved) {
                      actualSavedCount++;
                      reviews.push(reviewData);
                      if (actualSavedCount <= 10 || actualSavedCount % 50 === 0) {
                        console.log(`✅ [야놀자 즉시 저장 성공] ${actualSavedCount}번째: ${reviewData.nickname} - date: ${date}`);
                      }
                    } else {
                      reviews.push(reviewData);
                    }
                  } else {
                    reviews.push(reviewData);
                  }
                } catch (saveError) {
                  console.error(`[야놀자] 리뷰 ${i + 1} 즉시 저장 실패:`, saveError.message);
                  reviews.push(reviewData);
                }
              } else {
                // 기존 방식: 배열에 추가만 함
                reviews.push(reviewData);
              }
            } else if (i < 3) {
              // 처음 3개 리뷰에서 유효하지 않은 경우 로그
              console.log(`리뷰 ${i + 1} 유효하지 않음: content=${content.length}, rating=${rating}, nickname="${nickname}"`);
            }
          } catch (err) {
            console.error(`리뷰 ${i + 1} 추출 오류:`, err.message);
            console.error(err.stack);
          }
        }
        
        console.log(`야놀자 스크래핑 완료: ${reviews.length}개 리뷰 발견`);
        if (saveImmediately) {
          console.log(`[야놀자] 즉시 저장 완료: ${actualSavedCount}개 리뷰 저장 성공 (추출: ${reviews.length}개)`);
          reviews._actualSavedCount = actualSavedCount;
        }
      } catch (e) {
        console.log('리뷰 추출 실패:', e.message);
      }

      return reviews;
    } catch (error) {
      console.error('야놀자 스크래핑 실패:', error);
      // 디버깅을 위해 스크린샷 저장
      try {
        await this.page.screenshot({ path: 'yanolja-error.png' });
      } catch (e) {
        // 스크린샷 실패는 무시
      }
      return [];
    }
  }

  /**
   * 굿초이스 스크래핑 (예시)
   */
  async scrapeGoodchoice(url) {
    // 굿초이스 스크래핑 로직
    return [];
  }

  /**
   * 구글 여행 스크래핑 (company_name으로 검색)
   * @param {string} companyName - 기업명 (검색어로 사용)
   * @param {string} dateFilter - 'all' (전체) 또는 'week' (일주일 간격)
   */
  async scrapeGoogle(companyName, dateFilter = 'week', jobId = null, portalType = 'google', saveImmediately = false) {
    let actualSavedCount = 0; // 실제 저장 성공 개수 추적
    try {
      console.log(`구글 여행 스크래핑 시작: "${companyName}" 검색 (필터: ${dateFilter}, 즉시 저장: ${saveImmediately ? '활성화' : '비활성화'})`);
      
      // 구글 여행 검색 페이지로 이동
      const searchUrl = `https://www.google.com/travel/search?q=${encodeURIComponent(companyName)}`;
      await this.page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await this.page.waitForTimeout(3000);
      
      // 리뷰 섹션으로 이동 (#reviews)
      try {
        const reviewsLink = this.page.locator('#reviews');
        const reviewsLinkCount = await reviewsLink.count();
        if (reviewsLinkCount > 0) {
          await reviewsLink.first().scrollIntoViewIfNeeded();
          await this.page.waitForTimeout(1000);
          await reviewsLink.first().click({ timeout: 10000 });
          await this.page.waitForTimeout(3000);
        }
      } catch (e) {
        console.log('리뷰 섹션으로 이동 실패:', e.message);
      }
      
      // 최신순 정렬 시도 (구글 리뷰는 기본적으로 최신순이지만 명시적으로 확인)
      try {
        // 정렬 드롭다운 또는 버튼 찾기
        const sortSelectors = [
          'button[aria-label*="Sort"]',
          'button:has-text("Sort")',
          'button:has-text("정렬")',
          '[aria-label*="sort"]',
          '[aria-label*="Sort"]',
        ];
        
        for (const selector of sortSelectors) {
          const sortButton = this.page.locator(selector);
          const count = await sortButton.count();
          if (count > 0) {
            const isVisible = await sortButton.first().isVisible().catch(() => false);
            if (isVisible) {
              await sortButton.first().scrollIntoViewIfNeeded();
              await this.page.waitForTimeout(500);
              await sortButton.first().click({ timeout: 5000 });
              await this.page.waitForTimeout(2000);
              
              // "Newest" 또는 "최신순" 옵션 선택
              const newestOptions = [
                'button:has-text("Newest")',
                'button:has-text("최신순")',
                '[aria-label*="Newest"]',
                '[aria-label*="최신순"]',
              ];
              
              for (const optionSelector of newestOptions) {
                const option = this.page.locator(optionSelector);
                const optionCount = await option.count();
                if (optionCount > 0) {
                  await option.first().click({ timeout: 3000 });
                  await this.page.waitForTimeout(2000);
                  console.log('최신순 정렬 선택 완료');
                  break;
                }
              }
              break;
            }
          }
        }
      } catch (e) {
        console.log('최신순 정렬 선택 실패 (기본 정렬 사용):', e.message);
      }
      
      // 무한 스크롤로 리뷰 로드
      console.log('무한 스크롤로 리뷰 로드 중...');
      
      let lastReviewCount = 0;
      let noChangeCount = 0;
      const maxScrollAttempts = 50;
      
      // 리뷰 리스트 선택자
      const reviewListSelector = '#reviews > c-wiz > c-wiz > div > div > div > div > div.v85cbc > c-wiz > div';
      let reviewItems = this.page.locator(reviewListSelector);
      lastReviewCount = await reviewItems.count();
      
      if (lastReviewCount === 0) {
        console.log('⚠️ 리뷰를 찾을 수 없습니다.');
        return [];
      }
      
      console.log(`리뷰 선택자 발견: "${reviewListSelector}" (${lastReviewCount}개)`);
      console.log(`초기 리뷰 개수: ${lastReviewCount}개`);
      
      // 스크롤하여 더 많은 리뷰 로드
      for (let scrollAttempt = 0; scrollAttempt < maxScrollAttempts; scrollAttempt++) {
        try {
          // 마지막 리뷰 아이템으로 스크롤
          const lastReviewItem = this.page.locator(`${reviewListSelector}:last-child`);
          const lastItemCount = await lastReviewItem.count();
          if (lastItemCount > 0) {
            await lastReviewItem.scrollIntoViewIfNeeded();
            await this.page.waitForTimeout(500);
          }
          
          // JavaScript로 점진적 스크롤
          await this.page.evaluate(() => {
            const scrollHeight = document.documentElement.scrollHeight;
            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
            const windowHeight = window.innerHeight;
            
            window.scrollTo({
              top: currentScroll + windowHeight * 0.8,
              behavior: 'smooth'
            });
          });
          await this.page.waitForTimeout(1000);
          
          // 페이지 하단으로 완전히 스크롤
          await this.page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await this.page.waitForTimeout(1000);
          
          // End 키로 페이지 하단으로 스크롤
          await this.page.keyboard.press('End');
          await this.page.waitForTimeout(1000);
          
          // 스크롤 이벤트 트리거
          await this.page.evaluate(() => {
            window.dispatchEvent(new Event('scroll'));
            window.dispatchEvent(new Event('scrollend'));
          });
          await this.page.waitForTimeout(1000);
          
        } catch (scrollError) {
          // 스크롤 에러는 무시하고 계속 진행
        }
        
        // 리뷰 로딩 대기
        await this.page.waitForTimeout(2000); // 대기 시간 감소
        
        // 리뷰 개수 재확인
        reviewItems = this.page.locator(reviewListSelector);
        const currentCount = await reviewItems.count();
        
        if (currentCount > lastReviewCount) {
          console.log(`스크롤 (${scrollAttempt + 1}번째) - 리뷰: ${lastReviewCount}개 → ${currentCount}개 ✅`);
          lastReviewCount = currentCount;
          noChangeCount = 0;
        } else {
          noChangeCount++;
          if (noChangeCount >= 5) {
            console.log(`리뷰 개수가 ${noChangeCount}번 연속 변하지 않아 스크롤을 중단합니다.`);
            break;
          }
        }
      }
      
      // 최종 리뷰 개수 확인
      reviewItems = this.page.locator(reviewListSelector);
      const reviewCount = await reviewItems.count();
      console.log(`최종 리뷰 개수: ${reviewCount}개`);
      
      // 리뷰 데이터 추출
      const reviews = [];
      for (let i = 0; i < reviewCount; i++) {
        try {
          // 각 리뷰 아이템
          const reviewItem = this.page.locator(`${reviewListSelector}:nth-child(${i + 1})`);
          
          // rating 추출
          let rating = 0;
          try {
            const ratingElement = reviewItem.locator('div > div > div > div > div.aAs4ib > div.GDWaad');
            const ratingText = await ratingElement.first().textContent().catch(() => '');
            if (ratingText) {
              const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
              if (ratingMatch) {
                rating = parseFloat(ratingMatch[1]);
              }
            }
          } catch (e) {
            // rating 추출 실패
          }
          
          // nickname 추출
          let nickname = '';
          try {
            const nicknameElement = reviewItem.locator('div > div > div > div > div.aAs4ib > div.jUkSGf.WwUTAf > span > a');
            nickname = await nicknameElement.first().textContent().catch(() => '');
            if (nickname) {
              nickname = nickname.trim();
            }
          } catch (e) {
            // nickname 추출 실패
          }
          
          // visit_type 추출
          let visitType = '';
          try {
            const visitTypeElement = reviewItem.locator('div > div > div > div > div:nth-child(2) > div.ThUm5b > span');
            visitType = await visitTypeElement.first().textContent().catch(() => '');
            if (visitType) {
              visitType = visitType.trim();
            }
          } catch (e) {
            // visit_type 추출 실패
          }
          
          // content 추출 (제공된 정보 기반)
          // 구조:
          // - 접힌 본문: div[jsname="kmPxT"] 안에 … + Read more 버튼
          // - 펼친 본문: div[jsname="NwoMSd"] 안에 전체 텍스트 (이미 DOM에 존재)
          // 핵심: 클릭 없이 div[jsname="NwoMSd"] span에서 전체 텍스트를 읽을 수 있음
          let content = '';
          
          try {
            // 1단계: 클릭 없이 div[jsname="NwoMSd"]에서 전체 텍스트 읽기 시도 (가장 안정적)
            // Playwright는 숨겨진 요소도 textContent()로 읽을 수 있음
            const fullTextSelectors = [
              'div[jsname="NwoMSd"] span',
              'div[jsname="NwoMSd"] div.STQFb.eoY5cb div.K7oBsc span',
              'div[jsname="NwoMSd"] div.STQFb.eoY5cb span',
            ];
            
            console.log(`[디버깅] 리뷰 ${i + 1} content 추출 시작 - div[jsname="NwoMSd"] 찾기 시도`);
            
            for (const fullTextSelector of fullTextSelectors) {
              try {
                const fullTextElement = reviewItem.locator(fullTextSelector);
                const count = await fullTextElement.count();
                console.log(`[디버깅] 리뷰 ${i + 1} 선택자 "${fullTextSelector}" 검색 결과: ${count}개 발견`);
                
                if (count > 0) {
                  // textContent()로 숨겨진 요소도 읽기
                  const textContents = await fullTextElement.allTextContents().catch(() => []);
                  if (textContents && textContents.length > 0) {
                    content = textContents.join('\n').trim();
                  } else {
                    content = await fullTextElement.first().textContent().catch(() => '') || '';
                  }
                  
                  console.log(`[디버깅] 리뷰 ${i + 1} 선택자 "${fullTextSelector}"에서 추출한 content 길이: ${content ? content.length : 0}`);
                  
                  if (content && content.trim().length > 0) {
                    content = content.trim();
                    // "Read more", "더보기" 텍스트 제거
                    content = content.replace(/Read more/gi, '').replace(/더보기/g, '').replace(/더 보기/g, '').trim();
                    
                    if (content.length > 0) {
                      console.log(`[디버깅] 리뷰 ${i + 1} content 추출 성공 (클릭 없이, 선택자: ${fullTextSelector}, 길이: ${content.length})`);
                      if (content.length < 200) {
                        console.log(`[디버깅] 리뷰 ${i + 1} content 미리보기: "${content}"`);
                      }
                      break;
                    }
                  }
                }
              } catch (e) {
                console.log(`[디버깅] 리뷰 ${i + 1} 선택자 "${fullTextSelector}" 에러:`, e.message);
                continue;
              }
            }
            
            // 2단계: 전체 텍스트를 찾지 못했거나 너무 짧은 경우, Read more 버튼 클릭 시도
            if (!content || content.length < 50) {
              // 접힌 본문 확인 (div[jsname="kmPxT"])
              const foldedContent = await reviewItem.locator('div[jsname="kmPxT"] span').textContent().catch(() => '') || '';
              const hasReadMoreButton = foldedContent && (
                foldedContent.includes('Read more') || 
                foldedContent.includes('더보기') ||
                foldedContent.endsWith('...') ||
                foldedContent.endsWith('…')
              );
              
              if (hasReadMoreButton && i < 10) {
                console.log(`[디버깅] 리뷰 ${i + 1} Read more 버튼 필요 (접힌 본문 길이: ${foldedContent.length})`);
              }
              
              // Read more 버튼 찾기 및 클릭 (리뷰 컨테이너 내부에서)
              // 가장 정확한 선택자: span[jsname="kDNJsb"][role="button"]
              const readMoreButtonSelectors = [
                'span[jsname="kDNJsb"][role="button"]',  // 가장 정확한 선택자
                'span.Jmi7d.TJUuge[jsname="kDNJsb"][role="button"]',
                'span[role="button"][jsname="kDNJsb"]',
              ];
              
              let buttonClicked = false;
              for (const buttonSelector of readMoreButtonSelectors) {
                try {
                  const readMoreButton = reviewItem.locator(buttonSelector);
                  const buttonCount = await readMoreButton.count();
                  
                  if (buttonCount > 0) {
                    const isVisible = await readMoreButton.first().isVisible({ timeout: 1000 }).catch(() => false);
                    if (isVisible) {
                      const buttonText = await readMoreButton.first().textContent().catch(() => '') || '';
                      const buttonTextLower = buttonText.toLowerCase().trim();
                      
                      // "Read more", "더보기" 확인
                      const isReadMore = 
                        buttonTextLower.includes('read more') || 
                        buttonTextLower.includes('readmore') ||
                        buttonText.includes('더보기') ||
                        buttonText.includes('더 보기');
                      
                      if (isReadMore) {
                        if (i < 10) {
                          console.log(`[디버깅] 리뷰 ${i + 1} Read more 버튼 발견: "${buttonText}"`);
                        }
                        
                        // 스크롤 후 클릭
                        await readMoreButton.first().scrollIntoViewIfNeeded();
                        await this.page.waitForTimeout(300);
                        
                        try {
                          await readMoreButton.first().click({ timeout: 2000 });
                          buttonClicked = true;
                          if (i < 10) {
                            console.log(`[디버깅] 리뷰 ${i + 1} Read more 버튼 클릭 성공 (Playwright)`);
                          }
                          // 클릭 후 content가 나타날 때까지 대기
                          await this.page.waitForTimeout(1200);
                          
                          // 클릭 후 다시 div[jsname="NwoMSd"]에서 읽기
                          for (const fullTextSelector of fullTextSelectors) {
                            try {
                              const fullTextElement = reviewItem.locator(fullTextSelector);
                              const count = await fullTextElement.count();
                              if (count > 0) {
                                const textContents = await fullTextElement.allTextContents().catch(() => []);
                                if (textContents && textContents.length > 0) {
                                  content = textContents.join('\n').trim();
                                } else {
                                  content = await fullTextElement.first().textContent().catch(() => '') || '';
                                }
                                
                                if (content && content.trim().length > 0) {
                                  content = content.trim();
                                  content = content.replace(/Read more/gi, '').replace(/더보기/g, '').replace(/더 보기/g, '').trim();
                                  
                                  if (content.length > 0) {
                                    if (i < 10) {
                                      console.log(`[디버깅] 리뷰 ${i + 1} content 추출 성공 (클릭 후, 선택자: ${fullTextSelector}, 길이: ${content.length})`);
                                    }
                                    break;
                                  }
                                }
                              }
                            } catch (e) {
                              continue;
                            }
                          }
                          
                          break;
                        } catch (clickError) {
                          if (i < 10) {
                            console.log(`[디버깅] 리뷰 ${i + 1} Read more 버튼 클릭 실패 (Playwright):`, clickError.message);
                          }
                          
                          // JavaScript로 클릭 시도
                          try {
                            const clicked = await reviewItem.evaluate((selector) => {
                              const button = document.querySelector(selector);
                              if (button) {
                                const text = (button.textContent || '').trim();
                                const textLower = text.toLowerCase();
                                if (textLower.includes('read more') || textLower.includes('readmore') || text.includes('더보기') || text.includes('더 보기')) {
                                  button.click();
                                  return true;
                                }
                              }
                              return false;
                            }, buttonSelector);
                            
                            if (clicked) {
                              buttonClicked = true;
                              if (i < 10) {
                                console.log(`[디버깅] 리뷰 ${i + 1} Read more 버튼 클릭 성공 (JavaScript)`);
                              }
                              await this.page.waitForTimeout(1200);
                              
                              // 클릭 후 다시 읽기
                              for (const fullTextSelector of fullTextSelectors) {
                                try {
                                  const fullTextElement = reviewItem.locator(fullTextSelector);
                                  const count = await fullTextElement.count();
                                  if (count > 0) {
                                    const textContents = await fullTextElement.allTextContents().catch(() => []);
                                    if (textContents && textContents.length > 0) {
                                      content = textContents.join('\n').trim();
                                    } else {
                                      content = await fullTextElement.first().textContent().catch(() => '') || '';
                                    }
                                    
                                    if (content && content.trim().length > 0) {
                                      content = content.trim();
                                      content = content.replace(/Read more/gi, '').replace(/더보기/g, '').replace(/더 보기/g, '').trim();
                                      
                                      if (content.length > 0) {
                                        break;
                                      }
                                    }
                                  }
                                } catch (e) {
                                  continue;
                                }
                              }
                              
                              break;
                            }
                          } catch (jsError) {
                            if (i < 10) {
                              console.log(`[디버깅] 리뷰 ${i + 1} Read more 버튼 클릭 실패 (JavaScript):`, jsError.message);
                            }
                          }
                        }
                      }
                    }
                  }
                } catch (e) {
                  continue;
                }
              }
            }
            
            // 3단계: fallback - 다른 선택자로 시도
            if (!content || content.length === 0) {
              const fallbackSelectors = [
                'div.kVathc.eoY5cb > div:nth-child(2) > div',
                'div[jsname="NwoMSd"]',
                'div.STQFb.eoY5cb div.K7oBsc span',
                'div.STQFb.eoY5cb span',
              ];
              
              for (const fallbackSelector of fallbackSelectors) {
                try {
                  const fallbackElement = reviewItem.locator(fallbackSelector);
                  const count = await fallbackElement.count();
                  if (count > 0) {
                    const textContents = await fallbackElement.allTextContents().catch(() => []);
                    if (textContents && textContents.length > 0) {
                      content = textContents.join('\n').trim();
                    } else {
                      content = await fallbackElement.first().textContent().catch(() => '') || '';
                    }
                    
                    if (content && content.trim().length > 0) {
                      content = content.trim();
                      content = content.replace(/Read more/gi, '').replace(/더보기/g, '').replace(/더 보기/g, '').trim();
                      
                      if (content.length > 0) {
                        if (i < 10) {
                          console.log(`[디버깅] 리뷰 ${i + 1} content 추출 성공 (fallback, 선택자: ${fallbackSelector}, 길이: ${content.length})`);
                        }
                        break;
                      }
                    }
                  }
                } catch (e) {
                  continue;
                }
              }
            }
            
            if (!content || content.length === 0) {
              if (i < 10) {
                console.log(`[디버깅] 리뷰 ${i + 1} content 추출 최종 실패`);
              }
            } else if (i < 10) {
              console.log(`[디버깅] 리뷰 ${i + 1} content 최종 추출 성공 (길이: ${content.length})`);
            }
          } catch (e) {
            console.log(`[디버깅] 리뷰 ${i + 1} content 추출 실패:`, e.message);
          }
          
          // visit_keyword 추출 (read more 클릭 후에도 추출 가능)
          // 제공된 HTML: visit_keyword는 <div class="X4nL7d"><div><div class="dA5Vzb"><span class="uTU5Ac">Service</span><span>4.0</span></div>...</div></div> 안에 있음
          let visitKeyword = '';
          try {
            const visitKeywordSelectors = [
              // 정확한 선택자 (제공된 HTML 기반 - read more 클릭 후)
              'div[jsname="NwoMSd"] div.X4nL7d',
              'div.STQFb.eoY5cb div.X4nL7d',
              // 일반적인 선택자
              'div.kVathc.eoY5cb div.X4nL7d',
              'div.kVathc.eoY5cb > div:nth-child(2) > div > div.X4nL7d',
              'div > div > div > div > div.v85cbc > c-wiz > div:nth-child(1) > div > div > div:nth-child(3) > div:nth-child(2) > div.kVathc.eoY5cb > div:nth-child(2) > div > div.X4nL7d',
              // read more 클릭 후 경로에서도 시도 (reviewItem 내에서 상대 경로)
              'div:nth-child(6) > div:nth-child(2) > div.kVathc.eoY5cb > div:nth-child(2) > div > div.X4nL7d',
              'div.kVathc.eoY5cb > div:nth-child(2) > div > div > div.X4nL7d',
              'div.X4nL7d',
            ];
            
            for (const selector of visitKeywordSelectors) {
              try {
                const visitKeywordElement = reviewItem.locator(selector);
                const count = await visitKeywordElement.count();
                if (count > 0) {
                  visitKeyword = await visitKeywordElement.first().textContent().catch(() => '');
                  if (visitKeyword) {
                    visitKeyword = visitKeyword.trim();
                    if (visitKeyword.length > 0) {
                      if (i < 5) {
                        console.log(`[디버깅] 리뷰 ${i + 1} visit_keyword 추출 성공: "${visitKeyword}"`);
                      }
                      break;
                    }
                  }
                }
              } catch (e) {
                // 다음 선택자 시도
                continue;
              }
            }
          } catch (e) {
            console.log(`[디버깅] 리뷰 ${i + 1} visit_keyword 추출 실패:`, e.message);
          }
          
          // review_date 추출 (날짜 타입이 아님)
          let reviewDate = null;
          let date = null;
          try {
            // 여러 날짜 선택자 시도
            const dateSelectors = [
              'div > div:nth-child(6) > div:nth-child(6) > div.aAs4ib > div.jUkSGf.WwUTAf > span > span',
              'div.jUkSGf.WwUTAf > span > span',
              'div.aAs4ib > div.jUkSGf > span > span',
              'span:has-text("전에 Google에서 작성")',
              'span:has-text("주 전")',
              'span:has-text("개월 전")',
            ];
            
            let dateText = '';
            for (const selector of dateSelectors) {
              const dateElement = reviewItem.locator(selector);
              const count = await dateElement.count();
              if (count > 0) {
                dateText = await dateElement.first().textContent().catch(() => '');
                if (dateText && dateText.trim()) {
                  break;
                }
              }
            }
            
            if (dateText) {
              const trimmedDateText = dateText.trim();
              console.log(`[디버깅] 리뷰 ${i + 1} 날짜 텍스트: "${trimmedDateText}"`);
              
              // 상대적 날짜 파싱 (예: "1주 전", "1개월 전", "정확히 1주 전에 Google에서 작성")
              const relativeDatePatterns = [
                /정확히\s*(\d+)\s*주\s*전/,
                /(\d+)\s*주\s*전/,
                /(\d+)\s*개월\s*전/,
                /(\d+)\s*일\s*전/,
                /(\d+)\s*년\s*전/,
              ];
              
              let daysAgo = 0;
              let matched = false;
              for (const pattern of relativeDatePatterns) {
                const match = trimmedDateText.match(pattern);
                if (match) {
                  matched = true;
                  const value = parseInt(match[1]);
                  if (pattern.source.includes('주')) {
                    daysAgo = value * 7;
                  } else if (pattern.source.includes('개월')) {
                    daysAgo = value * 30; // 대략적으로
                  } else if (pattern.source.includes('일')) {
                    daysAgo = value;
                  } else if (pattern.source.includes('년')) {
                    daysAgo = value * 365;
                  }
                  
                  if (daysAgo > 0) {
                    const today = new Date();
                    const reviewDateObj = new Date(today);
                    reviewDateObj.setDate(today.getDate() - daysAgo);
                    date = reviewDateObj.toISOString().split('T')[0];
                    reviewDate = reviewDateObj;
                    console.log(`[디버깅] 리뷰 ${i + 1} 상대적 날짜 파싱 성공: "${trimmedDateText}" → ${date} (${daysAgo}일 전)`);
                    break;
                  }
                }
              }
              
              // 패턴 매칭이 안 된 경우에도 텍스트에 포함된 키워드로 확인
              if (!matched && !date) {
                if (trimmedDateText.includes('주 전') || trimmedDateText.includes('주전')) {
                  const weekMatch = trimmedDateText.match(/(\d+)\s*주/);
                  if (weekMatch) {
                    daysAgo = parseInt(weekMatch[1]) * 7;
                    const today = new Date();
                    const reviewDateObj = new Date(today);
                    reviewDateObj.setDate(today.getDate() - daysAgo);
                    date = reviewDateObj.toISOString().split('T')[0];
                    reviewDate = reviewDateObj;
                    console.log(`[디버깅] 리뷰 ${i + 1} 상대적 날짜 파싱 성공 (키워드): "${trimmedDateText}" → ${date} (${daysAgo}일 전)`);
                  }
                } else if (trimmedDateText.includes('개월 전') || trimmedDateText.includes('개월전')) {
                  const monthMatch = trimmedDateText.match(/(\d+)\s*개월/);
                  if (monthMatch) {
                    daysAgo = parseInt(monthMatch[1]) * 30;
                    const today = new Date();
                    const reviewDateObj = new Date(today);
                    reviewDateObj.setDate(today.getDate() - daysAgo);
                    date = reviewDateObj.toISOString().split('T')[0];
                    reviewDate = reviewDateObj;
                    console.log(`[디버깅] 리뷰 ${i + 1} 상대적 날짜 파싱 성공 (키워드): "${trimmedDateText}" → ${date} (${daysAgo}일 전)`);
                  }
                }
              }
              
              // 상대적 날짜 파싱이 실패한 경우 절대 날짜 파싱 시도
              if (!date) {
                const datePatterns = [
                  /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/,
                  /(\d{2})\.(\d{1,2})\.(\d{1,2})/,
                  /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
                ];
                
                for (const pattern of datePatterns) {
                  const dateMatch = trimmedDateText.match(pattern);
                  if (dateMatch) {
                    let year, month, day;
                    
                    if (dateMatch[1].length === 4) {
                      year = dateMatch[1];
                      month = dateMatch[2].padStart(2, '0');
                      day = dateMatch[3].padStart(2, '0');
                    } else if (dateMatch[3].length === 4) {
                      year = dateMatch[3];
                      month = dateMatch[1].padStart(2, '0');
                      day = dateMatch[2].padStart(2, '0');
                    } else {
                      year = parseInt(dateMatch[1]) < 50 ? `20${dateMatch[1]}` : `19${dateMatch[1]}`;
                      month = dateMatch[2].padStart(2, '0');
                      day = dateMatch[3].padStart(2, '0');
                    }
                    
                    date = `${year}-${month}-${day}`;
                    reviewDate = new Date(date);
                    console.log(`[디버깅] 리뷰 ${i + 1} 절대 날짜 파싱 성공: "${trimmedDateText}" → ${date}`);
                    break;
                  }
                }
              }
              
              // 날짜 파싱 실패 시 로그 출력
              if (!date) {
                console.log(`[디버깅] 리뷰 ${i + 1} 날짜 파싱 실패: "${trimmedDateText}"`);
              }
            }
          } catch (e) {
            console.log(`[디버깅] 리뷰 ${i + 1} 날짜 추출 실패:`, e.message);
          }
          
          // 날짜가 없으면 리뷰를 건너뜀 (오늘 날짜 사용하지 않음)
          if (!date) {
            console.log(`[디버깅] 리뷰 ${i + 1} 날짜가 없어 건너뜀`);
            continue;
          }
          
          // 날짜 필터링
          if (dateFilter === 'week') {
            const today = new Date();
            const oneWeekAgo = new Date(today);
            oneWeekAgo.setDate(today.getDate() - 7);
            if (reviewDate && reviewDate < oneWeekAgo) {
              continue;
            }
          }
          
          // emotion은 없음
          const emotion = null;
          
          // review_keyword는 없음
          const keywords = [];
          
          // 리뷰 데이터가 유효한지 확인
          if (content.trim().length > 10 || rating > 0 || (nickname && nickname.trim().length > 0)) {
            const reviewData = {
              content: content.trim() || '',
              nickname: nickname || `사용자${i + 1}`,
              rating: rating,
              visitType: visitType || '',
              emotion: emotion,
              reviewKeyword: keywords,
              visitKeyword: visitKeyword || '',
              reviewDate: date,
              revisitFlag: false,
            };
            
            // 즉시 저장 방식이 활성화된 경우 즉시 저장
            if (saveImmediately && companyName && date) {
              try {
                // 날짜 필터링 확인
                let shouldSave = true;
                if ((dateFilter === 'week' || dateFilter === 'twoWeeks') && reviewDate) {
                  const today = new Date();
                  const filterDate = new Date(today);
                  filterDate.setDate(today.getDate() - (dateFilter === 'week' ? 7 : 14));
                  if (reviewDate < filterDate) {
                    shouldSave = false;
                  }
                }
                
                if (shouldSave) {
                  const analysis = this.analyzeText(
                    reviewData.content,
                    rating,
                    reviewData.visitKeyword,
                    Array.isArray(reviewData.reviewKeyword) ? reviewData.reviewKeyword.join(', ') : reviewData.reviewKeyword
                  );
                  
                  const saved = await this.saveReview({
                    portalUrl: '구글',
                    companyName,
                    reviewDate: date,
                    content: reviewData.content,
                    rating: rating || null,
                    nickname: reviewData.nickname,
                    visitKeyword: reviewData.visitKeyword || null,
                    reviewKeyword: Array.isArray(reviewData.reviewKeyword) ? reviewData.reviewKeyword.join(', ') : reviewData.reviewKeyword || null,
                    visitType: reviewData.visitType || null,
                    emotion: reviewData.emotion || null,
                    revisitFlag: reviewData.revisitFlag || false,
                    nRating: analysis.nRating,
                    nEmotion: analysis.nEmotion,
                    nCharCount: analysis.nCharCount,
                    title: null,
                    additionalInfo: null,
                  });
                  
                  if (saved) {
                    actualSavedCount++;
                    reviews.push(reviewData);
                    if (actualSavedCount <= 10 || actualSavedCount % 50 === 0) {
                      console.log(`✅ [구글 즉시 저장 성공] ${actualSavedCount}번째: ${reviewData.nickname} - date: ${date}`);
                    }
                  } else {
                    reviews.push(reviewData);
                  }
                } else {
                  reviews.push(reviewData);
                }
              } catch (saveError) {
                console.error(`[구글] 리뷰 ${i + 1} 즉시 저장 실패:`, saveError.message);
                reviews.push(reviewData);
              }
            } else {
              // 기존 방식: 배열에 추가만 함
              reviews.push(reviewData);
            }
          }
        } catch (error) {
          console.log(`리뷰 ${i + 1} 추출 실패:`, error.message);
        }
      }
      
      console.log(`구글 여행 스크래핑 완료: ${reviews.length}개 리뷰 발견`);
      if (saveImmediately) {
        console.log(`[구글] 즉시 저장 완료: ${actualSavedCount}개 리뷰 저장 성공 (추출: ${reviews.length}개)`);
        reviews._actualSavedCount = actualSavedCount;
      }
      return reviews;
      
    } catch (error) {
      console.error('구글 여행 스크래핑 실패:', error);
      return [];
    }
  }

  /**
   * 트립어드바이저 스크래핑 (예시)
   */
  async scrapeTripadvisor(url) {
    // 트립어드바이저 스크래핑 로직
    return [];
  }

  /**
   * 아고다 스크래핑
   * @param {string} companyName - 기업명
   * @param {string} dateFilter - 날짜 필터 ('all', 'week', '2weeks')
   * @param {string} agodaUrl - 아고다 URL (companies 테이블의 agoda_url)
   */
  async scrapeAgoda(companyName, dateFilter = 'all', agodaUrl = null, jobId = null, portalType = 'agoda', saveImmediately = false) {
    let actualSavedCount = 0; // 실제 저장 성공 개수 추적
    try {
      console.log(`아고다 스크래핑 시작: "${companyName}" 검색(필터: ${dateFilter}, 즉시 저장: ${saveImmediately ? '활성화' : '비활성화'})`);
      
      // agoda_url이 있으면 직접 URL로 이동
      if (agodaUrl) {
        console.log(`직접 URL로 이동: ${agodaUrl}`);
        await this.page.goto(agodaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.page.waitForTimeout(2000);
        
        // 빈 화면 클릭 (모달/오버레이 닫기)
        try {
          console.log('빈 화면 클릭 (모달/오버레이 닫기)');
          // 페이지 중앙의 빈 공간 클릭
          await this.page.mouse.click(400, 300);
          await this.page.waitForTimeout(1000);
        } catch (e) {
          console.log('빈 화면 클릭 실패 (계속 진행):', e.message);
        }
      } else {
        // 기존 검색 로직
        // 아고다 메인 페이지로 이동
        await this.page.goto('https://www.agoda.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.page.waitForTimeout(2000);
        
        // 검색 입력창에 기업명 입력
        try {
          const searchInput = this.page.locator('#textInput');
          const inputCount = await searchInput.count();
          if (inputCount > 0) {
            await searchInput.first().fill(companyName);
            await this.page.waitForTimeout(2000);
            
            // Enter 키로 검색 실행 (검색 결과 클릭 대신)
            console.log('Enter 키로 검색 실행');
            await this.page.keyboard.press('Enter');
            await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
            await this.page.waitForTimeout(3000);
            
            // 검색 결과 페이지로 이동했는지 확인
            const currentUrl = this.page.url();
            console.log(`검색 후 URL: ${currentUrl}`);
            
            // 검색 결과 페이지에서 첫 번째 호텔 클릭
            // 여러 시나리오 처리: 검색 결과 페이지, 자동완성 클릭, 직접 호텔 페이지
            if (currentUrl.includes('/search') || currentUrl.includes('agoda.com')) {
              // 검색 결과 목록에서 첫 번째 호텔 찾기 (더 많은 선택자 시도)
              const hotelSelectors = [
                'a[data-selenium="hotel-item-title"]',
                'a[data-element-name="hotel-title"]',
                '.PropertyCard__Link',
                'a.PropertyCard',
                '[data-testid="property-card"] a',
                'a[href*="/hotels/"]',
                'a[href*="/property/"]',
                'a[href*="/hotel/"]',
                '.property-card a',
                '.hotel-card a',
                '[class*="PropertyCard"] a',
                '[class*="HotelCard"] a',
              ];
              
              let hotelFound = false;
              // 먼저 검색어와 일치하는 호텔 찾기
              for (const selector of hotelSelectors) {
                const hotelLink = this.page.locator(selector);
                const count = await hotelLink.count();
                if (count > 0) {
                  console.log(`호텔 링크 발견 (선택자: "${selector}", ${count}개)`);
                  
                  // 검색어와 일치하는 호텔 찾기
                  let matchedHotel = null;
                  const searchTerms = companyName.toLowerCase().split(/\s+/).filter(s => s.length > 1);
                  
                  for (let i = 0; i < Math.min(count, 10); i++) {
                    try {
                      const link = hotelLink.nth(i);
                      const text = await link.textContent().catch(() => '');
                      const href = await link.getAttribute('href').catch(() => null);
                      
                      if (text && href) {
                        const textLower = text.toLowerCase();
                        // 검색어의 주요 단어들이 포함되어 있는지 확인
                        const matchCount = searchTerms.filter(term => textLower.includes(term)).length;
                        const matchRatio = searchTerms.length > 0 ? matchCount / searchTerms.length : 0;
                        
                        if (matchRatio >= 0.5) { // 50% 이상 일치
                          console.log(`✅ 검색어와 일치하는 호텔 발견 (일치도: ${Math.round(matchRatio * 100)}%): ${text.substring(0, 50)}`);
                          matchedHotel = { href, text };
                          break;
                        }
                      }
                    } catch (e) {}
                  }
                  
                  // 일치하는 호텔이 없으면 첫 번째 호텔 사용
                  if (!matchedHotel && count > 0) {
                    const firstText = await hotelLink.first().textContent().catch(() => '');
                    const firstHref = await hotelLink.first().getAttribute('href').catch(() => null);
                    if (firstHref) {
                      console.log(`⚠️ 검색어와 일치하는 호텔을 찾지 못함, 첫 번째 호텔 사용: ${firstText.substring(0, 50)}`);
                      matchedHotel = { href: firstHref, text: firstText };
                    }
                  }
                  
                  if (matchedHotel && matchedHotel.href) {
                    // 한국어 URL 경로 처리: /ko-kr/ 경로가 없으면 추가
                    let fullUrl = matchedHotel.href.startsWith('http') ? matchedHotel.href : `https://www.agoda.com${matchedHotel.href}`;
                    
                    // URL에 /ko-kr/이 없고 /hotel/ 또는 /hotels/가 있으면 추가
                    if (!fullUrl.includes('/ko-kr/') && (fullUrl.includes('/hotel/') || fullUrl.includes('/hotels/'))) {
                      fullUrl = fullUrl.replace('https://www.agoda.com/', 'https://www.agoda.com/ko-kr/');
                    }
                    
                    console.log(`호텔 상세 페이지로 이동: ${fullUrl}`);
                    console.log(`  - 원본 href: ${matchedHotel.href}`);
                    await this.page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await this.page.waitForTimeout(3000);
                    
                    // 이동 후 URL 확인 (리다이렉트나 쿼리 파라미터 추가 여부 확인)
                  const finalUrl = this.page.url();
                  console.log(`이동 후 최종 URL: ${finalUrl}`);
                  
                  // URL 비교 (디버깅)
                  if (finalUrl !== fullUrl) {
                    console.log(`  ⚠️ URL이 변경됨: ${fullUrl} → ${finalUrl}`);
                  }
                  
                  hotelFound = true;
                  break;
                }
              }
            }
            
            // 선택자로 찾지 못한 경우, 텍스트 기반 검색 시도
            if (!hotelFound) {
              console.log('선택자로 호텔을 찾지 못함, 텍스트 기반 검색 시도');
              const hotelByText = await this.page.evaluate((searchTerm) => {
                const links = Array.from(document.querySelectorAll('a[href*="/hotel"], a[href*="/property"]'));
                for (const link of links) {
                  const text = link.textContent || '';
                  if (text.toLowerCase().includes(searchTerm.toLowerCase().substring(0, 5))) {
                    return link.href;
                  }
                }
                // 첫 번째 호텔 링크라도 반환
                if (links.length > 0) {
                  return links[0].href;
                }
                return null;
              }, companyName);
              
              if (hotelByText) {
                // 한국어 URL 경로 처리
                let fullUrl = hotelByText.startsWith('http') ? hotelByText : `https://www.agoda.com${hotelByText}`;
                if (!fullUrl.includes('/ko-kr/') && (fullUrl.includes('/hotel/') || fullUrl.includes('/hotels/'))) {
                  fullUrl = fullUrl.replace('https://www.agoda.com/', 'https://www.agoda.com/ko-kr/');
                }
                console.log(`텍스트 기반 검색으로 호텔 발견: ${fullUrl}`);
                await this.page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await this.page.waitForTimeout(3000);
                const finalUrl = this.page.url();
                console.log(`이동 후 최종 URL: ${finalUrl}`);
                hotelFound = true;
              }
            }
          }
        } else {
          console.log('검색 입력창을 찾을 수 없습니다.');
          return [];
        }
      } catch (e) {
        console.log('검색 입력 실패:', e.message);
        return [];
      }
      } // 검색 로직 else 블록 종료
      
      // 호텔 상세 페이지로 이동 확인
      // 실제 URL 형식: https://www.agoda.com/ko-kr/[hotel-name]/hotel/[location].html
      const currentUrl = this.page.url();
      const isHotelPage = currentUrl.includes('/ko-kr/') && 
                          (currentUrl.includes('/hotel/') || currentUrl.includes('/hotels/')) ||
                          currentUrl.includes('/property/') ||
                          currentUrl.match(/\/ko-kr\/[^\/]+\/hotel\/[^\/]+\.html/);
      
      if (!isHotelPage && (currentUrl === 'https://www.agoda.com/' || currentUrl.includes('?ds='))) {
        console.log('⚠️ 호텔 상세 페이지로 이동하지 못함 - 검색 결과 페이지에서 호텔 찾기 재시도');
        // 검색 결과 페이지에서 호텔 찾기 재시도
        const hotelSelectors = [
          'a[data-selenium="hotel-item-title"]',
          'a[data-element-name="hotel-title"]',
          '.PropertyCard__Link',
          'a.PropertyCard',
          '[data-testid="property-card"] a',
          'a[href*="/hotels/"]',
          'a[href*="/property/"]',
        ];
        
        for (const selector of hotelSelectors) {
          const hotelLink = this.page.locator(selector);
          const count = await hotelLink.count();
          if (count > 0) {
            console.log(`호텔 링크 발견 (선택자: "${selector}")`);
            const href = await hotelLink.first().getAttribute('href').catch(() => null);
            if (href) {
              let fullUrl = href.startsWith('http') ? href : `https://www.agoda.com${href}`;
              if (!fullUrl.includes('/ko-kr/') && (fullUrl.includes('/hotel/') || fullUrl.includes('/hotels/'))) {
                fullUrl = fullUrl.replace('https://www.agoda.com/', 'https://www.agoda.com/ko-kr/');
              }
              console.log(`호텔 상세 페이지로 이동 (재시도): ${fullUrl}`);
              await this.page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await this.page.waitForTimeout(3000);
              const finalUrl = this.page.url();
              console.log(`이동 후 최종 URL: ${finalUrl}`);
              break;
            }
          }
        }
      }
      
      // 리뷰 섹션으로 이동 (리뷰 탭 클릭 또는 스크롤)
      try {
        // 리뷰 탭/버튼 찾기 (여러 선택자 시도)
        const reviewTabSelectors = [
          'a:has-text("Reviews")',
          'button:has-text("Reviews")',
          'a:has-text("리뷰")',
          'button:has-text("리뷰")',
          '[data-testid*="review"]',
          '[aria-label*="Review"]',
          '[aria-label*="리뷰"]',
        ];
        
        let reviewTab = null;
        let tabCount = 0;
        
        for (const selector of reviewTabSelectors) {
          reviewTab = this.page.locator(selector);
          tabCount = await reviewTab.count();
          if (tabCount > 0) {
            console.log(`리뷰 탭 발견 (선택자: "${selector}")`);
            break;
          }
        }
        
        if (tabCount > 0 && reviewTab) {
          console.log('리뷰 탭 클릭');
          await reviewTab.first().scrollIntoViewIfNeeded();
          await this.page.waitForTimeout(1000);
          await reviewTab.first().click({ timeout: 5000 });
          await this.page.waitForTimeout(3000);
        } else {
          // 리뷰 섹션으로 스크롤
          console.log('리뷰 탭을 찾을 수 없음, 리뷰 섹션으로 스크롤 시도');
          await this.page.evaluate(() => {
            const reviewSection = document.querySelector('[id*="review"], [class*="Review"], [data-testid*="review"]');
            if (reviewSection) {
              reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              window.scrollTo(0, document.body.scrollHeight / 2);
            }
          });
          await this.page.waitForTimeout(3000);
        }
      } catch (e) {
        console.log('리뷰 섹션 이동 실패 (계속 진행):', e.message);
      }
      
      // 리뷰 섹션이 로드되었는지 확인
      await this.page.waitForTimeout(2000);
      const reviewCheck = await this.page.locator('[id^="review-"]').count();
      const sortCheck = await this.page.locator('#review-sort-id').count();
      console.log(`리뷰 섹션 확인: 리뷰 ${reviewCheck}개, 정렬 선택자 ${sortCheck}개 발견`);
      
      // 최신순 선택 (제공된 선택자: #review-sort-id > option:nth-child(1))
      try {
        const sortSelect = this.page.locator('#review-sort-id');
        const sortCount = await sortSelect.count();
        if (sortCount > 0) {
          // 방법 1: Playwright selectOption 시도
          let selectionResult = { success: false };
          try {
            await sortSelect.first().selectOption({ value: '1' }); // value="1"이 최신순
            await this.page.waitForTimeout(1000);
            
            // 선택 확인
            const checkResult = await sortSelect.first().evaluate((select) => {
              return {
                selectedIndex: select.selectedIndex,
                selectedValue: select.value,
                selectedText: select.options[select.selectedIndex]?.text || '',
              };
            });
            
            if (checkResult.selectedValue === '1') {
              selectionResult = {
                success: true,
                changed: true,
                newValue: '1',
                newText: checkResult.selectedText,
              };
              console.log(`최신순 필터 선택 완료 (Playwright): "${checkResult.selectedText}" (value: ${checkResult.selectedValue})`);
            }
          } catch (playwrightError) {
            console.log('Playwright selectOption 실패, JavaScript로 시도:', playwrightError.message);
          }
          
          // 방법 2: JavaScript로 직접 선택 (Playwright 실패 시)
          if (!selectionResult.success) {
            selectionResult = await this.page.evaluate(() => {
              const select = document.querySelector('#review-sort-id');
              if (!select) return { success: false, reason: 'select not found' };
              
              // 현재 선택된 값 확인
              const currentIndex = select.selectedIndex;
              const currentValue = select.value;
              
              // 첫 번째 옵션 (최신순, value="1") 선택
              if (select.options.length > 0) {
                // value="1"인 옵션 찾기
                let targetIndex = 0;
                for (let i = 0; i < select.options.length; i++) {
                  if (select.options[i].value === '1') {
                    targetIndex = i;
                    break;
                  }
                }
                
                select.selectedIndex = targetIndex;
                const newValue = select.value;
                const newText = select.options[targetIndex]?.text || '';
                
                // change 이벤트 발생
                const changeEvent = new Event('change', { bubbles: true, cancelable: true });
                const changed = select.dispatchEvent(changeEvent);
                
                // input 이벤트도 발생
                const inputEvent = new Event('input', { bubbles: true, cancelable: true });
                select.dispatchEvent(inputEvent);
                
                // 실제 change 이벤트 핸들러 호출 (jQuery 등이 있을 경우)
                if (typeof jQuery !== 'undefined' && jQuery(select).length > 0) {
                  jQuery(select).trigger('change');
                }
                
                return {
                  success: true,
                  changed: currentIndex !== targetIndex || currentValue !== newValue,
                  previousIndex: currentIndex,
                  previousValue: currentValue,
                  newIndex: targetIndex,
                  newValue: newValue,
                  newText: newText,
                  eventDispatched: changed,
                };
              }
              return { success: false, reason: 'no options' };
            });
          }
          
          if (selectionResult.success) {
            if (selectionResult.changed) {
              console.log(`최신순 필터 선택 완료: "${selectionResult.newText}" (value: ${selectionResult.newValue})`);
              console.log(`  - 이전: index=${selectionResult.previousIndex}, value=${selectionResult.previousValue}`);
              console.log(`  - 변경: index=${selectionResult.newIndex}, value=${selectionResult.newValue}`);
            } else {
              console.log(`최신순 필터가 이미 선택되어 있음: "${selectionResult.newText}" (value: ${selectionResult.newValue})`);
            }
          } else {
            console.log(`최신순 필터 선택 실패: ${selectionResult.reason}`);
            // Playwright selectOption으로 fallback
            await sortSelect.first().selectOption({ index: 0 });
            console.log('최신순 필터 선택 완료 (Playwright fallback)');
          }
          
          // 필터 선택 후 리뷰가 다시 로드될 때까지 대기
          // 첫 번째 리뷰의 ID와 날짜를 저장하여 변경 여부 확인
          console.log('필터 변경 후 리뷰 재로딩 대기 중...');
          
          // 초기 상태 저장 (필터 변경 전)
          // 실제 리뷰만 선택 (div.Review-comment[id^="review-"] 형태, review-footer-legend 같은 요소 제외)
          let initialFirstReviewId = null;
          let initialFirstReviewDate = null;
          let initialFirstReviewText = null;
          try {
            // 실제 리뷰 아이템만 선택 (Review-comment 클래스를 가진 요소)
            const firstReview = this.page.locator('div.Review-comment[id^="review-"]').first();
            const exists = await firstReview.count();
            if (exists > 0) {
              initialFirstReviewId = await firstReview.getAttribute('id').catch(() => null);
              // 초기 날짜와 텍스트도 저장 (여러 선택자 시도)
              const dateSelectors = [
                'div.Review-statusBar > div.Review-statusBar-left > span',
                'div.Review-comment-right > div.Review-comment-bubble > div.Review-statusBar > div.Review-statusBar-left > span',
                '.Review-statusBar-left span',
              ];
              
              for (const selector of dateSelectors) {
                const dateEl = firstReview.locator(selector);
                const dateCount = await dateEl.count();
                if (dateCount > 0) {
                  let dateText = ((await dateEl.first().textContent().catch(() => '')) || '').trim();
                  dateText = dateText.replace(/작성일:\s*/g, '').trim();
                  if (dateText && dateText.match(/\d{4}년/)) {
                    initialFirstReviewDate = dateText;
                    break;
                  }
                }
              }
              // 첫 리뷰의 전체 텍스트 일부 저장 (ID나 날짜가 같아도 내용이 바뀔 수 있음)
              initialFirstReviewText = (await firstReview.textContent().catch(() => '') || '').substring(0, 200);
              console.log(`초기 첫 번째 리뷰: ID=${initialFirstReviewId}, 날짜=${initialFirstReviewDate || '없음'}`);
            } else {
              // fallback: 일반 리뷰 선택자 시도
              const fallbackReview = this.page.locator('[id^="review-"]:not([id*="footer"]):not([id*="legend"])').first();
              const fallbackExists = await fallbackReview.count();
              if (fallbackExists > 0) {
                initialFirstReviewId = await fallbackReview.getAttribute('id').catch(() => null);
                console.log(`초기 첫 번째 리뷰 (fallback): ID=${initialFirstReviewId}`);
              }
            }
          } catch (e) {
            console.log('초기 리뷰 상태 저장 실패:', e.message);
          }
          
          // 네트워크 요청 완료 대기
          await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          
          // 첫 번째 리뷰의 ID 또는 날짜가 변경될 때까지 명시적으로 대기
          // 이는 리뷰 목록이 실제로 재정렬되었음을 의미
          let reviewReloaded = false;
          const maxWaitTime = 15000; // 최대 15초 대기
          const checkInterval = 300; // 300ms마다 확인
          const maxAttempts = Math.floor(maxWaitTime / checkInterval);
          
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await this.page.waitForTimeout(checkInterval);
            
            try {
              // 실제 리뷰 아이템만 선택 (Review-comment 클래스를 가진 요소)
              let currentFirstReview = this.page.locator('div.Review-comment[id^="review-"]').first();
              let exists = await currentFirstReview.count();
              
              // fallback: 일반 리뷰 선택자 시도
              if (exists === 0) {
                currentFirstReview = this.page.locator('[id^="review-"]:not([id*="footer"]):not([id*="legend"])').first();
                exists = await currentFirstReview.count();
              }
              
              if (exists > 0) {
                const currentFirstReviewId = await currentFirstReview.getAttribute('id').catch(() => null);
                
                // 날짜 확인 (여러 선택자 시도)
                let currentDateText = null;
                const dateSelectors = [
                  'div.Review-statusBar > div.Review-statusBar-left > span',
                  'div.Review-comment-right > div.Review-comment-bubble > div.Review-statusBar > div.Review-statusBar-left > span',
                  '.Review-statusBar-left span',
                ];
                
                for (const selector of dateSelectors) {
                  const dateEl = currentFirstReview.locator(selector);
                  const dateCount = await dateEl.count();
                  if (dateCount > 0) {
                    let dateText = ((await dateEl.first().textContent().catch(() => '')) || '').trim();
                    dateText = dateText.replace(/작성일:\s*/g, '').trim();
                    if (dateText && dateText.match(/\d{4}년/)) {
                      currentDateText = dateText;
                      break;
                    }
                  }
                }
                
                // 첫 리뷰의 텍스트 일부 확인
                const currentFirstReviewText = (await currentFirstReview.textContent().catch(() => '') || '').substring(0, 200);
                
                // ID가 변경되었거나 날짜가 변경되었거나 텍스트가 변경되었으면 재로드된 것으로 간주
                const idChanged = initialFirstReviewId && currentFirstReviewId && currentFirstReviewId !== initialFirstReviewId;
                const dateChanged = initialFirstReviewDate && currentDateText && currentDateText !== initialFirstReviewDate;
                const textChanged = initialFirstReviewText && currentFirstReviewText && currentFirstReviewText !== initialFirstReviewText;
                
                if (idChanged || dateChanged || textChanged) {
                  if (idChanged) {
                    console.log(`✅ 리뷰가 재정렬되었습니다 (첫 번째 리뷰 ID 변경: ${initialFirstReviewId} → ${currentFirstReviewId})`);
                  }
                  if (dateChanged) {
                    console.log(`✅ 리뷰가 재정렬되었습니다 (첫 번째 리뷰 날짜 변경: ${initialFirstReviewDate} → ${currentDateText})`);
                  }
                  if (textChanged && !idChanged && !dateChanged) {
                    console.log(`✅ 리뷰가 재정렬되었습니다 (첫 번째 리뷰 내용 변경)`);
                  }
                  if (currentDateText) {
                    console.log(`   현재 첫 번째 리뷰 날짜: ${currentDateText}`);
                  }
                  reviewReloaded = true;
                  break;
                }
              }
            } catch (e) {
              // 에러가 발생해도 계속 시도
            }
          }
          
          if (!reviewReloaded) {
            console.log(`⚠️ 리뷰 재정렬 확인 실패 (최대 대기 시간 초과). 계속 진행합니다.`);
            // 필터가 이미 최신순이었을 수 있으므로 현재 첫 번째 리뷰의 날짜를 확인
            try {
              const finalFirstReview = this.page.locator('div.Review-comment[id^="review-"]').first();
              const exists = await finalFirstReview.count();
              if (exists > 0) {
                const dateSelectors = [
                  'div.Review-statusBar > div.Review-statusBar-left > span',
                  'div.Review-comment-right > div.Review-comment-bubble > div.Review-statusBar > div.Review-statusBar-left > span',
                ];
                for (const selector of dateSelectors) {
                  const dateEl = finalFirstReview.locator(selector);
                  const dateCount = await dateEl.count();
                  if (dateCount > 0) {
                    let dateText = ((await dateEl.first().textContent().catch(() => '')) || '').trim();
                    dateText = dateText.replace(/작성일:\s*/g, '').trim();
                    if (dateText && dateText.match(/\d{4}년/)) {
                      console.log(`📅 현재 첫 번째 리뷰 날짜: ${dateText} (필터가 이미 최신순일 수 있음)`);
                      if (initialFirstReviewDate) {
                        console.log(`   필터 변경 전 날짜: ${initialFirstReviewDate}`);
                      }
                      break;
                    }
                  }
                }
              }
            } catch (e) {}
          }
          
          // 추가 대기 시간 (리뷰가 완전히 로드될 때까지)
          await this.page.waitForTimeout(2000);
          
          // 리뷰가 실제로 재정렬되었는지 확인 (첫 번째 리뷰의 날짜 확인)
          let firstReviewDate = null;
          try {
            const firstReview = this.page.locator('[id^="review-"]').first();
            const firstReviewExists = await firstReview.count();
            if (firstReviewExists > 0) {
              // 첫 번째 리뷰의 날짜 추출 (제공된 선택자: #review-0 > div.Review-comment-right > div.Review-comment-bubble > div.Review-statusBar >)
              // 제공된 HTML 구조: div.Review-statusBar > div.Review-statusBar-left > span - "작성일: 2026년 1월 19일"
              const dateSelectors = [
                'div.Review-comment-right > div.Review-comment-bubble > div.Review-statusBar > div.Review-statusBar-left > span',
                'div.Review-statusBar > div.Review-statusBar-left > span',
                '.Review-statusBar-left span',
                'div.Review-comment-right > div.Review-comment-bubble > div.Review-statusBar span',
              ];
              
              for (const selector of dateSelectors) {
                const dateEl = firstReview.locator(selector);
                const count = await dateEl.count();
                if (count > 0) {
                  let dateText = ((await dateEl.first().textContent().catch(() => '')) || '').trim();
                  dateText = dateText.replace(/작성일:\s*/g, '').trim();
                  // 날짜 형식이 포함되어 있는지 확인
                  if (dateText && (dateText.match(/\d{4}년/) || dateText.match(/\d{1,2}월/) || dateText.match(/\d{1,2}일/))) {
                    firstReviewDate = dateText;
                    console.log(`✅ 첫 번째 리뷰 날짜 발견 (선택자: "${selector}"): ${firstReviewDate}`);
                    break;
                  }
                }
              }
              
              // 날짜를 찾지 못한 경우, 첫 번째 리뷰의 모든 텍스트 확인 (디버깅)
              if (!firstReviewDate) {
                const allText = await firstReview.textContent().catch(() => '');
                console.log(`[디버깅] 첫 번째 리뷰 전체 텍스트 (일부): ${allText.substring(0, 200)}`);
              }
            }
          } catch (e) {
            console.log('첫 번째 리뷰 날짜 확인 실패:', e.message);
          }
          
          if (firstReviewDate) {
            console.log(`✅ 첫 번째 리뷰 날짜: ${firstReviewDate} (최신순 정렬 확인)`);
            
            // 여러 리뷰의 날짜를 확인하여 실제로 최신순으로 정렬되었는지 검증
            try {
              const reviewItems = this.page.locator('[id^="review-"]');
              const reviewCount = await reviewItems.count();
              const datesToCheck = Math.min(5, reviewCount); // 처음 5개 리뷰의 날짜 확인
              const extractedDates = [];
              
              for (let i = 0; i < datesToCheck; i++) {
                try {
                  const reviewItem = reviewItems.nth(i);
                  const dateEl = reviewItem.locator('div.Review-statusBar > div.Review-statusBar-left > span');
                  const count = await dateEl.count();
                  if (count > 0) {
                    let dateText = ((await dateEl.first().textContent().catch(() => '')) || '').trim();
                    dateText = dateText.replace(/작성일:\s*/g, '').trim();
                    
                    // 한국어 날짜 형식 파싱
                    const koreanDateMatch = dateText.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
                    if (koreanDateMatch) {
                      const year = parseInt(koreanDateMatch[1]);
                      const month = parseInt(koreanDateMatch[2]) - 1;
                      const day = parseInt(koreanDateMatch[3]);
                      const parsedDate = new Date(year, month, day);
                      if (!isNaN(parsedDate.getTime())) {
                        extractedDates.push({
                          index: i,
                          dateText: dateText,
                          date: parsedDate,
                        });
                      }
                    }
                  }
                } catch (e) {}
              }
              
              // 날짜가 최신순으로 정렬되었는지 확인
              if (extractedDates.length >= 2) {
                let isSorted = true;
                for (let i = 1; i < extractedDates.length; i++) {
                  if (extractedDates[i].date > extractedDates[i - 1].date) {
                    isSorted = false;
                    console.log(`⚠️ 날짜 정렬 확인: 리뷰 ${extractedDates[i - 1].index + 1} (${extractedDates[i - 1].dateText})가 리뷰 ${extractedDates[i].index + 1} (${extractedDates[i].dateText})보다 최신이 아닙니다.`);
                    break;
                  }
                }
                
                if (isSorted) {
                  console.log(`✅ 최신순 정렬 확인 완료: 처음 ${extractedDates.length}개 리뷰가 최신순으로 정렬되어 있습니다.`);
                  extractedDates.forEach((d, idx) => {
                    console.log(`   리뷰 ${idx + 1}: ${d.dateText}`);
                  });
                } else {
                  console.log(`⚠️ 최신순 정렬이 제대로 적용되지 않았을 수 있습니다.`);
                }
              } else if (extractedDates.length === 1) {
                console.log(`✅ 첫 번째 리뷰 날짜 확인: ${extractedDates[0].dateText}`);
              }
            } catch (e) {
              console.log('날짜 정렬 검증 중 오류:', e.message);
            }
          } else {
            console.log('⚠️ 첫 번째 리뷰 날짜를 확인할 수 없습니다.');
          }
          
          // 추가 대기 (리뷰가 완전히 재정렬될 때까지)
          await this.page.waitForTimeout(2000);
          
          // 최종 확인
          const finalCheck = await sortSelect.first().evaluate((select) => {
            return {
              selectedIndex: select.selectedIndex,
              selectedValue: select.value,
              selectedText: select.options[select.selectedIndex]?.text || '',
            };
          });
          console.log(`최신순 필터 최종 확인: index=${finalCheck.selectedIndex}, value=${finalCheck.selectedValue}, text="${finalCheck.selectedText}"`);
          
          // 최신순이 아닌 경우 경고
          if (finalCheck.selectedIndex !== 0) {
            console.log(`⚠️ 경고: 최신순 필터가 설정되지 않았습니다. 현재 선택: index=${finalCheck.selectedIndex}, text="${finalCheck.selectedText}"`);
          }
        } else {
          console.log('최신순 필터를 찾을 수 없습니다 (계속 진행)');
        }
      } catch (e) {
        console.log('최신순 필터 선택 실패:', e.message);
      }
      
      // 리뷰 데이터 추출
      const reviews = [];
      let pageNum = 0;
      const maxPages = 10; // 최대 10페이지까지
      
      while (pageNum < maxPages) {
        // 리뷰 섹션이 로드될 때까지 대기
        if (pageNum === 0) {
          // 첫 페이지에서는 리뷰 섹션으로 스크롤하고 대기
          await this.page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await this.page.waitForTimeout(3000);
          
          // 리뷰 섹션으로 스크롤
          await this.page.evaluate(() => {
            const reviewSection = document.querySelector('[id*="review"], [class*="Review"], [data-testid*="review"]');
            if (reviewSection) {
              reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          });
          await this.page.waitForTimeout(3000);
        }
        
        // 현재 페이지의 리뷰 개수 확인 (여러 선택자 시도)
        let reviewItems = null;
        let reviewCount = 0;
        
        const reviewSelectors = [
          'div.Review-comment[id^="review-"]', // 실제 리뷰 아이템만 선택 (review-footer-legend 제외)
          '[id^="review-"]:not([id*="footer"]):not([id*="legend"])', // fallback: footer/legend 제외
          'li.Review-comment',
          'div.Review-comment',
          'li[class*="Review-comment"]',
          'div[class*="Review-comment"]',
          '[class*="Review"]',
          '[data-testid*="review"]',
        ];
        
        // 리뷰가 로드될 때까지 최대 10초 대기
        for (let attempt = 0; attempt < 10; attempt++) {
          for (const selector of reviewSelectors) {
            reviewItems = this.page.locator(selector);
            reviewCount = await reviewItems.count();
            if (reviewCount > 0) {
              console.log(`리뷰 선택자 "${selector}"로 ${reviewCount}개 발견`);
              break;
            }
          }
          
          if (reviewCount > 0) break;
          
          // 리뷰가 없으면 스크롤하고 대기
          await this.page.evaluate(() => {
            window.scrollBy(0, 500);
          });
          await this.page.waitForTimeout(1000);
        }
        
        if (reviewCount === 0) {
          // 디버깅: 페이지 구조 확인
          const pageInfo = await this.page.evaluate(() => {
            const reviewElements = [];
            // Review 관련 클래스를 가진 모든 요소 찾기
            const allElements = document.querySelectorAll('*');
            allElements.forEach((el, idx) => {
              if (idx < 100) { // 처음 100개만 확인
                const className = String(el.className || '');
                const id = String(el.id || '');
                if (className.includes('Review') || className.includes('review') || 
                    id.includes('review') || id.includes('Review')) {
                  reviewElements.push({
                    tag: el.tagName,
                    className: className.substring(0, 100),
                    id: id.substring(0, 50),
                  });
                }
              }
            });
            return {
              url: window.location.href,
              reviewElements: reviewElements.slice(0, 20), // 처음 20개만
            };
          });
          console.log('디버깅 정보:', JSON.stringify(pageInfo, null, 2));
          console.log('리뷰를 찾을 수 없습니다.');
          break;
        }
        
        console.log(`페이지 ${pageNum + 1}: ${reviewCount}개 리뷰 발견`);
        
        // 각 리뷰 추출
        for (let i = 0; i < reviewCount; i++) {
          try {
            // nth()를 사용하여 리뷰 아이템 선택
            const reviewItem = reviewItems.nth(i);
            const exists = await reviewItem.count();
            
            if (exists === 0) continue;
            
            // rating 추출 (제공된 선택자: #review-0 > div.Review-comment-left > div > div.Review-comment-leftHeader > div.Review-comment-leftScore)
            let rating = 0;
            try {
              const ratingSelectors = [
                'div.Review-comment-left > div > div.Review-comment-leftHeader > div.Review-comment-leftScore',
                'div.Review-comment-leftScore',
              ];
              for (const selector of ratingSelectors) {
                const ratingEl = reviewItem.locator(selector);
                const count = await ratingEl.count();
                if (count > 0) {
                  const ratingText = (await ratingEl.first().textContent().catch(() => '')) || '';
                  const match = ratingText.match(/(\d+\.?\d*)/);
                  if (match) {
                    rating = parseFloat(match[1]);
                    // 아고다는 10점 만점이므로 10으로 제한 (DB 스키마: NUMERIC(3,2)는 10 미만만 허용)
                    if (rating > 10) {
                      rating = 10;
                    }
                    break;
                  }
                }
              }
            } catch (e) {}
            
            // nickname 추출 (제공된 HTML 구조: div.Review-comment-reviewer[data-info-type="reviewer-name"] strong)
            let nickname = '';
            try {
              const nicknameSelectors = [
                '.Review-comment-reviewer[data-info-type="reviewer-name"] strong',
                'div.Review-comment-reviewer[data-info-type="reviewer-name"] strong',
                'div.Review-comment-left > div > div:nth-child(2) strong',
              ];
              for (const selector of nicknameSelectors) {
                const nicknameEl = reviewItem.locator(selector);
                const count = await nicknameEl.count();
                if (count > 0) {
                  nickname = ((await nicknameEl.first().textContent().catch(() => '')) || '').trim();
                  if (nickname) break;
                }
              }
            } catch (e) {}
            
            // visit_type 추출 (제공된 HTML 구조: div.Review-comment-reviewer[data-info-type="group-name"] span)
            let visitType = '';
            try {
              const visitTypeSelectors = [
                '.Review-comment-reviewer[data-info-type="group-name"] span',
                'div.Review-comment-reviewer[data-info-type="group-name"] span',
                'div.Review-comment-left > div > div:nth-child(3) span',
              ];
              for (const selector of visitTypeSelectors) {
                const visitTypeEl = reviewItem.locator(selector);
                const count = await visitTypeEl.count();
                if (count > 0) {
                  visitType = ((await visitTypeEl.first().textContent().catch(() => '')) || '').trim();
                  if (visitType) break;
                }
              }
            } catch (e) {}
            
            // emotion 추출 (제공된 선택자: #review-0 > div.Review-comment-left > div > div.Review-comment-leftHeader > div.Review-comment-leftScoreText)
            let emotion = '';
            try {
              const emotionEl = reviewItem.locator('div.Review-comment-left > div > div.Review-comment-leftHeader > div.Review-comment-leftScoreText');
              const count = await emotionEl.count();
              if (count > 0) {
                emotion = ((await emotionEl.first().textContent().catch(() => '')) || '').trim();
              }
            } catch (e) {}
            
            // visitKeyword는 빈값으로 설정
            const visitKeyword = '';
            
            // title 추출 (제공된 HTML 구조: h4[data-testid="review-title"] 또는 div.Review-comment-body > h4)
            let title = '';
            try {
              const titleSelectors = [
                'h4[data-testid="review-title"]',
                'div.Review-comment-right > div.Review-comment-bubble > div.Review-comment-body > h4',
                'div.Review-comment-body > h4',
              ];
              for (const selector of titleSelectors) {
                const titleEl = reviewItem.locator(selector);
                const count = await titleEl.count();
                if (count > 0) {
                  title = ((await titleEl.first().textContent().catch(() => '')) || '').trim();
                  if (title) break;
                }
              }
            } catch (e) {}
            
            // content 추출 (제공된 HTML 구조: p.Review-comment-bodyText 또는 div.Review-comment-body > p.Review-comment-bodyText)
            let content = '';
            try {
              const contentSelectors = [
                'p.Review-comment-bodyText',
                'p[data-testid="review-comment"]',
                'div.Review-comment-right > div.Review-comment-bubble > div.Review-comment-body > p.Review-comment-bodyText',
                'div.Review-comment-body > p.Review-comment-bodyText',
                '.Review-comment-bodyText',
              ];
              for (const selector of contentSelectors) {
                const contentEl = reviewItem.locator(selector);
                const count = await contentEl.count();
                if (count > 0) {
                  content = ((await contentEl.first().textContent().catch(() => '')) || '').trim();
                  if (content) {
                    // content를 한국어로 번역
                    if (content && content.trim().length > 0) {
                      content = await translateToKorean(content);
                    }
                    break;
                  }
                }
              }
            } catch (e) {}
            
            // review_date 추출 (제공된 HTML 구조: div.Review-statusBar > div.Review-statusBar-left > span - "작성일: 2026년 1월 19일")
            let reviewDate = null;
            let date = null;
            try {
              const dateSelectors = [
                'div.Review-comment-right > div.Review-comment-bubble > div.Review-statusBar > div.Review-statusBar-left > span',
                'div.Review-statusBar > div.Review-statusBar-left > span',
                '.Review-statusBar-left span',
                'div.Review-comment-right > div.Review-comment-bubble > div.Review-statusBar span',
                '.Review-statusBar span',
              ];
              for (const selector of dateSelectors) {
                const dateEl = reviewItem.locator(selector);
                const count = await dateEl.count();
                if (count > 0) {
                  let dateText = ((await dateEl.first().textContent().catch(() => '')) || '').trim();
                  // "작성일: " 제거
                  dateText = dateText.replace(/작성일:\s*/g, '').trim();
                  
                  if (dateText) {
                    // 디버깅: 처음 몇 개 리뷰의 날짜 텍스트 로그
                    if (i < 5) {
                      console.log(`[디버깅] 리뷰 ${i + 1} 날짜 텍스트: "${dateText}"`);
                    }
                    
                    // 한국어 날짜 형식 파싱 (예: "2026년 1월 18일", "2026년 1월 19일")
                    const koreanDateMatch = dateText.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
                    if (koreanDateMatch) {
                      const year = parseInt(koreanDateMatch[1]);
                      const month = parseInt(koreanDateMatch[2]);
                      const day = parseInt(koreanDateMatch[3]);
                      // 시간대 문제를 피하기 위해 직접 문자열 생성
                      date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                      // reviewDate는 Date 객체로 생성 (시간대 고려)
                      const parsedDate = new Date(year, month - 1, day);
                      if (!isNaN(parsedDate.getTime())) {
                        reviewDate = parsedDate;
                        
                        // 디버깅: 처음 몇 개 리뷰의 파싱된 날짜 로그
                        if (i < 5) {
                          console.log(`[디버깅] 리뷰 ${i + 1} 날짜 파싱 성공: "${dateText}" → ${date} (${year}년 ${month}월 ${day}일)`);
                        }
                        break;
                      } else if (i < 5) {
                        console.log(`[디버깅] 리뷰 ${i + 1} 날짜 파싱 실패: "${dateText}" (유효하지 않은 날짜)`);
                      }
                    } else {
                      // 다른 형식 시도
                      const parsedDate = new Date(dateText);
                      if (!isNaN(parsedDate.getTime())) {
                        date = parsedDate.toISOString().split('T')[0];
                        reviewDate = parsedDate;
                        if (i < 5) {
                          console.log(`[디버깅] 리뷰 ${i + 1} 날짜 파싱 (대체 방법): "${dateText}" → ${date}`);
                        }
                        break;
                      } else if (i < 5) {
                        console.log(`[디버깅] 리뷰 ${i + 1} 날짜 파싱 실패: "${dateText}" (형식 불일치)`);
                      }
                    }
                  } else if (i < 5) {
                    console.log(`[디버깅] 리뷰 ${i + 1} 날짜 텍스트 없음`);
                  }
                }
              }
            } catch (e) {}
            
            if (!date) {
              date = new Date().toISOString().split('T')[0];
              reviewDate = new Date();
            }
            
            // 날짜 필터링 (2주 전까지)
            if (dateFilter === 'week' || dateFilter === '2weeks') {
              const today = new Date();
              const twoWeeksAgo = new Date(today);
              twoWeeksAgo.setDate(today.getDate() - 14);
              if (reviewDate && reviewDate < twoWeeksAgo) {
                continue;
              }
            }
            
            // 리뷰 데이터 추가
            if ((content && content.trim().length > 0) || rating > 0 || (nickname && nickname.trim().length > 0)) {
              const reviewData = {
                content: content ? content.trim() : '',
                nickname: nickname || `사용자${i + 1}`,
                rating: rating,
                visitType: visitType || '',
                emotion: emotion || null,
                reviewKeyword: [],
                visitKeyword: visitKeyword || '',
                reviewDate: date,
                title: title || null,
                additionalInfo: null, // 추가 정보는 필요시 확장
                revisitFlag: false,
              };
              
              // 즉시 저장 방식이 활성화된 경우 즉시 저장
              if (saveImmediately && companyName) {
                // date가 없어도 저장 시도
                if (!date) {
                  date = new Date().toISOString().split('T')[0];
                  reviewDate = new Date();
                }
                try {
                  // 날짜 필터링 확인
                  let shouldSave = true;
                  if ((dateFilter === 'week' || dateFilter === 'twoWeeks') && reviewDate) {
                    const today = new Date();
                    const filterDate = new Date(today);
                    filterDate.setDate(today.getDate() - (dateFilter === 'week' ? 7 : 14));
                    if (reviewDate < filterDate) {
                      shouldSave = false;
                    }
                  }
                  
                  if (shouldSave) {
                    const analysis = this.analyzeText(
                      reviewData.content,
                      rating,
                      reviewData.visitKeyword,
                      Array.isArray(reviewData.reviewKeyword) ? reviewData.reviewKeyword.join(', ') : reviewData.reviewKeyword
                    );
                    
                    const saved = await this.saveReview({
                      portalUrl: '아고다',
                      companyName,
                      reviewDate: date,
                      content: reviewData.content,
                      rating: rating || null,
                      nickname: reviewData.nickname,
                      visitKeyword: reviewData.visitKeyword || null,
                      reviewKeyword: Array.isArray(reviewData.reviewKeyword) ? reviewData.reviewKeyword.join(', ') : reviewData.reviewKeyword || null,
                      visitType: reviewData.visitType || null,
                      emotion: reviewData.emotion || null,
                      revisitFlag: reviewData.revisitFlag || false,
                      nRating: analysis.nRating,
                      nEmotion: analysis.nEmotion,
                      nCharCount: analysis.nCharCount,
                      title: reviewData.title || null,
                      additionalInfo: reviewData.additionalInfo || null,
                    });
                    
                    if (saved) {
                      actualSavedCount++;
                      reviews.push(reviewData);
                      if (actualSavedCount <= 10 || actualSavedCount % 50 === 0) {
                        console.log(`✅ [아고다 즉시 저장 성공] ${actualSavedCount}번째: ${reviewData.nickname} - date: ${date}`);
                      }
                    } else {
                      reviews.push(reviewData);
                    }
                  } else {
                    reviews.push(reviewData);
                  }
                } catch (saveError) {
                  console.error(`[아고다] 리뷰 ${i + 1} 즉시 저장 실패:`, saveError.message);
                  reviews.push(reviewData);
                }
              } else {
                // 기존 방식: 배열에 추가만 함
                reviews.push(reviewData);
              }
            }
          } catch (error) {
            // 리뷰 추출 실패 시 건너뛰기
            if (i < 3) console.log(`[디버깅] 리뷰 ${i + 1} 추출 실패:`, error.message);
          }
        }
        
        // 다음 페이지로 이동
        try {
          // 다양한 선택자로 다음 페이지 버튼 찾기
          const nextPageSelectors = [
            '#reviews-panel-1 > div:nth-child(2) > div > nav > ul li:has-text("Next")',
            '#reviews-panel-1 > div:nth-child(2) > div > nav > ul li:has-text("다음")',
            '#reviews-panel-1 > div:nth-child(2) > div > nav > ul a[aria-label*="Next"]',
            '#reviews-panel-1 > div:nth-child(2) > div > nav > ul a[aria-label*="다음"]',
            'nav[aria-label*="pagination"] a[aria-label*="Next"]',
            'nav[aria-label*="pagination"] a[aria-label*="다음"]',
            'button[aria-label*="Next"]',
            'button[aria-label*="다음"]',
            'a:has-text("Next")',
            'a:has-text("다음")',
            '[data-testid*="next"]',
            '[class*="next"]:not([class*="disabled"])',
          ];
          
          let nextPageFound = false;
          for (const selector of nextPageSelectors) {
            try {
              const nextButton = this.page.locator(selector);
              const nextCount = await nextButton.count();
              if (nextCount > 0) {
                const isVisible = await nextButton.first().isVisible().catch(() => false);
                if (isVisible) {
                  // disabled 속성 확인
                  const isDisabled = await nextButton.first().getAttribute('disabled').catch(() => null);
                  const hasDisabledClass = await nextButton.first().evaluate((el) => {
                    return el.classList.contains('disabled') || el.classList.contains('disabled');
                  }).catch(() => false);
                  
                  if (!isDisabled && !hasDisabledClass) {
                    await nextButton.first().scrollIntoViewIfNeeded();
                    await this.page.waitForTimeout(1000);
                    await nextButton.first().click({ timeout: 5000 });
                    await this.page.waitForTimeout(4000); // 페이지 로딩 대기 시간 증가
                    pageNum++;
                    console.log(`아고다 ${pageNum}페이지로 이동 완료`);
                    nextPageFound = true;
                    break;
                  }
                }
              }
            } catch (e) {
              // 다음 선택자 시도
              continue;
            }
          }
          
          if (!nextPageFound) {
            console.log('다음 페이지 버튼을 찾을 수 없습니다. 모든 페이지 수집 완료.');
            break;
          }
        } catch (e) {
          // 다음 페이지로 이동 실패
          console.log('다음 페이지로 이동 실패:', e.message);
          break;
        }
      }
      
      console.log(`아고다 스크래핑 완료: ${reviews.length}개 리뷰 발견`);
      if (saveImmediately) {
        console.log(`[아고다] 즉시 저장 완료: ${actualSavedCount}개 리뷰 저장 성공 (추출: ${reviews.length}개)`);
        reviews._actualSavedCount = actualSavedCount;
      }
      return reviews;
      
    } catch (error) {
      console.error('아고다 스크래핑 실패:', error);
      return [];
    }
  }

  /**
   * 포털 URL을 포털 이름으로 변환
   * @param {string} portalUrl - 포털 URL
   * @param {string} portalType - 포털 타입 강제 지정 ('kakao', 'yanolja', 'google' 등, 선택사항)
   * @returns {string} 포털 이름 (네이버맵, 카카오맵, 야놀자, 굿초이스, 구글, 트립어드바이저, 아고다)
   */
  getPortalName(portalUrl, portalType = null) {
    // portalType이 명시적으로 지정된 경우 우선 처리
    if (portalType === 'google') {
      return '구글';
    }
    
    if (!portalUrl) return '알 수 없음';
    
    if (portalUrl.includes('naver.com')) {
      return '네이버맵';
    } else if (portalUrl.includes('kakao.com')) {
      return '카카오맵';
    } else if (portalUrl.includes('yanolja.com')) {
      return '야놀자';
    } else if (portalUrl.includes('goodchoice.kr')) {
      return '굿초이스';
    } else if (portalUrl.includes('google.com')) {
      return '구글';
    } else if (portalUrl.includes('tripadvisor.co.kr') || portalUrl.includes('tripadvisor.com')) {
      return '트립어드바이저';
    } else if (portalUrl.includes('agoda.com')) {
      return '아고다';
    }
    
    return '알 수 없음';
  }

  /**
   * 구글 여행 스크래핑 (company_name으로 검색)
   * @param {string} companyName - 기업명 (검색어로 사용)
   * @param {string} dateFilter - 'all' (전체) 또는 'week' (일주일 간격)
   */
  async scrapeGoogle(companyName, dateFilter = 'week', jobId = null, portalType = 'google', saveImmediately = false) {
    let actualSavedCount = 0; // 실제 저장 성공 개수 추적
    try {
      console.log(`구글 여행 스크래핑 시작: "${companyName}" 검색 (필터: ${dateFilter}, 즉시 저장: ${saveImmediately ? '활성화' : '비활성화'})`);
      
      // 구글 여행 검색 페이지로 이동
      const searchUrl = `https://www.google.com/travel/search?q=${encodeURIComponent(companyName)}`;
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.page.waitForTimeout(2000);
      
      // 리뷰 섹션으로 이동 (컨테이너 안의 #reviews 클릭)
      try {
        // 먼저 컨테이너 내부의 #reviews를 찾아서 클릭
        const containerSelector = '#yDmH0d > c-wiz.zQTmif.SSPGKf.AglWE > div > c-wiz > div.dTQsx.gBIxsf > div.gJGKuf > div.QbZN0b > div.NCKy7b > div.pYg9cc > c-wiz > div > div > div.XoUIOc.Hg8rr.z5aADe > div.mrslJ.ZjAUM.nkLxl.rZGTQc';
        const container = this.page.locator(containerSelector);
        const containerCount = await container.count();
        
        if (containerCount > 0) {
          // 컨테이너 내부의 #reviews 찾기
          const reviewsLink = container.locator('#reviews');
          const reviewsLinkCount = await reviewsLink.count();
          
          if (reviewsLinkCount > 0) {
            await reviewsLink.first().scrollIntoViewIfNeeded();
            await this.page.waitForTimeout(500);
            await reviewsLink.first().click({ timeout: 5000 }).catch(() => {});
            await this.page.waitForTimeout(2000);
          } else {
            // 컨테이너 내부에서 #reviews를 찾지 못한 경우, 전체 페이지에서 찾기 시도
            const globalReviewsLink = this.page.locator('#reviews');
            const globalCount = await globalReviewsLink.count();
            if (globalCount > 0) {
              await globalReviewsLink.first().scrollIntoViewIfNeeded();
              await this.page.waitForTimeout(500);
              await globalReviewsLink.first().click({ timeout: 5000 }).catch(() => {});
              await this.page.waitForTimeout(2000);
            }
          }
        } else {
          // 컨테이너를 찾지 못한 경우, 전체 페이지에서 #reviews 찾기 시도
          const globalReviewsLink = this.page.locator('#reviews');
          const globalCount = await globalReviewsLink.count();
          if (globalCount > 0) {
            await globalReviewsLink.first().scrollIntoViewIfNeeded();
            await this.page.waitForTimeout(500);
            await globalReviewsLink.first().click({ timeout: 5000 }).catch(() => {});
            await this.page.waitForTimeout(2000);
          }
        }
      } catch (e) {
        // 리뷰 섹션 클릭 실패해도 계속 진행
        console.log('리뷰 섹션 클릭 실패:', e.message);
      }
      
      // 리뷰 섹션으로 이동한 후 충분한 대기 시간 (한글 리뷰 로드 대기)
      await this.page.waitForTimeout(3000);
      
      // 최신순 필터 클릭 전에 초기 로드된 리뷰 확인
      let initialReviewItems = this.page.locator('#reviews div.Svr5cf.bKhjM');
      let initialCount = await initialReviewItems.count().catch(() => 0);
      if (initialCount > 0) {
        console.log(`[최신순 필터 클릭 전] 초기 리뷰 ${initialCount}개 확인`);
        for (let i = 0; i < Math.min(initialCount, 10); i++) {
          try {
            const testItem = initialReviewItems.nth(i);
            const nicknameSelectors = [
              'div > div > div:nth-child(1) > div.aAs4ib > div.jUkSGf.WwUTAf > span > a',
              'div.aAs4ib > div.jUkSGf.WwUTAf > span > a',
              'a.DHIhE.QB2Jof',
              'div.aAs4ib a',
            ];
            
            let testNickname = '';
            for (const selector of nicknameSelectors) {
              try {
                const el = testItem.locator(selector);
                const count = await el.count();
                if (count > 0) {
                  testNickname = (await el.first().textContent().catch(() => '')) || '';
                  if (testNickname && testNickname.trim().length > 0) break;
                }
              } catch (e) {}
            }
            
            if (testNickname) {
              const hasKorean = /[가-힣]/.test(testNickname);
              console.log(`[최신순 필터 클릭 전 리뷰 ${i + 1}] nickname: "${testNickname.trim()}" ${hasKorean ? '(한글)' : ''}`);
            }
          } catch (e) {}
        }
      }
      
      // 최신순 필터 클릭
      try {
        // 여러 선택자 시도
        const sortFilterSelectors = [
          '#reviews > c-wiz > c-wiz > div > div > div > div > div:nth-child(3) > div > div.qtSVMc.oU1sdf > span:nth-child(1) > span > div.jgvuAb.rRDaU.xnu6rd.QGRmIf.yJkB0b.THFy7d.XXyf0.iWO5td > div.OA0qNb.ncFHed > div.MocG8c.o7IkCf.LMgvRb.KKjvXb',
          'div.qtSVMc.oU1sdf span:nth-child(1) div.MocG8c',
          'div.MocG8c.o7IkCf.LMgvRb.KKjvXb',
          'div[class*="MocG8c"]',
        ];
        
        let sortFilterClicked = false;
        for (const selector of sortFilterSelectors) {
          try {
            const sortFilter = this.page.locator(selector);
            const sortFilterCount = await sortFilter.count();
            if (sortFilterCount > 0) {
              const isVisible = await sortFilter.first().isVisible({ timeout: 2000 }).catch(() => false);
              if (isVisible) {
                await sortFilter.first().scrollIntoViewIfNeeded();
                await this.page.waitForTimeout(500);
                await sortFilter.first().click({ timeout: 5000 }).catch(() => {});
                await this.page.waitForTimeout(2000);
                console.log('최신순 필터 클릭 완료');
                sortFilterClicked = true;
                break;
              }
            }
          } catch (e) {
            // 다음 선택자 시도
          }
        }
        
        if (!sortFilterClicked) {
          console.log('최신순 필터를 찾을 수 없습니다 (계속 진행)');
        }
      } catch (e) {
        // 최신순 필터 클릭 실패해도 계속 진행
        console.log('최신순 필터 클릭 실패:', e.message);
      }
      
      // 최신순 필터 클릭 후 리뷰 로드 대기
      await this.page.waitForTimeout(3000);
      
      // 구글 트래블 리뷰 "반복 단위" (사용자 제공)
      // 이 단위가 가장 안정적이며, UI 요소가 섞이는 문제를 크게 줄인다.
      let reviewItems = this.page.locator('#reviews div.Svr5cf.bKhjM');
      let lastReviewCount = await reviewItems.count().catch(() => 0);
      
      if (lastReviewCount === 0) {
        console.log('⚠️ 리뷰를 찾을 수 없습니다.');
        return [];
      }
      
      console.log(`초기 리뷰 개수(선택자 기준): ${lastReviewCount}개`);
      
      // 초기 로드된 리뷰의 nickname 확인 (한글 리뷰 확인용)
      if (lastReviewCount > 0) {
        try {
          console.log(`[초기 리뷰 확인] ${lastReviewCount}개 리뷰 발견, 처음 5개 nickname 확인 중...`);
          for (let i = 0; i < Math.min(lastReviewCount, 5); i++) {
            const testItem = reviewItems.nth(i);
            // 여러 선택자 시도
            const nicknameSelectors = [
              'div > div > div:nth-child(1) > div.aAs4ib > div.jUkSGf.WwUTAf > span > a',
              'div.aAs4ib > div.jUkSGf.WwUTAf > span > a',
              'a.DHIhE.QB2Jof',
              'div.aAs4ib a',
            ];
            
            let testNickname = '';
            for (const selector of nicknameSelectors) {
              try {
                const el = testItem.locator(selector);
                const count = await el.count();
                if (count > 0) {
                  testNickname = (await el.first().textContent().catch(() => '')) || '';
                  if (testNickname && testNickname.trim().length > 0) break;
                }
              } catch (e) {
                // 다음 선택자 시도
              }
            }
            
            if (testNickname) {
              console.log(`[초기 리뷰 ${i + 1}] nickname: "${testNickname.trim()}"`);
            } else {
              console.log(`[초기 리뷰 ${i + 1}] nickname: (찾을 수 없음)`);
            }
          }
        } catch (e) {
          console.log(`[초기 리뷰 확인 실패]:`, e.message);
        }
      }
      
      // 무한 스크롤로 리뷰 로드
      let noChangeCount = 0;
      const maxScrollAttempts = 60; // 스크롤 횟수 증가 (리뷰 더 로드)
      
      for (let scrollAttempt = 0; scrollAttempt < maxScrollAttempts; scrollAttempt++) {
        try {
          // 리뷰 섹션 컨테이너 찾기
          const reviewsContainer = this.page.locator('#reviews');
          const containerCount = await reviewsContainer.count();
          
          // 마지막 리뷰 아이템으로 스크롤
          const currentCountBeforeScroll = await reviewItems.count().catch(() => 0);
          if (currentCountBeforeScroll > 0) {
            const lastReviewItem = reviewItems.nth(currentCountBeforeScroll - 1);
            await lastReviewItem.scrollIntoViewIfNeeded().catch(() => {});
            await this.page.waitForTimeout(800);
          }
          
          // 리뷰 섹션 내부를 스크롤 (JavaScript로)
          await this.page.evaluate(() => {
            // 리뷰 섹션 찾기
            const reviewsSection = document.querySelector('#reviews');
            if (reviewsSection) {
              // 리뷰 섹션 내부를 스크롤
              reviewsSection.scrollTop = reviewsSection.scrollHeight;
              // 추가 스크롤
              setTimeout(() => {
                reviewsSection.scrollTop = reviewsSection.scrollHeight;
              }, 100);
            }
            
            // 페이지 전체도 스크롤
            window.scrollTo(0, document.body.scrollHeight);
            
            // 점진적 스크롤 (여러 번)
            const scrollHeight = document.documentElement.scrollHeight;
            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
            const windowHeight = window.innerHeight;
            
            for (let i = 0; i < 3; i++) {
              window.scrollTo({
                top: currentScroll + windowHeight * (i + 1) * 0.5,
                behavior: 'smooth'
              });
            }
          });
          await this.page.waitForTimeout(2000);
          
          // End 키로 추가 스크롤 (여러 번)
          for (let i = 0; i < 3; i++) {
            await this.page.keyboard.press('End');
            await this.page.waitForTimeout(1000);
          }
          
          // 스크롤 이벤트 트리거
          await this.page.evaluate(() => {
            window.dispatchEvent(new Event('scroll'));
            window.dispatchEvent(new Event('scrollend'));
            // 리뷰 섹션 내부 스크롤 이벤트도 트리거
            const reviewsSection = document.querySelector('#reviews');
            if (reviewsSection) {
              reviewsSection.dispatchEvent(new Event('scroll'));
            }
          });
          await this.page.waitForTimeout(1500);
          
        } catch (scrollError) {
          // 스크롤 에러는 무시
        }
        
        // 리뷰 개수 재확인 (동일한 로케이터로 다시 count)
        // DOM이 갱신되더라도 locator는 live이므로 그대로 사용
        // 리뷰 로케이터는 live이지만, DOM 구조가 바뀔 수 있으니 재할당해서 안정성 확보
        reviewItems = this.page.locator('#reviews div.Svr5cf.bKhjM');
        const currentCount = await reviewItems.count().catch(() => 0);
        
        if (currentCount > lastReviewCount) {
          console.log(`스크롤 (${scrollAttempt + 1}번째) - 리뷰: ${lastReviewCount}개 → ${currentCount}개`);
          lastReviewCount = currentCount;
          noChangeCount = 0;
        } else {
          noChangeCount++;
          if (noChangeCount >= 10) { // 연속 10번 변하지 않으면 중단 (더 많은 스크롤 시도)
            console.log(`리뷰 개수가 ${noChangeCount}번 연속 변하지 않아 스크롤을 중단합니다.`);
            break;
          }
        }
      }
      
      // 최종 리뷰 개수 확인
      const reviewCount = await reviewItems.count();
      console.log(`최종 리뷰 개수: ${reviewCount}개`);
      
      // 리뷰 데이터 추출 (제공된 선택자 우선 사용)
      const reviews = [];
      for (let i = 0; i < reviewCount; i++) {
        try {
          // 각 리뷰 아이템 (nth 사용)
          const reviewItem = reviewItems.nth(i);

          // rating 추출 (사용자 제공: div.GDWaad)
          let rating = 0;
          try {
            const ratingElement = reviewItem.locator('div.GDWaad');
            const count = await ratingElement.count();
            if (count > 0) {
              const ratingText = (await ratingElement.first().textContent().catch(() => '')) || '';
              const m = ratingText.match(/(\d+)\s*\/\s*5/);
              if (m) rating = parseInt(m[1], 10);
              if (!rating) {
                const m2 = ratingText.match(/(\d+\.?\d*)/);
                if (m2) rating = parseFloat(m2[1]);
              }
            }
          } catch (e) {}

          // nickname 추출 (사용자 제공: a.DHIhE.QB2Jof, 여러 선택자 시도)
          let nickname = '';
          try {
            const nicknameSelectors = [
              // 한글 닉네임용 선택자 (사용자 제공)
              'div > div > div:nth-child(1) > div.aAs4ib > div.jUkSGf.WwUTAf > span > a',
              'div.aAs4ib > div.jUkSGf.WwUTAf > span > a',
              // 기존 선택자들
              'a.DHIhE.QB2Jof',
              'a.DHIhE',
              'div.aAs4ib a[href*="/maps/contrib"]',
              'div.aAs4ib a',
              'div.jUkSGf.WwUTAf a',
            ];
            
            for (const selector of nicknameSelectors) {
              const authorEl = reviewItem.locator(selector);
              const count = await authorEl.count();
              if (count > 0) {
                nickname = ((await authorEl.first().textContent().catch(() => '')) || '').trim();
                if (nickname && nickname.length > 0) break;
              }
            }
          } catch (e) {}

          // visit_type (사용자 제공: div.ThUm5b span)
          let visitType = '';
          try {
            const visitEl = reviewItem.locator('div.ThUm5b span');
            const count = await visitEl.count();
            if (count > 0) {
              visitType = ((await visitEl.first().textContent().catch(() => '')) || '').trim();
            }
          } catch (e) {}

          // review_date (제공된 선택자 사용: "5 months ago on" 같은 상대 시간 형식)
          let reviewDate = null;
          let date = null;
          try {
            // 제공된 선택자 사용
            const dateSelectors = [
              'div > div > div:nth-child(2) > div.aAs4ib > div.jUkSGf.WwUTAf > span > span',
              'span.iUtr1.CQYfx',
              'div.aAs4ib div.jUkSGf span span',
            ];
            
            let dateText = '';
            for (const selector of dateSelectors) {
              const dateEl = reviewItem.locator(selector);
              const count = await dateEl.count();
              if (count > 0) {
                dateText = ((await dateEl.first().textContent().catch(() => '')) || '').trim();
                if (dateText && dateText.length > 0) break;
              }
            }
            
            if (dateText) {
              const trimmedDateText = dateText.trim();
              if (i < 5) {
                console.log(`[디버깅] 리뷰 ${i + 1} 날짜 텍스트: "${trimmedDateText}"`);
              }
              
              // 상대 시간 파싱 ("5 months ago on", "a week ago", "2 weeks ago", "정확히 1주 전에 Google에서 작성" 등)
              const relativeTimePatterns = [
                // 한국어 패턴 (우선 처리) - "전에" 형식도 포함
                /정확히\s*(\d+)\s*주\s*전/,
                /(\d+)\s*주\s*전에?/,
                /(\d+)\s*개월\s*전에?/,
                /(\d+)\s*일\s*전에?/,
                /(\d+)\s*년\s*전에?/,
                // 영어 패턴
                /(\d+)\s*(?:month|months|mo)\s*ago/i,
                /(\d+)\s*(?:week|weeks|wk|w)\s*ago/i,
                /(\d+)\s*(?:day|days|d)\s*ago/i,
                /(\d+)\s*(?:year|years|yr|y)\s*ago/i,
                /a\s*(?:week|month|day|year)\s*ago/i,
                /(\d+)\s*(?:시간|hour|hours|h)\s*ago/i,
              ];
              
              let daysAgo = 0;
              let matched = false;
              for (const pattern of relativeTimePatterns) {
                const match = trimmedDateText.match(pattern);
                if (match) {
                  matched = true;
                  if (match[1]) {
                    // 숫자가 있는 경우 (예: "1주 전", "2 weeks ago")
                    const num = parseInt(match[1]);
                    // 한국어 패턴 확인 (패턴 소스와 실제 텍스트 모두 확인)
                    if (pattern.source.includes('주') || trimmedDateText.includes('주')) {
                      daysAgo = num * 7;
                    } else if (pattern.source.includes('개월') || trimmedDateText.includes('개월')) {
                      daysAgo = num * 30;
                    } else if ((pattern.source.includes('일') && !pattern.source.includes('작성')) || (trimmedDateText.includes('일') && !trimmedDateText.includes('작성'))) {
                      daysAgo = num;
                    } else if (pattern.source.includes('년') || trimmedDateText.includes('년')) {
                      daysAgo = num * 365;
                    } else if (trimmedDateText.match(/month|months|mo/i)) {
                      daysAgo = num * 30; // 대략 30일
                    } else if (trimmedDateText.match(/week|weeks|wk|w/i)) {
                      daysAgo = num * 7;
                    } else if (trimmedDateText.match(/day|days|d/i)) {
                      daysAgo = num;
                    } else if (trimmedDateText.match(/year|years|yr|y/i)) {
                      daysAgo = num * 365;
                    } else if (trimmedDateText.match(/시간|hour|hours|h/i)) {
                      daysAgo = 0; // 시간 단위는 0일로 처리
                    }
                  } else {
                    // "a week ago", "a month ago" 등 (숫자가 없는 경우)
                    if (trimmedDateText.match(/week/i)) {
                      daysAgo = 7;
                    } else if (trimmedDateText.match(/month/i)) {
                      daysAgo = 30;
                    } else if (trimmedDateText.match(/day/i)) {
                      daysAgo = 1;
                    } else if (trimmedDateText.match(/year/i)) {
                      daysAgo = 365;
                    }
                  }
                  // daysAgo가 설정되었으면 루프 종료
                  if (daysAgo > 0) {
                    break;
                  }
                }
              }
              
              // 패턴 매칭이 안 된 경우에도 텍스트에 포함된 키워드로 확인 (한국어, 영어)
              if (!matched || daysAgo === 0) {
                // 한국어: "1주 전", "1주 전에", "1개월 전" 등 다양한 형식 지원 (공백 유무 무관, "전에" 형식 포함)
                const weekMatch = trimmedDateText.match(/(\d+)\s*주\s*전에?/);
                if (weekMatch) {
                  daysAgo = parseInt(weekMatch[1]) * 7;
                  matched = true;
                } else {
                  const monthMatch = trimmedDateText.match(/(\d+)\s*개월\s*전에?/);
                  if (monthMatch) {
                    daysAgo = parseInt(monthMatch[1]) * 30;
                    matched = true;
                  } else {
                    const dayMatch = trimmedDateText.match(/(\d+)\s*일\s*전에?/);
                    if (dayMatch) {
                      daysAgo = parseInt(dayMatch[1]);
                      matched = true;
                    } else {
                      const yearMatch = trimmedDateText.match(/(\d+)\s*년\s*전에?/);
                      if (yearMatch) {
                        daysAgo = parseInt(yearMatch[1]) * 365;
                        matched = true;
                      } else {
                        // 영어: "a week ago", "a month ago" 등 (패턴 매칭이 실패한 경우 재시도)
                        if (trimmedDateText.match(/a\s+week\s+ago/i)) {
                          daysAgo = 7;
                          matched = true;
                        } else if (trimmedDateText.match(/a\s+month\s+ago/i)) {
                          daysAgo = 30;
                          matched = true;
                        } else if (trimmedDateText.match(/a\s+day\s+ago/i)) {
                          daysAgo = 1;
                          matched = true;
                        } else if (trimmedDateText.match(/a\s+year\s+ago/i)) {
                          daysAgo = 365;
                          matched = true;
                        } else {
                          // 추가 시도: "1주 전에", "1개월 전에" 등 (공백이 없는 경우 또는 "전에" 형식)
                          const weekMatch2 = trimmedDateText.match(/(\d+)주\s*전에?/);
                          if (weekMatch2) {
                            daysAgo = parseInt(weekMatch2[1]) * 7;
                            matched = true;
                          } else {
                            const monthMatch2 = trimmedDateText.match(/(\d+)개월\s*전에?/);
                            if (monthMatch2) {
                              daysAgo = parseInt(monthMatch2[1]) * 30;
                              matched = true;
                            } else {
                              // "1개월 전에 Google에서 작성" 형식에서 "1개월" 추출 (더 유연한 패턴)
                              const monthMatch3 = trimmedDateText.match(/(\d+)\s*개월/);
                              if (monthMatch3 && (trimmedDateText.includes('전') || trimmedDateText.includes('ago'))) {
                                daysAgo = parseInt(monthMatch3[1]) * 30;
                                matched = true;
                                if (i < 5) {
                                  console.log(`[디버깅] 리뷰 ${i + 1} 개월 패턴 매칭 (fallback): "${trimmedDateText}" → ${daysAgo}일 전`);
                                }
                              } else {
                                // "1주 전에 Google에서 작성" 형식에서 "1주" 추출
                                const weekMatch3 = trimmedDateText.match(/(\d+)\s*주/);
                                if (weekMatch3 && (trimmedDateText.includes('전') || trimmedDateText.includes('ago'))) {
                                  daysAgo = parseInt(weekMatch3[1]) * 7;
                                  matched = true;
                                  if (i < 5) {
                                    console.log(`[디버깅] 리뷰 ${i + 1} 주 패턴 매칭 (fallback): "${trimmedDateText}" → ${daysAgo}일 전`);
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
              
              if (daysAgo > 0) {
                const today = new Date();
                const reviewDateObj = new Date(today);
                reviewDateObj.setDate(today.getDate() - daysAgo);
                date = reviewDateObj.toISOString().split('T')[0];
                reviewDate = reviewDateObj;
                
                // 디버깅: 처음 몇 개 리뷰만 날짜 로그
                if (i < 5) {
                  console.log(`[디버깅] 리뷰 ${i + 1} 날짜 파싱 성공: "${dateText}" → ${daysAgo}일 전 → ${date}`);
                }
              } else if (i < 5) {
                console.log(`[디버깅] 리뷰 ${i + 1} 날짜 파싱 실패: "${dateText}" (daysAgo=0, matched=${matched})`);
              }
            } else if (i < 3) {
              console.log(`[디버깅] 리뷰 ${i + 1} 날짜 텍스트 없음`);
            }
          } catch (e) {
            // 날짜 파싱 실패
            if (i < 3) {
              console.log(`[디버깅] 리뷰 ${i + 1} 날짜 파싱 에러:`, e.message);
            }
          }

          // 날짜를 찾지 못한 경우 리뷰를 건너뜀 (오늘 날짜 사용하지 않음)
          if (!date) {
            if (i < 3) {
              console.log(`[디버깅] 리뷰 ${i + 1} 날짜 없음 → 리뷰 건너뜀`);
            }
            continue;
          } else {
            reviewDate = new Date(date);
          }

          // content 추출
          // - 전체 컨테이너: div.K7oBsc
          // - 텍스트: div.STQFb.eoY5cb span 또는 div[jsname="NwoMSd"] span
          let content = '';
          try {
            const contentRoot = reviewItem.locator('div.K7oBsc');
            const rootCount = await contentRoot.count();
            if (rootCount > 0) {
              // 더보기 클릭 시도
              try {
                const more = contentRoot.locator('button:has-text("Read more"), button:has-text("read more"), span:has-text("Read more"), span:has-text("read more"), span:has-text("더보기")');
                const moreCount = await more.count();
                if (moreCount > 0) {
                  const visible = await more.first().isVisible({ timeout: 1000 }).catch(() => false);
                  if (visible) {
                    await more.first().click({ timeout: 2000 }).catch(() => {});
                    await this.page.waitForTimeout(600);
                  }
                }
              } catch (e) {}

              const contentSelectors = [
                'div[jsname="NwoMSd"] span',
                'div.STQFb.eoY5cb span',
                'div.STQFb span',
              ];
              for (const sel of contentSelectors) {
                const el = contentRoot.locator(sel);
                const c = await el.count();
                if (c > 0) {
                  const t = ((await el.allTextContents().catch(() => [])) || []).join('\n').trim();
                  if (t && t.length > 0) {
                    content = t;
                    break;
                  }
                }
              }
              if (!content) {
                content = ((await contentRoot.first().textContent().catch(() => '')) || '').trim();
              }
              content = content.replace(/Read more/gi, '').replace(/더보기/g, '').trim();
              
              // content를 한국어로 번역
              if (content && content.trim().length > 0) {
                content = await translateToKorean(content);
              }
            }
          } catch (e) {}

          // visit_keyword / review_keyword (기존 구조 유지)
          let visitKeyword = '';
          try {
            const visitKeywordElement = reviewItem.locator('div.kVathc.eoY5cb div.X4nL7d > div:nth-child(1)');
            const count = await visitKeywordElement.count();
            if (count > 0) {
              visitKeyword = ((await visitKeywordElement.first().textContent().catch(() => '')) || '').trim();
            }
          } catch (e) {}

          let reviewKeyword = '';
          try {
            const reviewKeywordElement = reviewItem.locator('div.kVathc.eoY5cb div.X4nL7d > div:nth-child(2) > span:nth-child(2)');
            const count = await reviewKeywordElement.count();
            if (count > 0) {
              reviewKeyword = ((await reviewKeywordElement.first().textContent().catch(() => '')) || '').trim();
            }
          } catch (e) {}

          // 날짜 필터링 (2주 전까지)
          // 'all'일 때는 필터링하지 않음
          let dateFiltered = false;
          if (dateFilter === 'week' || dateFilter === '2weeks') {
            const today = new Date();
            const twoWeeksAgo = new Date(today);
            twoWeeksAgo.setDate(today.getDate() - 14);
            if (reviewDate && reviewDate < twoWeeksAgo) {
              if (i < 10) {
                console.log(`[디버깅] 리뷰 ${i + 1} 날짜 필터링: ${date} (2주 전 이전)`);
              }
              dateFiltered = true;
              continue;
            }
          }

          const emotion = null;
          const keywords = [];
          if (reviewKeyword && reviewKeyword.trim().length > 0) keywords.push(reviewKeyword.trim());

          if ((content && content.trim().length > 0) || rating > 0 || (nickname && nickname.trim().length > 0)) {
            reviews.push({
              content: content ? content.trim() : '',
              nickname: nickname || `사용자${i + 1}`,
              rating: rating,
              visitType: visitType || '',
              emotion: emotion,
              reviewKeyword: keywords,
              visitKeyword: visitKeyword || '',
              reviewDate: date,
              revisitFlag: false,
            });
            
            // 디버깅: 처음 10개 리뷰 상세 로그
            if (i < 10) {
              const contentPreview = content ? (content.length > 50 ? content.substring(0, 50) + '...' : content) : '(없음)';
              console.log(`[디버깅] 리뷰 ${i + 1} 추출됨: nickname="${nickname}", rating=${rating}, date=${date}, content="${contentPreview}"`);
            }
          } else if (i < 10) {
            console.log(`[디버깅] 리뷰 ${i + 1} 유효하지 않음: content=${content ? content.length : 0}, rating=${rating}, nickname="${nickname}"`);
          }
          
        } catch (error) {
          // 리뷰 추출 실패 시 건너뛰기
          if (i < 3) console.log(`[디버깅] 리뷰 ${i + 1} 추출 실패:`, error.message);
        }
      }
      
      console.log(`구글 여행 스크래핑 완료: ${reviews.length}개 리뷰 발견`);
      if (saveImmediately) {
        console.log(`[구글] 즉시 저장 완료: ${actualSavedCount}개 리뷰 저장 성공 (추출: ${reviews.length}개)`);
        reviews._actualSavedCount = actualSavedCount;
      }
      return reviews;
      
    } catch (error) {
      console.error('구글 여행 스크래핑 실패:', error);
      return [];
    }
  }

  /**
   * 포털 URL에 따라 적절한 스크래퍼 선택
   * @param {string} portalUrl - 포털 URL (카카오맵/야놀자의 경우 null 또는 빈 문자열 가능)
   * @param {string} companyName - 기업명
   * @param {string} dateFilter - 'all' (전체), 'week' (일주일 간격), 'twoWeeks' (2주 간격)
   * @param {number} jobId - 스크래핑 작업 ID (선택사항)
   * @param {string} portalType - 포털 타입 강제 지정 ('kakao', 'yanolja', 'google' 등, 선택사항)
   */
  async scrapeByPortal(portalUrl, companyName, dateFilter = 'week', jobId = null, portalType = null) {
    let reviews = [];

    // portalType이 명시적으로 지정된 경우 우선 처리
    // 모든 포털에 즉시 저장 방식 적용 (메모리 효율성)
    if (portalType === 'yanolja') {
      reviews = await this.scrapeYanolja(companyName, dateFilter, jobId, 'yanolja', true);
    } else if (portalType === 'kakao') {
      reviews = await this.scrapeKakaoMap(companyName, dateFilter, jobId, 'kakao', true);
    } else if (portalType === 'google') {
      reviews = await this.scrapeGoogle(companyName, dateFilter, jobId, 'google', true);
    } else if (portalType === 'agoda') {
      // portalUrl이 있으면 agodaUrl로 사용, 없으면 null
      const agodaUrl = portalUrl && portalUrl.includes('agoda.com') ? portalUrl : null;
      reviews = await this.scrapeAgoda(companyName, dateFilter, agodaUrl, jobId, 'agoda', true);
    } else if (portalType === 'naver') {
      // 네이버맵은 companyName으로 검색하여 스크래핑
      // 즉시 저장 방식으로 변경 (메모리 효율성)
      reviews = await this.scrapeNaverMap(companyName, dateFilter, jobId, 'naver', true);
    } else if (portalUrl && portalUrl.includes('naver.com')) {
      // 네이버맵 URL이 제공된 경우에도 companyName으로 검색 (더보기 버튼 클릭 방식)
      // 즉시 저장 방식으로 변경 (메모리 효율성)
      reviews = await this.scrapeNaverMap(companyName, dateFilter, jobId, 'naver', true);
    } else if (!portalUrl || portalUrl.includes('kakao.com')) {
      // 카카오맵은 URL이 없어도 companyName으로 검색하여 스크래핑
      reviews = await this.scrapeKakaoMap(companyName, dateFilter, jobId, 'kakao', true);
    } else if (portalUrl && portalUrl.includes('yanolja.com')) {
      // 야놀자 URL이 제공된 경우
      reviews = await this.scrapeYanolja(companyName, dateFilter, jobId, 'yanolja', true);
    } else if (portalUrl && portalUrl.includes('google.com')) {
      reviews = await this.scrapeGoogle(companyName, dateFilter, jobId, 'google', true);
    } else if (portalUrl && portalUrl.includes('goodchoice.kr')) {
      reviews = await this.scrapeGoodchoice(portalUrl);
    } else if (portalUrl && portalUrl.includes('tripadvisor.co.kr')) {
      reviews = await this.scrapeTripadvisor(portalUrl);
    } else if (portalUrl && portalUrl.includes('agoda.com')) {
      reviews = await this.scrapeAgoda(companyName, dateFilter, portalUrl, jobId, 'agoda', true);
    }

    // 수집한 리뷰 데이터를 DB 형식에 맞게 변환
    // 날짜 필터링 설정
    let filterDate = null;
    if (dateFilter === 'week') {
      const today = new Date();
      filterDate = new Date(today);
      filterDate.setDate(today.getDate() - 7);
    } else if (dateFilter === 'twoWeeks') {
      const today = new Date();
      filterDate = new Date(today);
      filterDate.setDate(today.getDate() - 14);
    }
    
    let savedCount = 0;
    let filteredCount = 0; // 날짜 필터링으로 제외된 개수
    let skippedNoDate = 0; // 날짜 파싱 실패로 스킵된 개수
    let duplicateCount = 0; // 중복으로 스킵된 개수
    let emptyContentCount = 0;
    
    console.log(`\n[저장 시작] 총 ${reviews.length}개 리뷰 추출됨 (기업: "${companyName}", 포털: ${portalType || portalUrl || '알 수 없음'})`);
    
    if (reviews.length === 0) {
      console.log(`⚠️ [저장] 추출된 리뷰가 없습니다. 스크래핑이 완료되지 않았거나 리뷰를 찾지 못했을 수 있습니다.`);
      return 0;
    }
    
    // 모든 포털이 즉시 저장 방식으로 이미 저장되었으므로, 여기서는 통계만 업데이트
    if (portalType === 'naver' || portalType === 'kakao' || portalType === 'yanolja' || portalType === 'google' || portalType === 'agoda' ||
        (portalUrl && (portalUrl.includes('naver.com') || portalUrl.includes('kakao.com') || portalUrl.includes('yanolja.com') || portalUrl.includes('google.com') || portalUrl.includes('agoda.com')))) {
      const portalName = portalType === 'naver' ? '네이버맵' : 
                         portalType === 'kakao' ? '카카오맵' :
                         portalType === 'yanolja' ? '야놀자' :
                         portalType === 'google' ? '구글' :
                         portalType === 'agoda' ? '아고다' : '알 수 없음';
      console.log(`[저장] ${portalName}은 즉시 저장 방식으로 이미 저장되었습니다. 통계만 업데이트합니다.`);
      // 각 스크래퍼에서 실제 저장 개수를 _actualSavedCount로 저장했음
      const actualSavedCount = reviews._actualSavedCount !== undefined ? reviews._actualSavedCount : reviews.length;
      console.log(`[저장] ${portalName} 저장 완료: ${actualSavedCount}개 리뷰 저장 성공 (추출: ${reviews.length}개)`);
      return actualSavedCount;
    }
    
    console.log(`[저장] 리뷰 저장 루프 시작 (${reviews.length}개 처리 예정)...`);
    
    for (const review of reviews) {
      const contentText = (review.content || '').trim();
      const ratingValue = typeof review.rating === 'number' ? review.rating : (review.rating ? Number(review.rating) : 0);
      const hasAnySignal =
        contentText.length > 0 ||
        ratingValue > 0 ||
        (review.visitType && String(review.visitType).trim().length > 0) ||
        (review.visitKeyword && String(review.visitKeyword).trim().length > 0) ||
        (Array.isArray(review.reviewKeyword) && review.reviewKeyword.length > 0);

      // content가 없어도(평점만 있는) 구글 리뷰가 있으므로, 완전 빈 데이터만 스킵
      if (!hasAnySignal) {
        emptyContentCount++;
        continue;
      }
      
      // 날짜 파싱/정규화
      // - 저장은 YYYY-MM-DD 문자열로 통일
      // - Invalid Date로 인해 작업이 멈추지 않도록 방어
      const rawDate = review.reviewDate ?? review.date ?? null;
      const normalizeDateStr = (s) => {
        if (!s) return null;
        const t = String(s).trim();
        const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const dt = new Date(t);
        if (Number.isNaN(dt.getTime())) return null;
        return t;
      };
      const toIsoDateStr = (d) => {
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0];
      };

      let reviewDateStr = null;
      let reviewDateObj = null;

      if (rawDate instanceof Date) {
        reviewDateStr = toIsoDateStr(rawDate);
      } else {
        // 문자열 우선
        reviewDateStr = normalizeDateStr(rawDate);
        if (!reviewDateStr && rawDate) {
          const dt = new Date(String(rawDate));
          reviewDateStr = toIsoDateStr(dt);
        }
      }
      if (reviewDateStr) {
        reviewDateObj = new Date(reviewDateStr);
      }

      // 날짜가 없거나 유효하지 않으면 저장/필터링 불가 → 스킵
      if (!reviewDateStr || !reviewDateObj || Number.isNaN(reviewDateObj.getTime())) {
        skippedNoDate++;
        if (skippedNoDate <= 10) {
          console.log(`⚠️ [저장] 날짜 파싱 실패로 스킵 (${skippedNoDate}번째): nickname="${review.nickname}", rawDate="${rawDate}"`);
        }
        continue;
      }

      // 날짜 필터링: week 또는 twoWeeks 모드일 때 필터링
      if ((dateFilter === 'week' || dateFilter === 'twoWeeks') && filterDate && reviewDateObj < filterDate) {
        filteredCount++;
        if (filteredCount <= 10) {
          console.log(`⚠️ [저장] 날짜 필터링으로 제외 (${filteredCount}번째): nickname="${review.nickname}", date="${reviewDateStr}" (필터 기준: ${filterDate.toISOString().split('T')[0]} 이후)`);
        }
        continue;
      }
      
      const analysis = this.analyzeText(
        contentText,
        ratingValue,
        review.visitKeyword,
        review.reviewKeyword
      );

      // portal_url을 포털 이름으로 변환
      // portalType이 지정된 경우 우선 사용
      let portalName = '알 수 없음';
      if (portalType === 'yanolja') {
        portalName = '야놀자';
      } else if (portalType === 'kakao') {
        portalName = '카카오맵';
      } else if (portalType === 'google') {
        portalName = '구글';
      } else if (portalType === 'agoda') {
        portalName = '아고다';
      } else if (portalType === 'naver') {
        portalName = '네이버맵';
      } else if (portalUrl && portalUrl.includes('naver.com')) {
        portalName = '네이버맵';
      } else if (!portalUrl || portalUrl.includes('kakao.com')) {
        portalName = '카카오맵';
      } else if (portalUrl && portalUrl.includes('yanolja.com')) {
        portalName = '야놀자';
      } else if (portalUrl && portalUrl.includes('google.com')) {
        portalName = '구글';
      } else if (portalUrl && portalUrl.includes('agoda.com')) {
        portalName = '아고다';
      } else if (portalUrl) {
        portalName = this.getPortalName(portalUrl, portalType);
      }

      // 디버깅: 저장 시도 데이터 확인 (야놀자인 경우 모든 리뷰 로그)
      if (portalName === '야놀자' && reviews.indexOf(review) < 3) {
        console.log(`[디버깅] 야놀자 리뷰 ${reviews.indexOf(review) + 1} 저장 시도:`);
        console.log(`  portalUrl: "${portalName}"`);
        console.log(`  companyName: "${companyName}"`);
        console.log(`  reviewDate: ${reviewDate} (타입: ${typeof reviewDate})`);
        console.log(`  nickname: "${review.nickname}"`);
        console.log(`  content 길이: ${review.content?.length || 0}`);
        console.log(`  rating: ${review.rating}`);
        console.log(`  visitType: ${review.visitType}`);
      }

      const saved = await this.saveReview({
        portalUrl: portalName,
        companyName,
        reviewDate: reviewDateStr,
        content: contentText, // 빈 문자열 허용
        rating: ratingValue || null,
        nickname: review.nickname,
        visitKeyword: review.visitKeyword || null,
        reviewKeyword: review.reviewKeyword || null,
        visitType: review.visitType || null,
        emotion: review.emotion || null,
        revisitFlag: review.revisitFlag || false,
        nRating: analysis.nRating,
        nEmotion: analysis.nEmotion,
        nCharCount: analysis.nCharCount,
        title: review.title || null,
        additionalInfo: review.additionalInfo || null,
      });

      if (saved) {
        savedCount++;
        // 저장 성공 로그는 처음 10개만 출력
        if (savedCount <= 10) {
          console.log(`✅ [저장 성공] ${savedCount}번째: ${review.nickname} (${portalName}) - date: ${reviewDateStr}`);
        } else if (savedCount % 10 === 0) {
          console.log(`✅ [저장 진행] ${savedCount}개 저장 완료...`);
        }
      } else {
        // 중복이거나 저장 실패
        duplicateCount++;
        // 중복 로그는 처음 10개만 출력
        if (duplicateCount <= 10) {
          console.log(`⚠️ [저장 실패/중복] ${duplicateCount}번째: ${review.nickname} (${portalName}) - ${review.content?.substring(0, 50)}`);
        }
      }
    }
    
    // 상세 통계 출력
    const totalSkipped = emptyContentCount + skippedNoDate + filteredCount + duplicateCount;
    console.log(`\n📊 저장 통계:`);
    console.log(`  - 총 추출: ${reviews.length}개`);
    console.log(`  - 저장 성공: ${savedCount}개`);
    console.log(`  - 중복으로 스킵: ${duplicateCount}개`);
    console.log(`  - 날짜 파싱 실패로 스킵: ${skippedNoDate}개`);
    if (filteredCount > 0) {
      console.log(`  - 날짜 필터링으로 제외: ${filteredCount}개 (${dateFilter === 'week' ? '일주일' : '2주일'} 이전)`);
    }
    if (emptyContentCount > 0) {
      console.log(`  - 빈 데이터로 스킵: ${emptyContentCount}개`);
    }
    console.log(`  - 저장 시도: ${reviews.length - emptyContentCount - skippedNoDate - filteredCount}개`);

    // scraping_jobs 테이블에 데이터 저장 (jobId가 있는 경우)
    if (jobId) {
      try {
        await pool.query(
          `UPDATE scraping_jobs 
           SET total_reviews = total_reviews + $1,
               success_count = success_count + $2,
               error_count = error_count + $3
           WHERE id = $4`,
          [reviews.length, savedCount, reviews.length - savedCount - emptyContentCount - filteredCount, jobId]
        );
      } catch (error) {
        console.error('scraping_jobs 업데이트 실패:', error);
      }
    }

    return savedCount;
  }
}

export default ScraperService;
