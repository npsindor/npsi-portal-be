-- CreateTable
CREATE TABLE IF NOT EXISTS `safar_entries` (
    `client_request_id` VARCHAR(36) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `request_type` VARCHAR(16) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(10) NOT NULL,
    `email` VARCHAR(254) NULL,
    `origin` VARCHAR(150) NOT NULL,
    `destination` VARCHAR(150) NOT NULL,
    `origin_key` VARCHAR(150) NOT NULL,
    `destination_key` VARCHAR(150) NOT NULL,
    `travel_date` DATE NOT NULL,
    `preferred_time` VARCHAR(5) NOT NULL,
    `item_details` TEXT NULL,
    `instructions` TEXT NULL,
    `notification_method` VARCHAR(16) NOT NULL,
    `lang` VARCHAR(2) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    `consent_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `safar_entries_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `safar_route_idx`(`origin_key`, `destination_key`, `travel_date`, `kind`, `status`),
    UNIQUE INDEX `safar_entries_user_id_client_request_id_key`(`user_id`, `client_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `safar_matches` (
    `id` VARCHAR(64) NOT NULL,
    `request_id` VARCHAR(64) NOT NULL,
    `offer_id` VARCHAR(64) NOT NULL,
    `request_accepted` BOOLEAN NOT NULL DEFAULT false,
    `offer_accepted` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PROPOSED',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `safar_matches_request_id_offer_id_key`(`request_id`, `offer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `safar_notices` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `match_id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `email_status` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `safar_notices_user_id_created_at_idx`(`user_id`, `created_at`),
    UNIQUE INDEX `safar_notices_user_id_match_id_kind_key`(`user_id`, `match_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Match the legacy users.id collation without changing existing member tables.
-- Some imported databases use utf8mb4_bin, while fresh databases use unicode_ci.
SET @safar_user_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id');
SET @safar_sql = CONCAT('ALTER TABLE `safar_entries` MODIFY `user_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @safar_user_collation, ' NOT NULL');
PREPARE safar_stmt FROM @safar_sql;
EXECUTE safar_stmt;
DEALLOCATE PREPARE safar_stmt;
SET @safar_sql = CONCAT('ALTER TABLE `safar_notices` MODIFY `user_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @safar_user_collation, ' NOT NULL');
PREPARE safar_stmt FROM @safar_sql;
EXECUTE safar_stmt;
DEALLOCATE PREPARE safar_stmt;

-- AddForeignKey
ALTER TABLE `safar_entries` ADD CONSTRAINT `safar_entries_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `safar_matches` ADD CONSTRAINT `safar_matches_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `safar_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `safar_matches` ADD CONSTRAINT `safar_matches_offer_id_fkey` FOREIGN KEY (`offer_id`) REFERENCES `safar_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `safar_notices` ADD CONSTRAINT `safar_notices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `safar_notices` ADD CONSTRAINT `safar_notices_match_id_fkey` FOREIGN KEY (`match_id`) REFERENCES `safar_matches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
