import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// PostgreSQL 연결 풀 생성
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// 연결 테스트
pool.on('connect', () => {
  console.log('PostgreSQL 연결 성공');
});

pool.on('error', (err) => {
  console.error('PostgreSQL 연결 오류:', err);
});
