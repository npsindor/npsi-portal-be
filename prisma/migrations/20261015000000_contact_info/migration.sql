CREATE TABLE `contact_info` (
  `id` VARCHAR(64) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `contact_number` VARCHAR(10) NOT NULL,
  `email` VARCHAR(254) NULL,
  `indore_area` VARCHAR(150) NOT NULL,
  `native_village` VARCHAR(150) NOT NULL,
  `is_student` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
