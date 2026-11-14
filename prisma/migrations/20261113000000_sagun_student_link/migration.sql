-- Link a Sagun profile to the existing approved student record when that family member has one.
ALTER TABLE `sagun_profiles` ADD COLUMN `student_id` VARCHAR(255) NULL;

SET @student_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'student_id');
SET @student_sql = CONCAT('ALTER TABLE `sagun_profiles` MODIFY `student_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE ', @student_collation, ' NULL');
PREPARE student_stmt FROM @student_sql;
EXECUTE student_stmt;
DEALLOCATE PREPARE student_stmt;

CREATE UNIQUE INDEX `sagun_profiles_student_id_key` ON `sagun_profiles`(`student_id`);
ALTER TABLE `sagun_profiles` ADD CONSTRAINT `sagun_profiles_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`student_id`) ON DELETE SET NULL ON UPDATE CASCADE;
