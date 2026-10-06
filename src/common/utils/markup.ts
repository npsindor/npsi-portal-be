import { ApiError } from "../filters/api-error.js";

// Legitimate form input never needs angle brackets; rejecting them stops
// HTML/script injection at the point of entry (non-admin writes only).
const MARKUP = /[<>]/;

export const assertNoMarkup = (input: object): void => {
  const field = Object.entries(input).find(([, value]) => typeof value === "string" && MARKUP.test(value))?.[0];
  if (field) throw new ApiError(400, `The "${field}" field cannot contain < or > characters.`);
};
