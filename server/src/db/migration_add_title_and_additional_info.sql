-- reviews 테이블에 title과 additional_info 필드 추가
-- null 값 허용

ALTER TABLE reviews 
ADD COLUMN IF NOT EXISTS title VARCHAR(500),
ADD COLUMN IF NOT EXISTS additional_info TEXT;
