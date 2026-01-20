import dotenv from 'dotenv';
import { pool } from '../db/connection.js';
import ScraperService from '../services/scraper.js';

dotenv.config();

/**
 * 네이버맵만 테스트 (companies 테이블의 모든 기업)
 */
async function testNaverOnly() {
  console.log('🚀 네이버맵 스크래핑 테스트 시작\n');

  const scraper = new ScraperService();
  const dateFilter = 'all';

  try {
    await scraper.init();
    console.log('✅ 브라우저 초기화 완료\n');

    // companies 테이블에서 모든 기업 조회
    const companies = await pool.query('SELECT * FROM companies');
    console.log(`총 ${companies.rows.length}개 기업 발견\n`);

    let totalCount = 0;

    for (const company of companies.rows) {
      try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`기업: ${company.company_name}`);
        console.log('='.repeat(60));

        const count = await scraper.scrapeByPortal(
          company.naver_url || null, // URL이 있으면 전달, 없으면 null (검색 방식 사용)
          company.company_name,
          dateFilter,
          null, // jobId
          'naver' // portalType 명시
        );

        totalCount += count;
        console.log(`✅ "${company.company_name}" 네이버맵 스크래핑 완료: ${count}개 리뷰 저장`);
      } catch (error) {
        console.error(`❌ "${company.company_name}" 네이버맵 스크래핑 실패:`, error.message);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`전체 완료: 총 ${totalCount}개 리뷰 저장`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ 네이버맵 스크래핑 실패:', error);
    console.error(error.stack);
  } finally {
    await scraper.close();
    await pool.end();
  }
}

testNaverOnly().catch(console.error);
