-- CreateTable
CREATE TABLE `sehat_mrs` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `membership_id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `company` VARCHAR(180) NOT NULL,
    `role` VARCHAR(150) NOT NULL,
    `city` VARCHAR(150) NOT NULL,
    `city_key` VARCHAR(150) NOT NULL,
    `areas` JSON NOT NULL,
    `area_keys` JSON NOT NULL,
    `phone` VARCHAR(10) NOT NULL,
    `whatsapp` VARCHAR(10) NULL,
    `assistance` VARCHAR(20) NOT NULL,
    `publish_contact` BOOLEAN NOT NULL DEFAULT false,
    `email_opt_in` BOOLEAN NOT NULL DEFAULT false,
    `whatsapp_opt_in` BOOLEAN NOT NULL DEFAULT false,
    `lang` VARCHAR(2) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `review_note` TEXT NULL,
    `verified_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `sehat_mrs_user_id_key`(`user_id`),
    INDEX `sehat_mrs_city_key_status_idx`(`city_key`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sehat_resources` (
    `id` VARCHAR(64) NOT NULL,
    `title_en` VARCHAR(200) NOT NULL,
    `title_hi` VARCHAR(200) NOT NULL,
    `description_en` TEXT NOT NULL,
    `description_hi` TEXT NOT NULL,
    `source` VARCHAR(200) NOT NULL,
    `url` TEXT NOT NULL,
    `category` VARCHAR(20) NOT NULL,
    `city` VARCHAR(150) NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `verified_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sehat_requests` (
    `id` VARCHAR(64) NOT NULL,
    `reference` VARCHAR(40) NOT NULL,
    `client_request_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `medicine` VARCHAR(180) NOT NULL,
    `composition` VARCHAR(200) NULL,
    `quantity` INTEGER NOT NULL,
    `assistance` VARCHAR(20) NOT NULL,
    `city` VARCHAR(150) NOT NULL,
    `city_key` VARCHAR(150) NOT NULL,
    `area` VARCHAR(150) NOT NULL,
    `area_key` VARCHAR(150) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(10) NOT NULL,
    `whatsapp` VARCHAR(10) NULL,
    `notes` TEXT NULL,
    `email_opt_in` BOOLEAN NOT NULL DEFAULT false,
    `whatsapp_opt_in` BOOLEAN NOT NULL DEFAULT false,
    `lang` VARCHAR(2) NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    `assigned_mr_id` VARCHAR(64) NULL,
    `consent_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `sehat_requests_reference_key`(`reference`),
    INDEX `sehat_requests_city_key_status_idx`(`city_key`, `status`),
    UNIQUE INDEX `sehat_requests_user_id_client_request_id_key`(`user_id`, `client_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sehat_routings` (
    `id` VARCHAR(64) NOT NULL,
    `request_id` VARCHAR(64) NOT NULL,
    `mr_id` VARCHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'INVITED',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `sehat_routings_request_id_mr_id_key`(`request_id`, `mr_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sehat_reports` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `target_type` VARCHAR(20) NOT NULL,
    `target_id` VARCHAR(64) NOT NULL,
    `message` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `resolution` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sehat_notifications` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `dedupe_key` VARCHAR(190) NOT NULL,
    `topic` VARCHAR(40) NOT NULL,
    `entity_id` VARCHAR(64) NOT NULL,
    `channel` VARCHAR(16) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `provider_id` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `sehat_notifications_user_id_dedupe_key_channel_key`(`user_id`, `dedupe_key`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sehat_audits` (
    `id` VARCHAR(64) NOT NULL,
    `actor_id` VARCHAR(64) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `entity_type` VARCHAR(24) NOT NULL,
    `entity_id` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Keep user references compatible with imported and fresh databases.
SET @sehat_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id');
SET @sehat_sql = CONCAT('ALTER TABLE `sehat_mrs` MODIFY `user_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @sehat_collation, ' NOT NULL');
PREPARE sehat_stmt FROM @sehat_sql;
EXECUTE sehat_stmt;
DEALLOCATE PREPARE sehat_stmt;
SET @sehat_sql = CONCAT('ALTER TABLE `sehat_requests` MODIFY `user_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @sehat_collation, ' NOT NULL');
PREPARE sehat_stmt FROM @sehat_sql;
EXECUTE sehat_stmt;
DEALLOCATE PREPARE sehat_stmt;
SET @sehat_sql = CONCAT('ALTER TABLE `sehat_reports` MODIFY `user_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @sehat_collation, ' NOT NULL');
PREPARE sehat_stmt FROM @sehat_sql;
EXECUTE sehat_stmt;
DEALLOCATE PREPARE sehat_stmt;
SET @sehat_sql = CONCAT('ALTER TABLE `sehat_notifications` MODIFY `user_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @sehat_collation, ' NOT NULL');
PREPARE sehat_stmt FROM @sehat_sql;
EXECUTE sehat_stmt;
DEALLOCATE PREPARE sehat_stmt;

-- AddForeignKey
ALTER TABLE `sehat_mrs` ADD CONSTRAINT `sehat_mrs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sehat_requests` ADD CONSTRAINT `sehat_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sehat_requests` ADD CONSTRAINT `sehat_requests_assigned_mr_id_fkey` FOREIGN KEY (`assigned_mr_id`) REFERENCES `sehat_mrs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sehat_routings` ADD CONSTRAINT `sehat_routings_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `sehat_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sehat_routings` ADD CONSTRAINT `sehat_routings_mr_id_fkey` FOREIGN KEY (`mr_id`) REFERENCES `sehat_mrs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sehat_reports` ADD CONSTRAINT `sehat_reports_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sehat_notifications` ADD CONSTRAINT `sehat_notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
