-- Room Hunting: rental listings, room requirements, their matches, enquiries and an audit log.
-- New tables only; existing tables are not touched. user/member ids are plain columns (no FK to the legacy tables,
-- whose collation differs between databases), as in safar_entries.

CREATE TABLE IF NOT EXISTS `rental_listings` (
    `id` VARCHAR(64) NOT NULL,
    `reference` VARCHAR(20) NOT NULL,
    `client_request_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `member_id` VARCHAR(64) NULL,
    `family_id` VARCHAR(255) NULL,
    `student_id` VARCHAR(255) NULL,
    `property_type` VARCHAR(60) NOT NULL,
    `type_key` VARCHAR(60) NOT NULL,
    `available_for` VARCHAR(16) NOT NULL DEFAULT 'ANY',
    `rent_amount` INTEGER NOT NULL,
    `area` VARCHAR(150) NOT NULL,
    `area_key` VARCHAR(150) NOT NULL,
    `address` VARCHAR(500) NULL,
    `show_address` BOOLEAN NOT NULL DEFAULT false,
    `available_from` DATE NULL,
    `description` TEXT NULL,
    `photo_url` VARCHAR(500) NULL,
    `contact_name` VARCHAR(150) NOT NULL,
    `contact_mobile` VARCHAR(10) NOT NULL,
    `contact_email` VARCHAR(254) NULL,
    `show_mobile` BOOLEAN NOT NULL DEFAULT false,
    `show_email` BOOLEAN NOT NULL DEFAULT false,
    `owner_confirmed` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `admin_remarks` VARCHAR(500) NULL,
    `approved_at` DATETIME(0) NULL,
    `expires_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `rental_listings_reference_key`(`reference`),
    UNIQUE INDEX `rental_listings_user_id_client_request_id_key`(`user_id`, `client_request_id`),
    INDEX `rental_listings_status_type_key_area_key_rent_amount_idx`(`status`, `type_key`, `area_key`, `rent_amount`),
    INDEX `rental_listings_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rental_requirements` (
    `id` VARCHAR(64) NOT NULL,
    `reference` VARCHAR(20) NOT NULL,
    `client_request_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(64) NULL,
    `name` VARCHAR(150) NOT NULL,
    `mobile` VARCHAR(10) NOT NULL,
    `email` VARCHAR(254) NULL,
    `property_type` VARCHAR(60) NOT NULL,
    `type_key` VARCHAR(60) NOT NULL,
    `tenant_type` VARCHAR(16) NOT NULL DEFAULT 'ANY',
    `area` VARCHAR(150) NOT NULL,
    `area_key` VARCHAR(150) NOT NULL,
    `min_budget` INTEGER NULL,
    `max_budget` INTEGER NOT NULL,
    `move_in_date` DATE NULL,
    `note` VARCHAR(1000) NULL,
    `show_mobile` BOOLEAN NOT NULL DEFAULT false,
    `show_email` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `admin_remarks` VARCHAR(500) NULL,
    `expires_at` DATETIME(0) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `rental_requirements_reference_key`(`reference`),
    UNIQUE INDEX `rental_requirements_mobile_client_request_id_key`(`mobile`, `client_request_id`),
    INDEX `rental_requirements_status_type_key_area_key_max_budget_idx`(`status`, `type_key`, `area_key`, `max_budget`),
    INDEX `rental_requirements_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rental_matches` (
    `id` VARCHAR(64) NOT NULL,
    `requirement_id` VARCHAR(64) NOT NULL,
    `listing_id` VARCHAR(64) NOT NULL,
    `score` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'NEW',
    `email_status` VARCHAR(16) NOT NULL DEFAULT 'NOT_SENT',
    `notified_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `rental_matches_requirement_id_listing_id_key`(`requirement_id`, `listing_id`),
    INDEX `rental_matches_listing_id_created_at_idx`(`listing_id`, `created_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `rental_matches_requirement_id_fkey` FOREIGN KEY (`requirement_id`) REFERENCES `rental_requirements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `rental_matches_listing_id_fkey` FOREIGN KEY (`listing_id`) REFERENCES `rental_listings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rental_enquiries` (
    `id` VARCHAR(64) NOT NULL,
    `listing_id` VARCHAR(64) NOT NULL,
    `requirement_id` VARCHAR(64) NULL,
    `requester_user_id` VARCHAR(64) NOT NULL,
    `requester_name` VARCHAR(150) NOT NULL,
    `requester_mobile` VARCHAR(10) NOT NULL,
    `message` VARCHAR(1000) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `rental_enquiries_listing_id_requester_user_id_key`(`listing_id`, `requester_user_id`),
    INDEX `rental_enquiries_requester_user_id_created_at_idx`(`requester_user_id`, `created_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `rental_enquiries_listing_id_fkey` FOREIGN KEY (`listing_id`) REFERENCES `rental_listings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `rental_enquiries_requirement_id_fkey` FOREIGN KEY (`requirement_id`) REFERENCES `rental_requirements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rental_audit_logs` (
    `id` VARCHAR(64) NOT NULL,
    `actor_user_id` VARCHAR(64) NULL,
    `action` VARCHAR(40) NOT NULL,
    `entity` VARCHAR(16) NOT NULL,
    `entity_id` VARCHAR(64) NOT NULL,
    `remarks` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `rental_audit_logs_entity_entity_id_created_at_idx`(`entity`, `entity_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
