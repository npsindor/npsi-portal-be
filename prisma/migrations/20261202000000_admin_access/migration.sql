-- Role-based admin access: the super admin lets a registered family member handle chosen admin work (approve family /
-- student registrations, registration payments, family members) for chosen villages. One row per account.
-- No foreign key to users: the legacy users table uses a different collation on some servers (utf8mb4_bin), which
-- MariaDB refuses for a key; the API removes the row with the account instead.
-- Rollback: DROP TABLE `admin_access`;
CREATE TABLE `admin_access` (
  `user_id` VARCHAR(64) NOT NULL,
  `areas` JSON NOT NULL,
  `villages` JSON NOT NULL,
  `all_villages` BOOLEAN NOT NULL DEFAULT false,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `note` VARCHAR(500) NULL,
  `granted_by_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
