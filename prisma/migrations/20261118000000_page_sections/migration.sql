-- Single-page sections for Events & Programs and Community Services.

-- AlterTable: which Events & Programs section an event belongs to.
ALTER TABLE `events` ADD COLUMN `category` VARCHAR(16) NOT NULL DEFAULT 'GENERAL';
-- Place existing events the way the old page filtered them (by title).
UPDATE `events` SET `category` = 'GARBA' WHERE LOWER(`title`) LIKE '%garba%' OR `title_hi` LIKE '%गरबा%';
UPDATE `events` SET `category` = 'CULTURAL'
    WHERE `category` = 'GENERAL'
      AND (LOWER(`title`) LIKE '%cultural%' OR LOWER(`title`) LIKE '%diwali%' OR LOWER(`title`) LIKE '%deepotsav%'
           OR `title_hi` LIKE '%सांस्कृतिक%' OR `title_hi` LIKE '%दीपावली%' OR `title_hi` LIKE '%दीपोत्सव%');

-- CreateTable
CREATE TABLE `community_posts` (
    `id` VARCHAR(64) NOT NULL,
    `section` VARCHAR(24) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `title_hi` VARCHAR(200) NULL,
    `body` VARCHAR(1500) NULL,
    `body_hi` VARCHAR(1500) NULL,
    `image_url` VARCHAR(500) NULL,
    `event_date` DATE NULL,
    `location` VARCHAR(200) NULL,
    `location_hi` VARCHAR(200) NULL,
    `contact_name` VARCHAR(120) NULL,
    `contact_phone` VARCHAR(20) NULL,
    `link_url` VARCHAR(500) NULL,
    `cta_label` VARCHAR(80) NULL,
    `cta_label_hi` VARCHAR(80) NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `community_posts_section_active_sort_order_idx`(`section`, `active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
