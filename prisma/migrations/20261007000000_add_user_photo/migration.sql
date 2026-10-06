-- Profile photo of a portal user (an /uploads/ URL), set from the member's settings page.
ALTER TABLE `users` ADD COLUMN `photo_url` TEXT NULL;
