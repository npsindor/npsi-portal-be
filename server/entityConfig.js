export const entityTables = {
  Announcement: "announcements",
  Application: "applications",
  Event: "events",
  EventRegistration: "event_registrations",
  Family: "families",
  FamilyMember: "family_members",
  Feedback: "feedback",
  Notification: "notifications",
  Rule: "rules",
  Principle: "principles",
  Samiti: "samitis",
  SamitiMember: "samiti_members",
  Student: "students",
  StudentApplication: "student_applications",
  Transaction: "transactions",
  TransferRequest: "transfer_requests",
};

export const getTable = (entity) => {
  const table = entityTables[entity];
  if (!table) {
    const error = new Error(`Unsupported entity: ${entity}`);
    error.status = 404;
    throw error;
  }
  return table;
};

export const quoteIdentifier = (value) => `\`${value.replaceAll("`", "``")}\``;