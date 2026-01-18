-- 기업 정보 테이블
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 숙박시설, 음식점 등
  is_member CHAR(1) DEFAULT 'N', -- Y/N
  address TEXT,
  email VARCHAR(255),
  phone VARCHAR(50),
  manager VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 리뷰 정보 테이블
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  portal_url VARCHAR(255) NOT NULL, -- 네이버맵, 카카오맵, 아고다 등
  company_name VARCHAR(255) NOT NULL,
  review_date DATE NOT NULL,
  content TEXT,
  rating DECIMAL(3, 2), -- 평점
  nickname VARCHAR(100) NOT NULL,
  visit_keyword VARCHAR(255), -- 방문키워드
  review_keyword VARCHAR(255), -- 리뷰키워드
  visit_type VARCHAR(50), -- 방문구성 (혼자, 연인, 가족 등)
  emotion VARCHAR(50), -- 감정
  revisit_flag BOOLEAN DEFAULT FALSE, -- 재방문 여부
  n_rating DECIMAL(3, 2), -- 종합 분석 평점
  n_emotion VARCHAR(50), -- 종합 분석 감정
  n_char_count INTEGER, -- 종합 분석 글자수
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 중복 방지를 위한 유니크 제약조건 (호텔명, 날짜, 닉네임)
  UNIQUE(company_name, review_date, nickname)
);

-- 스크래핑 작업 로그 테이블
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id SERIAL PRIMARY KEY,
  status VARCHAR(20) NOT NULL, -- pending, running, completed, failed, stopped
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_reviews INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_reviews_company_name ON reviews(company_name);
CREATE INDEX IF NOT EXISTS idx_reviews_review_date ON reviews(review_date);
CREATE INDEX IF NOT EXISTS idx_reviews_portal_url ON reviews(portal_url);
CREATE INDEX IF NOT EXISTS idx_companies_company_name ON companies(company_name);
