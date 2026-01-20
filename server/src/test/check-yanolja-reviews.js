import dotenv from 'dotenv';
import { pool } from '../db/connection.js';

dotenv.config();

/**
 * 야놀자 리뷰 확인
 */
async function checkYanoljaReviews() {
  try {
    console.log('🔍 야놀자 리뷰 확인 중...\n');

    // 야놀자 리뷰 조회
    const result = await pool.query(
      `SELECT 
        id,
        portal_url,
        company_name,
        review_date,
        nickname,
        rating,
        content,
        created_at
       FROM reviews 
       WHERE portal_url = '야놀자'
       ORDER BY created_at DESC
       LIMIT 20`
    );

    console.log(`📊 야놀자 리뷰 총 개수: ${result.rows.length}개\n`);

    if (result.rows.length > 0) {
      console.log('📋 최근 야놀자 리뷰 목록:');
      console.log('='.repeat(80));
      
      for (const review of result.rows) {
        console.log(`\n[ID: ${review.id}]`);
        console.log(`  기업명: ${review.company_name}`);
        console.log(`  포털: ${review.portal_url}`);
        console.log(`  닉네임: ${review.nickname}`);
        console.log(`  날짜: ${review.review_date}`);
        console.log(`  평점: ${review.rating || 'N/A'}`);
        console.log(`  내용: ${review.content?.substring(0, 50)}...`);
        console.log(`  생성일: ${review.created_at}`);
      }
    } else {
      console.log('⚠️ 야놀자 리뷰가 없습니다.');
    }

    // 기업별 야놀자 리뷰 개수
    console.log('\n' + '='.repeat(80));
    console.log('📊 기업별 야놀자 리뷰 개수:');
    console.log('='.repeat(80));
    
    const countResult = await pool.query(
      `SELECT 
        company_name,
        COUNT(*) as count
       FROM reviews 
       WHERE portal_url = '야놀자'
       GROUP BY company_name
       ORDER BY count DESC`
    );

    for (const row of countResult.rows) {
      console.log(`  ${row.company_name}: ${row.count}개`);
    }

    // portal_url 값 확인 (혹시 다른 값으로 저장되었는지)
    console.log('\n' + '='.repeat(80));
    console.log('📊 portal_url 값 분포:');
    console.log('='.repeat(80));
    
    const portalResult = await pool.query(
      `SELECT 
        portal_url,
        COUNT(*) as count
       FROM reviews 
       GROUP BY portal_url
       ORDER BY count DESC`
    );

    for (const row of portalResult.rows) {
      console.log(`  "${row.portal_url}": ${row.count}개`);
    }

  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await pool.end();
  }
}

checkYanoljaReviews().catch(console.error);
