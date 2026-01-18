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

    // 스키마 파일 읽기
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // 스키마 실행
    await client.query(schema);
    console.log('스키마 생성 완료');

    console.log('마이그레이션 완료');
  } catch (error) {
    console.error('마이그레이션 실패:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
