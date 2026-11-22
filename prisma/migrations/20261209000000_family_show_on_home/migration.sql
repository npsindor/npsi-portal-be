-- Home page "Sangathan Family Heads" carousel and "Today Birthday" wishes: an administrator chooses which families
-- appear on the public website. Off for every family until an administrator turns it on.
ALTER TABLE `families` ADD COLUMN `show_on_home` BOOLEAN NOT NULL DEFAULT false;
