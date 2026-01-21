import { pool } from '../db/connection.js';
import ScraperService from './scraper.js';

/**
 * 스크래핑 작업 관리 서비스
 */
class JobService {
  constructor() {
    this.currentJob = null;
    this.isRunning = false;
  }

  /**
   * DB 연결(POOL) 가드
   */
  requirePool() {
    if (!pool) {
      throw new Error('DATABASE_URL이 설정되지 않아 작업(DB 저장/조회)을 수행할 수 없습니다.');
    }
  }

  /**
   * 작업 오류 메시지 누적 저장 (최근 내용 유지)
   * - error_message 컬럼에 최근 8000자만 유지
   */
  async appendJobError(jobId, message) {
    this.requirePool();
    const line = `\n[${new Date().toISOString()}] ${message}`;
    try {
      await pool.query(
        `UPDATE scraping_jobs
         SET error_message = RIGHT(COALESCE(error_message, '') || $1, 8000)
         WHERE id = $2`,
        [line, jobId]
      );
    } catch (e) {
      // 로그만 남기고 진행 (에러 저장 실패가 작업을 또 실패시키지 않도록)
      console.error('scraping_jobs error_message 업데이트 실패:', e);
    }
  }

  /**
   * 새 작업 생성
   */
  async createJob() {
    this.requirePool();
    const result = await pool.query(
      'INSERT INTO scraping_jobs (status) VALUES ($1) RETURNING *',
      ['pending']
    );
    return result.rows[0];
  }

  /**
   * 작업 상태 업데이트
   */
  async updateJobStatus(jobId, status, data = {}) {
    this.requirePool();
    const updates = ['status = $1'];
    const values = [status];
    let paramIndex = 2;

    if (data.startedAt) {
      updates.push(`started_at = $${paramIndex}`);
      values.push(data.startedAt);
      paramIndex++;
    }

    if (data.completedAt) {
      updates.push(`completed_at = $${paramIndex}`);
      values.push(data.completedAt);
      paramIndex++;
    }

    if (data.totalReviews !== undefined) {
      updates.push(`total_reviews = $${paramIndex}`);
      values.push(data.totalReviews);
      paramIndex++;
    }

    if (data.successCount !== undefined) {
      updates.push(`success_count = $${paramIndex}`);
      values.push(data.successCount);
      paramIndex++;
    }

    if (data.errorCount !== undefined) {
      updates.push(`error_count = $${paramIndex}`);
      values.push(data.errorCount);
      paramIndex++;
    }

    if (data.errorMessage) {
      updates.push(`error_message = $${paramIndex}`);
      values.push(data.errorMessage);
      paramIndex++;
    }

    values.push(jobId);

    await pool.query(
      `UPDATE scraping_jobs SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * 작업 정보 조회
   */
  async getJob(jobId) {
    this.requirePool();
    const result = await pool.query('SELECT * FROM scraping_jobs WHERE id = $1', [jobId]);
    return result.rows[0];
  }

  /**
   * 최근 작업 목록 조회
   */
  async getRecentJobs(limit = 10) {
    this.requirePool();
    const result = await pool.query(
      'SELECT * FROM scraping_jobs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  /**
   * 현재 실행 중인 작업 조회
   */
  async getCurrentJob() {
    this.requirePool();
    const result = await pool.query(
      "SELECT * FROM scraping_jobs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1"
    );
    return result.rows[0] || null;
  }

  /**
   * 스크래핑 작업 실행
   * 실제로는 기업 목록을 조회하여 각 기업의 포털 URL을 스크래핑해야 합니다.
   * @param {string} dateFilter - 'all' (전체), 'week' (일주일 간격), 'twoWeeks' (2주 간격)
   * @param {string|null} companyName - 특정 기업명 (null이면 전체 기업)
   */
  async runScrapingJob(dateFilter = 'week', companyName = null) {
    if (this.isRunning) {
      throw new Error('이미 실행 중인 작업이 있습니다.');
    }

    this.isRunning = true;
    this.requirePool();
    const job = await this.createJob();
    this.currentJob = job;

    const scraper = new ScraperService();
    let successCount = 0;
    let errorCount = 0;

    try {
      await this.updateJobStatus(job.id, 'running', {
        startedAt: new Date(),
      });

      await scraper.init();

      // companies 테이블에서 기업 목록 조회
      let companies;
      if (companyName && companyName.trim()) {
        // 특정 기업만 조회
        companies = await pool.query(
          'SELECT * FROM companies WHERE company_name = $1',
          [companyName.trim()]
        );
        if (companies.rows.length === 0) {
          throw new Error(`기업 "${companyName.trim()}"을 찾을 수 없습니다.`);
        }
        console.log(`특정 기업 스크래핑: "${companyName.trim()}"`);
      } else {
        // 전체 기업 조회
        companies = await pool.query('SELECT * FROM companies');
        console.log('전체 기업 스크래핑');
      }

      let filterText = '';
      if (dateFilter === 'all') {
        filterText = '전체';
      } else if (dateFilter === 'week') {
        filterText = '일주일 간격';
      } else if (dateFilter === 'twoWeeks') {
        filterText = '2주 간격';
      }
      console.log(`날짜 필터: ${filterText}`);

      for (const company of companies.rows) {
        const companyLabel = `company="${company.company_name}"`;

        // 포털별로 try/catch 분리: 한 포털 실패가 전체를 멈추지 않도록
        try {
          console.log(`기업 "${company.company_name}" 네이버맵 스크래핑 시작 (검색: ${company.company_name})`);
          const naverCount = await scraper.scrapeByPortal(
            company.naver_url || null,
            company.company_name,
            dateFilter,
            job.id,
            'naver'
          );
          successCount += naverCount;
          console.log(`기업 "${company.company_name}" 네이버맵 스크래핑 완료: ${naverCount}개 리뷰 저장`);
        } catch (error) {
          errorCount++;
          console.error(`네이버맵 스크래핑 실패 (${companyLabel}):`, error);
          await this.appendJobError(
            job.id,
            `naver 실패 (${companyLabel}): ${error?.message || String(error)}`
          );
        }

        try {
          console.log(`기업 "${company.company_name}" 카카오맵 스크래핑 시작 (검색: ${company.company_name})`);
          const kakaoCount = await scraper.scrapeByPortal(
            null,
            company.company_name,
            dateFilter,
            job.id,
            'kakao'
          );
          successCount += kakaoCount;
          console.log(`기업 "${company.company_name}" 카카오맵 스크래핑 완료: ${kakaoCount}개 리뷰 저장`);
        } catch (error) {
          errorCount++;
          console.error(`카카오맵 스크래핑 실패 (${companyLabel}):`, error);
          await this.appendJobError(
            job.id,
            `kakao 실패 (${companyLabel}): ${error?.message || String(error)}`
          );
        }

        try {
          console.log(`기업 "${company.company_name}" 야놀자 스크래핑 시작 (검색: ${company.company_name})`);
          const yanoljaCount = await scraper.scrapeByPortal(
            null,
            company.company_name,
            dateFilter,
            job.id,
            'yanolja'
          );
          successCount += yanoljaCount;
          console.log(`기업 "${company.company_name}" 야놀자 스크래핑 완료: ${yanoljaCount}개 리뷰 저장`);
        } catch (error) {
          errorCount++;
          console.error(`야놀자 스크래핑 실패 (${companyLabel}):`, error);
          await this.appendJobError(
            job.id,
            `yanolja 실패 (${companyLabel}): ${error?.message || String(error)}`
          );
        }

        if (company.agoda_url) {
          try {
            console.log(`기업 "${company.company_name}" 아고다 스크래핑 시작: ${company.agoda_url}`);
            const agodaCount = await scraper.scrapeByPortal(
              company.agoda_url,
              company.company_name,
              dateFilter,
              job.id,
              'agoda'
            );
            successCount += agodaCount;
            console.log(`기업 "${company.company_name}" 아고다 스크래핑 완료: ${agodaCount}개 리뷰 저장`);
          } catch (error) {
            errorCount++;
            console.error(`아고다 스크래핑 실패 (${companyLabel}):`, error);
            await this.appendJobError(
              job.id,
              `agoda 실패 (${companyLabel}): ${error?.message || String(error)}`
            );
          }
        } else {
          console.log(`기업 "${company.company_name}" 아고다 스크래핑 건너뜀 (agoda_url 없음)`);
        }

        try {
          console.log(`기업 "${company.company_name}" 구글 스크래핑 시작 (검색: ${company.company_name})`);
          const googleCount = await scraper.scrapeByPortal(
            null,
            company.company_name,
            dateFilter,
            job.id,
            'google'
          );
          successCount += googleCount;
          console.log(`기업 "${company.company_name}" 구글 스크래핑 완료: ${googleCount}개 리뷰 저장`);
        } catch (error) {
          errorCount++;
          console.error(`구글 스크래핑 실패 (${companyLabel}):`, error);
          await this.appendJobError(
            job.id,
            `google 실패 (${companyLabel}): ${error?.message || String(error)}`
          );
        }
      }

      await this.updateJobStatus(job.id, 'completed', {
        completedAt: new Date(),
        // total/success/error 카운트는 scraper.saveReview()에서 누적 업데이트 중이므로
        // 여기서는 상태/시간만 확정한다.
      });

      await scraper.close();
    } catch (error) {
      console.error('스크래핑 작업 실패:', error);
      await this.appendJobError(job.id, `job 실패: ${error?.message || String(error)}`);
      await this.updateJobStatus(job.id, 'failed', {
        completedAt: new Date(),
        errorMessage: error.message,
      });
      await scraper.close();
    } finally {
      this.isRunning = false;
      this.currentJob = null;
    }

    return job;
  }

  /**
   * 작업 중지
   */
  async stopJob() {
    if (!this.isRunning || !this.currentJob) {
      throw new Error('실행 중인 작업이 없습니다.');
    }

    await this.updateJobStatus(this.currentJob.id, 'stopped', {
      completedAt: new Date(),
    });

    this.isRunning = false;
    this.currentJob = null;

    return this.currentJob;
  }

  /**
   * 실행 중 여부 확인
   */
  getIsRunning() {
    return this.isRunning;
  }
}

export default new JobService();
