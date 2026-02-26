-- UNIQUE 제약조건 수정: review_date 제거, content 추가
-- (company_name, review_date, nickname, portal_url) → (company_name, nickname, portal_url, content)

-- 기존 UNIQUE 제약조건 삭제
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'reviews'::regclass
      AND contype = 'u';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE reviews DROP CONSTRAINT IF EXISTS %I', constraint_name);
        RAISE NOTICE '기존 UNIQUE 제약조건 삭제: %', constraint_name;
    END IF;
END $$;

-- 중복 행 제거 (company_name, nickname, portal_url, content 앞 2000자 기준)
-- 같은 키를 가진 행 중 id가 가장 작은 것만 남김
DELETE FROM reviews a
USING reviews b
WHERE a.id > b.id
  AND a.company_name = b.company_name
  AND a.nickname = b.nickname
  AND a.portal_url = b.portal_url
  AND COALESCE(LEFT(a.content, 2000), '') = COALESCE(LEFT(b.content, 2000), '');

-- content가 길 경우 인덱스 크기 제한을 위해 LEFT(content, 2000) 사용
-- (PostgreSQL btree 인덱스 키 최대 약 2712 bytes)
CREATE UNIQUE INDEX IF NOT EXISTS reviews_company_nickname_portal_content_unique
ON reviews (company_name, nickname, portal_url, COALESCE(LEFT(content, 2000), ''));
