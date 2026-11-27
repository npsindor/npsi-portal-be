-- Registration form: the applicant's blood group (optional). On approval the applicant joins the Blood Donor list.
ALTER TABLE `applications` ADD COLUMN `blood_group` VARCHAR(3) NULL;
ALTER TABLE `student_applications` ADD COLUMN `blood_group` VARCHAR(3) NULL;
