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
   * @param {string} dateFilter - 'all' (전체), 'week' (일주일 간격), 'twoWeeks' (2주 간격)
   * @param {string|null} companyName - 특정 기업명 (null이면 전체 기업)
   */
  async runScrapingJob(dateFilter = 'week', companyName = null) {
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
        try {
          // 네이버맵 스크래핑 (companyName으로 검색)
          console.log(`기업 "${company.company_name}" 네이버맵 스크래핑 시작 (검색: ${company.company_name})`);
          const naverCount = await scraper.scrapeByPortal(
            company.naver_url || null, // URL이 있으면 전달, 없으면 null (검색 방식 사용)
            company.company_name,
            dateFilter, // 날짜 필터 전달
            job.id, // jobId 전달
            'naver' // portalType 명시
          );
          successCount += naverCount;
          console.log(`기업 "${company.company_name}" 네이버맵 스크래핑 완료: ${naverCount}개 리뷰 저장`);
          
          // 카카오맵 스크래핑 (URL 없이 company_name으로 검색)
          console.log(`기업 "${company.company_name}" 카카오맵 스크래핑 시작 (검색: ${company.company_name})`);
          const kakaoCount = await scraper.scrapeByPortal(
            null, // URL 없음 (company_name으로 검색)
            company.company_name,
            dateFilter, // 날짜 필터 전달
            job.id, // jobId 전달
            'kakao' // portalType 명시
          );
          successCount += kakaoCount;
          console.log(`기업 "${company.company_name}" 카카오맵 스크래핑 완료: ${kakaoCount}개 리뷰 저장`);
          
          // 야놀자 스크래핑 (URL 없이 company_name으로 검색)
          console.log(`기업 "${company.company_name}" 야놀자 스크래핑 시작 (검색: ${company.company_name})`);
          const yanoljaCount = await scraper.scrapeByPortal(
            null, // URL 없음 (company_name으로 검색)
            company.company_name,
            dateFilter, // 날짜 필터 전달
            job.id, // jobId 전달
            'yanolja' // portalType 명시
          );
          successCount += yanoljaCount;
          console.log(`기업 "${company.company_name}" 야놀자 스크래핑 완료: ${yanoljaCount}개 리뷰 저장`);
          
          // 아고다 스크래핑 (agoda_url이 있는 경우만 스크래핑)
          if (company.agoda_url) {
            console.log(`기업 "${company.company_name}" 아고다 스크래핑 시작: ${company.agoda_url}`);
            const agodaCount = await scraper.scrapeByPortal(
              company.agoda_url,
              company.company_name,
              dateFilter, // 날짜 필터 전달
              job.id, // jobId 전달
              'agoda' // portalType 명시
            );
            successCount += agodaCount;
            console.log(`기업 "${company.company_name}" 아고다 스크래핑 완료: ${agodaCount}개 리뷰 저장`);
          } else {
            console.log(`기업 "${company.company_name}" 아고다 스크래핑 건너뜀 (agoda_url 없음)`);
          }
          
          // 구글 스크래핑 (URL 없이 company_name으로 검색)
          console.log(`기업 "${company.company_name}" 구글 스크래핑 시작 (검색: ${company.company_name})`);
          const googleCount = await scraper.scrapeByPortal(
            null, // URL 없음 (company_name으로 검색)
            company.company_name,
            dateFilter, // 날짜 필터 전달
            job.id, // jobId 전달
            'google' // portalType 명시
          );
          successCount += googleCount;
          console.log(`기업 "${company.company_name}" 구글 스크래핑 완료: ${googleCount}개 리뷰 저장`);
          
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
