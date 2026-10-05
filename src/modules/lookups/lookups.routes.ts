// Paths (relative to the global /api/v1 prefix), shared by the controller and
// the rate-limit wiring.
export const LOOKUP_ROUTES = {
  verifyFamily: "family-verifications/:familyId",
  applicationStatus: "application-status",
  mobileAvailability: "mobile-availability",
  emailAvailability: "email-availability",
  stats: "stats",
} as const;
