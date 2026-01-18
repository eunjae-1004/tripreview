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
   * 새 작업 생성
   */
  async createJob() {
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
    const result = await pool.query('SELECT * FROM scraping_jobs WHERE id = $1', [jobId]);
    return result.rows[0];
  }

  /**
   * 최근 작업 목록 조회
   */
  async getRecentJobs(limit = 10) {
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
    const result = await pool.query(
      "SELECT * FROM scraping_jobs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1"
    );
    return result.rows[0] || null;
  }

  /**
   * 스크래핑 작업 실행
   * 실제로는 기업 목록을 조회하여 각 기업의 포털 URL을 스크래핑해야 합니다.
   */
  async runScrapingJob() {
    if (this.isRunning) {
      throw new Error('이미 실행 중인 작업이 있습니다.');
    }

    this.isRunning = true;
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

      // 실제로는 companies 테이블에서 기업 목록을 조회해야 합니다
      // 여기서는 예시로 하드코딩된 URL을 사용합니다
      const companies = await pool.query('SELECT * FROM companies');

      for (const company of companies.rows) {
        try {
          // 각 포털 URL을 스크래핑
          // 실제로는 companies 테이블에 portal_urls 컬럼이 필요할 수 있습니다
          // 여기서는 예시로 처리합니다
          const count = await scraper.scrapeByPortal(
            'https://map.naver.com',
            company.company_name
          );
          successCount += count;
        } catch (error) {
          console.error(`기업 ${company.company_name} 스크래핑 실패:`, error);
          errorCount++;
        }
      }

      await this.updateJobStatus(job.id, 'completed', {
        completedAt: new Date(),
        totalReviews: successCount + errorCount,
        successCount,
        errorCount,
      });

      await scraper.close();
    } catch (error) {
      console.error('스크래핑 작업 실패:', error);
      await this.updateJobStatus(job.id, 'failed', {
        completedAt: new Date(),
        errorMessage: error.message,
        errorCount: errorCount + 1,
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
