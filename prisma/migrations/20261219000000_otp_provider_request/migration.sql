-- Mobile codes sent by MSG91's OTP widget (default template, no DLT of our own): MSG91 creates and checks the code,
-- so the challenge keeps MSG91's request id instead of a code we could check ourselves.
ALTER TABLE `otp_challenges` ADD COLUMN `provider_request_id` VARCHAR(128) NULL;
