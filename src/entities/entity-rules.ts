import type { EntityName } from "./entity-definitions.js";

// Access rules for the generic entity API, unchanged from the legacy app.

// Every entity carries PII except this public-content set, so reads default
// to admin-only unless listed here.
export const PUBLIC_READ_ENTITIES = new Set<EntityName>(["Event", "Announcement", "Rule", "Principle"]);
// Readable by any logged-in user (rows are then scoped to the user's family).
export const AUTH_READ_ENTITIES = new Set<EntityName>(["Notification"]);
// Created by unauthenticated flows (registration forms, payment intents, and
// the "your application was submitted" notification sent before login exists).
export const PUBLIC_CREATE_ENTITIES = new Set<EntityName>(["Application", "StudentApplication", "Transaction", "Notification"]);
export const AUTH_CREATE_ENTITIES = new Set<EntityName>(["Feedback", "EventRegistration", "TransferRequest"]);
// Members may write these only for their own family.
export const OWNERSHIP_ENTITIES = new Set<EntityName>(["Family", "FamilyMember"]);

// The exact fields the member-facing UI ever sends for these entities; every
// other column stays admin-only even on the member's own records.
export const NON_ADMIN_WRITABLE_FIELDS: Partial<Record<EntityName, Set<string>>> = {
  Family: new Set(["member_count"]),
  FamilyMember: new Set(["name", "relationship", "gender", "dob", "mobile", "email", "education", "occupation", "address", "status"]),
  Notification: new Set(["read"]),
  EventRegistration: new Set([
    "registration_id",
    "event_id",
    "event_title",
    "family_id",
    "member_ids",
    "member_names",
    "count",
    "fee_per_member",
    "total_fee",
    "payment_status",
    "transaction_id",
    "status",
    "registered_by_id",
    "registered_date",
    "registrant_name",
  ]),
  Feedback: new Set(["member_name", "email", "feedback_type", "subject", "message", "attachment_url", "status", "submitted_date", "questions", "rating"]),
  TransferRequest: new Set([
    "request_type",
    "status",
    "requester_name",
    "requester_email",
    "requester_mobile",
    "source_student_id",
    "source_membership_id",
    "source_family_id",
    "target_family_id",
    "target_family_name",
    "reason",
    "requester_id",
    "requested_date",
  ]),
};

// Sequential display ids (e.g. NPSI-FAM-000123) are always assigned by the
// server on create, never taken from the client.
export const ID_FIELD_CONFIG: Partial<Record<EntityName, { field: string; prefix: () => string }>> = {
  Family: { field: "family_id", prefix: () => "NPSI-FAM-" },
  FamilyMember: { field: "membership_id", prefix: () => "NPSI-MEM-" },
  Student: { field: "student_id", prefix: () => "NPSI-STU-" },
  Application: { field: "application_id", prefix: () => `NPSI-APP-${new Date().getFullYear()}-` },
  StudentApplication: { field: "application_id", prefix: () => `NPSI-STU-APP-${new Date().getFullYear()}-` },
  TransferRequest: { field: "request_id", prefix: () => "TRF-" },
  Feedback: { field: "feedback_id", prefix: () => "FB-" },
};
