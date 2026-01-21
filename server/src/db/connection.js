import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// PostgreSQL 연결 풀 생성
// DATABASE_URL이 없어도 서버가 시작되도록 설정
let poolInstance = null;

if (process.env.DATABASE_URL) {
  try {
    poolInstance = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      // 연결 실패 시 재시도 설정
      connectionTimeoutMillis: 10000, // 10초 타임아웃
      idleTimeoutMillis: 30000,
      max: 10, // 최대 연결 수
    });
  } catch (error) {
    console.error('❌ PostgreSQL Pool 생성 실패:', error.message);
    console.warn('⚠️ 데이터베이스 연결 없이 서버를 계속 실행합니다.');
  }
} else {
  console.warn('⚠️ DATABASE_URL이 설정되지 않았습니다. 데이터베이스 기능을 사용할 수 없습니다.');
}

export const pool = poolInstance;

// 연결 테스트 (DATABASE_URL이 있는 경우만)
if (pool) {
  pool.on('connect', () => {
    console.log('✅ PostgreSQL 연결 성공');
  });

  // 연결 에러 처리 (서버가 종료되지 않도록)
  pool.on('error', (err) => {
    console.error('❌ PostgreSQL 연결 오류:', err.message);
    console.error('⚠️ 데이터베이스 연결이 실패했지만 서버는 계속 실행됩니다.');
    // 서버가 종료되지 않도록 에러만 로깅
  });
} else {
  console.warn('⚠️ DATABASE_URL이 설정되지 않았습니다. 데이터베이스 기능을 사용할 수 없습니다.');
}
