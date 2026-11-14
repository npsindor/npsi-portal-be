// Paths (relative to the global /api/v1 prefix) used by both the controller
// decorators and the rate-limit middleware wiring, so they can't drift apart.
export const AUTH_ROUTES = {
  base: "auth",
  register: "registrations",
  verifyOtp: "otp-verifications",
  resendOtp: "otps",
  login: "sessions",
  resetRequest: "password-resets",
  resetPassword: "password-resets/confirmations",
  invite: "invitations",
  changePassword: "password",
  me: "me",
  logout: "sessions/current",
  mobileOtp: "mobile-otps",
  mobileOtpVerify: "mobile-otps/verifications",
  mobileRegister: "mobile-registrations",
} as const;
