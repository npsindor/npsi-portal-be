// Paths shared by the controller and the rate-limit wiring.
export const BLOOD_HELP_ROUTE = "blood-help";
export const BLOOD_REQUESTS_PATH = `${BLOOD_HELP_ROUTE}/requests`;
export const BLOOD_DONOR_PATH = `${BLOOD_HELP_ROUTE}/me/donor`;
export const BLOOD_NOTIFY_PATH = `${BLOOD_HELP_ROUTE}/requests/:id/donor-notifications`;
