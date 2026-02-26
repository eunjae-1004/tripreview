import express from 'express';
import jobService from '../services/jobService.js';
import { getScheduleStatus, setScheduleEnabled } from '../services/scheduleService.js';

const router = express.Router();

// ADMIN_PASSWORD 미설정 시 클라이언트 기본값(admin123)과 맞춰 로컬에서 바로 동작하도록 기본값 사용
const expectedAdminSecret = (process.env.ADMIN_PASSWORD || 'admin123').trim();
console.log('[admin] API 인증: 서버가 기대하는 비밀번호 =', process.env.ADMIN_PASSWORD ? '환경변수 ADMIN_PASSWORD 값 사용' : 'admin123 (기본값)');

/**
 * 관리자 인증 미들웨어 (간단 버전)
 * 실제로는 JWT 토큰 기반 인증을 사용하는 것이 좋습니다.
 */
const authenticateAdmin = (req, res, next) => {
  // OPTIONS 요청은 CORS preflight이므로 인증을 건너뜀
  if (req.method === 'OPTIONS') {
    return next();
  }

  const adminSecret = (req.headers['x-admin-secret'] || '').trim();
  if (adminSecret === expectedAdminSecret) {
    next();
  } else {
    console.warn('[admin] 인증 실패 - 클라이언트가 보낸 x-admin-secret:', adminSecret ? '있음(서버와 값이 다름)' : '없음(헤더 누락)');
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

    // 날짜 필터 옵션 (기본값: 'week'), breakpointMode: 디버그 시 단계마다 클릭하여 진행
    const { dateFilter = 'week', companyName = null, portals = null, breakpointMode = false } = req.body;
    
    if (dateFilter !== 'all' && dateFilter !== 'week' && dateFilter !== 'twoWeeks') {
      return res.status(400).json({ error: 'dateFilter는 "all", "week", "twoWeeks" 중 하나여야 합니다.' });
    }
    
    // portals 검증: 배열이거나 null이어야 함
    if (portals !== null && (!Array.isArray(portals) || portals.length === 0)) {
      return res.status(400).json({ error: 'portals는 배열이거나 null이어야 합니다.' });
    }
    
    // portals 값 검증: 유효한 포털 이름만 허용
    const validPortals = ['naver', 'kakao', 'yanolja', 'agoda', 'google'];
    if (portals && Array.isArray(portals)) {
      const invalidPortals = portals.filter(p => !validPortals.includes(p));
      if (invalidPortals.length > 0) {
        return res.status(400).json({ error: `유효하지 않은 포털: ${invalidPortals.join(', ')}. 유효한 포털: ${validPortals.join(', ')}` });
      }
    }

    // portals 로깅
    console.log(`[작업 시작] dateFilter: ${dateFilter}, companyName: ${companyName || 'null'}, portals: ${portals ? JSON.stringify(portals) : 'null'}`);

    // 비동기로 실행 (응답은 즉시 반환)
    jobService.runScrapingJob(dateFilter, companyName, portals, { breakpointMode: breakpointMode === true }).catch((error) => {
      console.error('스크래핑 작업 실행 오류:', error);
    });

    let filterText = '';
    if (dateFilter === 'all') {
      filterText = '전체';
    } else if (dateFilter === 'week') {
      filterText = '일주일 간격';
    } else if (dateFilter === 'twoWeeks') {
      filterText = '2주 간격';
    }
    
    const companyText = companyName ? ` (기업: ${companyName})` : ' (전체 기업)';
    const portalText = portals && Array.isArray(portals) && portals.length > 0 
      ? ` (포털: ${portals.join(', ')})` 
      : '';
    res.json({ message: `스크래핑 작업이 시작되었습니다. (${filterText}${companyText}${portalText})` });
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
 * 현재 작업 상태 조회 (실시간 진행 로그 포함)
 */
router.get('/jobs/status', async (req, res) => {
  try {
    const currentJob = await jobService.getCurrentJob();
    const isRunning = jobService.getIsRunning();
    const progress = jobService.getProgress ? jobService.getProgress() : null;
    const progressLog = jobService.getProgressLog ? jobService.getProgressLog() : [];
    const waitingForContinue = jobService.waitingForContinue === true;

    res.json({
      isRunning,
      currentJob: currentJob || null,
      progress: progress || null,
      progressLog: progressLog || [],
      waitingForContinue: waitingForContinue || false,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 디버그 브레이크포인트: 다음 단계로 진행 (클릭 시 호출)
 */
router.post('/jobs/continue', (req, res) => {
  try {
    jobService.continueFromBreakpoint();
    res.json({ message: '다음 단계로 진행합니다.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 스케줄 상태 조회 (매주 일요일 2시 자동 실행)
 */
router.get('/schedule/status', (req, res) => {
  try {
    const status = getScheduleStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 스케줄 활성화/비활성화
 */
router.put('/schedule', (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled는 boolean이어야 합니다.' });
    }
    const result = setScheduleEnabled(enabled);
    res.json({
      enabled: result.enabled,
      message: result.enabled ? '반복 실행이 활성화되었습니다.' : '반복 실행이 비활성화되었습니다.',
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

/**
 * 기업 목록 조회
 */
router.get('/companies', async (req, res) => {
  try {
    const { pool } = await import('../db/connection.js');
    const result = await pool.query('SELECT * FROM companies ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 기업 정보 추가/수정
 */
router.post('/companies', async (req, res) => {
  try {
    const {
      companyName,
      type,
      isMember,
      address,
      email,
      phone,
      manager,
      naverUrl,
      kakaoUrl,
      yanoljaUrl,
      goodchoiceUrl,
      googleUrl,
      tripadvisorUrl,
      agodaUrl
    } = req.body;

    if (!companyName || !type) {
      return res.status(400).json({ error: '기업명과 유형은 필수입니다.' });
    }

    const ScraperService = (await import('../services/scraper.js')).default;
    const scraper = new ScraperService();

    const saved = await scraper.saveCompany({
      companyName,
      type,
      isMember: isMember || 'N',
      address,
      email,
      phone,
      manager,
      naverUrl,
      kakaoUrl,
      yanoljaUrl,
      goodchoiceUrl,
      googleUrl,
      tripadvisorUrl,
      agodaUrl
    });

    if (saved) {
      res.json({ message: '기업 정보가 저장되었습니다.' });
    } else {
      res.status(500).json({ error: '기업 정보 저장 실패' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 기업 정보 수정
 */
router.put('/companies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      companyName,
      type,
      isMember,
      address,
      email,
      phone,
      manager,
      naverUrl,
      kakaoUrl,
      yanoljaUrl,
      goodchoiceUrl,
      googleUrl,
      tripadvisorUrl,
      agodaUrl
    } = req.body;

    const { pool } = await import('../db/connection.js');
    
    const result = await pool.query(
      `UPDATE companies SET
        company_name = COALESCE($1, company_name),
        type = COALESCE($2, type),
        is_member = COALESCE($3, is_member),
        address = COALESCE($4, address),
        email = COALESCE($5, email),
        phone = COALESCE($6, phone),
        manager = COALESCE($7, manager),
        naver_url = COALESCE($8, naver_url),
        kakao_url = COALESCE($9, kakao_url),
        yanolja_url = COALESCE($10, yanolja_url),
        goodchoice_url = COALESCE($11, goodchoice_url),
        google_url = COALESCE($12, google_url),
        tripadvisor_url = COALESCE($13, tripadvisor_url),
        agoda_url = COALESCE($14, agoda_url),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $15
       RETURNING *`,
      [
        companyName, type, isMember, address, email, phone, manager,
        naverUrl, kakaoUrl, yanoljaUrl, goodchoiceUrl, googleUrl, tripadvisorUrl, agodaUrl,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '기업을 찾을 수 없습니다.' });
    }

    res.json({ message: '기업 정보가 수정되었습니다.', company: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 스크래핑 테스트 (단일 URL 테스트)
 */
router.post('/test/scrape', async (req, res) => {
  try {
    const { url, companyName } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }

    const ScraperService = (await import('../services/scraper.js')).default;
    const scraper = new ScraperService();

    let result = {
      success: false,
      reviews: [],
      savedCount: 0,
      error: null,
    };

    try {
      await scraper.init();
      
      // 스크래핑 실행
      const savedCount = await scraper.scrapeByPortal(url, companyName || '테스트 기업');
      
      result.success = true;
      result.savedCount = savedCount;
    } catch (error) {
      console.error('테스트 스크래핑 실패:', error);
      result.error = error.message;
    } finally {
      await scraper.close();
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 리뷰 통계 조회
 */
router.get('/statistics', async (req, res) => {
  try {
    const { pool } = await import('../db/connection.js');
    
    // 전체 리뷰 수
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM reviews');
    const totalReviews = parseInt(totalResult.rows[0].count);
    
    // 포털별 리뷰 수
    const portalResult = await pool.query(
      `SELECT portal_url, COUNT(*) as count 
       FROM reviews 
       GROUP BY portal_url 
       ORDER BY count DESC`
    );
    
    // 기업별 리뷰 수
    const companyResult = await pool.query(
      `SELECT company_name, COUNT(*) as count 
       FROM reviews 
       GROUP BY company_name 
       ORDER BY count DESC`
    );
    
    // 기업별 포털별 리뷰 수
    const companyPortalResult = await pool.query(
      `SELECT company_name, portal_url, COUNT(*) as count 
       FROM reviews 
       GROUP BY company_name, portal_url 
       ORDER BY company_name, count DESC`
    );
    
    res.json({
      totalReviews,
      byPortal: portalResult.rows,
      byCompany: companyResult.rows,
      byCompanyAndPortal: companyPortalResult.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
