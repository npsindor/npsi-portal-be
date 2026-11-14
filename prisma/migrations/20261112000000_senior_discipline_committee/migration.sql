CREATE TABLE `senior_discipline_committee_members` (
    `id` VARCHAR(64) NOT NULL,
    `name_en` VARCHAR(255) NOT NULL,
    `name_hi` VARCHAR(255) NOT NULL,
    `photo_url` TEXT NULL,
    `designation_en` VARCHAR(255) NULL,
    `designation_hi` VARCHAR(255) NULL,
    `introduction_en` TEXT NULL,
    `introduction_hi` TEXT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    INDEX `senior_discipline_members_active_order_idx`(`active`, `display_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `senior_discipline_committee_members` (`id`, `name_en`, `name_hi`, `display_order`) VALUES
('senior-discipline-01', 'Shri Gajanand Ji Patidar', 'श्री गजानंद जी पाटीदार', 1),
('senior-discipline-02', 'Shri Sukhdev Ji Patidar', 'श्री सुखदेव जी पाटीदार', 2),
('senior-discipline-03', 'Shri Ramesh Ji Patidar', 'श्री रमेश जी पाटीदार', 3),
('senior-discipline-04', 'Shri Sevkram Ji Patidar', 'श्री सेवकराम जी पाटीदार', 4),
('senior-discipline-05', 'Shri Mahesh Ji Patidar', 'श्री महेश जी पाटीदार', 5),
('senior-discipline-06', 'Shri Ramchandra Ji Patidar', 'श्री रामचन्द्र जी पाटीदार', 6);
