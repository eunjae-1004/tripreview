import cron from 'node-cron';
import jobService from './jobService.js';

let scheduleTask = null;
let scheduleEnabled = true; // 기본값: 활성화

/**
 * 스케줄 서비스 초기화 (index.js에서 호출)
 */
export function initSchedule() {
  if (scheduleTask) return;
  scheduleTask = cron.schedule('0 2 * * 0', async () => {
    if (!scheduleEnabled) {
      console.log('스케줄이 비활성화되어 있어 실행을 건너뜁니다.');
      return;
    }
    console.log('스케줄된 스크래핑 작업 시작:', new Date());
    if (!jobService.getIsRunning()) {
      try {
        await jobService.runScrapingJob('week');
        console.log('스케줄된 스크래핑 작업 완료');
      } catch (error) {
        console.error('스케줄된 스크래핑 작업 실패:', error);
      }
    } else {
      console.log('이미 실행 중인 작업이 있어 스케줄 작업을 건너뜁니다.');
    }
  }, { scheduled: scheduleEnabled, timezone: 'Asia/Seoul' });
}

/**
 * 스케줄 활성화 여부 조회
 */
export function getScheduleStatus() {
  return {
    enabled: scheduleEnabled,
    cronExpression: '0 2 * * 0',
    description: '매주 일요일 새벽 2시 (한국 시간 KST)',
  };
}

/**
 * 스케줄 활성화/비활성화 설정
 */
export function setScheduleEnabled(enabled) {
  const prev = scheduleEnabled;
  scheduleEnabled = !!enabled;
  if (scheduleTask) {
    if (enabled) {
      scheduleTask.start();
    } else {
      scheduleTask.stop();
    }
  }
  return { enabled: scheduleEnabled, previous: prev };
}
