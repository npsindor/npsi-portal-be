-- An account made when an administrator approved a registration starts as "invited" and stayed so even after its owner
-- signed in, so member services treated registered members as unregistered. Signing in now activates it; this does the
-- same for accounts that have already signed in (they have a session). Only the status of those rows changes.
UPDATE `users` SET `status` = 'active' WHERE `status` = 'invited' AND EXISTS (SELECT 1 FROM `sessions` s WHERE s.`user_id` = `users`.`id`);
