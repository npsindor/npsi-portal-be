-- Event registrations belong to an existing event. First remove the three
-- registrations (and their unpaid fees) that point at the deleted "Holi Milan
-- 2027" event: family PSI-FAM-000018 registered three times within 20 seconds
-- on 2026-09-23 and never paid. Deleting an event that has registrations is
-- refused from now on (the app says so; see EventsService.remove).

DELETE FROM `transactions`
WHERE `transaction_id` IN ('TXN-1790189638065', 'TXN-1790189648248', 'TXN-1790189656508')
  AND `reference_id` IN ('EVT-REG-1790189638065', 'EVT-REG-1790189648248', 'EVT-REG-1790189656508')
  AND `payment_status` = 'PENDING';

DELETE FROM `event_registrations`
WHERE `id` IN ('285b00df-67d2-472e-89f7-5d112d947662', '7e04f640-55fa-4d69-94a2-60a81eb5b1f6', 'c5547a78-06d7-4597-8747-872d2bc4a479')
  AND `event_id` = '6aa917907362e8b267befcd9';

-- AddForeignKey
ALTER TABLE `event_registrations` ADD CONSTRAINT `event_registrations_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
