-- AlterTable
ALTER TABLE `booking` ADD COLUMN `bookingReference` VARCHAR(191) NULL,
    ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'website';

-- CreateTable
CREATE TABLE `Availability` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `villaSlug` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `available` BOOLEAN NOT NULL DEFAULT true,
    `source` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Availability_villaSlug_idx`(`villaSlug`),
    INDEX `Availability_date_idx`(`date`),
    UNIQUE INDEX `Availability_villaSlug_date_key`(`villaSlug`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `villaSlug` VARCHAR(191) NOT NULL,
    `checkIn` DATETIME(3) NOT NULL,
    `checkOut` DATETIME(3) NOT NULL,
    `available` BOOLEAN NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `success` BOOLEAN NOT NULL DEFAULT true,
    `error` VARCHAR(191) NULL,

    INDEX `SyncLog_villaSlug_idx`(`villaSlug`),
    INDEX `SyncLog_syncedAt_idx`(`syncedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Booking_source_idx` ON `Booking`(`source`);
