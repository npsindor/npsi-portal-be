-- My Family → Add / Edit member: where the member studies (school / college) and works (company), free text.
ALTER TABLE `family_members`
  ADD COLUMN `school_college` VARCHAR(255) NULL,
  ADD COLUMN `company_name` VARCHAR(255) NULL;
