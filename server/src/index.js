import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import adminRoutes from './routes/admin.js';
import jobService from './services/jobService.js';
import { initSchedule } from './services/scheduleService.js';

dotenv.config();

// Railway 배포 시 환경 변수 확인 (서버 시작 전에 먼저 출력)
console.log('[서버 시작] 환경 변수 확인 중...');
const rawPort = process.env.PORT;
console.log(`- PORT 환경 변수: ${rawPort || '미설정'}`);
console.log(`- NODE_ENV: ${process.env.NODE_ENV || '미설정'}`);
console.log(`- DATABASE_URL: ${process.env.DATABASE_URL ? '설정됨' : '미설정'}`);

const app = express();
// Railway는 자동으로 PORT 환경 변수를 설정합니다
// Railway Networking에서 설정한 포트와 일치해야 합니다
const PORT = rawPort ? parseInt(rawPort, 10) : 3000;
console.log(`[서버 시작] 사용할 포트: ${PORT} (${rawPort ? '환경 변수에서' : '기본값'})`);

console.log('[서버 시작] Express 앱 생성 완료');

// CORS 설정 - 모든 도메인에서 접근 허용
// - 프리플라이트(OPTIONS)는 Railway 프록시에서 502로 보일 수 있어 명시적으로 처리
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-secret'],
  credentials: false,
  optionsSuccessStatus: 204,
};

// Health check를 가장 먼저 등록 (서버 시작 전에도 응답 가능)
// Railway Healthcheck는 서버가 요청을 처리할 수 있으면 성공으로 간주
// 매우 빠르게 응답하여 스크래핑 작업 중에도 healthcheck가 실패하지 않도록 함
app.get('/health', (req, res) => {
  // 최소한의 로깅만 수행 (빠른 응답을 위해)
  // Railway Healthcheck는 매우 자주 호출되므로 로깅을 최소화
  
  // 즉시 응답 (비동기 작업 없이)
  res.status(200).json({
    status: 'ok',
    message: 'Trip Review Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    port: PORT
  });
});

// 미들웨어
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());

// 요청 로깅 (프로덕션 환경에서도 API 요청 로깅)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[API] ${req.method} ${req.path} - ${new Date().toISOString()}`);
    console.log(`[API] Headers:`, {
      'x-admin-secret': req.headers['x-admin-secret'] ? '설정됨' : '미설정',
      'content-type': req.headers['content-type'],
      'origin': req.headers['origin'],
    });
  }
  next();
});

// 라우트
app.use('/api/admin', adminRoutes);

// Health check (루트 경로)
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Trip Review Server is running',
    timestamp: new Date().toISOString()
  });
});

// 매주 일요일 새벽 2시 자동 실행 (scheduleService에서 제어)
initSchedule();

// 서버 시작
let serverReady = false;

console.log(`[서버 시작] 포트 ${PORT}에서 서버 시작 시도 중...`);

const server = app.listen(PORT, '0.0.0.0', () => {
  serverReady = true;
  console.log(`✅ 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`📅 스케줄: 매주 일요일 오전 2시 자동 실행`);
  console.log(`🏥 Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`🌐 서버 준비 완료 - 요청 대기 중...`);
  
  // Railway Healthcheck를 즉시 테스트
  if (process.env.NODE_ENV === 'production') {
    // Healthcheck 엔드포인트가 즉시 응답할 수 있도록 확인
    console.log(`[Railway] Healthcheck 엔드포인트 준비 완료: /health`);
    console.log(`[Railway] 서버가 Healthcheck 요청을 받을 준비가 되었습니다.`);
    
    // 프로덕션 환경에서만 READY 신호 출력 (Railway가 서버 준비 상태를 확인)
    // Railway는 Healthcheck를 호출하지만, READY 신호도 확인할 수 있음
    process.stdout.write('READY\n');
    console.log(`[Railway] READY 신호 전송 완료`);
    
    // Keep-alive: 주기적으로 로그를 출력하여 서버가 살아있음을 Railway에 알림
    const keepAliveInterval = setInterval(() => {
      if (serverReady) {
        console.log(`[Keep-Alive] 서버 실행 중 - uptime: ${process.uptime()}초`);
      }
    }, 30000); // 30초마다
    
    // 서버 종료 시 interval 정리
    process.on('SIGTERM', () => {
      clearInterval(keepAliveInterval);
    });
    process.on('SIGINT', () => {
      clearInterval(keepAliveInterval);
    });
  }
});

// 서버 시작 실패 시 로그
server.on('error', (err) => {
  console.error('[서버 시작 실패]', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 포트 ${PORT}가 이미 사용 중입니다.`);
    process.exit(1);
  } else {
    console.error(`❌ 서버 시작 실패: ${err.message}`);
    process.exit(1);
  }
});

// 서버 에러는 위에서 처리됨

// 프로세스 종료 시 정리
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM 신호 수신, 서버 종료 중...');
  console.log('⚠️ Railway가 서버 종료를 요청했습니다.');
  console.log(`⚠️ 현재 실행 중인 작업: ${jobService.getIsRunning() ? '있음' : '없음'}`);
  
  // 실행 중인 스크래핑 작업이 있으면 먼저 중지 시도
  if (jobService.getIsRunning()) {
    console.log('⚠️ 실행 중인 스크래핑 작업을 중지합니다...');
    jobService.stopJob().catch((err) => {
      console.error('⚠️ 작업 중지 실패:', err);
    });
  }
  
  server.close(() => {
    console.log('✅ HTTP 서버가 종료되었습니다.');
    process.exit(0);
  });
  
  // 강제 종료 타임아웃 (30초로 증가 - 스크래핑 작업 종료 시간 확보)
  setTimeout(() => {
    console.error('⚠️ 강제 종료: 서버가 30초 내에 종료되지 않았습니다.');
    process.exit(1);
  }, 30000);
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
// Railway가 서버를 종료시키지 않도록 주기적으로 활동 신호 전송
setInterval(() => {
  if (serverReady) {
    // 서버가 정상 실행 중임을 확인
    process.stdout.write('.');
    console.log(`[Keep-Alive] 서버 실행 중 - uptime: ${process.uptime()}초`);
  }
}, 30000); // 30초마다
