-- Account-first registration: mobile OTP challenges, applications owned by a user account,
-- UPI payment proof and admin payment review, notifications addressed to a user, and
-- admin-managed address lists (areas, PIN codes, villages).

-- CreateTable
CREATE TABLE `otp_challenges` (
    `id` VARCHAR(64) NOT NULL,
    `mobile_digits` VARCHAR(10) NOT NULL,
    `purpose` VARCHAR(16) NOT NULL,
    `code_hash` VARCHAR(64) NOT NULL,
    `channel` VARCHAR(16) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(0) NOT NULL,
    `verified_at` DATETIME(0) NULL,
    `token_hash` VARCHAR(64) NULL,
    `token_expires_at` DATETIME(0) NULL,
    `used_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `otp_challenges_mobile_digits_purpose_created_at_idx`(`mobile_digits`, `purpose`, `created_at`),
    UNIQUE INDEX `otp_challenges_token_hash_key`(`token_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: the account that submitted an application, and the language to notify it in.
ALTER TABLE `applications` ADD COLUMN `user_id` VARCHAR(64) NULL, ADD COLUMN `lang` VARCHAR(4) NULL;
ALTER TABLE `student_applications` ADD COLUMN `user_id` VARCHAR(64) NULL, ADD COLUMN `lang` VARCHAR(4) NULL;
CREATE INDEX `applications_user_id_idx` ON `applications`(`user_id`);
CREATE INDEX `student_applications_user_id_idx` ON `student_applications`(`user_id`);

-- AlterTable: the account that owns an approved family / student record.
ALTER TABLE `families` ADD COLUMN `owner_user_id` VARCHAR(64) NULL;
ALTER TABLE `students` ADD COLUMN `user_id` VARCHAR(64) NULL;
CREATE INDEX `families_owner_user_id_idx` ON `families`(`owner_user_id`);
CREATE INDEX `students_user_id_idx` ON `students`(`user_id`);

-- AlterTable: UPI payment proof and the admin's payment decision.
ALTER TABLE `transactions`
    ADD COLUMN `screenshot_file` VARCHAR(120) NULL,
    ADD COLUMN `utr` VARCHAR(40) NULL,
    ADD COLUMN `admin_remarks` TEXT NULL,
    ADD COLUMN `reviewed_by` VARCHAR(64) NULL,
    ADD COLUMN `reviewed_at` DATETIME(0) NULL;
CREATE INDEX `transactions_reference_id_idx` ON `transactions`(`reference_id`);

-- AlterTable: notifications for one account (applicants before their family/student record exists).
ALTER TABLE `notifications` ADD COLUMN `recipient_user_id` VARCHAR(64) NULL;
CREATE INDEX `notifications_recipient_user_id_idx` ON `notifications`(`recipient_user_id`, `date`);

-- CreateTable
CREATE TABLE `address_options` (
    `id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `city` VARCHAR(64) NOT NULL DEFAULT '',
    `value` VARCHAR(150) NOT NULL,
    `label_hi` VARCHAR(150) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `address_options_kind_city_value_key`(`kind`, `city`, `value`),
    INDEX `address_options_kind_city_active_idx`(`kind`, `city`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Indore city PIN codes as a starting list; admins can add, correct or deactivate entries.
INSERT INTO `address_options` (`id`, `kind`, `city`, `value`, `sort_order`) VALUES
    ('pin-indore-452001', 'PINCODE', 'Indore', '452001', 1),
    ('pin-indore-452002', 'PINCODE', 'Indore', '452002', 2),
    ('pin-indore-452003', 'PINCODE', 'Indore', '452003', 3),
    ('pin-indore-452005', 'PINCODE', 'Indore', '452005', 5),
    ('pin-indore-452006', 'PINCODE', 'Indore', '452006', 6),
    ('pin-indore-452007', 'PINCODE', 'Indore', '452007', 7),
    ('pin-indore-452008', 'PINCODE', 'Indore', '452008', 8),
    ('pin-indore-452009', 'PINCODE', 'Indore', '452009', 9),
    ('pin-indore-452010', 'PINCODE', 'Indore', '452010', 10),
    ('pin-indore-452011', 'PINCODE', 'Indore', '452011', 11),
    ('pin-indore-452012', 'PINCODE', 'Indore', '452012', 12),
    ('pin-indore-452013', 'PINCODE', 'Indore', '452013', 13),
    ('pin-indore-452014', 'PINCODE', 'Indore', '452014', 14),
    ('pin-indore-452015', 'PINCODE', 'Indore', '452015', 15),
    ('pin-indore-452016', 'PINCODE', 'Indore', '452016', 16),
    ('pin-indore-452018', 'PINCODE', 'Indore', '452018', 18),
    ('pin-indore-452020', 'PINCODE', 'Indore', '452020', 20);
