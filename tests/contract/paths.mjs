// Endpoint table for the contract suite: tests refer to endpoints by key, so a
// path change is one edit here and never touches an expected status or body.
const RESOURCES = {
  Announcement: "announcements",
  Application: "applications",
  Event: "events",
  EventRegistration: "event-registrations",
  Family: "families",
  FamilyMember: "family-members",
  Feedback: "feedback",
  Notification: "notifications",
  Principle: "principles",
  Rule: "rules",
  Samiti: "samitis",
  SamitiMember: "samiti-members",
  Student: "students",
  StudentApplication: "student-applications",
  Transaction: "transactions",
  TransferRequest: "transfer-requests",
};

const v1 = {
  health: () => ["GET", "/api/v1/health"],
  register: () => ["POST", "/api/v1/auth/registrations"],
  verifyOtp: () => ["POST", "/api/v1/auth/otp-verifications"],
  resendOtp: () => ["POST", "/api/v1/auth/otps"],
  login: () => ["POST", "/api/v1/auth/sessions"],
  resetRequest: () => ["POST", "/api/v1/auth/password-resets"],
  resetPassword: () => ["POST", "/api/v1/auth/password-resets/confirmations"],
  invite: () => ["POST", "/api/v1/auth/invitations"],
  changePassword: () => ["PUT", "/api/v1/auth/password"],
  me: () => ["GET", "/api/v1/auth/me"],
  updateMe: () => ["PATCH", "/api/v1/auth/me"],
  logout: () => ["DELETE", "/api/v1/auth/sessions/current"],
  myFamily: () => ["GET", "/api/v1/me/family"],
  myFeedback: () => ["GET", "/api/v1/me/feedback"],
  verifyFamily: (familyId) => ["GET", `/api/v1/family-verifications/${encodeURIComponent(familyId)}`],
  trackApplication: (qs = "") => ["GET", `/api/v1/application-status${qs}`],
  checkMobile: (qs = "") => ["GET", `/api/v1/mobile-availability${qs}`],
  checkEmail: (qs = "") => ["GET", `/api/v1/email-availability${qs}`],
  stats: () => ["GET", "/api/v1/stats"],
  upload: () => ["POST", "/api/v1/uploads"],
  list: (entity, qs = "") => ["GET", `/api/v1/${RESOURCES[entity]}${qs}`],
  create: (entity) => ["POST", `/api/v1/${RESOURCES[entity]}`],
  bulk: (entity) => ["POST", `/api/v1/${RESOURCES[entity]}/batch`],
  update: (entity, id) => ["PATCH", `/api/v1/${RESOURCES[entity]}/${id}`],
  remove: (entity, id) => ["DELETE", `/api/v1/${RESOURCES[entity]}/${id}`],
  review: (entity, id) => ["POST", `/api/v1/${RESOURCES[entity]}/${id}/review`],
};

export const API = v1;
export const ENTITIES = Object.keys(RESOURCES);
