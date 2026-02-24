'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || 'admin123';

// 환경 변수 확인 및 경고
if (typeof window !== 'undefined') {
  if (!process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL === 'http://localhost:3000') {
    console.warn('⚠️ NEXT_PUBLIC_API_URL이 설정되지 않았습니다. Vercel 환경 변수를 확인하세요.');
  }
  if (!process.env.NEXT_PUBLIC_ADMIN_SECRET || process.env.NEXT_PUBLIC_ADMIN_SECRET === 'admin123') {
    console.warn('⚠️ NEXT_PUBLIC_ADMIN_SECRET이 설정되지 않았습니다. Vercel 환경 변수를 확인하세요.');
  }
}

interface Job {
  id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_reviews: number;
  success_count: number;
  error_count: number;
  error_message: string | null;
  created_at: string;
}

interface Progress {
  company: string | null;
  portal: string | null;
  attempt: number | null;
  phase: string | null;
}

interface Company {
  id: number;
  company_name: string;
  type: string;
  is_member: string;
  naver_url: string | null;
  kakao_url: string | null;
  yanolja_url: string | null;
  agoda_url: string | null;
  google_url: string | null;
}

interface Statistics {
  totalReviews: number;
  byPortal: Array<{ portal_url: string; count: string }>;
  byCompany: Array<{ company_name: string; count: string }>;
  byCompanyAndPortal: Array<{ company_name: string; portal_url: string; count: string }>;
}

type DateFilter = 'all' | 'week' | 'twoWeeks';

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progressLine, setProgressLine] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('week');
  const [companyName, setCompanyName] = useState<string>('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [selectedPortals, setSelectedPortals] = useState<string[]>(['naver', 'kakao', 'yanolja', 'agoda', 'google']);
  
  const availablePortals = [
    { id: 'naver', name: '네이버맵' },
    { id: 'kakao', name: '카카오맵' },
    { id: 'yanolja', name: '야놀자' },
    { id: 'agoda', name: '아고다' },
    { id: 'google', name: '구글' },
  ];

  // 상태 조회
  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/jobs/status`, {
        headers: {
          'x-admin-secret': ADMIN_SECRET,
        },
      });
      const data = await response.json();
      setIsRunning(data.isRunning);
      setCurrentJob(data.currentJob);

      // 진행 상황 한 줄 표시 (로그 누적 X)
      const p: Progress | null = data.progress || null;
      if (data.isRunning && p) {
        const companyText = p.company ? `${p.company}` : '-';
        const portalText = p.portal ? `${p.portal}` : '-';
        const attemptText = p.attempt ? `${p.attempt}` : '-';
        const phaseText = p.phase ? `${p.phase}` : '-';
        setProgressLine(`진행: 기업=${companyText} | 포털=${portalText} | 시도=${attemptText} | 상태=${phaseText}`);
      } else if (data.isRunning) {
        setProgressLine('진행: 준비 중...');
      } else {
        setProgressLine('');
      }
    } catch (error) {
      console.error('상태 조회 실패:', error);
    }
  };

  // 최근 작업 목록 조회
  const fetchRecentJobs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/jobs?limit=10`, {
        headers: {
          'x-admin-secret': ADMIN_SECRET,
        },
      });
      const data = await response.json();
      setRecentJobs(data);
    } catch (error) {
      console.error('작업 목록 조회 실패:', error);
    }
  };

  // 기업 목록 조회
  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/companies`, {
        headers: {
          'x-admin-secret': ADMIN_SECRET,
        },
      });
      const data = await response.json();
      setCompanies(data);
    } catch (error) {
      console.error('기업 목록 조회 실패:', error);
    }
  };

  // 통계 조회
  const fetchStatistics = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/statistics`, {
        headers: {
          'x-admin-secret': ADMIN_SECRET,
        },
      });
      const data = await response.json();
      setStatistics(data);
    } catch (error) {
      console.error('통계 조회 실패:', error);
    }
  };

  // 작업 시작
  const handleStart = async () => {
    // 포털 선택 검증
    if (selectedPortals.length === 0) {
      setMessage('⚠️ 최소 1개 이상의 포털을 선택해야 합니다.');
      return;
    }
    
    setLoading(true);
    // 메시지 박스는 진행상황 한 줄을 보여주는 용도로 사용 (누적 로그 X)
    setMessage(null);
    try {
      const requestBody = {
        dateFilter: dateFilter, // 'all', 'week', 'twoWeeks'
        companyName: companyName.trim() || null, // 특정 기업만 스크랩 (빈 값이면 전체)
        portals: selectedPortals.length > 0 ? selectedPortals : null, // 선택된 포털 (빈 배열이면 null = 전체)
      };
      
      console.log(`[API] 작업 시작 요청: ${API_URL}/api/admin/jobs/start`);
      console.log(`[API] Admin Secret: ${ADMIN_SECRET ? '설정됨' : '미설정'}`);
      console.log(`[API] 요청 본문:`, requestBody);
      
      const response = await fetch(`${API_URL}/api/admin/jobs/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': ADMIN_SECRET,
        },
        body: JSON.stringify(requestBody),
      });
      
      console.log(`[API] 응답 상태: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[API] 에러 응답 (${response.status}):`, errorText);
        try {
          const errorData = JSON.parse(errorText);
          setMessage(`❌ 오류: ${errorData.error || '알 수 없는 오류'}`);
        } catch {
          setMessage(`❌ 오류: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
        }
        setLoading(false);
        return;
      }
      
      const data = await response.json();
      console.log(`[API] 성공 응답:`, data);
      
      let filterText = '';
      if (dateFilter === 'all') {
        filterText = '전체';
      } else if (dateFilter === 'week') {
        filterText = '일주일 간격';
      } else if (dateFilter === 'twoWeeks') {
        filterText = '2주 간격';
      }
      
      const companyText = companyName.trim() ? ` (기업: ${companyName.trim()})` : ' (전체 기업)';
      const portalText = selectedPortals.length < availablePortals.length 
        ? ` (포털: ${selectedPortals.map(id => availablePortals.find(p => p.id === id)?.name).join(', ')})`
        : '';
      setMessage(`✅ 시작 요청 완료 (${filterText}${companyText}${portalText})`);
      setTimeout(() => {
        fetchStatus();
        fetchRecentJobs();
      }, 1000);
    } catch (error) {
      console.error('[API] 네트워크 에러:', error);
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      
      // API URL 확인 메시지 추가
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        if (API_URL === 'http://localhost:3000') {
          setMessage(`작업 시작 실패: Vercel 환경 변수 NEXT_PUBLIC_API_URL이 설정되지 않았습니다. Railway 서버 URL을 설정하세요.`);
        } else {
          const fullUrl = `${API_URL}/api/admin/jobs/start`;
          setMessage(`작업 시작 실패: 서버에 연결할 수 없습니다. 
          
확인 사항:
1. Railway 서버가 실행 중인지 확인: ${API_URL}/health
2. API URL 확인: ${fullUrl}
3. 브라우저 콘솔(F12)에서 자세한 에러 확인`);
        }
      } else {
        setMessage(`작업 시작 실패: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // 작업 중지
  const handleStop = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/jobs/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': ADMIN_SECRET,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setMessage('스크래핑 작업이 중지되었습니다.');
        setTimeout(() => {
          fetchStatus();
          fetchRecentJobs();
        }, 1000);
      } else {
        setMessage(`오류: ${data.error}`);
      }
    } catch (error) {
      setMessage('작업 중지 실패');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 초기 로드 및 주기적 업데이트
  useEffect(() => {
    fetchStatus();
    fetchRecentJobs();
    fetchCompanies();
    fetchStatistics();

    // 5초마다 상태 업데이트
    const interval = setInterval(() => {
      fetchStatus();
      fetchRecentJobs();
      fetchStatistics();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // 상태에 따른 표시 텍스트
  const getStatusText = (status: string) => {
    const statusMap: { [key: string]: string } = {
      pending: '대기 중',
      running: '실행 중',
      completed: '완료',
      failed: '실패',
      stopped: '중지됨',
    };
    return statusMap[status] || status;
  };

  // 상태에 따른 색상
  const getStatusColor = (status: string) => {
    const colorMap: { [key: string]: string } = {
      pending: '#666',
      running: '#2196F3',
      completed: '#4CAF50',
      failed: '#F44336',
      stopped: '#FF9800',
    };
    return colorMap[status] || '#666';
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Trip Review 관리자</h1>
        <p>기업 리뷰 스크래핑 관리 시스템</p>
      </header>

      <main className={styles.main}>
        {/* 제어 패널 */}
        <section className={styles.controlPanel}>
          <h2>작업 제어</h2>
          
          {/* 날짜 필터 선택 */}
          <div className={styles.filterSection}>
            <label className={styles.filterLabel}>리뷰 기간 선택:</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="dateFilter"
                  value="all"
                  checked={dateFilter === 'all'}
                  onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                  disabled={loading || isRunning}
                  className={styles.radioInput}
                />
                <span>전체</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="dateFilter"
                  value="week"
                  checked={dateFilter === 'week'}
                  onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                  disabled={loading || isRunning}
                  className={styles.radioInput}
                />
                <span>일주일 간격</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="dateFilter"
                  value="twoWeeks"
                  checked={dateFilter === 'twoWeeks'}
                  onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                  disabled={loading || isRunning}
                  className={styles.radioInput}
                />
                <span>2주 간격</span>
              </label>
            </div>
            <p className={styles.filterDescription}>
              {dateFilter === 'all' 
                ? '모든 리뷰를 수집합니다.' 
                : dateFilter === 'week'
                ? '오늘 기준 일주일 이내의 리뷰만 수집합니다.'
                : '오늘 기준 2주 이내의 리뷰만 수집합니다.'}
            </p>
          </div>

          {/* 기업명 필터 */}
          <div className={styles.filterSection}>
            <label className={styles.filterLabel} htmlFor="companyName">
              기업명 (선택사항):
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={loading || isRunning}
              placeholder="기업명을 입력하면 해당 기업만 스크랩합니다 (비워두면 전체 기업)"
              className={styles.companyInput}
            />
            <p className={styles.filterDescription}>
              {companyName.trim() 
                ? `"${companyName.trim()}" 기업만 스크랩합니다.` 
                : '모든 기업을 스크랩합니다.'}
            </p>
          </div>

          {/* 포털 선택 - 스크래핑할 포털을 선택하세요 */}
          <div className={styles.filterSection}>
            <label className={styles.filterLabel}>스크래핑할 포털 선택:</label>
            <div className={styles.portalCheckboxes}>
              {availablePortals.map((portal) => (
                <label key={portal.id} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedPortals.includes(portal.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPortals([...selectedPortals, portal.id]);
                      } else {
                        setSelectedPortals(selectedPortals.filter((p) => p !== portal.id));
                      }
                    }}
                    disabled={loading || isRunning}
                    className={styles.checkboxInput}
                  />
                  <span>{portal.name}</span>
                </label>
              ))}
            </div>
            <p className={styles.filterDescription}>
              {selectedPortals.length === 0
                ? '⚠️ 최소 1개 이상의 포털을 선택해야 합니다.'
                : selectedPortals.length === availablePortals.length
                ? '모든 포털을 스크랩합니다.'
                : `${selectedPortals.map((id) => availablePortals.find((p) => p.id === id)?.name).join(', ')} 포털만 스크랩합니다.`}
            </p>
          </div>

          <div className={styles.controls}>
            <button
              onClick={handleStart}
              disabled={loading || isRunning}
              className={`${styles.button} ${styles.buttonPrimary}`}
            >
              {loading ? '실행 중...' : isRunning ? '실행 중' : '지금 실행'}
            </button>
            <button
              onClick={handleStop}
              disabled={loading || !isRunning}
              className={`${styles.button} ${styles.buttonStop}`}
            >
              작업 중지
            </button>
            <button
              onClick={() => {
                fetchStatus();
                fetchRecentJobs();
                fetchCompanies();
                fetchStatistics();
              }}
              disabled={loading}
              className={`${styles.button} ${styles.buttonRefresh}`}
            >
              새로고침
            </button>
          </div>
          <div className={styles.infoBox}>
            <p className={styles.infoText}>
              💡 <strong>지금 실행</strong> 버튼을 클릭하면 설정한 조건(기간, 기업)에 따라 즉시 스크래핑을 시작합니다.
              <br />
              자동 스케줄(매주 월요일 오전 2시)과는 별개로 수동으로 실행할 수 있습니다.
            </p>
          </div>
          {message && (
            <div className={styles.message}>{message}</div>
          )}
          {isRunning && progressLine && (
            <div className={styles.message}>{progressLine}</div>
          )}
        </section>

        {/* 현재 상태 */}
        <section className={styles.statusPanel}>
          <h2>현재 상태</h2>
          <div className={styles.statusInfo}>
            <div className={styles.statusItem}>
              <span className={styles.label}>실행 상태:</span>
              <span
                className={styles.value}
                style={{ color: isRunning ? '#2196F3' : '#666' }}
              >
                {isRunning ? '실행 중' : '대기 중'}
              </span>
            </div>
            {currentJob && (
              <>
                <div className={styles.statusItem}>
                  <span className={styles.label}>작업 ID:</span>
                  <span className={styles.value}>#{currentJob.id}</span>
                </div>
                <div className={styles.statusItem}>
                  <span className={styles.label}>상태:</span>
                  <span
                    className={styles.value}
                    style={{ color: getStatusColor(currentJob.status) }}
                  >
                    {getStatusText(currentJob.status)}
                  </span>
                </div>
                {currentJob.started_at && (
                  <div className={styles.statusItem}>
                    <span className={styles.label}>시작 시간:</span>
                    <span className={styles.value}>
                      {new Date(currentJob.started_at).toLocaleString('ko-KR')}
                    </span>
                  </div>
                )}
                {currentJob.total_reviews > 0 && (
                  <div className={styles.statusItem}>
                    <span className={styles.label}>처리된 리뷰:</span>
                    <span className={styles.value}>
                      {currentJob.success_count} / {currentJob.total_reviews}
                    </span>
                  </div>
                )}
                {currentJob.error_count > 0 && (
                  <div className={styles.statusItem}>
                    <span className={styles.label}>오류:</span>
                    <span className={styles.value} style={{ color: '#F44336' }}>
                      {currentJob.error_count}건
                    </span>
                  </div>
                )}
                {currentJob.error_message && (
                  <div className={styles.statusItem}>
                    <span className={styles.label}>오류 메시지:</span>
                    <span className={styles.value} style={{ color: '#F44336', whiteSpace: 'pre-wrap' }}>
                      {currentJob.error_message}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* 통계 */}
        {statistics && (
          <section className={styles.statisticsPanel}>
            <h2>리뷰 통계</h2>
            <div className={styles.statisticsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>전체 리뷰</div>
                <div className={styles.statValue}>{statistics.totalReviews.toLocaleString()}</div>
              </div>
              {statistics.byPortal.map((portal) => (
                <div key={portal.portal_url} className={styles.statCard}>
                  <div className={styles.statLabel}>{portal.portal_url}</div>
                  <div className={styles.statValue}>{parseInt(portal.count).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 기업 목록 */}
        <section className={styles.companiesPanel}>
          <h2>기업 목록 ({companies.length}개)</h2>
          {companies.length === 0 ? (
            <p className={styles.empty}>등록된 기업이 없습니다.</p>
          ) : (
            <div className={styles.companiesList}>
              {companies.map((company) => {
                const companyStats = statistics?.byCompanyAndPortal.filter(
                  (s) => s.company_name === company.company_name
                ) || [];
                const totalCompanyReviews = companyStats.reduce(
                  (sum, s) => sum + parseInt(s.count),
                  0
                );

                return (
                  <div key={company.id} className={styles.companyItem}>
                    <div className={styles.companyHeader}>
                      <h3>{company.company_name}</h3>
                      <span className={styles.companyType}>{company.type}</span>
                    </div>
                    <div className={styles.companyInfo}>
                      <div className={styles.portalUrls}>
                        <div className={styles.portalItem}>
                          <span className={styles.portalLabel}>네이버맵:</span>
                          <span className={styles.portalStatus}>
                            {company.naver_url ? '✅' : '❌'}
                          </span>
                        </div>
                        <div className={styles.portalItem}>
                          <span className={styles.portalLabel}>카카오맵:</span>
                          <span className={styles.portalStatus}>
                            {company.kakao_url ? '✅' : '❌'}
                          </span>
                        </div>
                        <div className={styles.portalItem}>
                          <span className={styles.portalLabel}>야놀자:</span>
                          <span className={styles.portalStatus}>
                            {company.yanolja_url ? '✅' : '❌'}
                          </span>
                        </div>
                        <div className={styles.portalItem}>
                          <span className={styles.portalLabel}>아고다:</span>
                          <span className={styles.portalStatus}>
                            {company.agoda_url ? '✅' : '❌'}
                          </span>
                        </div>
                        <div className={styles.portalItem}>
                          <span className={styles.portalLabel}>구글:</span>
                          <span className={styles.portalStatus}>
                            {company.google_url ? '✅' : '❌'}
                          </span>
                        </div>
                      </div>
                      {totalCompanyReviews > 0 && (
                        <div className={styles.companyReviews}>
                          <strong>저장된 리뷰: {totalCompanyReviews}개</strong>
                          <div className={styles.portalBreakdown}>
                            {companyStats.map((stat) => (
                              <span key={stat.portal_url} className={styles.portalStat}>
                                {stat.portal_url}: {stat.count}개
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 최근 작업 목록 */}
        <section className={styles.jobsPanel}>
          <h2>최근 작업 목록</h2>
          {recentJobs.length === 0 ? (
            <p className={styles.empty}>작업 내역이 없습니다.</p>
          ) : (
            <div className={styles.jobsList}>
              {recentJobs.filter((j): j is Job => j != null && typeof j.id === 'number').map((job) => (
                <div key={job.id} className={styles.jobItem}>
                  <div className={styles.jobHeader}>
                    <span className={styles.jobId}>작업 #{job.id}</span>
                    <span
                      className={styles.jobStatus}
                      style={{ color: getStatusColor(job.status) }}
                    >
                      {getStatusText(job.status)}
                    </span>
                  </div>
                  <div className={styles.jobDetails}>
                    <div>
                      <strong>시작:</strong>{' '}
                      {job.started_at
                        ? new Date(job.started_at).toLocaleString('ko-KR')
                        : '-'}
                    </div>
                    <div>
                      <strong>완료:</strong>{' '}
                      {job.completed_at
                        ? new Date(job.completed_at).toLocaleString('ko-KR')
                        : '-'}
                    </div>
                    <div>
                      <strong>성공:</strong> {job.success_count} /{' '}
                      {job.total_reviews}
                    </div>
                    {job.error_count > 0 && (
                      <div style={{ color: '#F44336' }}>
                        <strong>오류:</strong> {job.error_count}건
                      </div>
                    )}
                    {job.error_message && (
                      <div className={styles.errorMessage}>
                        <strong>오류 메시지:</strong> {job.error_message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
