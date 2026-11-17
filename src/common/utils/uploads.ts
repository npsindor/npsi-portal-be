// A URL of an image uploaded to this portal (`POST /uploads`: a random UUID name with an image extension).
// Members may only link such images (profile photos, feedback attachments), never outside URLs or
// other schemes such as `javascript:`.
export const OWN_UPLOAD_URL = /^https?:\/\/[^/\s]+\/uploads\/[0-9a-f-]{36}\.(?:jpe?g|png|webp|gif)$/i;
