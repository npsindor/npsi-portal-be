-- Duplicate mobile/email checks become plain indexed lookups: each table keeps
-- the last 10 digits of its mobile (families: contact number), written by the
-- repositories on every save, and emails are stored trimmed.

-- AlterTable
ALTER TABLE `applications` ADD COLUMN `mobile_digits` VARCHAR(10) NULL;
-- AlterTable
ALTER TABLE `families` ADD COLUMN `contact_digits` VARCHAR(10) NULL;
-- AlterTable
ALTER TABLE `family_members` ADD COLUMN `mobile_digits` VARCHAR(10) NULL;
-- AlterTable
ALTER TABLE `student_applications` ADD COLUMN `mobile_digits` VARCHAR(10) NULL;
-- AlterTable
ALTER TABLE `students` ADD COLUMN `mobile_digits` VARCHAR(10) NULL;
-- CreateIndex
CREATE INDEX `applications_mobile_digits_idx` ON `applications`(`mobile_digits`);
-- CreateIndex
CREATE INDEX `families_contact_digits_idx` ON `families`(`contact_digits`);
-- CreateIndex
CREATE INDEX `family_members_mobile_digits_idx` ON `family_members`(`mobile_digits`);
-- CreateIndex
CREATE INDEX `student_applications_mobile_digits_idx` ON `student_applications`(`mobile_digits`);
-- CreateIndex
CREATE INDEX `students_mobile_digits_idx` ON `students`(`mobile_digits`);

-- Backfill: the same rule as normalizeMobile() (digits only, the last 10, none becomes NULL).
UPDATE `applications` SET `mobile_digits` = NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(`mobile`, ''), '[^0-9]', ''), 10), '');
UPDATE `families` SET `contact_digits` = NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(`contact_number`, ''), '[^0-9]', ''), 10), '');
UPDATE `family_members` SET `mobile_digits` = NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(`mobile`, ''), '[^0-9]', ''), 10), '');
UPDATE `student_applications` SET `mobile_digits` = NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(`mobile`, ''), '[^0-9]', ''), 10), '');
UPDATE `students` SET `mobile_digits` = NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(`mobile`, ''), '[^0-9]', ''), 10), '');

-- Emails without surrounding spaces (matching is case-insensitive through the collation).
UPDATE `applications` SET `email` = TRIM(`email`) WHERE `email` <> TRIM(`email`);
UPDATE `families` SET `email` = TRIM(`email`) WHERE `email` <> TRIM(`email`);
UPDATE `family_members` SET `email` = TRIM(`email`) WHERE `email` <> TRIM(`email`);
UPDATE `student_applications` SET `email` = TRIM(`email`) WHERE `email` <> TRIM(`email`);
UPDATE `students` SET `email` = TRIM(`email`) WHERE `email` <> TRIM(`email`);
