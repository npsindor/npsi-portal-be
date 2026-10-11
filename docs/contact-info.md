# Community contact form

The public frontend URL `/contact-info` opens a full-screen English/Hindi form without requiring login. Its location dropdowns search English and Hindi labels. Selecting Other opens a required text field; the resolved text is sent to the backend. Community-provided bilingual location lists live in the frontend's `src/lib/contact-info-text.js` and can be expanded there.

`POST /api/v1/contact-info` accepts:

```json
{
  "fullName": "Example Member",
  "contactNumber": "9876543210",
  "email": "member@example.com",
  "indoreArea": "Rajendra Nagar",
  "nativeVillage": "Borawan",
  "isStudent": false,
  "lang": "en"
}
```

Name, contact number, Indore area and native village are required. Email may be omitted or blank. `isStudent` defaults to false and must be a JSON boolean when supplied. `lang` defaults to `en` and also supports `hi`. Indian mobile numbers are normalized to ten digits (optional +91 prefix, spaces, parentheses and hyphens accepted). Names and locations are trimmed and limited to 150 characters; email is normalized to lowercase and limited to 254 characters.

Each successful submission creates a row in `contact_info` with a generated ID and creation timestamp. Repeated contact numbers are allowed, so a shared family number does not block another person. No login account is created and no OTP is sent. There is no public endpoint for retrieving these records. The endpoint allows ten submissions per IP per fifteen minutes, using the existing in-memory limiter infrastructure.

The server responds HTTP 201 only after the insert succeeds:

```json
{"success": true, "message": "Thank you! Your details have been saved."}
```

With `lang: "hi"`, the message is `धन्यवाद! आपकी जानकारी सहेज ली गई है।`. Invalid fields return HTTP 400; rate limiting returns HTTP 429. The frontend keeps entered values if saving fails and prevents repeat clicks while a request is in progress.

## Deployment

Generate the Prisma client with `npm run build`. Apply `prisma/migrations/20261015000000_contact_info/migration.sql` through the existing Prisma deployment workflow against the intended database before accepting submissions. Normal backend startup also applies pending migrations unless `SKIP_DB_MIGRATIONS=true` is set. Review all pending migrations before deployment. No database migrations were run as part of implementing this feature.

Deploy the frontend with its existing `VITE_API_BASE_URL` pointed at the backend. The host must serve the SPA entry point for `/contact-info`, as with other frontend routes.
