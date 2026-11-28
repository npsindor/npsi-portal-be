-- Travel & Assistance (Safar) place keys follow routeKey in src/safar-saathi/safar.rules.ts again:
-- 1. no brackets, single spaces, no trailing space (older keys of "Indore." ended in a space), no ", M.P." /
--    "Madhya Pradesh" suffix;
-- 2. the spellings added to routeKey map to one key per place (Khargon -> khargone, सनावद -> sanawad, ...).
-- Open entries whose keys now agree are paired the next time either member opens the page.
UPDATE `safar_entries` SET
  `origin_key` = TRIM(REGEXP_REPLACE(REGEXP_REPLACE(`origin_key`, '\\([^)]*\\)', ' '), ' +', ' ')),
  `destination_key` = TRIM(REGEXP_REPLACE(REGEXP_REPLACE(`destination_key`, '\\([^)]*\\)', ' '), ' +', ' '));
UPDATE `safar_entries` SET `origin_key` = TRIM(REGEXP_REPLACE(`origin_key`, ' (m ?p|madhya pradesh)$', ''))
  WHERE `origin_key` REGEXP ' (m ?p|madhya pradesh)$';
UPDATE `safar_entries` SET `destination_key` = TRIM(REGEXP_REPLACE(`destination_key`, ' (m ?p|madhya pradesh)$', ''))
  WHERE `destination_key` REGEXP ' (m ?p|madhya pradesh)$';
UPDATE `safar_entries` SET `origin_key` = CASE `origin_key`
    WHEN 'indor' THEN 'indore'
    WHEN 'khargon' THEN 'khargone'
    WHEN 'khargaon' THEN 'khargone'
    WHEN 'khandava' THEN 'khandwa'
    WHEN 'badwani' THEN 'barwani'
    WHEN 'bombay' THEN 'mumbai'
    WHEN 'सनावद' THEN 'sanawad'
    WHEN 'बड़वाह' THEN 'barwaha'
    WHEN 'badwaha' THEN 'barwaha'
    WHEN 'कसरावद' THEN 'kasrawad'
    WHEN 'महेश्वर' THEN 'maheshwar'
    WHEN 'मंडलेश्वर' THEN 'mandleshwar'
    WHEN 'सेंधवा' THEN 'sendhwa'
    WHEN 'ओंकारेश्वर' THEN 'omkareshwar'
    ELSE `origin_key` END
  WHERE `origin_key` IN ('indor', 'khargon', 'khargaon', 'khandava', 'badwani', 'bombay', 'सनावद', 'बड़वाह', 'badwaha', 'कसरावद', 'महेश्वर', 'मंडलेश्वर', 'सेंधवा', 'ओंकारेश्वर');
UPDATE `safar_entries` SET `destination_key` = CASE `destination_key`
    WHEN 'indor' THEN 'indore'
    WHEN 'khargon' THEN 'khargone'
    WHEN 'khargaon' THEN 'khargone'
    WHEN 'khandava' THEN 'khandwa'
    WHEN 'badwani' THEN 'barwani'
    WHEN 'bombay' THEN 'mumbai'
    WHEN 'सनावद' THEN 'sanawad'
    WHEN 'बड़वाह' THEN 'barwaha'
    WHEN 'badwaha' THEN 'barwaha'
    WHEN 'कसरावद' THEN 'kasrawad'
    WHEN 'महेश्वर' THEN 'maheshwar'
    WHEN 'मंडलेश्वर' THEN 'mandleshwar'
    WHEN 'सेंधवा' THEN 'sendhwa'
    WHEN 'ओंकारेश्वर' THEN 'omkareshwar'
    ELSE `destination_key` END
  WHERE `destination_key` IN ('indor', 'khargon', 'khargaon', 'khandava', 'badwani', 'bombay', 'सनावद', 'बड़वाह', 'badwaha', 'कसरावद', 'महेश्वर', 'मंडलेश्वर', 'सेंधवा', 'ओंकारेश्वर');

-- The page moved from /transportation to /travel-assistance: keep an admin's show/hide choice for it.
UPDATE IGNORE `site_visibility` SET `key` = 'page:/travel-assistance' WHERE `key` = 'page:/transportation';
DELETE FROM `site_visibility` WHERE `key` = 'page:/transportation';
