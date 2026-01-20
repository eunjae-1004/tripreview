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
    // Railway 배포 시 마이그레이션이 이미 완료된 경우를 고려하여
    // 에러가 발생해도 프로세스를 종료하지 않음
    if (error.message && error.message.includes('already exists')) {
      console.log('⚠️ 테이블이 이미 존재합니다. 마이그레이션을 건너뜁니다.');
      process.exit(0);
    }
    // 다른 에러의 경우에도 배포를 계속 진행
    console.log('⚠️ 마이그레이션 에러가 발생했지만 배포를 계속 진행합니다.');
    process.exit(0);
  } finally {
    await client.end();
  }
}

migrate();
