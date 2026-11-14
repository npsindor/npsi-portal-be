-- Some databases (the Hostinger test database) carry two foreign keys that are not in schema.prisma and can
-- never hold: student_applications.application_id (the NPSI-STU-APP-… display id) pointing at applications.id,
-- and resulting_student_id (the NPSI-STU-… display id) pointing at students.id (a uuid). With them in place
-- every new student registration fails ("A referenced record does not exist"). Drop them where they exist.
ALTER TABLE `student_applications` DROP FOREIGN KEY IF EXISTS `student_applications_application_id_fkey`;
ALTER TABLE `student_applications` DROP FOREIGN KEY IF EXISTS `student_applications_student_id_fkey`;
