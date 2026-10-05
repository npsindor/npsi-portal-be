-- CreateTable
CREATE TABLE `SequelizeMeta` (
    `name` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `name`(`name`),
    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` VARCHAR(64) NOT NULL,
    `title` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `date` DATETIME(0) NULL,
    `type` VARCHAR(255) NULL,
    `status` VARCHAR(64) NULL DEFAULT 'Active',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `title_hi` TEXT NULL,
    `body_hi` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `applications` (
    `id` VARCHAR(64) NOT NULL,
    `application_id` VARCHAR(255) NOT NULL,
    `status` VARCHAR(64) NULL DEFAULT 'SUBMITTED',
    `family_head_name` TEXT NOT NULL,
    `mobile` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `family_name` TEXT NOT NULL,
    `address` TEXT NULL,
    `city` VARCHAR(255) NULL,
    `district` VARCHAR(255) NULL,
    `state` VARCHAR(255) NULL,
    `pincode` VARCHAR(255) NULL,
    `gotra` VARCHAR(255) NULL,
    `native_place` VARCHAR(255) NULL,
    `village` VARCHAR(255) NULL,
    `members_data` JSON NULL,
    `submitted_date` DATETIME(0) NULL,
    `admin_remarks` TEXT NULL,
    `reviewed_date` DATETIME(0) NULL,
    `resulting_family_id` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `application_id`(`application_id`),
    INDEX `applications_lookup_idx`(`application_id`, `mobile`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_registrations` (
    `id` VARCHAR(64) NOT NULL,
    `registration_id` VARCHAR(255) NOT NULL,
    `event_id` VARCHAR(64) NOT NULL,
    `event_title` VARCHAR(255) NULL,
    `family_id` VARCHAR(255) NULL,
    `member_ids` JSON NULL,
    `member_names` JSON NULL,
    `count` INTEGER NULL DEFAULT 0,
    `fee_per_member` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `total_fee` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `payment_status` VARCHAR(64) NULL DEFAULT 'PENDING',
    `transaction_id` VARCHAR(255) NULL,
    `status` VARCHAR(64) NULL DEFAULT 'REGISTERED',
    `registered_by_id` VARCHAR(255) NULL,
    `registered_date` DATETIME(0) NULL,
    `registrant_name` VARCHAR(255) NULL,
    `registrant_email` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `registration_id`(`registration_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` VARCHAR(64) NOT NULL,
    `title` TEXT NOT NULL,
    `slug` VARCHAR(255) NULL,
    `banner_url` TEXT NULL,
    `description` TEXT NULL,
    `date` DATE NOT NULL,
    `start_time` VARCHAR(255) NULL,
    `end_time` VARCHAR(255) NULL,
    `venue` TEXT NOT NULL,
    `map_location` TEXT NULL,
    `organizer` VARCHAR(255) NULL,
    `contact` VARCHAR(255) NULL,
    `registration_open` DATETIME(0) NULL,
    `registration_close` DATETIME(0) NULL,
    `fee` DECIMAL(12, 2) NULL DEFAULT 0.00,
    `capacity` INTEGER NULL,
    `rules` TEXT NULL,
    `terms` TEXT NULL,
    `status` VARCHAR(64) NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `title_hi` TEXT NULL,
    `description_hi` TEXT NULL,

    INDEX `events_status_date_idx`(`status`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `families` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(255) NULL,
    `family_name` TEXT NULL,
    `head_name` TEXT NULL,
    `status` VARCHAR(64) NULL DEFAULT 'PENDING',
    `address` TEXT NULL,
    `city` VARCHAR(255) NULL,
    `district` VARCHAR(255) NULL,
    `state` VARCHAR(255) NULL,
    `pincode` VARCHAR(255) NULL,
    `native_place` VARCHAR(255) NULL,
    `village` VARCHAR(255) NULL,
    `gotra` VARCHAR(255) NULL,
    `contact_number` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `registration_date` DATETIME(0) NULL,
    `member_count` INTEGER NULL DEFAULT 0,
    `application_id` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `family_id`(`family_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `family_members` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `membership_id` VARCHAR(255) NULL,
    `name` TEXT NOT NULL,
    `relationship` VARCHAR(255) NOT NULL,
    `gender` VARCHAR(255) NULL,
    `dob` DATE NULL,
    `mobile` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `education` VARCHAR(255) NULL,
    `occupation` VARCHAR(255) NULL,
    `address` TEXT NULL,
    `photo_url` TEXT NULL,
    `status` VARCHAR(64) NULL DEFAULT 'PENDING',
    `linked_student_id` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `family_members_family_idx`(`family_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedback` (
    `id` VARCHAR(64) NOT NULL,
    `feedback_id` VARCHAR(255) NULL,
    `member_name` TEXT NOT NULL,
    `family_id` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `feedback_type` VARCHAR(255) NULL,
    `subject` VARCHAR(255) NULL,
    `message` TEXT NULL,
    `attachment_url` TEXT NULL,
    `questions` JSON NULL,
    `rating` INTEGER NULL,
    `status` VARCHAR(64) NULL DEFAULT 'Submitted',
    `reply` TEXT NULL,
    `replied_date` DATETIME(0) NULL,
    `replied_by_id` VARCHAR(255) NULL,
    `internal_note` TEXT NULL,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `submitted_date` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `feedback_id`(`feedback_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(64) NOT NULL,
    `title` TEXT NOT NULL,
    `message` TEXT NOT NULL,
    `type` VARCHAR(255) NOT NULL,
    `recipient_family_id` VARCHAR(255) NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `date` DATETIME(0) NULL,
    `deep_link` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `notifications_recipient_idx`(`recipient_family_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `principles` (
    `id` VARCHAR(64) NOT NULL,
    `section_number` INTEGER NULL,
    `title_en` TEXT NOT NULL,
    `title_hi` TEXT NOT NULL,
    `content_en` TEXT NOT NULL,
    `content_hi` TEXT NOT NULL,
    `status` VARCHAR(64) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `principles_section_idx`(`section_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rules` (
    `id` VARCHAR(64) NOT NULL,
    `section_number` INTEGER NULL,
    `title_en` TEXT NOT NULL,
    `title_hi` TEXT NOT NULL,
    `content_en` TEXT NOT NULL,
    `content_hi` TEXT NOT NULL,
    `status` VARCHAR(64) NULL DEFAULT 'Active',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `samiti_members` (
    `id` VARCHAR(64) NOT NULL,
    `samiti_id` VARCHAR(64) NOT NULL,
    `name` TEXT NOT NULL,
    `position` VARCHAR(255) NULL,
    `mobile` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `status` VARCHAR(64) NULL DEFAULT 'Active',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `samitis` (
    `id` VARCHAR(64) NOT NULL,
    `name` TEXT NOT NULL,
    `description` TEXT NULL,
    `formed_date` DATE NULL,
    `status` VARCHAR(64) NULL DEFAULT 'Active',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_applications` (
    `id` VARCHAR(64) NOT NULL,
    `application_id` VARCHAR(255) NOT NULL,
    `status` VARCHAR(64) NULL DEFAULT 'SUBMITTED',
    `student_name` TEXT NOT NULL,
    `mobile` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NULL,
    `dob` DATE NULL,
    `gender` VARCHAR(255) NULL,
    `course` VARCHAR(255) NULL,
    `institution` VARCHAR(255) NULL,
    `academic_year` VARCHAR(255) NULL,
    `guardian_name` VARCHAR(255) NULL,
    `guardian_mobile` VARCHAR(255) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(255) NULL,
    `district` VARCHAR(255) NULL,
    `state` VARCHAR(255) NULL,
    `pincode` VARCHAR(255) NULL,
    `photo_url` TEXT NULL,
    `submitted_date` DATETIME(0) NULL,
    `admin_remarks` TEXT NULL,
    `reviewed_date` DATETIME(0) NULL,
    `resulting_student_id` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `father_name` VARCHAR(255) NULL,

    UNIQUE INDEX `application_id`(`application_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `students` (
    `id` VARCHAR(64) NOT NULL,
    `student_id` VARCHAR(255) NULL,
    `student_name` TEXT NOT NULL,
    `status` VARCHAR(64) NULL DEFAULT 'PENDING',
    `mobile` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `dob` DATE NULL,
    `gender` VARCHAR(255) NULL,
    `course` VARCHAR(255) NULL,
    `institution` VARCHAR(255) NULL,
    `academic_year` VARCHAR(255) NULL,
    `guardian_name` VARCHAR(255) NULL,
    `guardian_mobile` VARCHAR(255) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(255) NULL,
    `district` VARCHAR(255) NULL,
    `state` VARCHAR(255) NULL,
    `pincode` VARCHAR(255) NULL,
    `photo_url` TEXT NULL,
    `registration_date` DATETIME(0) NULL,
    `application_id` VARCHAR(255) NULL,
    `linked_family_id` VARCHAR(255) NULL,
    `linked_membership_id` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `father_name` VARCHAR(255) NULL,

    UNIQUE INDEX `student_id`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transactions` (
    `id` VARCHAR(64) NOT NULL,
    `transaction_id` VARCHAR(255) NOT NULL,
    `type` VARCHAR(255) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `payment_method` VARCHAR(255) NULL,
    `payment_status` VARCHAR(64) NULL DEFAULT 'PENDING',
    `family_id` VARCHAR(255) NULL,
    `member_id` VARCHAR(255) NULL,
    `event_id` VARCHAR(255) NULL,
    `reference_id` VARCHAR(255) NULL,
    `date` DATETIME(0) NULL,
    `remarks` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `transaction_id`(`transaction_id`),
    INDEX `transactions_family_idx`(`family_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transfer_requests` (
    `id` VARCHAR(64) NOT NULL,
    `request_id` VARCHAR(255) NOT NULL,
    `request_type` VARCHAR(255) NOT NULL,
    `status` VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    `reason` TEXT NULL,
    `source_student_id` VARCHAR(255) NULL,
    `source_membership_id` VARCHAR(255) NULL,
    `source_family_id` VARCHAR(255) NULL,
    `target_family_id` VARCHAR(255) NULL,
    `requester_id` VARCHAR(255) NULL,
    `admin_remarks` TEXT NULL,
    `approved_by_id` VARCHAR(255) NULL,
    `approved_date` DATETIME(0) NULL,
    `resulting_membership_id` VARCHAR(255) NULL,
    `old_family_id` VARCHAR(255) NULL,
    `new_family_id` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `requester_name` VARCHAR(255) NULL,
    `requester_email` VARCHAR(255) NULL,
    `requester_mobile` VARCHAR(255) NULL,
    `target_family_name` TEXT NULL,
    `requested_date` DATETIME(0) NULL,

    UNIQUE INDEX `request_id`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(64) NOT NULL,
    `email` VARCHAR(255) NULL,
    `full_name` VARCHAR(255) NULL,
    `role` VARCHAR(64) NULL DEFAULT 'user',
    `password_hash` TEXT NULL,
    `is_verified` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(64) NOT NULL DEFAULT 'active',
    `session_token` TEXT NULL,
    `session_expires_at` DATETIME(0) NULL,
    `reset_token_hash` TEXT NULL,
    `reset_token_expires_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `phone` VARCHAR(20) NULL,
    `otp_hash` VARCHAR(255) NULL,
    `otp_expires_at` DATETIME(0) NULL,

    UNIQUE INDEX `email`(`email`),
    INDEX `users_reset_token_idx`(`reset_token_hash`(255)),
    INDEX `users_session_token_idx`(`session_token`(255)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed data from the legacy sequelize migration 002-seed-principles (fresh databases only;
-- existing databases are baselined and never run this migration).
INSERT INTO `principles` (`id`, `section_number`, `title_en`, `title_hi`, `content_en`, `content_hi`, `status`, `created_at`, `updated_at`) VALUES ('2950c683-0d34-46b0-8c88-8642acdb02e9',10,'Progress and Welfare','प्रगति एवं कल्याण','Working toward collective progress and social welfare.','सामूहिक प्रगति और सामाजिक कल्याण के लिए कार्य करना।','Active','2026-10-05 11:54:53','2026-10-05 11:54:53');
INSERT INTO `principles` (`id`, `section_number`, `title_en`, `title_hi`, `content_en`, `content_hi`, `status`, `created_at`, `updated_at`) VALUES ('4af404e5-6833-47f2-b5c2-752315267f9d',6,'Transparency and Accountability','पारदर्शिता एवं जवाबदेही','Maintaining clarity in organizational work and finances.','संगठन के कार्यों और वित्त में स्पष्टता रखना।','Active','2026-10-05 11:54:53','2026-10-05 11:54:53');
INSERT INTO `principles` (`id`, `section_number`, `title_en`, `title_hi`, `content_en`, `content_hi`, `status`, `created_at`, `updated_at`) VALUES ('78d52fca-7110-48c8-89b5-48fe7a05ab3c',1,'Unity and Brotherhood','एकता एवं भाईचारा','Bringing all families and members together as one community.','सभी परिवारों और सदस्यों को एक सूत्र में जोड़ना।','Active','2026-10-05 11:54:53','2026-10-05 11:54:53');
INSERT INTO `principles` (`id`, `section_number`, `title_en`, `title_hi`, `content_en`, `content_hi`, `status`, `created_at`, `updated_at`) VALUES ('82e12471-7e53-4bca-b016-1e17284dd5bd',2,'Equality and Respect','समानता एवं सम्मान','Giving every person equal respect without discrimination.','हर व्यक्ति को बिना भेदभाव समान सम्मान देना।','Active','2026-10-05 11:54:53','2026-10-05 11:54:53');
INSERT INTO `principles` (`id`, `section_number`, `title_en`, `title_hi`, `content_en`, `content_hi`, `status`, `created_at`, `updated_at`) VALUES ('891ae5b5-62af-482d-80ca-99c55602efab',3,'Community Welfare First','समाजहित सर्वोपरि','Keeping the welfare of society above personal interests.','व्यक्तिगत हितों से ऊपर समाजहित रखना।','Active','2026-10-05 11:54:53','2026-10-05 11:54:53');
INSERT INTO `principles` (`id`, `section_number`, `title_en`, `title_hi`, `content_en`, `content_hi`, `status`, `created_at`, `updated_at`) VALUES ('c73bb9b8-37c0-4a76-80b8-b684c2638d40',8,'Education and Opportunity','शिक्षा एवं अवसर','Promoting education, careers, employment, and skills.','शिक्षा, करियर, रोजगार और कौशल को बढ़ावा देना।','Active','2026-10-05 11:54:53','2026-10-05 11:54:53');
INSERT INTO `principles` (`id`, `section_number`, `title_en`, `title_hi`, `content_en`, `content_hi`, `status`, `created_at`, `updated_at`) VALUES ('ca19a9a9-ff24-4eb6-9e33-4b7944083aeb',9,'Dialogue and Coordination','संवाद एवं समन्वय','Resolving differences through dialogue and understanding.','मतभेदों को संवाद और आपसी समझ से सुलझाना।','Active','2026-10-05 11:54:53','2026-10-05 11:54:53');
INSERT INTO `principles` (`id`, `section_number`, `title_en`, `title_hi`, `content_en`, `content_hi`, `status`, `created_at`, `updated_at`) VALUES ('d53d4408-25d1-41cb-a2fa-f624aa149088',4,'Collective Leadership','सामूहिक नेतृत्व','Ensuring participation from all sections in decisions.','निर्णय में सभी वर्गों की भागीदारी।','Active','2026-10-05 11:54:53','2026-10-05 11:54:53');
INSERT INTO `principles` (`id`, `section_number`, `title_en`, `title_hi`, `content_en`, `content_hi`, `status`, `created_at`, `updated_at`) VALUES ('e6211229-6fe0-4d5f-853d-bb0b9b843494',7,'Youth and Women Participation','युवा एवं महिला सहभागिता','Promoting active roles and leadership opportunities.','सक्रिय भूमिका और नेतृत्व के अवसर देना।','Active','2026-10-05 11:54:53','2026-10-05 11:54:53');
INSERT INTO `principles` (`id`, `section_number`, `title_en`, `title_hi`, `content_en`, `content_hi`, `status`, `created_at`, `updated_at`) VALUES ('e8c459cf-ae87-40a7-8cac-d20d672854df',5,'Cooperation and Service','सहयोग एवं सेवा','Supporting one another in times of need.','जरूरत के समय एक-दूसरे का सहयोग करना।','Active','2026-10-05 11:54:53','2026-10-05 11:54:53');
