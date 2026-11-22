-- Blood Help Network (Community Services → Blood Donor): donors and blood requests.
-- New tables only; nothing existing is changed. Donor name, mobile and city are read from the member's own account and
-- family record (not copied here). user ids are plain columns (no FK to the legacy users table), as in rental_listings.

CREATE TABLE IF NOT EXISTS `blood_donors` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `blood_group` VARCHAR(3) NOT NULL,
    `last_donation_date` DATE NULL,
    `available` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `blood_donors_user_id_key`(`user_id`),
    INDEX `blood_donors_blood_group_available_idx`(`blood_group`, `available`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blood_requests` (
    `id` VARCHAR(64) NOT NULL,
    `reference` VARCHAR(20) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `patient_name` VARCHAR(150) NOT NULL,
    `blood_group` VARCHAR(3) NOT NULL,
    `units` INTEGER NOT NULL,
    `hospital` VARCHAR(200) NOT NULL,
    `city` VARCHAR(150) NOT NULL,
    `contact_name` VARCHAR(150) NOT NULL,
    `contact_phone` VARCHAR(10) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS',
    `completed_at` DATETIME(0) NULL,
    `completed_by_id` VARCHAR(64) NULL,
    `completion_source` VARCHAR(16) NULL,
    `last_prompted_at` DATETIME(0) NULL,
    `history` JSON NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `blood_requests_reference_key`(`reference`),
    INDEX `blood_requests_status_created_at_idx`(`status`, `created_at`),
    INDEX `blood_requests_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
