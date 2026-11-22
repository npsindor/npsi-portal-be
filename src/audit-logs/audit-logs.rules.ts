// Which record a DELETE route removes, and how to show it in the audit log.

// Route pattern (Express, after /api/v1) → the Prisma model the record lives in and the route parameter holding its key.
// Routes not listed are still logged, only without a copy of the record.
export const SNAPSHOT_MODELS: Record<string, { model: string; param: string; key?: string }> = {
  "/families/:id": { model: "family", param: "id" },
  "/family-members/:id": { model: "familyMember", param: "id" },
  "/students/:id": { model: "student", param: "id" },
  "/student-applications/:id": { model: "studentApplication", param: "id" },
  "/applications/:id": { model: "application", param: "id" },
  "/transactions/:id": { model: "transaction", param: "id" },
  "/events/:id": { model: "event", param: "id" },
  "/event-registrations/:id": { model: "eventRegistration", param: "id" },
  "/announcements/:id": { model: "announcement", param: "id" },
  "/notifications/:id": { model: "notification", param: "id" },
  "/feedback/:id": { model: "feedback", param: "id" },
  "/samitis/:id": { model: "samiti", param: "id" },
  "/samiti-members/:id": { model: "samitiMember", param: "id" },
  "/rules/:id": { model: "rule", param: "id" },
  "/principles/:id": { model: "principle", param: "id" },
  "/page-blocks/:id": { model: "pageBlock", param: "id" },
  "/home-highlights/:id": { model: "homeHighlight", param: "id" },
  "/community-posts/:id": { model: "communityPost", param: "id" },
  "/address-options/:id": { model: "addressOption", param: "id" },
  "/transfer-requests/:id": { model: "transferRequest", param: "id" },
  "/event-member-applications/:id": { model: "eventMemberApplication", param: "id" },
  "/admin-access/:userId": { model: "adminAccess", param: "userId", key: "userId" },
  "/room-hunting/listings/:id": { model: "rentalListing", param: "id" },
  "/sagun/profiles/:id": { model: "sagunProfile", param: "id" },
  "/senior-discipline-committee/:id": { model: "seniorDisciplineCommitteeMember", param: "id" },
  "/event-finance/admin/categories/:id": { model: "expenseCategory", param: "id" },
  "/event-finance/admin/events/:eventId/contributions/:id": { model: "eventContribution", param: "id" },
  "/event-finance/admin/events/:eventId/expenses/:id": { model: "eventExpense", param: "id" },
  "/event-finance/admin/events/:eventId/roster/:id": { model: "eventRoster", param: "id" },
  "/event-finance/admin/events/:eventId/teams/:id": { model: "eventTeam", param: "id" },
};

// Logging out is not deleting an entry.
export const NOT_AUDITED = ["/auth/sessions", "/auth/sessions/current"];

// "families", "event-finance/admin/events/:eventId/expenses" → a readable resource name for the log.
export const resourceOf = (pattern: string): string =>
  pattern
    .split("/")
    .filter((part) => part && !part.startsWith(":"))
    .join(" / ") || "unknown";

const SECRET = /pass(word)?|token|otp|hash|secret|session/i;
const MAX_SNAPSHOT = 20000;

// A copy of the deleted record for the log: secrets removed, dates and decimals as text, size capped.
export const cleanSnapshot = (row: unknown): unknown => {
  if (!row || typeof row !== "object") return null;
  const clean = JSON.parse(
    JSON.stringify(row, (key, value) => (key && SECRET.test(key) ? undefined : typeof value === "bigint" ? value.toString() : value)),
  ) as Record<string, unknown>;
  const text = JSON.stringify(clean);
  return text.length <= MAX_SNAPSHOT ? clean : { truncated: true, preview: text.slice(0, MAX_SNAPSHOT) };
};

// The record's own name for the list ("Subhash Patidar", "NPSI-FAM-000024", an event title…).
const LABEL_FIELDS = [
  "name",
  "studentName",
  "familyHeadName",
  "headName",
  "fullName",
  "title",
  "patientName",
  "familyId",
  "membershipId",
  "applicationId",
  "transactionId",
  "requestId",
  "reference",
  "value",
  "email",
];
export const labelOf = (row: unknown): string | null => {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  for (const field of LABEL_FIELDS) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) return value.replace(/\s+/g, " ").trim().slice(0, 255);
  }
  return null;
};
