-- CreateIndex
CREATE INDEX `families_email_idx` ON `families`(`email`);

-- CreateIndex
CREATE INDEX `family_members_email_idx` ON `family_members`(`email`);

-- CreateIndex
CREATE INDEX `family_members_membership_idx` ON `family_members`(`membership_id`);

-- CreateIndex
CREATE INDEX `feedback_email_idx` ON `feedback`(`email`);

-- CreateIndex
CREATE INDEX `students_email_idx` ON `students`(`email`);
