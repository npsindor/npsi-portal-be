-- A family member's marital status (MARRIED / UNMARRIED), asked by the registration form and the
-- "Add family member" form. Existing members keep NULL (not given); nothing else changes.
ALTER TABLE `family_members` ADD COLUMN `marital_status` VARCHAR(20) NULL;
