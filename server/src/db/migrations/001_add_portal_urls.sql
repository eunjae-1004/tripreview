-- 포털 URL 컬럼 추가 마이그레이션
-- 기존 테이블에 포털 URL 컬럼들을 추가합니다.

ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS naver_url TEXT,
ADD COLUMN IF NOT EXISTS kakao_url TEXT,
ADD COLUMN IF NOT EXISTS yanolja_url TEXT,
ADD COLUMN IF NOT EXISTS goodchoice_url TEXT,
ADD COLUMN IF NOT EXISTS google_url TEXT,
ADD COLUMN IF NOT EXISTS tripadvisor_url TEXT,
ADD COLUMN IF NOT EXISTS agoda_url TEXT;

-- 인덱스 추가 (네이버 URL로 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_companies_naver_url ON companies(naver_url) WHERE naver_url IS NOT NULL;
