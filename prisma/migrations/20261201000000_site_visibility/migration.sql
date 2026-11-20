-- Which public pages and homepage sections are switched off by an admin. A key that has no row is shown.
-- Rollback: DROP TABLE `site_visibility`;
CREATE TABLE `site_visibility` (
  `key` VARCHAR(120) NOT NULL,
  `visible` BOOLEAN NOT NULL DEFAULT true,
  `updated_by_id` VARCHAR(64) NULL,
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
