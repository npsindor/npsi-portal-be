-- Audit log: every deletion made through the website or app (by any member or administrator) — who, when, what, and a
-- copy of the deleted record. Only the super admin can read it, and there is no way to delete or edit entries.
-- New table only; nothing existing is changed. actor_user_id is a plain column (no FK to the legacy users table).
CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` VARCHAR(64) NOT NULL,
    `action` VARCHAR(16) NOT NULL,
    `resource` VARCHAR(80) NOT NULL,
    `record_id` VARCHAR(255) NULL,
    `label` VARCHAR(255) NULL,
    `path` VARCHAR(500) NOT NULL,
    `actor_user_id` VARCHAR(64) NULL,
    `actor_name` VARCHAR(255) NULL,
    `actor_email` VARCHAR(255) NULL,
    `actor_role` VARCHAR(24) NULL,
    `snapshot` JSON NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `audit_logs_created_at_idx`(`created_at`),
    INDEX `audit_logs_resource_created_at_idx`(`resource`, `created_at`),
    INDEX `audit_logs_actor_user_id_idx`(`actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
