import dotenv from 'dotenv';
import { pool } from '../db/connection.js';
import ScraperService from '../services/scraper.js';

dotenv.config();

/**
 * 테스트용 기업 정보 추가 스크립트
 */
async function addTestCompanies() {
  const scraper = new ScraperService();

  const companies = [
    {
      companyName: '동해보양온천컨벤션호텔',
      type: '숙박시설',
      isMember: 'Y',
      address: '강원 동해시 동해대로',
      naverUrl: 'https://map.naver.com/p/entry/place/11658902',
    },
    {
      companyName: '오색그량야드호텔',
      type: '숙박시설',
      isMember: 'N',
      address: null,
      naverUrl: null, // URL을 찾아야 함
    },
  ];

  console.log('기업 정보 추가 시작...\n');

  for (const company of companies) {
    try {
      const saved = await scraper.saveCompany(company);
      if (saved) {
        console.log(`✅ ${company.companyName} 추가 완료`);
        if (company.naverUrl) {
          console.log(`   네이버맵 URL: ${company.naverUrl}`);
        }
      } else {
        console.log(`❌ ${company.companyName} 추가 실패`);
      }
    } catch (error) {
      console.error(`❌ ${company.companyName} 추가 오류:`, error.message);
    }
  }

  console.log('\n기업 목록 조회:');
  const result = await pool.query('SELECT id, company_name, naver_url FROM companies ORDER BY id DESC LIMIT 10');
  console.table(result.rows.map(row => ({
    id: row.id,
    기업명: row.company_name,
    네이버URL: row.naver_url || '(없음)',
  })));

  await pool.end();
}

addTestCompanies().catch(console.error);
