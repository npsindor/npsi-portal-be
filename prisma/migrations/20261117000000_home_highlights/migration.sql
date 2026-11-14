-- Admin-managed homepage "Community highlights": text slider and media slider (images, videos, text, sponsored ads).

-- CreateTable
CREATE TABLE `home_highlights` (
    `id` VARCHAR(64) NOT NULL,
    `slider` VARCHAR(8) NOT NULL,
    `media_type` VARCHAR(8) NOT NULL DEFAULT 'TEXT',
    `sponsored` BOOLEAN NOT NULL DEFAULT false,
    `eyebrow` VARCHAR(80) NULL,
    `eyebrow_hi` VARCHAR(80) NULL,
    `title` VARCHAR(200) NOT NULL,
    `title_hi` VARCHAR(200) NULL,
    `body` VARCHAR(600) NULL,
    `body_hi` VARCHAR(600) NULL,
    `media_url` VARCHAR(500) NULL,
    `link_url` VARCHAR(500) NULL,
    `cta_label` VARCHAR(80) NULL,
    `cta_label_hi` VARCHAR(80) NULL,
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `home_highlights_slider_active_sort_order_idx`(`slider`, `active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
