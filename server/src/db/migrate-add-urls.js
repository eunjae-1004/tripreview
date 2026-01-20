import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('데이터베이스 연결 성공');

    // 마이그레이션 파일 읽기
    const migrationPath = path.join(__dirname, 'migrations', '001_add_portal_urls.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');

    // 마이그레이션 실행
    await client.query(migration);
    console.log('포털 URL 컬럼 추가 완료');

    console.log('마이그레이션 완료');
  } catch (error) {
    console.error('마이그레이션 실패:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
