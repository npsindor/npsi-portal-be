-- "Become an NPSI Event Member": one application workflow for every event team and the Core Team.
--   event_member_sections      the teams people can apply to (Core Team, Deepotsav Team, Maa Na Garba Team, Holi Milan
--                              Team, and sections the admin adds for "Other" requests), optionally linked to an event page;
--   event_member_applications  one application per person per section, also the public event profile once approved
--                              (approval also syncs the event roster when the section has an event);
--   event_member_application_logs  history of every action.
-- Existing data is copied, not moved: live Core Team rows and the self-service roster requests become applications with
-- their current status and visibility, so the same people stay on the website (no duplicate cards: each person once
-- per section). core_team_members and event_roster keep their rows.
-- Rollback:
--   DROP TABLE `event_member_application_logs`; DROP TABLE `event_member_applications`; DROP TABLE `event_member_sections`;

CREATE TABLE `event_member_sections` (
  `id` VARCHAR(64) NOT NULL,
  `key` VARCHAR(40) NOT NULL,
  `label` VARCHAR(150) NOT NULL,
  `label_hi` VARCHAR(150) NULL,
  `heading` VARCHAR(150) NOT NULL,
  `heading_hi` VARCHAR(150) NULL,
  `event_id` VARCHAR(64) NULL,
  `is_core_team` BOOLEAN NOT NULL DEFAULT false,
  `accepting` BOOLEAN NOT NULL DEFAULT true,
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `event_member_sections_key_key` (`key`),
  INDEX `event_member_sections_event_idx` (`event_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `event_member_applications` (
  `id` VARCHAR(64) NOT NULL,
  `section_id` VARCHAR(64) NULL,
  `custom_event_name` VARCHAR(150) NULL,
  `user_id` VARCHAR(64) NULL,
  `family_id` VARCHAR(255) NULL,
  `member_id` VARCHAR(64) NULL,
  `student_id` VARCHAR(255) NULL,
  `photo_url` VARCHAR(500) NULL,
  `name` VARCHAR(255) NOT NULL,
  `designation` VARCHAR(150) NULL,
  `designation_hi` VARCHAR(150) NULL,
  `mobile` VARCHAR(20) NULL,
  `mobile_digits` VARCHAR(10) NULL,
  `mobile_public` BOOLEAN NOT NULL DEFAULT false,
  `email` VARCHAR(255) NULL,
  `email_public` BOOLEAN NOT NULL DEFAULT false,
  `village` VARCHAR(255) NULL,
  `area` VARCHAR(150) NULL,
  `show_on_website` BOOLEAN NOT NULL DEFAULT true,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `rejection_reason` VARCHAR(500) NULL,
  `active_key` VARCHAR(400) NULL,
  `roster_id` VARCHAR(64) NULL,
  `source` VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `approved_by_id` VARCHAR(64) NULL,
  `approved_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `event_member_applications_active_key` (`active_key`),
  UNIQUE INDEX `event_member_applications_roster_key` (`roster_id`),
  INDEX `event_member_applications_section_status_idx` (`section_id`, `status`, `show_on_website`),
  INDEX `event_member_applications_user_idx` (`user_id`),
  INDEX `event_member_applications_mobile_idx` (`mobile_digits`),
  INDEX `event_member_applications_member_idx` (`member_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `event_member_application_logs` (
  `id` VARCHAR(64) NOT NULL,
  `application_id` VARCHAR(64) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `actor_id` VARCHAR(64) NULL,
  `remarks` VARCHAR(500) NULL,
  `changes` JSON NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `event_member_application_logs_application_idx` (`application_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `event_member_application_logs` ADD CONSTRAINT `event_member_application_logs_application_fkey`
  FOREIGN KEY (`application_id`) REFERENCES `event_member_applications` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `event_member_applications` ADD CONSTRAINT `event_member_applications_section_fkey`
  FOREIGN KEY (`section_id`) REFERENCES `event_member_sections` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys to events.id and family_members.id use those columns' collation (utf8mb4_bin on imported databases).
SET @event_id_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME = 'id');
SET @em_sql = CONCAT('ALTER TABLE `event_member_sections` MODIFY `event_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @event_id_collation, ' NULL');
PREPARE em_stmt FROM @em_sql;
EXECUTE em_stmt;
DEALLOCATE PREPARE em_stmt;
ALTER TABLE `event_member_sections` ADD CONSTRAINT `event_member_sections_event_fkey` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
SET @member_id_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'family_members' AND COLUMN_NAME = 'id');
SET @em_sql = CONCAT('ALTER TABLE `event_member_applications` MODIFY `member_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @member_id_collation, ' NULL');
PREPARE em_stmt FROM @em_sql;
EXECUTE em_stmt;
DEALLOCATE PREPARE em_stmt;
ALTER TABLE `event_member_applications` ADD CONSTRAINT `event_member_applications_member_fkey` FOREIGN KEY (`member_id`) REFERENCES `family_members` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The four standard sections. Deepotsav and Maa Na Garba link to the latest matching published event when there is
-- one; the admin can change any link in Become a NPSI Event Member → Sections.
INSERT INTO `event_member_sections` (`id`, `key`, `label`, `label_hi`, `heading`, `heading_hi`, `event_id`, `is_core_team`, `sort_order`) VALUES
  ('ems-core-team', 'CORE_TEAM', 'Core Team', 'कोर टीम', 'Core Team', 'कोर टीम', NULL, true, 1),
  ('ems-deepotsav', 'DEEPOTSAV', 'Sneh Deepotsav (Dev Utsav)', 'स्नेह दीपोत्सव (देव उत्सव)', 'Deepotsav Team', 'दीपोत्सव टीम',
    (SELECT `id` FROM `events` WHERE `slug` LIKE 'sneh-deepotsav%' OR `title` LIKE '%Deepotsav%' ORDER BY `date` DESC LIMIT 1), false, 2),
  ('ems-garba', 'GARBA', 'Maa Na Garba', 'माँ ना गरबा', 'Maa Na Garba Team', 'माँ ना गरबा टीम',
    (SELECT `id` FROM `events` WHERE `category` = 'GARBA' ORDER BY `date` DESC LIMIT 1), false, 3),
  ('ems-holi', 'HOLI', 'Holi Milan', 'होली मिलन', 'Holi Milan Team', 'होली मिलन टीम',
    (SELECT `id` FROM `events` WHERE `title` LIKE '%Holi%' ORDER BY `date` DESC LIMIT 1), false, 4);

-- Live Core Team rows → approved Core Team applications (inactive ones stay hidden from the website).
INSERT INTO `event_member_applications` (`id`, `section_id`, `member_id`, `student_id`, `family_id`, `photo_url`, `name`, `designation`, `designation_hi`,
  `mobile`, `mobile_digits`, `mobile_public`, `village`, `area`, `show_on_website`, `status`, `active_key`, `source`, `sort_order`, `approved_by_id`, `approved_at`, `created_at`)
SELECT CONCAT('emc-', c.`id`), 'ems-core-team', c.`member_id`, c.`student_id`, m.`family_id`, c.`photo_url`, c.`name`, c.`designation`, c.`designation_hi`,
  c.`mobile`, NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(c.`mobile`, ''), '[^0-9]', ''), 10), ''), c.`show_mobile`, c.`village`, c.`area`,
  c.`status` = 'ACTIVE', 'APPROVED',
  CONCAT('ems-core-team|', CASE WHEN c.`member_id` IS NOT NULL THEN CONCAT('M:', c.`member_id`) WHEN c.`student_id` IS NOT NULL THEN CONCAT('S:', c.`student_id`)
    WHEN NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(c.`mobile`, ''), '[^0-9]', ''), 10), '') IS NOT NULL THEN CONCAT('P:', RIGHT(REGEXP_REPLACE(c.`mobile`, '[^0-9]', ''), 10))
    ELSE CONCAT('A:emc-', c.`id`) END),
  'MIGRATED', c.`sort_order`, c.`created_by_id`, c.`created_at`, c.`created_at`
FROM `core_team_members` c LEFT JOIN `family_members` m ON m.`id` = c.`member_id`
WHERE c.`deleted_at` IS NULL;

-- Self-service roster requests (the earlier event "Join the team" form) → applications of the section linked to that event.
INSERT INTO `event_member_applications` (`id`, `section_id`, `user_id`, `member_id`, `student_id`, `family_id`, `photo_url`, `name`, `mobile`, `mobile_digits`,
  `mobile_public`, `village`, `area`, `show_on_website`, `status`, `rejection_reason`, `active_key`, `roster_id`, `source`, `approved_at`, `created_at`)
SELECT CONCAT('emr-', r.`id`), s.`id`, r.`user_id`, r.`member_id`, r.`student_id`, r.`family_id`, r.`photo_url`, r.`member_name`, r.`mobile`,
  NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(r.`mobile`, ''), '[^0-9]', ''), 10), ''), r.`show_mobile`, r.`village`, r.`area`, r.`show_on_website`,
  CASE r.`review_status` WHEN 'APPROVED' THEN 'APPROVED' WHEN 'REJECTED' THEN 'REJECTED' ELSE 'PENDING' END, r.`review_remarks`,
  CASE WHEN r.`review_status` = 'REJECTED' THEN NULL ELSE CONCAT(s.`id`, '|', CASE WHEN r.`member_id` IS NOT NULL THEN CONCAT('M:', r.`member_id`)
    WHEN r.`student_id` IS NOT NULL THEN CONCAT('S:', r.`student_id`) ELSE CONCAT('A:emr-', r.`id`) END) END,
  r.`id`, 'MIGRATED', CASE WHEN r.`review_status` = 'APPROVED' THEN r.`updated_at` END, r.`created_at`
FROM `event_roster` r JOIN `event_member_sections` s ON s.`event_id` = r.`event_id`
WHERE r.`source` = 'SELF' AND r.`deleted_at` IS NULL
  -- the same person already copied from the Core Team into this section is not added twice
  AND NOT EXISTS (SELECT 1 FROM `event_member_applications` a WHERE a.`section_id` = s.`id`
    AND ((r.`member_id` IS NOT NULL AND a.`member_id` = r.`member_id`) OR (r.`student_id` IS NOT NULL AND a.`student_id` = r.`student_id`)));

INSERT INTO `event_member_application_logs` (`id`, `application_id`, `action`, `remarks`)
SELECT CONCAT('eml-', a.`id`), a.`id`, 'MIGRATED', IF(a.`id` LIKE 'emc-%', 'Copied from the Core Team list', 'Copied from the event team requests')
FROM `event_member_applications` a;
