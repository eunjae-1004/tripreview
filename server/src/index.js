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
  res.status(200).json({ 
    status: 'ok', 
    message: 'Trip Review Server is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  // Railway Healthcheck는 서버가 요청을 처리할 수 있으면 성공으로 간주
  // Express 서버가 시작되면 이미 요청을 처리할 수 있으므로 항상 200 반환
  res.status(200).json({ 
    status: serverReady ? 'ok' : 'starting',
    message: serverReady ? 'Trip Review Server is running' : 'Server is starting up',
    timestamp: new Date().toISOString(),
    ...(serverReady && {
      uptime: process.uptime(),
      port: PORT
    })
  });
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
let serverReady = false;

const server = app.listen(PORT, '0.0.0.0', () => {
  serverReady = true;
  console.log(`✅ 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`📅 스케줄: 매주 월요일 오전 2시 자동 실행`);
  console.log(`🏥 Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`🌐 서버 준비 완료 - 요청 대기 중...`);
  
  // 서버가 정상적으로 시작되었음을 확인
  // Railway가 서버 준비 상태를 확인할 수 있도록
  if (process.env.NODE_ENV === 'production') {
    // 프로덕션 환경에서만 READY 신호 출력
    setTimeout(() => {
      process.stdout.write('READY\n');
    }, 1000);
  }
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
  console.log('⚠️ SIGTERM 신호 수신, 서버 종료 중...');
  server.close(() => {
    console.log('✅ HTTP 서버가 종료되었습니다.');
    process.exit(0);
  });
  
  // 강제 종료 타임아웃 (10초)
  setTimeout(() => {
    console.error('⚠️ 강제 종료: 서버가 10초 내에 종료되지 않았습니다.');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('⚠️ SIGINT 신호 수신, 서버 종료 중...');
  server.close(() => {
    console.log('✅ HTTP 서버가 종료되었습니다.');
    process.exit(0);
  });
  
  // 강제 종료 타임아웃 (10초)
  setTimeout(() => {
    console.error('⚠️ 강제 종료: 서버가 10초 내에 종료되지 않았습니다.');
    process.exit(1);
  }, 10000);
});

// 처리되지 않은 에러 처리
process.on('uncaughtException', (error) => {
  console.error('❌ 처리되지 않은 예외:', error);
  console.error('스택 트레이스:', error.stack);
  // 서버를 즉시 종료하지 않고 로깅만 수행
  // Railway가 자동으로 재시작할 수 있도록
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 처리되지 않은 Promise 거부:', reason);
  // 서버를 즉시 종료하지 않고 로깅만 수행
});

// 서버가 종료되지 않도록 keep-alive
setInterval(() => {
  if (serverReady) {
    // 서버가 정상 실행 중임을 확인
    process.stdout.write('.');
  }
}, 30000); // 30초마다
