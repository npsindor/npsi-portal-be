-- One-off cleanup of test records left in production during the Base44 era
-- (reviewed 2026-10-08 against the production copy). Every row is named by id;
-- on a database without them (CI, fresh setups) this changes nothing.

-- Test applications: example.com addresses, "Test / Approval Check / Flow Verify" names.
DELETE FROM `applications` WHERE `id` IN (
  '40cea85f-8566-467f-ab5a-a9df8a5541c3', -- PSI-APP-VERIFY-001001
  '9e0365c2-6037-4644-8670-83cafdaf7aba', -- PSI-APP-VERIFY-001002
  'ac4823dc-7de3-4c2a-85ee-8707c96fd965', -- PSI-APP-VERIFY-001000
  'cf64f66c-dcec-4d79-ba2c-6fbe2e1316d0', -- HTTP-TEST-1789742620
  'db96201e-6471-48cd-b374-9c16fbfb27c7', -- PSI-APP-TEST-000001
  'dc8502d1-888b-4e7c-a0ec-5c34c5d8f61c', -- PSI-APP-FLOW-VERIFY-001
  'ea5010ee-bb4a-425b-bde3-06402ec5f0a8', -- VERIFY-DATETIME-1789742161521
  'f26bd2f8-00b9-4b19-9487-40892f61736a'  -- PSI-APP-VERIFY-000999
);

-- Their test families; their two members go with them (ON DELETE CASCADE).
DELETE FROM `families` WHERE `id` IN (
  '7511d67d-7eb8-4fe6-8c9d-f413cceef621', -- PSI-FAM-TEST-000001
  '7a00b955-6c04-45ba-9184-344e562e9dd0', -- PSI-FAM-FINAL-001
  '7b080c66-d2d9-41c9-bb9e-ea4bf712f79d', -- PSI-FAM-VERIFY-000999
  '849b5515-cfe1-4ace-8625-0e078c7b1bfa', -- PSI-FAM-FLOW-VER-001
  '97d799e3-e5c8-4420-90ef-f7a7aefeba87', -- PSI-FAM-VERIFY-001000
  'c1369a57-1d71-4133-a605-593120c1c8d4'  -- PSI-FAM-VERIFY-001001
);

-- The test family's fake fee and its invited test account.
DELETE FROM `transactions` WHERE `transaction_id` = 'TXN-FLOW-REVENUE-001';
DELETE FROM `users` WHERE `id` = '7d44e478-203b-4a37-b9fd-11f2ff087faa' AND `email` = 'flowmemberverify@example.com';

-- Notifications with no title, message or type at all.
DELETE FROM `notifications` WHERE `id` IN (
  '37583489-18e5-434a-a716-6692ba697ec9', '4eaa0a17-a418-406e-86ad-f834fb123494', '52f85b04-e153-48af-9a5a-bad40776b172',
  '736136fa-9cf7-40ee-b83d-fcbfc44cee49', '8bdac9af-852d-4e81-a247-bedca55a4f2f', '9cf7fd98-97ae-42ec-ab65-80879b792f18',
  'a1072509-8ef4-404c-9710-22fdb632a12d', 'fc5e6f0c-3ef6-4a48-8089-8d2b57145e2c'
) AND `title` = '' AND `message` = '';

-- A registration fee stored with an empty family id instead of none.
UPDATE `transactions` SET `family_id` = NULL WHERE `transaction_id` = 'TXN-1790526028505' AND `family_id` = '';
