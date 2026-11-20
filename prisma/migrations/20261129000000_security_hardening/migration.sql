-- Security findings (open issues list, 17 Nov 2026): one open transfer request per member/student (#31), one live
-- event registration per family and event (#27), unverified mobile numbers (#23), session idle timeout (#11) and
-- never-reused transfer reference numbers.
-- Additive only: no row is deleted and no existing value changes. Existing duplicates are left as they are: only the
-- newest open transfer request per member and the oldest live registration per family/event get the key; the admin
-- decides the rest (deciding one transfer request closes the other open ones for the same member).
-- Rollback:
--   ALTER TABLE `transfer_requests` DROP INDEX `transfer_requests_open_key_key`, DROP COLUMN `open_key`;
--   ALTER TABLE `event_registrations` DROP INDEX `event_registrations_active_key_key`, DROP COLUMN `active_key`;
--   ALTER TABLE `users` DROP COLUMN `phone_verified`;
--   ALTER TABLE `sessions` DROP COLUMN `last_seen_at`;
--   DROP TABLE `display_id_counters`;

ALTER TABLE `transfer_requests` ADD COLUMN `open_key` VARCHAR(300) NULL;
ALTER TABLE `transfer_requests` ADD UNIQUE INDEX `transfer_requests_open_key_key`(`open_key`);

UPDATE `transfer_requests` t
JOIN (
  SELECT `id`, `subject`, ROW_NUMBER() OVER (PARTITION BY `subject` ORDER BY `created_at` DESC, `id`) AS `rn`
  FROM (
    SELECT `id`, `created_at`,
      CASE
        WHEN `source_membership_id` IS NOT NULL AND `source_membership_id` <> '' THEN CONCAT('M:', `source_membership_id`)
        WHEN `source_student_id` IS NOT NULL AND `source_student_id` <> '' THEN CONCAT('S:', `source_student_id`)
      END AS `subject`
    FROM `transfer_requests`
    WHERE `status` IN ('PENDING', 'CORRECTION_REQUIRED')
  ) AS `open_requests`
  WHERE `subject` IS NOT NULL
) AS `ranked` ON `ranked`.`id` = t.`id` AND `ranked`.`rn` = 1
SET t.`open_key` = `ranked`.`subject`;

ALTER TABLE `event_registrations` ADD COLUMN `active_key` VARCHAR(400) NULL;
ALTER TABLE `event_registrations` ADD UNIQUE INDEX `event_registrations_active_key_key`(`active_key`);

UPDATE `event_registrations` r
JOIN (
  SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `event_id`, `family_id` ORDER BY `created_at`, `id`) AS `rn`
  FROM `event_registrations`
  WHERE `family_id` IS NOT NULL AND `family_id` <> '' AND (`status` IS NULL OR `status` <> 'CANCELLED')
) AS `ranked` ON `ranked`.`id` = r.`id` AND `ranked`.`rn` = 1
SET r.`active_key` = CONCAT(r.`event_id`, ':', r.`family_id`);

ALTER TABLE `users` ADD COLUMN `phone_verified` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `sessions` ADD COLUMN `last_seen_at` DATETIME(0) NULL;

CREATE TABLE `display_id_counters` (
  `prefix` VARCHAR(40) NOT NULL,
  `last` INTEGER NOT NULL,
  PRIMARY KEY (`prefix`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Start the transfer counter at the highest number already used.
INSERT INTO `display_id_counters` (`prefix`, `last`)
SELECT 'TRF-', COALESCE(MAX(CAST(SUBSTRING(`request_id`, 5) AS UNSIGNED)), 0)
FROM `transfer_requests`
WHERE `request_id` REGEXP '^TRF-[0-9]+$';
