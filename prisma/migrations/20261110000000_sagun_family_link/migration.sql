-- Sagun profiles now belong to a registered family member (one profile per member), keep a status log and admin settings.

-- AlterTable
ALTER TABLE `sagun_profiles`
    ADD COLUMN `family_id` VARCHAR(255) NULL,
    ADD COLUMN `member_id` VARCHAR(64) NULL,
    ADD COLUMN `village` VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN `age_at_submission` INTEGER NULL,
    ADD COLUMN `submitted_at` DATETIME(0) NULL,
    ADD COLUMN `approved_at` DATETIME(0) NULL;

-- Match family_members.id exactly (legacy tables may use another collation) so the foreign key can be created.
SET @sagun_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'family_members' AND COLUMN_NAME = 'id');
SET @sagun_sql = CONCAT('ALTER TABLE `sagun_profiles` MODIFY `member_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @sagun_collation, ' NULL');
PREPARE sagun_stmt FROM @sagun_sql;
EXECUTE sagun_stmt;
DEALLOCATE PREPARE sagun_stmt;

-- CreateIndex
CREATE UNIQUE INDEX `sagun_profiles_member_id_key` ON `sagun_profiles`(`member_id`);
CREATE INDEX `sagun_profiles_family_id_idx` ON `sagun_profiles`(`family_id`);
CREATE INDEX `sagun_profiles_status_candidate_type_idx` ON `sagun_profiles`(`status`, `candidate_type`);

-- AddForeignKey
ALTER TABLE `sagun_profiles` ADD CONSTRAINT `sagun_profiles_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `family_members`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Status names used by the application workflow.
UPDATE `sagun_profiles` SET `status` = 'SUBMITTED' WHERE `status` = 'PENDING';
UPDATE `sagun_profiles` SET `status` = 'INACTIVE' WHERE `status` = 'DEACTIVATED';
UPDATE `sagun_profiles` SET `submitted_at` = `updated_at` WHERE `status` IN ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE `sagun_application_logs` (
    `id` VARCHAR(64) NOT NULL,
    `sagun_profile_id` VARCHAR(64) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `previous_status` VARCHAR(20) NULL,
    `new_status` VARCHAR(20) NULL,
    `action_by` VARCHAR(64) NOT NULL,
    `remarks` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `sagun_application_logs_sagun_profile_id_created_at_idx`(`sagun_profile_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sagun_settings` (
    `id` VARCHAR(16) NOT NULL,
    `minimum_female_age` INTEGER NOT NULL DEFAULT 18,
    `minimum_male_age` INTEGER NOT NULL DEFAULT 21,
    `registration_enabled` BOOLEAN NOT NULL DEFAULT true,
    `profile_visibility` VARCHAR(16) NOT NULL DEFAULT 'MEMBERS',
    `approval_required` BOOLEAN NOT NULL DEFAULT true,
    `allow_edit_after_submission` BOOLEAN NOT NULL DEFAULT true,
    `allow_resubmission` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `sagun_settings` (`id`) VALUES ('default');
