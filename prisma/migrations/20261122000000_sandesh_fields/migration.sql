-- Sandesh (news): category, featured image, URL slug, author and scheduled publication. Existing rows keep working:
-- all new columns are nullable, and an empty publish_at means "published as soon as Active".
ALTER TABLE `announcements`
    ADD COLUMN `category` VARCHAR(40) NULL,
    ADD COLUMN `image_url` VARCHAR(500) NULL,
    ADD COLUMN `slug` VARCHAR(220) NULL,
    ADD COLUMN `author` VARCHAR(150) NULL,
    ADD COLUMN `publish_at` DATETIME(0) NULL;

CREATE UNIQUE INDEX `announcements_slug_key` ON `announcements`(`slug`);
CREATE INDEX `announcements_status_publish_at_idx` ON `announcements`(`status`, `publish_at`);
