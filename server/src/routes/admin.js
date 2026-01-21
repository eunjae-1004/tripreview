import express from 'express';
import jobService from '../services/jobService.js';

const router = express.Router();

/**
 * 관리자 인증 미들웨어 (간단 버전)
 * 실제로는 JWT 토큰 기반 인증을 사용하는 것이 좋습니다.
 */
const authenticateAdmin = (req, res, next) => {
  // OPTIONS 요청은 CORS preflight이므로 인증을 건너뜀
  if (req.method === 'OPTIONS') {
    return next();
  }
  
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

    // 날짜 필터 옵션 (기본값: 'week')
    const { dateFilter = 'week', companyName = null } = req.body;
    
    if (dateFilter !== 'all' && dateFilter !== 'week' && dateFilter !== 'twoWeeks') {
      return res.status(400).json({ error: 'dateFilter는 "all", "week", "twoWeeks" 중 하나여야 합니다.' });
    }

    // 비동기로 실행 (응답은 즉시 반환)
    jobService.runScrapingJob(dateFilter, companyName).catch((error) => {
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
    res.json({ message: `스크래핑 작업이 시작되었습니다. (${filterText}${companyText})` });
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
    const progress = jobService.getProgress ? jobService.getProgress() : null;

    res.json({
      isRunning,
      currentJob: currentJob || null,
      progress: progress || null,
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
