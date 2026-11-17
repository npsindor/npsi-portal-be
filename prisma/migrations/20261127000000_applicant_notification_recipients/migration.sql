-- Applicant notifications (payment verified, refund requested, correction needed, …) written by older builds
-- had no recipient, and a notification with no recipient is a broadcast: every logged-in user saw other
-- applicants' application ids, amounts and refund reasons. Current code addresses them to the applicant's
-- account, or to the application id when there is no account yet. This gives the old rows the same recipient.
-- Data only; no schema change. Rows that don't name a real application id (admin broadcasts) are untouched.
-- COLLATE on both sides: legacy databases mix utf8mb4_unicode_ci and utf8mb4_bin tables.

-- 1. Family applications submitted from an account: to that account.
UPDATE `notifications` n
JOIN `applications` a
  ON (CONCAT(n.`title`, ' ', n.`message`) COLLATE utf8mb4_bin) LIKE (CONCAT('%', a.`application_id`, '%') COLLATE utf8mb4_bin)
SET n.`recipient_user_id` = a.`user_id`
WHERE (n.`recipient_family_id` IS NULL OR n.`recipient_family_id` = '')
  AND n.`recipient_user_id` IS NULL
  AND n.`type` IN ('Payment', 'Approval', 'Correction', 'Registration')
  AND a.`user_id` IS NOT NULL;

-- 2. Student applications submitted from an account: to that account.
UPDATE `notifications` n
JOIN `student_applications` s
  ON (CONCAT(n.`title`, ' ', n.`message`) COLLATE utf8mb4_bin) LIKE (CONCAT('%', s.`application_id`, '%') COLLATE utf8mb4_bin)
SET n.`recipient_user_id` = s.`user_id`
WHERE (n.`recipient_family_id` IS NULL OR n.`recipient_family_id` = '')
  AND n.`recipient_user_id` IS NULL
  AND n.`type` IN ('Payment', 'Approval', 'Correction', 'Registration')
  AND s.`user_id` IS NOT NULL;

-- 3. The rest (applications without an account): to the application id, as the workflows do today.
UPDATE `notifications` n
JOIN `applications` a
  ON (CONCAT(n.`title`, ' ', n.`message`) COLLATE utf8mb4_bin) LIKE (CONCAT('%', a.`application_id`, '%') COLLATE utf8mb4_bin)
SET n.`recipient_family_id` = a.`application_id`
WHERE (n.`recipient_family_id` IS NULL OR n.`recipient_family_id` = '')
  AND n.`recipient_user_id` IS NULL
  AND n.`type` IN ('Payment', 'Approval', 'Correction', 'Registration');

UPDATE `notifications` n
JOIN `student_applications` s
  ON (CONCAT(n.`title`, ' ', n.`message`) COLLATE utf8mb4_bin) LIKE (CONCAT('%', s.`application_id`, '%') COLLATE utf8mb4_bin)
SET n.`recipient_family_id` = s.`application_id`
WHERE (n.`recipient_family_id` IS NULL OR n.`recipient_family_id` = '')
  AND n.`recipient_user_id` IS NULL
  AND n.`type` IN ('Payment', 'Approval', 'Correction', 'Registration');
