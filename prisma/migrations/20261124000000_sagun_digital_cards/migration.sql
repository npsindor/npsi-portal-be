-- Sagun Bandhan digital cards and printable booklet history. Additive only: two new tables, no change to existing rows.
-- Rollback: DROP TABLE `sagun_booklet_history`; DROP TABLE `sagun_digital_cards`;

-- CreateTable
CREATE TABLE `sagun_digital_cards` (
    `id` VARCHAR(64) NOT NULL,
    `profile_id` VARCHAR(64) NOT NULL,
    `serial` INTEGER NOT NULL,
    `profile_code` VARCHAR(24) NOT NULL,
    `verify_token` VARCHAR(64) NOT NULL,
    `design_version` INTEGER NOT NULL DEFAULT 1,
    `selected_for_booklet` BOOLEAN NOT NULL DEFAULT false,
    `last_published_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `sagun_digital_cards_profile_id_key`(`profile_id`),
    UNIQUE INDEX `sagun_digital_cards_serial_key`(`serial`),
    UNIQUE INDEX `sagun_digital_cards_profile_code_key`(`profile_code`),
    UNIQUE INDEX `sagun_digital_cards_verify_token_key`(`verify_token`),
    INDEX `sagun_digital_cards_selected_for_booklet_idx`(`selected_for_booklet`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sagun_booklet_history` (
    `id` VARCHAR(64) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `edition` VARCHAR(100) NOT NULL DEFAULT '',
    `profile_ids` JSON NOT NULL,
    `card_layout` INTEGER NOT NULL,
    `grouping` VARCHAR(16) NOT NULL,
    `include_cover` BOOLEAN NOT NULL,
    `include_index` BOOLEAN NOT NULL,
    `total_profiles` INTEGER NOT NULL,
    `total_pages` INTEGER NOT NULL,
    `pdf_filename` VARCHAR(120) NULL,
    `pdf_size` INTEGER NULL,
    `generated_by` VARCHAR(64) NOT NULL,
    `generated_by_name` VARCHAR(150) NOT NULL DEFAULT '',
    `generated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `sagun_booklet_history_generated_at_idx`(`generated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sagun_digital_cards` ADD CONSTRAINT `sagun_digital_cards_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `sagun_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
