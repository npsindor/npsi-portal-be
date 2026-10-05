// Every entity served by the generic entity API: its table, its REST
// resource path, and its columns (from the migrated schema). Request DTOs and
// response VOs for each entity are generated from these definitions.

// s = varchar/text, i = int, d = decimal (returned as a string by MySQL),
// b = tinyint boolean (returned as 0/1), j = JSON, dt = datetime, dd = date
export type ColumnKind = "s" | "i" | "d" | "b" | "j" | "dt" | "dd";

export interface EntityDefinition {
  name: EntityName;
  table: string;
  resource: string;
  columns: Record<string, ColumnKind>;
}

const cols = (spec: string): Record<string, ColumnKind> =>
  Object.fromEntries(
    spec
      .trim()
      .split(/\s+/)
      .map((entry) => entry.split(":") as [string, ColumnKind]),
  );

const DEFINITIONS = {
  Announcement: { table: "announcements", resource: "announcements", columns: cols("title:s title_hi:s body:s body_hi:s date:dt type:s status:s") },
  Application: {
    table: "applications",
    resource: "applications",
    columns: cols(
      "application_id:s status:s family_head_name:s mobile:s email:s family_name:s address:s city:s district:s state:s pincode:s gotra:s native_place:s village:s members_data:j submitted_date:dt admin_remarks:s reviewed_date:dt resulting_family_id:s",
    ),
  },
  Event: {
    table: "events",
    resource: "events",
    columns: cols(
      "title:s title_hi:s slug:s banner_url:s description:s description_hi:s date:dd start_time:s end_time:s venue:s map_location:s organizer:s contact:s registration_open:dt registration_close:dt fee:d capacity:i rules:s terms:s status:s",
    ),
  },
  EventRegistration: {
    table: "event_registrations",
    resource: "event-registrations",
    columns: cols(
      "registration_id:s event_id:s event_title:s family_id:s member_ids:j member_names:j count:i fee_per_member:d total_fee:d payment_status:s transaction_id:s status:s registered_by_id:s registered_date:dt registrant_name:s registrant_email:s",
    ),
  },
  Family: {
    table: "families",
    resource: "families",
    columns: cols(
      "family_id:s family_name:s head_name:s status:s address:s city:s district:s state:s pincode:s native_place:s village:s gotra:s contact_number:s email:s registration_date:dt member_count:i application_id:s",
    ),
  },
  FamilyMember: {
    table: "family_members",
    resource: "family-members",
    columns: cols(
      "family_id:s membership_id:s name:s relationship:s gender:s dob:dd mobile:s email:s education:s occupation:s address:s photo_url:s status:s linked_student_id:s",
    ),
  },
  Feedback: {
    table: "feedback",
    resource: "feedback",
    columns: cols(
      "feedback_id:s member_name:s family_id:s email:s feedback_type:s subject:s message:s attachment_url:s questions:j rating:i status:s reply:s replied_date:dt replied_by_id:s internal_note:s archived:b submitted_date:dt",
    ),
  },
  Notification: {
    table: "notifications",
    resource: "notifications",
    columns: cols("title:s message:s type:s recipient_family_id:s read:b date:dt deep_link:s"),
  },
  Principle: { table: "principles", resource: "principles", columns: cols("section_number:i title_en:s title_hi:s content_en:s content_hi:s status:s") },
  Rule: { table: "rules", resource: "rules", columns: cols("section_number:i title_en:s title_hi:s content_en:s content_hi:s status:s") },
  Samiti: { table: "samitis", resource: "samitis", columns: cols("name:s description:s formed_date:dd status:s") },
  SamitiMember: { table: "samiti_members", resource: "samiti-members", columns: cols("samiti_id:s name:s position:s mobile:s email:s status:s") },
  Student: {
    table: "students",
    resource: "students",
    columns: cols(
      "student_id:s student_name:s father_name:s status:s mobile:s email:s dob:dd gender:s course:s institution:s academic_year:s guardian_name:s guardian_mobile:s address:s city:s district:s state:s pincode:s photo_url:s registration_date:dt application_id:s linked_family_id:s linked_membership_id:s",
    ),
  },
  StudentApplication: {
    table: "student_applications",
    resource: "student-applications",
    columns: cols(
      "application_id:s status:s student_name:s father_name:s mobile:s email:s dob:dd gender:s course:s institution:s academic_year:s guardian_name:s guardian_mobile:s address:s city:s district:s state:s pincode:s photo_url:s submitted_date:dt admin_remarks:s reviewed_date:dt resulting_student_id:s",
    ),
  },
  Transaction: {
    table: "transactions",
    resource: "transactions",
    columns: cols("transaction_id:s type:s amount:d payment_method:s payment_status:s family_id:s member_id:s event_id:s reference_id:s date:dt remarks:s"),
  },
  TransferRequest: {
    table: "transfer_requests",
    resource: "transfer-requests",
    columns: cols(
      "request_id:s request_type:s status:s reason:s source_student_id:s source_membership_id:s source_family_id:s target_family_id:s target_family_name:s requester_id:s requester_name:s requester_email:s requester_mobile:s requested_date:dt admin_remarks:s approved_by_id:s approved_date:dt resulting_membership_id:s old_family_id:s new_family_id:s",
    ),
  },
} as const;

export type EntityName = keyof typeof DEFINITIONS;

export const ENTITY_DEFINITIONS: Record<EntityName, EntityDefinition> = Object.fromEntries(
  Object.entries(DEFINITIONS).map(([name, def]) => [name, { name, ...def }]),
) as unknown as Record<EntityName, EntityDefinition>;

export const ENTITY_NAMES = Object.keys(DEFINITIONS) as EntityName[];
