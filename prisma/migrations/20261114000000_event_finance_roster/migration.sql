CREATE TABLE `event_expense_categories` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `event_expense_categories_name_key` (`name`),
  INDEX `event_expense_categories_active_sort_idx` (`active`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `event_contributions` (
  `id` VARCHAR(64) NOT NULL,
  `event_id` VARCHAR(64) NOT NULL,
  `member_id` VARCHAR(64) NULL,
  `member_name` VARCHAR(255) NOT NULL,
  `family_id` VARCHAR(255) NULL,
  `village` VARCHAR(255) NULL,
  `mobile` VARCHAR(20) NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `payment_mode` VARCHAR(32) NOT NULL,
  `payment_reference` VARCHAR(128) NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `contributed_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `created_by_id` VARCHAR(64) NOT NULL,
  `updated_by_id` VARCHAR(64) NULL,
  `deleted_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `event_contributions_payment_reference_key` (`payment_reference`),
  INDEX `event_contributions_event_status_date_idx` (`event_id`, `status`, `contributed_at`),
  INDEX `event_contributions_village_idx` (`village`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `event_expenses` (
  `id` VARCHAR(64) NOT NULL,
  `event_id` VARCHAR(64) NOT NULL,
  `category_id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `vendor_name` VARCHAR(255) NULL,
  `vendor_mobile` VARCHAR(20) NULL,
  `invoice_number` VARCHAR(128) NULL,
  `expense_date` DATETIME(0) NOT NULL,
  `payment_mode` VARCHAR(32) NOT NULL,
  `payment_reference` VARCHAR(128) NULL,
  `receipt_url` TEXT NULL,
  `notes` TEXT NULL,
  `payment_status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `approved_by_id` VARCHAR(64) NULL,
  `approved_at` DATETIME(0) NULL,
  `created_by_id` VARCHAR(64) NOT NULL,
  `updated_by_id` VARCHAR(64) NULL,
  `deleted_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  INDEX `event_expenses_event_status_date_idx` (`event_id`, `status`, `expense_date`),
  INDEX `event_expenses_category_idx` (`category_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `event_expenses_category_fkey` FOREIGN KEY (`category_id`) REFERENCES `event_expense_categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `event_teams` (
  `id` VARCHAR(64) NOT NULL,
  `event_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `leader_name` VARCHAR(255) NULL,
  `leader_mobile` VARCHAR(20) NULL,
  `responsibilities` TEXT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  `created_by_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `event_teams_event_name_key` (`event_id`, `name`),
  INDEX `event_teams_event_status_idx` (`event_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `event_roster` (
  `id` VARCHAR(64) NOT NULL,
  `event_id` VARCHAR(64) NOT NULL,
  `member_id` VARCHAR(64) NULL,
  `team_id` VARCHAR(64) NULL,
  `member_name` VARCHAR(255) NOT NULL,
  `father_name` VARCHAR(255) NULL,
  `village` VARCHAR(255) NULL,
  `mobile` VARCHAR(20) NULL,
  `family_id` VARCHAR(255) NULL,
  `membership_id` VARCHAR(255) NULL,
  `committee` VARCHAR(160) NULL,
  `responsibility` VARCHAR(255) NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  `created_by_id` VARCHAR(64) NOT NULL,
  `updated_by_id` VARCHAR(64) NULL,
  `deleted_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `event_roster_event_member_key` (`event_id`, `member_id`),
  INDEX `event_roster_event_village_idx` (`event_id`, `village`),
  INDEX `event_roster_event_status_idx` (`event_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `event_roster_team_fkey` FOREIGN KEY (`team_id`) REFERENCES `event_teams` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `event_responsibilities` (
  `id` VARCHAR(64) NOT NULL,
  `event_id` VARCHAR(64) NOT NULL,
  `roster_id` VARCHAR(64) NOT NULL,
  `team_id` VARCHAR(64) NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `assigned_by_id` VARCHAR(64) NOT NULL,
  `start_date` DATETIME(0) NULL,
  `deadline` DATETIME(0) NULL,
  `priority` VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
  `status` VARCHAR(24) NOT NULL DEFAULT 'ASSIGNED',
  `remarks` TEXT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  INDEX `event_responsibilities_event_status_deadline_idx` (`event_id`, `status`, `deadline`),
  PRIMARY KEY (`id`),
  CONSTRAINT `event_responsibilities_roster_fkey` FOREIGN KEY (`roster_id`) REFERENCES `event_roster` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `event_responsibilities_team_fkey` FOREIGN KEY (`team_id`) REFERENCES `event_teams` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `roster_import_history` (
  `id` VARCHAR(64) NOT NULL,
  `event_id` VARCHAR(64) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `total_rows` INTEGER NOT NULL,
  `imported_count` INTEGER NOT NULL,
  `failed_count` INTEGER NOT NULL,
  `report` JSON NOT NULL,
  `created_by_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `roster_import_history_event_date_idx` (`event_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `event_financial_audit_logs` (
  `id` VARCHAR(64) NOT NULL,
  `event_id` VARCHAR(64) NOT NULL,
  `entity_type` VARCHAR(32) NOT NULL,
  `entity_id` VARCHAR(64) NOT NULL,
  `action` VARCHAR(24) NOT NULL,
  `actor_id` VARCHAR(64) NOT NULL,
  `before` JSON NULL,
  `after` JSON NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `event_financial_audit_event_date_idx` (`event_id`, `created_at`),
  INDEX `event_financial_audit_entity_idx` (`entity_type`, `entity_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `event_expense_categories` (`id`, `name`, `active`, `sort_order`, `created_at`, `updated_at`) VALUES
('ec-dj-sound', 'DJ & Sound System', true, 1, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-photo-video', 'Photographer & Videography', true, 2, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-stage-deco', 'Interior & Stage Decoration', true, 3, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-venue-rent', 'Garden / Venue Rent', true, 4, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-catering', 'Halwai & Catering Charges', true, 5, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-grocery', 'Kirana & Grocery Materials', true, 6, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-dairy', 'Milk & Dairy Products', true, 7, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-vegetables', 'Vegetable & Fruit Supplies', true, 8, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-mandi', 'Mandi Materials', true, 9, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-tent-seating', 'Tent & Seating Arrangements', true, 10, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-flex-banner', 'Flex, Banner & Advertisement', true, 11, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-print-garlands', 'Printing & Welcome Garlands', true, 12, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-music', 'Music System', true, 13, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-security', 'Security Guards', true, 14, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-helpers', 'Helpers & Sweeper Charges', true, 15, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-prasadi', 'Prasadi & Food Distribution', true, 16, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-storage', 'Hard Disk & Data Storage', true, 17, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-playzone', 'Mickey Mouse / Play Zone', true, 18, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-lighting', 'Lighting & Electrical Decoration', true, 19, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-electricity', 'Electricity Charges', true, 20, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-generator', 'Generator & Power Backup', true, 21, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-water', 'Water Supply', true, 22, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-transport', 'Transportation & Vehicle Charges', true, 23, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-stage-furniture', 'Stage & Furniture Arrangements', true, 24, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-hospitality', 'Guest Hospitality', true, 25, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-cleaning', 'Cleaning & Waste Management', true, 26, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-medical', 'Medical & First Aid Arrangements', true, 27, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-permission', 'Permission & Administrative Charges', true, 28, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
('ec-misc', 'Miscellaneous / Extra Expenses', true, 29, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0));

-- Match the collation of events.id / family_members.id before adding the foreign keys:
-- imported (legacy) databases use utf8mb4_bin, fresh databases (0_init) use utf8mb4_unicode_ci.
SET @event_id_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME = 'id');
SET @member_id_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'family_members' AND COLUMN_NAME = 'id');
SET @finance_sql = CONCAT('ALTER TABLE `event_contributions` MODIFY `event_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @event_id_collation, ' NOT NULL');
PREPARE finance_stmt FROM @finance_sql;
EXECUTE finance_stmt;
DEALLOCATE PREPARE finance_stmt;
SET @finance_sql = CONCAT('ALTER TABLE `event_contributions` MODIFY `member_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @member_id_collation, ' NULL');
PREPARE finance_stmt FROM @finance_sql;
EXECUTE finance_stmt;
DEALLOCATE PREPARE finance_stmt;
SET @finance_sql = CONCAT('ALTER TABLE `event_expenses` MODIFY `event_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @event_id_collation, ' NOT NULL');
PREPARE finance_stmt FROM @finance_sql;
EXECUTE finance_stmt;
DEALLOCATE PREPARE finance_stmt;
SET @finance_sql = CONCAT('ALTER TABLE `event_teams` MODIFY `event_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @event_id_collation, ' NOT NULL');
PREPARE finance_stmt FROM @finance_sql;
EXECUTE finance_stmt;
DEALLOCATE PREPARE finance_stmt;
SET @finance_sql = CONCAT('ALTER TABLE `event_roster` MODIFY `event_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @event_id_collation, ' NOT NULL');
PREPARE finance_stmt FROM @finance_sql;
EXECUTE finance_stmt;
DEALLOCATE PREPARE finance_stmt;
SET @finance_sql = CONCAT('ALTER TABLE `event_roster` MODIFY `member_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @member_id_collation, ' NULL');
PREPARE finance_stmt FROM @finance_sql;
EXECUTE finance_stmt;
DEALLOCATE PREPARE finance_stmt;
SET @finance_sql = CONCAT('ALTER TABLE `event_responsibilities` MODIFY `event_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @event_id_collation, ' NOT NULL');
PREPARE finance_stmt FROM @finance_sql;
EXECUTE finance_stmt;
DEALLOCATE PREPARE finance_stmt;
SET @finance_sql = CONCAT('ALTER TABLE `roster_import_history` MODIFY `event_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @event_id_collation, ' NOT NULL');
PREPARE finance_stmt FROM @finance_sql;
EXECUTE finance_stmt;
DEALLOCATE PREPARE finance_stmt;
SET @finance_sql = CONCAT('ALTER TABLE `event_financial_audit_logs` MODIFY `event_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE ', @event_id_collation, ' NOT NULL');
PREPARE finance_stmt FROM @finance_sql;
EXECUTE finance_stmt;
DEALLOCATE PREPARE finance_stmt;

-- AddForeignKey
ALTER TABLE `event_contributions` ADD CONSTRAINT `event_contributions_event_fkey` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `event_contributions` ADD CONSTRAINT `event_contributions_member_fkey` FOREIGN KEY (`member_id`) REFERENCES `family_members` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `event_expenses` ADD CONSTRAINT `event_expenses_event_fkey` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `event_teams` ADD CONSTRAINT `event_teams_event_fkey` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `event_roster` ADD CONSTRAINT `event_roster_event_fkey` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `event_roster` ADD CONSTRAINT `event_roster_member_fkey` FOREIGN KEY (`member_id`) REFERENCES `family_members` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `event_responsibilities` ADD CONSTRAINT `event_responsibilities_event_fkey` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `roster_import_history` ADD CONSTRAINT `roster_import_history_event_fkey` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `event_financial_audit_logs` ADD CONSTRAINT `event_financial_audit_event_fkey` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
