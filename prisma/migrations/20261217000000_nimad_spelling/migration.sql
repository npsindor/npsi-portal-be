-- The region is spelt "Nimad" across the portal (was "Nimar"): the English text admins entered in events,
-- announcements, page content and home highlights follows. REPLACE is case-sensitive; Hindi text already reads निमाड़.
UPDATE `events` SET
  `title` = REPLACE(REPLACE(`title`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `description` = REPLACE(REPLACE(`description`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `venue` = REPLACE(REPLACE(`venue`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `organizer` = REPLACE(REPLACE(`organizer`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `rules` = REPLACE(REPLACE(`rules`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `terms` = REPLACE(REPLACE(`terms`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD');

UPDATE `announcements` SET
  `title` = REPLACE(REPLACE(`title`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `body` = REPLACE(REPLACE(`body`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `author` = REPLACE(REPLACE(`author`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD');

UPDATE `page_blocks` SET
  `title` = REPLACE(REPLACE(`title`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `subtitle` = REPLACE(REPLACE(`subtitle`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `body` = REPLACE(REPLACE(`body`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `cta_label` = REPLACE(REPLACE(`cta_label`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD');

UPDATE `home_highlights` SET
  `eyebrow` = REPLACE(REPLACE(`eyebrow`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `title` = REPLACE(REPLACE(`title`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `body` = REPLACE(REPLACE(`body`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD'),
  `cta_label` = REPLACE(REPLACE(`cta_label`, 'Nimar', 'Nimad'), 'NIMAR', 'NIMAD');
