-- Event finance statement fields (Maa Na Garba statement import, bilingual roster).
-- Additive only: every existing row keeps its values; new columns are NULL or take the default.
-- Rollback:
--   ALTER TABLE `event_contributions` DROP INDEX `event_contributions_import_key_key`, DROP COLUMN `import_key`, DROP COLUMN `review_note`,
--     DROP COLUMN `notes`, DROP COLUMN `contribution_group`, DROP COLUMN `serial_no`;
--   ALTER TABLE `event_expenses` DROP INDEX `event_expenses_import_key_key`, DROP COLUMN `import_key`, DROP COLUMN `serial_no`,
--     DROP COLUMN `expense_group`, DROP COLUMN `description_hi`, DROP COLUMN `title_hi`;
--   ALTER TABLE `event_expense_categories` DROP COLUMN `name_hi`;

ALTER TABLE `event_contributions`
  ADD COLUMN `serial_no` INT NULL,
  ADD COLUMN `contribution_group` VARCHAR(24) NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN `notes` TEXT NULL,
  ADD COLUMN `review_note` TEXT NULL,
  ADD COLUMN `import_key` VARCHAR(128) NULL,
  ADD UNIQUE INDEX `event_contributions_import_key_key` (`import_key`);

ALTER TABLE `event_expenses`
  ADD COLUMN `title_hi` VARCHAR(255) NULL,
  ADD COLUMN `description_hi` TEXT NULL,
  ADD COLUMN `expense_group` VARCHAR(24) NOT NULL DEFAULT 'EVENT',
  ADD COLUMN `serial_no` INT NULL,
  ADD COLUMN `import_key` VARCHAR(128) NULL,
  ADD UNIQUE INDEX `event_expenses_import_key_key` (`import_key`);

ALTER TABLE `event_expense_categories`
  ADD COLUMN `name_hi` VARCHAR(160) NULL;
