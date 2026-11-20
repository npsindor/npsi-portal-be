-- Team members (Become a Member / Core Team) in Hindi: the name and village as shown when the site is in Hindi.
-- Additive only: existing rows keep their values and show the English name / village until an admin adds Hindi.
-- Rollback: ALTER TABLE `event_member_applications` DROP COLUMN `village_hi`, DROP COLUMN `name_hi`;
ALTER TABLE `event_member_applications`
  ADD COLUMN `name_hi` VARCHAR(255) NULL,
  ADD COLUMN `village_hi` VARCHAR(255) NULL;
