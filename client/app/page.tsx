'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || 'admin123';

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

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  // 작업 시작
  const handleStart = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/jobs/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': ADMIN_SECRET,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setMessage('스크래핑 작업이 시작되었습니다.');
        setTimeout(() => {
          fetchStatus();
          fetchRecentJobs();
        }, 1000);
      } else {
        setMessage(`오류: ${data.error}`);
      }
    } catch (error) {
      setMessage('작업 시작 실패');
      console.error(error);
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

    // 5초마다 상태 업데이트
    const interval = setInterval(() => {
      fetchStatus();
      fetchRecentJobs();
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
          <div className={styles.controls}>
            <button
              onClick={handleStart}
              disabled={loading || isRunning}
              className={styles.button}
            >
              작업 시작
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
              }}
              disabled={loading}
              className={`${styles.button} ${styles.buttonRefresh}`}
            >
              새로고침
            </button>
          </div>
          {message && (
            <div className={styles.message}>{message}</div>
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
              </>
            )}
          </div>
        </section>

        {/* 최근 작업 목록 */}
        <section className={styles.jobsPanel}>
          <h2>최근 작업 목록</h2>
          {recentJobs.length === 0 ? (
            <p className={styles.empty}>작업 내역이 없습니다.</p>
          ) : (
            <div className={styles.jobsList}>
              {recentJobs.map((job) => (
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
