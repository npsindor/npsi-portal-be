// Paths (relative to the global /api prefix), shared by the controller and the
// rate-limit wiring.
export const LOOKUP_ROUTES = {
  verifyFamily: "verify/:familyId",
  applicationStatus: "track/application",
  mobileAvailability: "check-mobile",
  emailAvailability: "check-email",
  stats: "stats",
} as const;
