-- "NPS Family Heads" carousel and birthday wishes: every registered (ACTIVE) family is shown by default, and an
-- administrator hides the ones that should not appear (Admin → Families → "On website"). Until now the switch was off
-- for everyone, so the home page section stayed empty. Only this one column changes.
ALTER TABLE `families` ALTER COLUMN `show_on_home` SET DEFAULT true;
UPDATE `families` SET `show_on_home` = true WHERE `show_on_home` = false;
