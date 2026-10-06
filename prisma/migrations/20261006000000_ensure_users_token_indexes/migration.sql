-- 0_init creates these indexes, but databases adopted from the legacy app
-- (baselined without running 0_init) can be missing them: the production copy
-- of 2026-10-05 has neither. MySQL has no CREATE INDEX IF NOT EXISTS, so each is
-- created only when absent.

SET @missing := (SELECT COUNT(*) = 0 FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'users_session_token_idx');
SET @ddl := IF(@missing, 'CREATE INDEX `users_session_token_idx` ON `users`(`session_token`(255))', 'DO 0');
PREPARE ensure_index FROM @ddl;
EXECUTE ensure_index;
DEALLOCATE PREPARE ensure_index;

SET @missing := (SELECT COUNT(*) = 0 FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'users_reset_token_idx');
SET @ddl := IF(@missing, 'CREATE INDEX `users_reset_token_idx` ON `users`(`reset_token_hash`(255))', 'DO 0');
PREPARE ensure_index FROM @ddl;
EXECUTE ensure_index;
DEALLOCATE PREPARE ensure_index;
