import dotenv from 'dotenv';
import { pool } from '../db/connection.js';

dotenv.config();

async function checkNaverReviews() {
  try {
    const result = await pool.query(
      `SELECT nickname, LEFT(content, 150) as content_preview, review_date, rating 
       FROM reviews 
       WHERE company_name = $1 AND portal_url = $2 
       ORDER BY created_at DESC 
       LIMIT 5`,
      ['오색그린야드호텔', '네이버맵']
    );
    
    console.log('최근 저장된 네이버맵 리뷰 샘플:');
    console.log('='.repeat(80));
    
    result.rows.forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.nickname} (${r.review_date}, ${r.rating}점)`);
      console.log(`   Content: ${r.content_preview}...`);
    });
    
    console.log(`\n총 ${result.rows.length}개 리뷰 확인`);
    
  } catch (error) {
    console.error('❌ 확인 실패:', error);
  } finally {
    await pool.end();
  }
}

checkNaverReviews().catch(console.error);
