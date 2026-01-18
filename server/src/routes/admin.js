import express from 'express';
import jobService from '../services/jobService.js';

const router = express.Router();

/**
 * 관리자 인증 미들웨어 (간단 버전)
 * 실제로는 JWT 토큰 기반 인증을 사용하는 것이 좋습니다.
 */
const authenticateAdmin = (req, res, next) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret === process.env.ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: '인증 실패' });
  }
};

// 모든 관리자 라우트에 인증 적용
router.use(authenticateAdmin);

/**
 * 스크래핑 작업 시작
 */
router.post('/jobs/start', async (req, res) => {
  try {
    if (jobService.getIsRunning()) {
      return res.status(400).json({ error: '이미 실행 중인 작업이 있습니다.' });
    }

    // 비동기로 실행 (응답은 즉시 반환)
    jobService.runScrapingJob().catch((error) => {
      console.error('스크래핑 작업 실행 오류:', error);
    });

    res.json({ message: '스크래핑 작업이 시작되었습니다.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 스크래핑 작업 중지
 */
router.post('/jobs/stop', async (req, res) => {
  try {
    await jobService.stopJob();
    res.json({ message: '스크래핑 작업이 중지되었습니다.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * 현재 작업 상태 조회
 */
router.get('/jobs/status', async (req, res) => {
  try {
    const currentJob = await jobService.getCurrentJob();
    const isRunning = jobService.getIsRunning();

    res.json({
      isRunning,
      currentJob: currentJob || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 최근 작업 목록 조회
 */
router.get('/jobs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const jobs = await jobService.getRecentJobs(limit);
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 특정 작업 상세 조회
 */
router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await jobService.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
    }
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
