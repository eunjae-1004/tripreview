import { pool } from '../db/connection.js';
import ScraperService from './scraper.js';

/**
 * 스크래핑 작업 관리 서비스
 */
class JobService {
  constructor() {
    this.currentJob = null;
    this.isRunning = false;
    this.cancelRequested = false;
    this.currentProgress = null; // { companyName, portal, attempt, phase }
  }

  setProgress(progress) {
    this.currentProgress = progress;
  }

  getProgress() {
    return this.currentProgress;
  }

  /**
   * 중지 요청 여부 체크
   */
  ensureNotCancelled() {
    if (this.cancelRequested) {
      const err = new Error('사용자에 의해 작업이 중지되었습니다.');
      err.name = 'JobCancelledError';
      throw err;
    }
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
    this.cancelRequested = false;
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

      const isLikelyPlaywrightFatal = (message = '') => {
        const m = String(message).toLowerCase();
        return (
          m.includes('target closed') ||
          m.includes('browser has been closed') ||
          m.includes('page has been closed') ||
          m.includes('protocol error') ||
          m.includes('execution context was destroyed') ||
          m.includes('cannot find context') ||
          m.includes('navigation failed because browser has disconnected')
        );
      };

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      /**
       * 포털별 안정성 강화:
       * - 2회 재시도(총 3회)
       * - Playwright 치명 오류로 보이면 브라우저 재시작 후 재시도
       */
      const runWithRetry = async ({ portal, companyLabel }, fn) => {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          this.ensureNotCancelled();
          try {
            this.setProgress({
              company: companyLabel,
              portal,
              attempt,
              phase: 'running',
            });
            return await fn();
          } catch (error) {
            const message = error?.message || String(error);
            const isLast = attempt === maxAttempts;
            console.error(`[재시도] ${portal} 실패 (${companyLabel}) attempt ${attempt}/${maxAttempts}:`, message);
            this.setProgress({
              company: companyLabel,
              portal,
              attempt,
              phase: isLast ? 'failed' : 'retrying',
            });

            // Playwright가 죽은 것으로 보이면 브라우저 재시작
            if (isLikelyPlaywrightFatal(message)) {
              await this.appendJobError(job.id, `${portal} 치명 오류로 브라우저 재시작 (${companyLabel}): ${message}`);
              try {
                await scraper.close();
              } catch {}
              try {
                await scraper.init();
              } catch (reinitError) {
                const reMsg = reinitError?.message || String(reinitError);
                await this.appendJobError(job.id, `${portal} 브라우저 재시작 실패 (${companyLabel}): ${reMsg}`);
              }
            }

            if (isLast) throw error;

            // 간단 backoff (2s, 5s)
            await sleep(attempt === 1 ? 2000 : 5000);
          }
        }
      };

      for (const company of companies.rows) {
        this.ensureNotCancelled();
        const companyLabel = `company="${company.company_name}"`;

        // 포털별로 try/catch 분리: 한 포털 실패가 전체를 멈추지 않도록
        try {
          console.log(`기업 "${company.company_name}" 네이버맵 스크래핑 시작 (검색: ${company.company_name})`);
          this.setProgress({ company: company.company_name, portal: 'naver', attempt: 1, phase: 'starting' });
          const naverCount = await runWithRetry(
            { portal: 'naver', companyLabel },
            () =>
              scraper.scrapeByPortal(
                company.naver_url || null,
                company.company_name,
                dateFilter,
                job.id,
                'naver'
              )
          );
          successCount += naverCount;
          console.log(`기업 "${company.company_name}" 네이버맵 스크래핑 완료: ${naverCount}개 리뷰 저장`);
          this.setProgress({ company: company.company_name, portal: 'naver', attempt: 1, phase: 'done' });
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
          this.setProgress({ company: company.company_name, portal: 'kakao', attempt: 1, phase: 'starting' });
          const kakaoCount = await runWithRetry(
            { portal: 'kakao', companyLabel },
            () => scraper.scrapeByPortal(null, company.company_name, dateFilter, job.id, 'kakao')
          );
          successCount += kakaoCount;
          console.log(`기업 "${company.company_name}" 카카오맵 스크래핑 완료: ${kakaoCount}개 리뷰 저장`);
          this.setProgress({ company: company.company_name, portal: 'kakao', attempt: 1, phase: 'done' });
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
          this.setProgress({ company: company.company_name, portal: 'yanolja', attempt: 1, phase: 'starting' });
          const yanoljaCount = await runWithRetry(
            { portal: 'yanolja', companyLabel },
            () => scraper.scrapeByPortal(null, company.company_name, dateFilter, job.id, 'yanolja')
          );
          successCount += yanoljaCount;
          console.log(`기업 "${company.company_name}" 야놀자 스크래핑 완료: ${yanoljaCount}개 리뷰 저장`);
          this.setProgress({ company: company.company_name, portal: 'yanolja', attempt: 1, phase: 'done' });
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
            this.setProgress({ company: company.company_name, portal: 'agoda', attempt: 1, phase: 'starting' });
            const agodaCount = await runWithRetry(
              { portal: 'agoda', companyLabel },
              () => scraper.scrapeByPortal(company.agoda_url, company.company_name, dateFilter, job.id, 'agoda')
            );
            successCount += agodaCount;
            console.log(`기업 "${company.company_name}" 아고다 스크래핑 완료: ${agodaCount}개 리뷰 저장`);
            this.setProgress({ company: company.company_name, portal: 'agoda', attempt: 1, phase: 'done' });
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
          this.setProgress({ company: company.company_name, portal: 'google', attempt: 1, phase: 'starting' });
          const googleCount = await runWithRetry(
            { portal: 'google', companyLabel },
            () => scraper.scrapeByPortal(null, company.company_name, dateFilter, job.id, 'google')
          );
          successCount += googleCount;
          console.log(`기업 "${company.company_name}" 구글 스크래핑 완료: ${googleCount}개 리뷰 저장`);
          this.setProgress({ company: company.company_name, portal: 'google', attempt: 1, phase: 'done' });
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
      this.setProgress({ company: null, portal: null, attempt: null, phase: 'completed' });

      await scraper.close();
    } catch (error) {
      console.error('스크래핑 작업 실패:', error);
      const msg = error?.message || String(error);
      await this.appendJobError(job.id, `job 실패: ${msg}`);
      this.setProgress({ company: null, portal: null, attempt: null, phase: 'failed' });

      if (error?.name === 'JobCancelledError') {
        await this.updateJobStatus(job.id, 'stopped', {
          completedAt: new Date(),
          errorMessage: msg,
        });
      } else {
        await this.updateJobStatus(job.id, 'failed', {
          completedAt: new Date(),
          errorMessage: msg,
        });
      }
      await scraper.close();
    } finally {
      this.isRunning = false;
      this.currentJob = null;
      this.cancelRequested = false;
      this.currentProgress = null;
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

    // 즉시 강제 종료는 어렵고(Playwright 작업 중), 루프가 안전 지점에서 종료되도록 플래그만 설정
    this.cancelRequested = true;
    await this.appendJobError(this.currentJob.id, '사용자가 중지 요청을 보냈습니다. 안전 지점에서 종료합니다.');
    return { message: '중지 요청 완료' };
  }

  /**
   * 실행 중 여부 확인
   */
  getIsRunning() {
    return this.isRunning;
  }
}

export default new JobService();
