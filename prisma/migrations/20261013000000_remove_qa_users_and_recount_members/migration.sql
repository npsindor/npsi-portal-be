-- Two tidy-ups found in the production export of 2026-10-06:
--
-- 1. Six QA/test login accounts (all @example.com) that the earlier test-data
--    cleanup didn't list. Nothing else refers to them (checked by id and email);
--    their sessions and notification read marks go with them (ON DELETE CASCADE).
--    Matched by id and email, so a reused id can't remove anyone else.
DELETE FROM `users`
WHERE (`id`, `email`) IN (
  ('3ea7f276-9cda-4b7a-8806-0b5a1c21286c', 'nps-qa-live-invite-test@example.com'),
  ('9368b4aa-50c3-4044-b501-f94f4cebdf90', 'nps-qa-livecap-1790510292424@example.com'),
  ('a44af841-2409-4a1f-8542-ae5ab3e57fc1', 'testuser@example.com'),
  ('be7a90ed-1a35-4d7c-a7a5-f9b115028f14', 'npsindore-qa-urltest@example.com'),
  ('ca6990bd-abd0-46dd-a118-f562fa3abd21', 'nps-qa-recaptcha-probe@example.com'),
  ('f8513c6e-f160-4765-b2c4-2ae718af789a', 'membertestfix@example.com')
);

-- 2. Member counts follow the member rows from now on (the app recounts on every
--    member change); bring every family in line once. In production this changes
--    PSI-FAM-000001 (5 -> 6) and PSI-FAM-000012 (1 -> 0) only.
UPDATE `families` f
SET f.`member_count` = (SELECT COUNT(*) FROM `family_members` m WHERE m.`family_id` = f.`family_id`);
