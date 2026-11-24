-- Become a Donor: the donor's own name, mobile and city (pre-filled from their profile, editable on the form). Nullable:
-- donors registered before this keep using their account's name and mobile. Existing rows are not changed.
ALTER TABLE `blood_donors` ADD COLUMN `name` VARCHAR(150) NULL, ADD COLUMN `mobile` VARCHAR(10) NULL, ADD COLUMN `city` VARCHAR(150) NULL;
