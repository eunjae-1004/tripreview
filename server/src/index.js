import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import adminRoutes from './routes/admin.js';
import jobService from './services/jobService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json());

// 라우트
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`스케줄: 매주 월요일 오전 2시 자동 실행`);
});
