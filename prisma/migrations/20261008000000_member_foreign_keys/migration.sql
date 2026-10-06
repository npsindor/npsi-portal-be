-- Members belong to an existing family / samiti; deleting one removes its members
-- (the admin screens already did that by hand). The production copy of
-- 2026-10-07 has no orphaned members, so these apply cleanly.

-- AddForeignKey
ALTER TABLE `family_members` ADD CONSTRAINT `family_members_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `families`(`family_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `samiti_members` ADD CONSTRAINT `samiti_members_samiti_id_fkey` FOREIGN KEY (`samiti_id`) REFERENCES `samitis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
