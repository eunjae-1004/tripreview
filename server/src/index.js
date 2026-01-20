import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import adminRoutes from './routes/admin.js';
import jobService from './services/jobService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Railway 배포 시 환경 변수 확인
console.log('환경 변수 확인:');
console.log(`- PORT: ${process.env.PORT || '미설정 (기본값 3000 사용)'}`);
console.log(`- NODE_ENV: ${process.env.NODE_ENV || '미설정'}`);
console.log(`- DATABASE_URL: ${process.env.DATABASE_URL ? '설정됨' : '미설정'}`);

// 미들웨어
app.use(cors());
app.use(express.json());

// 라우트
app.use('/api/admin', adminRoutes);

// Health check (루트 경로와 /health 모두 지원)
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Trip Review Server is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Trip Review Server is running' });
});

// 매주 월요일 새벽 2시에 자동 실행
// cron 표현식: 분 시 일 월 요일
// 0 2 * * 1 = 매주 월요일 오전 2시
cron.schedule('0 2 * * 1', async () => {
  console.log('스케줄된 스크래핑 작업 시작:', new Date());
  
  if (!jobService.getIsRunning()) {
    try {
      await jobService.runScrapingJob();
      console.log('스케줄된 스크래핑 작업 완료');
    } catch (error) {
      console.error('스케줄된 스크래핑 작업 실패:', error);
    }
  } else {
    console.log('이미 실행 중인 작업이 있어 스케줄 작업을 건너뜁니다.');
  }
});

// 서버 시작
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`스케줄: 매주 월요일 오전 2시 자동 실행`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});

// 서버 에러 처리
server.on('error', (err) => {
  console.error('서버 에러:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`포트 ${PORT}가 이미 사용 중입니다.`);
    process.exit(1);
  }
});

// 프로세스 종료 시 정리
process.on('SIGTERM', () => {
  console.log('SIGTERM 신호 수신, 서버 종료 중...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT 신호 수신, 서버 종료 중...');
  process.exit(0);
});
