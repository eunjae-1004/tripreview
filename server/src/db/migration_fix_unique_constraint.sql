-- UNIQUE 제약조건 수정: portal_url 추가
-- 기존 제약조건 삭제 및 새로운 제약조건 추가

-- 기존 UNIQUE 제약조건 찾기 및 삭제
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- 기존 UNIQUE 제약조건 이름 찾기
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'reviews'::regclass
      AND contype = 'u'
      AND array_length(conkey, 1) = 3; -- 3개 컬럼 (company_name, review_date, nickname)
    
    -- 제약조건이 있으면 삭제
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE reviews DROP CONSTRAINT IF EXISTS %I', constraint_name);
        RAISE NOTICE '기존 UNIQUE 제약조건 삭제: %', constraint_name;
    END IF;
END $$;

-- 새로운 UNIQUE 제약조건 추가 (portal_url 포함)
ALTER TABLE reviews 
ADD CONSTRAINT reviews_company_date_nickname_portal_unique 
UNIQUE (company_name, review_date, nickname, portal_url);

-- 확인
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'reviews'::regclass
  AND contype = 'u';
