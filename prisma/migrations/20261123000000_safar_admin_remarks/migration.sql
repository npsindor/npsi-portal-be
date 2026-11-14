-- Transportation (Safar Saathi) administration: remarks from the Sangathan on a request, and when it was last reviewed.
ALTER TABLE `safar_entries`
    ADD COLUMN `admin_remarks` VARCHAR(500) NULL,
    ADD COLUMN `reviewed_at` DATETIME(0) NULL;

CREATE INDEX `safar_entries_status_created_at_idx` ON `safar_entries`(`status`, `created_at`);
