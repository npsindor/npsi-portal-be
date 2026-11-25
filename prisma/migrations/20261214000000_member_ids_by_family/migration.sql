-- Member ids carry their family's number: family NPSI-FAM-000001 → NPSI-MEB-00000101 (the head), NPSI-MEB-00000102, …
-- (NPSI-MEB- + the family's 6-digit number + the member's 2-digit place in the family). Every existing member is
-- renumbered (head first, then in the order they were added) and the copies of its id follow:
-- event roster, linked students and student applications, Sehat Saathi MRs, and open member transfer requests
-- (decided requests keep the id they had, as history). Families whose id has no number keep the old ids. Two families
-- with the same number (e.g. PSI-FAM-000001 and NPSI-FAM-000001) share one numbered series, so no id repeats.
-- Comparisons use BINARY so columns with different collations can be matched.

CREATE TABLE `_member_id_map` (
  `id` VARCHAR(64) NOT NULL,
  `family_id` VARCHAR(255) NOT NULL,
  `old_id` VARCHAR(255) NULL,
  `new_id` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

INSERT INTO `_member_id_map` (`id`, `family_id`, `old_id`, `new_id`)
SELECT ranked.id, ranked.family_id, ranked.old_id,
       CONCAT('NPSI-MEB-', LPAD(ranked.num, GREATEST(6, CHAR_LENGTH(ranked.num)), '0'),
              LPAD(ranked.serial, GREATEST(2, CHAR_LENGTH(ranked.serial)), '0'))
FROM (
  SELECT m.id, m.family_id, m.membership_id AS old_id, f.num,
         CAST(ROW_NUMBER() OVER (
           PARTITION BY f.num
           ORDER BY (LEFT(m.family_id, 9) = 'NPSI-FAM-') DESC, m.family_id,
                    (LOWER(TRIM(m.relationship)) IN ('head', 'self')) DESC, m.created_at, m.membership_id, m.id
         ) AS CHAR) AS serial
  FROM `family_members` m
  JOIN (
    SELECT family_id, CAST(CAST(REGEXP_SUBSTR(family_id, '[0-9]+$') AS UNSIGNED) AS CHAR) AS num
    FROM `families`
    WHERE family_id REGEXP '[0-9]+$'
  ) f ON BINARY f.family_id = BINARY m.family_id
) ranked;

UPDATE `family_members` m JOIN `_member_id_map` x ON BINARY x.id = BINARY m.id SET m.membership_id = x.new_id;

UPDATE `event_roster` r JOIN `_member_id_map` x ON BINARY x.id = BINARY r.member_id SET r.membership_id = x.new_id;

UPDATE `students` s JOIN `_member_id_map` x
  ON BINARY x.old_id = BINARY s.linked_membership_id AND BINARY x.family_id = BINARY s.linked_family_id
SET s.linked_membership_id = x.new_id;

UPDATE `student_applications` a JOIN `_member_id_map` x
  ON BINARY x.old_id = BINARY a.linked_membership_id AND BINARY x.family_id = BINARY a.linked_family_id
SET a.linked_membership_id = x.new_id;

UPDATE `transfer_requests` t JOIN `_member_id_map` x
  ON BINARY x.old_id = BINARY t.source_membership_id AND BINARY x.family_id = BINARY t.source_family_id
SET t.source_membership_id = x.new_id,
    t.open_key = IF(t.open_key IS NULL, NULL, CONCAT('M:', x.new_id))
WHERE t.status IN ('PENDING', 'CORRECTION_REQUIRED');

-- An MR is matched by the old id only where that id belonged to a single member.
UPDATE `sehat_mrs` s JOIN (
  SELECT old_id, MIN(new_id) AS new_id FROM `_member_id_map` WHERE old_id IS NOT NULL GROUP BY old_id HAVING COUNT(*) = 1
) x ON BINARY x.old_id = BINARY s.membership_id
SET s.membership_id = x.new_id;

DROP TABLE `_member_id_map`;
