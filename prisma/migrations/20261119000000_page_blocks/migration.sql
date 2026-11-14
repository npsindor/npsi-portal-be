-- Admin-managed content (text, images, videos, cards) for every public menu page.

-- CreateTable
CREATE TABLE `page_blocks` (
    `id` VARCHAR(64) NOT NULL,
    `page` VARCHAR(32) NOT NULL,
    `section` VARCHAR(40) NOT NULL,
    `role` VARCHAR(8) NOT NULL DEFAULT 'ITEM',
    `title` VARCHAR(200) NULL,
    `title_hi` VARCHAR(200) NULL,
    `subtitle` VARCHAR(200) NULL,
    `subtitle_hi` VARCHAR(200) NULL,
    `body` TEXT NULL,
    `body_hi` TEXT NULL,
    `media_type` VARCHAR(8) NOT NULL DEFAULT 'NONE',
    `media_url` VARCHAR(500) NULL,
    `link_url` VARCHAR(500) NULL,
    `cta_label` VARCHAR(80) NULL,
    `cta_label_hi` VARCHAR(80) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `page_blocks_page_section_active_sort_order_idx`(`page`, `section`, `active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
