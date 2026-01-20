import dotenv from 'dotenv';
import { pool } from '../db/connection.js';

dotenv.config();

/**
 * companies 테이블의 기업 수와 각 포털별 스크래핑 현황 확인
 */
async function checkCompaniesStatus() {
  try {
    console.log('📊 companies 테이블 현황 확인\n');

    // 전체 기업 수 확인
    const companiesResult = await pool.query('SELECT COUNT(*) as count FROM companies');
    const totalCompanies = parseInt(companiesResult.rows[0].count);
    console.log(`전체 기업 수: ${totalCompanies}개\n`);

    // 각 기업별 정보 및 포털 URL 현황
    const companies = await pool.query('SELECT id, company_name, naver_url, kakao_url, yanolja_url, agoda_url, google_url FROM companies ORDER BY id');
    
    console.log('='.repeat(80));
    console.log('기업별 상세 정보');
    console.log('='.repeat(80));
    
    for (const company of companies.rows) {
      console.log(`\n[${company.id}] ${company.company_name}`);
      console.log(`  네이버맵 URL: ${company.naver_url ? '✅ 있음' : '❌ 없음'}`);
      console.log(`  카카오맵 URL: ${company.kakao_url ? '✅ 있음' : '❌ 없음'}`);
      console.log(`  야놀자 URL: ${company.yanolja_url ? '✅ 있음' : '❌ 없음'}`);
      console.log(`  아고다 URL: ${company.agoda_url ? '✅ 있음' : '❌ 없음'}`);
      console.log(`  구글 URL: ${company.google_url ? '✅ 있음' : '❌ 없음'}`);
      
      // 각 포털별 리뷰 수 확인
      const reviewResult = await pool.query(
        `SELECT portal_url, COUNT(*) as count 
         FROM reviews 
         WHERE company_name = $1 
         GROUP BY portal_url 
         ORDER BY count DESC`,
        [company.company_name]
      );
      
      if (reviewResult.rows.length > 0) {
        console.log(`  저장된 리뷰:`);
        for (const row of reviewResult.rows) {
          console.log(`    - ${row.portal_url}: ${row.count}개`);
        }
      } else {
        console.log(`  저장된 리뷰: 없음`);
      }
    }

    // 포털별 전체 리뷰 수 집계
    console.log(`\n${'='.repeat(80)}`);
    console.log('포털별 전체 리뷰 수');
    console.log('='.repeat(80));
    
    const portalStats = await pool.query(
      `SELECT portal_url, COUNT(*) as count 
       FROM reviews 
       GROUP BY portal_url 
       ORDER BY count DESC`
    );
    
    let totalReviews = 0;
    for (const row of portalStats.rows) {
      console.log(`  ${row.portal_url}: ${row.count}개`);
      totalReviews += parseInt(row.count);
    }
    console.log(`\n  전체 리뷰 수: ${totalReviews}개`);

    // 기업별 리뷰 수 집계
    console.log(`\n${'='.repeat(80)}`);
    console.log('기업별 리뷰 수');
    console.log('='.repeat(80));
    
    const companyStats = await pool.query(
      `SELECT company_name, COUNT(*) as count 
       FROM reviews 
       GROUP BY company_name 
       ORDER BY count DESC`
    );
    
    for (const row of companyStats.rows) {
      console.log(`  ${row.company_name}: ${row.count}개`);
    }

    console.log('\n✅ 확인 완료!');

  } catch (error) {
    console.error('❌ 확인 실패:', error);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkCompaniesStatus().catch(console.error);
