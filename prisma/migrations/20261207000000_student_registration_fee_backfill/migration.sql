-- Student applications sent from the public student form had no registration fee record, so the admin could approve
-- them without the ₹100 payment being verified. Give every student application that is still waiting for a decision
-- (not APPROVED / REJECTED) and has no registration fee a PENDING ₹100 fee, the same as the family form records.
-- Approval then waits until an admin verifies it under Admin → Registration payments. Decided applications, and
-- applications that already have a fee, are not touched; nothing is updated or deleted.
INSERT INTO `transactions` (`id`, `transaction_id`, `type`, `amount`, `payment_method`, `payment_status`, `reference_id`, `date`, `remarks`, `created_at`, `updated_at`)
SELECT
  UUID(),
  -- The next numbers after the highest TXN- number (at least 6 digits, like nextDisplayId; longer ones kept whole).
  CONCAT('TXN-', LPAD(base.n + ROW_NUMBER() OVER (ORDER BY sa.`created_at`, sa.`id`), GREATEST(6, CHAR_LENGTH(base.n + 1)), '0')),
  'Student Registration',
  100.00,
  'UPI',
  'PENDING',
  sa.`application_id`,
  UTC_TIMESTAMP(),
  'Student registration fee',
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
FROM `student_applications` sa
CROSS JOIN (
  SELECT COALESCE(MAX(CAST(SUBSTRING(`transaction_id`, 5) AS UNSIGNED)), 0) AS n
  FROM `transactions`
  WHERE `transaction_id` REGEXP '^TXN-[0-9]+$'
) base
WHERE (sa.`status` IS NULL OR sa.`status` NOT IN ('APPROVED', 'REJECTED'))
  AND NOT EXISTS (
    SELECT 1 FROM `transactions` t
    WHERE t.`reference_id` = sa.`application_id` AND t.`type` IN ('Family Registration', 'Student Registration')
  );
