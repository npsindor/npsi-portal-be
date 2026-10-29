-- CreateTable
CREATE TABLE `sagun_profiles` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `data` JSON NOT NULL,
    `display_name` VARCHAR(150) NOT NULL DEFAULT '',
    `candidate_type` VARCHAR(12) NOT NULL DEFAULT '',
    `birth_date` DATE NULL,
    `city` VARCHAR(150) NOT NULL DEFAULT '',
    `gotra` VARCHAR(150) NOT NULL DEFAULT '',
    `education` VARCHAR(200) NOT NULL DEFAULT '',
    `occupation` VARCHAR(200) NOT NULL DEFAULT '',
    `marital_status` VARCHAR(20) NOT NULL DEFAULT '',
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    `visibility` VARCHAR(16) NOT NULL DEFAULT 'PRIVATE',
    `review_notes` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `sagun_profiles_reference_key`(`reference`),
    INDEX `sagun_profiles_status_visibility_city_idx`(`status`, `visibility`, `city`),
    INDEX `sagun_profiles_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sagun_files` (
    `id` VARCHAR(64) NOT NULL,
    `profile_id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `filename` VARCHAR(80) NOT NULL,
    `mime` VARCHAR(40) NOT NULL,
    `size` INTEGER NOT NULL,
    `consent_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `sagun_files_profile_id_kind_key`(`profile_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sagun_inquiries` (
    `id` VARCHAR(64) NOT NULL,
    `profile_id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `message` TEXT NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `share_sagun` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `sagun_inquiries_profile_id_user_id_key`(`profile_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sagun_config` (
    `id` VARCHAR(16) NOT NULL,
    `fields` JSON NOT NULL,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sagun_audits` (
    `id` VARCHAR(64) NOT NULL,
    `actor_id` VARCHAR(64) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `entity_id` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sagun_notices` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `entity_id` VARCHAR(64) NOT NULL,
    `topic` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `sagun_notices_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @sagun_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id');
SET @sagun_sql = CONCAT('ALTER TABLE `sagun_profiles` MODIFY `user_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @sagun_collation, ' NOT NULL');
PREPARE sagun_stmt FROM @sagun_sql;
EXECUTE sagun_stmt;
DEALLOCATE PREPARE sagun_stmt;
SET @sagun_sql = CONCAT('ALTER TABLE `sagun_inquiries` MODIFY `user_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @sagun_collation, ' NOT NULL');
PREPARE sagun_stmt FROM @sagun_sql;
EXECUTE sagun_stmt;
DEALLOCATE PREPARE sagun_stmt;
SET @sagun_sql = CONCAT('ALTER TABLE `sagun_notices` MODIFY `user_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @sagun_collation, ' NOT NULL');
PREPARE sagun_stmt FROM @sagun_sql;
EXECUTE sagun_stmt;
DEALLOCATE PREPARE sagun_stmt;

-- AddForeignKey
ALTER TABLE `sagun_profiles` ADD CONSTRAINT `sagun_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sagun_files` ADD CONSTRAINT `sagun_files_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `sagun_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sagun_inquiries` ADD CONSTRAINT `sagun_inquiries_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `sagun_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sagun_inquiries` ADD CONSTRAINT `sagun_inquiries_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sagun_notices` ADD CONSTRAINT `sagun_notices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
