-- Account email change (Settings → Change email): the new address waits until the code sent to it is entered.
ALTER TABLE `users`
  ADD COLUMN `pending_email` VARCHAR(255) NULL,
  ADD COLUMN `pending_email_code_hash` VARCHAR(64) NULL,
  ADD COLUMN `pending_email_expires_at` DATETIME(0) NULL,
  ADD COLUMN `pending_email_attempts` INTEGER NOT NULL DEFAULT 0;
