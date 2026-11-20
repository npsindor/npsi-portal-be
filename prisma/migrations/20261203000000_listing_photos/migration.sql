-- Room hunting listings may carry several photographs (shown as a carousel). photo_url stays the first one.
ALTER TABLE `rental_listings` ADD COLUMN `photo_urls` JSON NULL;
