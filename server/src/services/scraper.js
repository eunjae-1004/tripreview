import { chromium } from 'playwright';
import { pool } from '../db/connection.js';

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
    this.page = await this.browser.newPage();
    
    // User-Agent 설정 (봇 차단 방지)
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
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
    } = reviewData;

    try {
      await pool.query(
        `INSERT INTO reviews (
          portal_url, company_name, review_date, content, rating, nickname,
          visit_keyword, review_keyword, visit_type, emotion, revisit_flag,
          n_rating, n_emotion, n_char_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (company_name, review_date, nickname) DO NOTHING`,
        [
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
          revisitFlag || false,
          nRating,
          nEmotion,
          nCharCount,
        ]
      );
      return true;
    } catch (error) {
      console.error('리뷰 저장 실패:', error);
      return false;
    }
  }

  /**
   * 기업 정보 저장
   */
  async saveCompany(companyData) {
    const { companyName, type, isMember, address, email, phone, manager } = companyData;

    try {
      await pool.query(
        `INSERT INTO companies (company_name, type, is_member, address, email, phone, manager)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [companyName, type, isMember, address, email, phone, manager]
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
   * 네이버맵 스크래핑 (예시)
   * 실제 사이트 구조에 맞게 수정 필요
   */
  async scrapeNaverMap(url) {
    try {
      await this.page.goto(url, { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(2000);

      // 실제 사이트 구조에 맞게 수정 필요
      // 여기서는 예시 구조만 제공
      const reviews = await this.page.evaluate(() => {
        // 실제 선택자로 변경 필요
        const reviewElements = document.querySelectorAll('.review-item');
        return Array.from(reviewElements).map((el) => ({
          content: el.querySelector('.review-text')?.textContent || '',
          rating: parseFloat(el.querySelector('.rating')?.textContent || '0'),
          nickname: el.querySelector('.nickname')?.textContent || '',
          date: el.querySelector('.date')?.textContent || '',
        }));
      });

      return reviews;
    } catch (error) {
      console.error('네이버맵 스크래핑 실패:', error);
      return [];
    }
  }

  /**
   * 카카오맵 스크래핑 (예시)
   */
  async scrapeKakaoMap(url) {
    // 카카오맵 스크래핑 로직
    // 실제 사이트 구조에 맞게 구현 필요
    return [];
  }

  /**
   * 야놀자 스크래핑 (예시)
   */
  async scrapeYanolja(url) {
    // 야놀자 스크래핑 로직
    return [];
  }

  /**
   * 굿초이스 스크래핑 (예시)
   */
  async scrapeGoodchoice(url) {
    // 굿초이스 스크래핑 로직
    return [];
  }

  /**
   * 구글 스크래핑 (예시)
   */
  async scrapeGoogle(url) {
    // 구글 스크래핑 로직
    return [];
  }

  /**
   * 트립어드바이저 스크래핑 (예시)
   */
  async scrapeTripadvisor(url) {
    // 트립어드바이저 스크래핑 로직
    return [];
  }

  /**
   * 아고다 스크래핑 (예시)
   */
  async scrapeAgoda(url) {
    // 아고다 스크래핑 로직
    return [];
  }

  /**
   * 포털 URL에 따라 적절한 스크래퍼 선택
   */
  async scrapeByPortal(portalUrl, companyName) {
    let reviews = [];

    if (portalUrl.includes('naver.com')) {
      reviews = await this.scrapeNaverMap(portalUrl);
    } else if (portalUrl.includes('kakao.com')) {
      reviews = await this.scrapeKakaoMap(portalUrl);
    } else if (portalUrl.includes('yanolja.com')) {
      reviews = await this.scrapeYanolja(portalUrl);
    } else if (portalUrl.includes('goodchoice.kr')) {
      reviews = await this.scrapeGoodchoice(portalUrl);
    } else if (portalUrl.includes('google.com')) {
      reviews = await this.scrapeGoogle(portalUrl);
    } else if (portalUrl.includes('tripadvisor.co.kr')) {
      reviews = await this.scrapeTripadvisor(portalUrl);
    } else if (portalUrl.includes('agoda.com')) {
      reviews = await this.scrapeAgoda(portalUrl);
    }

    // 수집한 리뷰 데이터를 DB 형식에 맞게 변환
    const savedCount = 0;
    for (const review of reviews) {
      const analysis = this.analyzeText(
        review.content,
        review.rating,
        review.visitKeyword,
        review.reviewKeyword
      );

      const saved = await this.saveReview({
        portalUrl,
        companyName,
        reviewDate: new Date(review.date || Date.now()),
        content: review.content,
        rating: review.rating,
        nickname: review.nickname,
        visitKeyword: review.visitKeyword || null,
        reviewKeyword: review.reviewKeyword || null,
        visitType: review.visitType || null,
        emotion: review.emotion || null,
        revisitFlag: review.revisitFlag || false,
        nRating: analysis.nRating,
        nEmotion: analysis.nEmotion,
        nCharCount: analysis.nCharCount,
      });

      if (saved) savedCount++;
    }

    return savedCount;
  }
}

export default ScraperService;
