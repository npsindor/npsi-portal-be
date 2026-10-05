// Paths (relative to the global /api prefix) used by both the controller
// decorators and the rate-limit middleware wiring, so they can't drift apart.
export const AUTH_ROUTES = {
  base: "auth",
  register: "register",
  verifyOtp: "verify-otp",
  resendOtp: "resend-otp",
  login: "login",
  resetRequest: "reset-request",
  resetPassword: "reset-password",
  invite: "invite",
  changePassword: "change-password",
  me: "me",
  logout: "logout",
} as const;
