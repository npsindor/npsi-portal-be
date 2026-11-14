-- Track actual manual UPI refund completion separately from payment review remarks.
ALTER TABLE `transactions`
    ADD COLUMN `refund_amount` DECIMAL(12, 2) NULL,
    ADD COLUMN `refund_reference` VARCHAR(120) NULL;
