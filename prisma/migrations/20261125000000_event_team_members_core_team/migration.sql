-- Event team joining (members/students join an event team; approved, consenting members are shown on the event page)
-- and the Sangathan Core Team. Additive only: new nullable/defaulted columns and one new table.
-- Existing roster rows keep working: they count as APPROVED and are NOT shown publicly until an admin opts them in.
-- Rollback:
--   DROP TABLE `core_team_members`;
--   ALTER TABLE `events` DROP COLUMN `team_joining_open`;
--   ALTER TABLE `event_roster` DROP INDEX `event_roster_event_student_key`, DROP INDEX `event_roster_event_review_idx`,
--     DROP COLUMN `student_id`, DROP COLUMN `user_id`, DROP COLUMN `photo_url`, DROP COLUMN `area`, DROP COLUMN `show_mobile`,
--     DROP COLUMN `show_on_website`, DROP COLUMN `review_status`, DROP COLUMN `review_remarks`, DROP COLUMN `source`;

ALTER TABLE `events` ADD COLUMN `team_joining_open` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `event_roster`
  ADD COLUMN `student_id` VARCHAR(255) NULL,
  ADD COLUMN `user_id` VARCHAR(64) NULL,
  ADD COLUMN `photo_url` VARCHAR(500) NULL,
  ADD COLUMN `area` VARCHAR(150) NULL,
  ADD COLUMN `show_mobile` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `show_on_website` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `review_status` VARCHAR(16) NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN `review_remarks` VARCHAR(500) NULL,
  ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'ADMIN';
CREATE UNIQUE INDEX `event_roster_event_student_key` ON `event_roster`(`event_id`, `student_id`);
CREATE INDEX `event_roster_event_review_idx` ON `event_roster`(`event_id`, `review_status`, `show_on_website`);

CREATE TABLE `core_team_members` (
  `id` VARCHAR(64) NOT NULL,
  `member_id` VARCHAR(64) NULL,
  `student_id` VARCHAR(255) NULL,
  `name` VARCHAR(255) NOT NULL,
  `name_hi` VARCHAR(255) NULL,
  `designation` VARCHAR(150) NULL,
  `designation_hi` VARCHAR(150) NULL,
  `photo_url` VARCHAR(500) NULL,
  `village` VARCHAR(255) NULL,
  `area` VARCHAR(150) NULL,
  `mobile` VARCHAR(20) NULL,
  `show_mobile` BOOLEAN NOT NULL DEFAULT false,
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_by_id` VARCHAR(64) NOT NULL,
  `updated_by_id` VARCHAR(64) NULL,
  `deleted_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `core_team_members_member_key` (`member_id`),
  UNIQUE INDEX `core_team_members_student_key` (`student_id`),
  INDEX `core_team_members_status_order_idx` (`status`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Same collation as family_members.id (utf8mb4_bin on imported databases, utf8mb4_unicode_ci on fresh ones).
SET @member_id_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'family_members' AND COLUMN_NAME = 'id');
SET @core_sql = CONCAT('ALTER TABLE `core_team_members` MODIFY `member_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @member_id_collation, ' NULL');
PREPARE core_stmt FROM @core_sql;
EXECUTE core_stmt;
DEALLOCATE PREPARE core_stmt;
ALTER TABLE `core_team_members` ADD CONSTRAINT `core_team_members_member_fkey` FOREIGN KEY (`member_id`) REFERENCES `family_members` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
