-- Travel & Assistance: direct requests made from Available Journeys & Requests point at the entry they answer.
ALTER TABLE `safar_entries` ADD COLUMN `target_entry_id` VARCHAR(64) NULL;
CREATE INDEX `safar_entries_target_entry_id_idx` ON `safar_entries`(`target_entry_id`);
