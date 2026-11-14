-- Extend the independent student workflow with a requested education level
-- and a backend-verified optional link to an existing family member.
ALTER TABLE `student_applications`
    ADD COLUMN `mother_name` VARCHAR(255) NULL,
    ADD COLUMN `education_level` VARCHAR(255) NULL,
    ADD COLUMN `linked_family_id` VARCHAR(255) NULL,
    ADD COLUMN `linked_member_id` VARCHAR(64) NULL,
    ADD COLUMN `linked_membership_id` VARCHAR(255) NULL,
    ADD INDEX `student_applications_linked_family_idx` (`linked_family_id`),
    ADD INDEX `student_applications_linked_member_idx` (`linked_member_id`);

ALTER TABLE `students`
    ADD COLUMN `mother_name` VARCHAR(255) NULL,
    ADD COLUMN `education_level` VARCHAR(255) NULL;
