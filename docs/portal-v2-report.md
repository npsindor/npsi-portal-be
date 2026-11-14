# Portal v2: audit, changes, migrations, APIs and test report

Branch `feature/portal-v2` (backend and frontend). Nothing in this work replaces the database, changes existing
records, or adds a third-party backend. The app has no Base44 SDK, API, database or hosting dependency. Two
references to the name remain. `src/api/base44Client.js` is only a file name; it calls this NestJS API. A legacy
image-URL rewrite maps `media.base44.com/...` to the portal's own `/images/public/` folder.

## 1. Audit of the existing portal (before this work)

| Area | State found | Action |
|---|---|---|
| Login, logout, sessions, forgot/reset password, roles | Working (httpOnly cookie sessions, per-device rows, role guards) | Kept |
| Family / student registration | Working; DOB rule existed only in the main registration form | DOB rule applied everywhere (see 3) |
| Sagun registration | Working; backend already restricts to approved family members | "Latest Photograph" upload fixed (see 4); messages reworded |
| Sagun photo upload | **Broken for many real photos.** The server required the browser-declared type *and* file extension to match the bytes, so WhatsApp/Windows `.jfif`, `image/jpg`, `application/octet-stream` and extension-less files were rejected (`SAGUN_FILE_TYPE`). The file input was also disabled until a consent box was ticked, so tapping it did nothing. | Fixed |
| Transportation (Safar Saathi) | Working for family members; students excluded; no admin screen | Students allowed; admin management added |
| Room Hunting | **Demo only.** Sample listings and posts kept in browser `sessionStorage`; nothing reached the server | Rebuilt end to end (see 5) |
| News / Sandesh | Working list + admin CRUD; no categories, images, drafts or scheduling | Extended (see 6) |
| Global search | Missing | Added (see 7) |
| Header navigation | 12 flat links, crowded on laptops | Regrouped (see 8) |
| Public uploads (`POST /uploads`) | Rejected JPEGs labelled `image/jpg` / `image/pjpeg` | Aliases accepted; bytes still verified |
| Local database | Original XAMPP tables unreadable (error 1932) | Local work uses `npsi_local` (copied read-only from the test DB) |

## 2. Shared eligibility (backend)

`src/common/eligibility/community-account.ts` works out who a logged-in user is from registration records only:
- `FAMILY`: owner or member of an ACTIVE family;
- `STUDENT`: an ACTIVE registered student;
- `ADMIN`;
- none of these.

It never trusts data sent by the client. Where it is used:
- **Sagun:** keeps its own stricter family-only check.
- **Transportation:** families and students.
- **Room Hunting:** families and students.
- **Search:** decides whether a user may search their own family.

## 3. Date of birth

- **Backend:** `OptionalBirthDate()` (`common/validation/fields.ts`) accepts only a real date (`YYYY-MM-DD`) strictly before today in India time.
  - It applies to family members, students and student applications.
  - Registration (`registration.rules.ts`) uses the same India date, with the existing minimum ages (18 for a family member, 3 for a student) and a maximum of 120.
- **Frontend:** `src/lib/dates.js` sets the date picker's `max` to yesterday in every DOB field (registration, student registration, My Family, admin students, Sagun), and the same check runs before submit.

## 4. Photograph uploads

- **Sagun:**
  - The server decides the type from the file bytes (JPEG, PNG or WebP; PDF too for non-photo documents) and stores the file under a name it chooses.
  - The limit is 10 MB. A larger file returns 413, shown as a size message.
  - The consent box is still required. If a file is chosen before ticking it, the user sees a clear message and the box gets focus.
  - The input accepts MIME types, so iPhones convert HEIC photos to JPEG.
- **Public uploads:** `image/jpg`, `image/pjpeg` and `image/x-png` are normalised; the byte check is unchanged.

## 5. Room Hunting

### Tables (migration `20261121000000_room_hunting`)
- `rental_listings`
- `rental_requirements`
- `rental_matches`
- `rental_enquiries`
- `rental_audit_logs`

Only new tables are created. Areas and property types reuse `address_options`, with new kinds `RENTAL_AREA` and `PROPERTY_TYPE` managed in Admin → Address options. They are merged with built-in lists covering Indore, Rau and Pithampur.

### Rules
- **Who may post:**
  - **Listings:** only approved family members or registered students. Every listing starts PENDING; an admin approves it, and it expires after 90 days.
  - **Requirements:** anyone. Anonymous posts pass reCAPTCHA and wait for an admin. Registered users' posts are published at once. Requirements expire after 60 days.
- **What the public sees:**
  - names are shortened ("Ramesh P.");
  - mobile, email and address appear only if the owner or poster chose to show them;
  - no user, member or family IDs are ever returned.
- **Matching** (`room-hunting.rules.ts`):
  - Points: exact or related property type (40 or 15), same area (40), rent within budget (20; up to 10% over budget gives 5).
  - Listings meant only for families or only for students are kept apart.
  - The owner is notified only about strong matches (same area and within budget), in-app and by email when SMTP is configured.
  - The email result (`SENT`, `FAILED`, `UNAVAILABLE`, `NO_EMAIL`) is stored as it actually happened.
- **Enquiries:** registered members and students can send one enquiry per listing. The owner receives the enquirer's name and registered mobile, with the enquirer's consent.
- **Duplicates:** blocked through `clientRequestId` (protects against a double click) and through "same open listing or requirement" checks (409).
- **Owners:** can edit (which sends the listing back for review), mark rented, deactivate, re-list, or delete. Deleting archives the record, so history is kept.
- **Admins:** can approve, reject (remarks required), deactivate, expire, archive or restore. Every action goes into `rental_audit_logs`.

### Screens
- `/room-hunting`: public listings, people looking for rooms, the requirement form, and an "Add property" dialog.
- `/portal/room-hunting`: the member or student dashboard.
- `/admin/room-hunting`: listings, requirements, matching records and the audit log, with export.

## 6. Sandesh / News (migration `20261122000000_sandesh_fields`)

- **New columns on `announcements`:**
  - `category` (7 categories);
  - `image_url` (must be a portal upload);
  - `slug` (generated);
  - `author` (the admin's name);
  - `publish_at` (scheduled publication).
- **Statuses:**
  - `Draft`: being written.
  - `Active`: published, and visible only once `publish_at` has passed.
  - `Archived`: unpublished.
- **Admin page:** filters, a featured-image upload, Preview, and one-click Publish / Unpublish.
- **Public page:** category filter, search, images and category badges.

## 7. Global search (`GET /api/v1/search?q=`)

- **Everyone:** published news, events, community posts, Room Hunting listings and requirements, and portal pages (matched in the browser in English and Hindi).
- **Logged-in member:** also people in **their own family only**.
- **Admin:** also families (by Family ID, including just its trailing number), members and students.
- **Never returned:** contact details, Aadhaar, payments or documents.
- **Limits:** searches start at 2 characters, are debounced by 300 ms and have their own rate limit (300 per 15 minutes).
- **Header:** the search sits in the navy menu bar on desktop and in the menu drawer on phones. Results are grouped by category with keyboard support, and `/search?q=` shows the full results page.

## 8. Navigation

```
Home · About Us · Events & Programs · Sandesh
Services ▾  (Sagun, Transportation, Room Hunting, Medical)
Community ▾ (Community Services, Career & Business)
Contact ▾   (Contact Us, Feedback)
```

## 9. Transportation administration (migration `20261123000000_safar_admin_remarks`)

- **API:** `GET /safar-saathi/admin/entries` and `PATCH /safar-saathi/admin/entries/:id`.
- **Statuses:** OPEN, COMPLETED, CANCELLED, CLOSED, ARCHIVED.
- **Remarks:** the member gets an in-app notice with the new status and remarks.
- **Closing an entry** withdraws its open matches.
- **Admin page:** `/admin/transportation`.
- **Messages:** the visitor and non-member messages use the brief's wording in English and Hindi.

## 10. Admin dashboard

A "Services overview" section shows:
- Sagun applications (total and pending);
- rental listings and requirements (total and pending);
- open transport requests;
- the latest Sandesh items.

## 11. New API endpoints (all under `/api/v1`)

| Method | Path | Who |
|---|---|---|
| GET | `/room-hunting/options`, `/room-hunting/listings`, `/room-hunting/requirements` | Public |
| POST | `/room-hunting/requirements` | Public (reCAPTCHA) or logged-in user |
| GET | `/room-hunting/me` | User |
| POST / PUT / DELETE | `/room-hunting/listings`, `/room-hunting/listings/:id` | Member / student (owner) |
| PATCH | `/room-hunting/listings/:id/status`, `/room-hunting/requirements/:id/closure` | Owner |
| POST | `/room-hunting/listings/:id/enquiries` | Member / student |
| GET | `/room-hunting/admin/{stats,listings,requirements,matches,audit-logs}` | Admin |
| PATCH | `/room-hunting/admin/{listings,requirements}/:id/review` | Admin |
| GET | `/search` | Public (more for members / admins) |
| GET / PATCH | `/safar-saathi/admin/entries[/:id]` | Admin |
| GET | `/announcements?category=` | Public (published only) |

Full schemas are in `docs/openapi.json` (also copied to the frontend).

## 12. Migrations and rollback

Migrations are applied automatically on boot (`prisma migrate deploy`). They are additive only: new tables, new nullable columns and new indexes. Existing records are untouched.

| Migration | Rollback (manual, if ever needed) |
|---|---|
| `20261120000000_drop_stray_student_application_fks` | None needed (it drops foreign keys that should not exist) |
| `20261121000000_room_hunting` | `DROP TABLE rental_enquiries, rental_matches, rental_audit_logs, rental_listings, rental_requirements;` |
| `20261122000000_sandesh_fields` | `DROP INDEX announcements_slug_key ON announcements; DROP INDEX announcements_status_publish_at_idx ON announcements; ALTER TABLE announcements DROP COLUMN category, DROP COLUMN image_url, DROP COLUMN slug, DROP COLUMN author, DROP COLUMN publish_at;` |
| `20261123000000_safar_admin_remarks` | `DROP INDEX safar_entries_status_created_at_idx ON safar_entries; ALTER TABLE safar_entries DROP COLUMN admin_remarks, DROP COLUMN reviewed_at;` |

## 13. Test report

| Suite | Result |
|---|---|
| Backend unit tests (`npm test`) | 224 / 224 pass (new: matching rules, birth date, upload typing) |
| Frontend unit tests (`npm test`) | 13 / 13 pass (endpoint map vs OpenAPI) |
| Frontend browser tests (`npx playwright test`) | 146 pass, 2 skipped (live-server leak checks). New: Room Hunting (5), global search (2); navigation, Sagun and Safar tests updated for the brief's dropdown menu and texts |
| Frontend lint / build | 0 errors / builds |
| Backend contract tests (`npm run test:contract`, local DB user with CREATE rights) | 102 / 117 pass. All 15 failures share one cause in an **uncommitted change that was already in the working tree**, not made in this round: `common/utils/display-ids.ts` limits the id range to `< '<prefix>:'`. Under `utf8mb4_unicode_ci` (fresh databases) `:` sorts before digits, so no existing id is found and every create picks `…000001` → unique-key 500. The hosted/test DB uses `utf8mb4_bin`, where it works. |
| Live checks against the local API and DB | Room Hunting 28/28; search privacy 7/7; Sandesh 9/9; Sagun upload variants 6/6 + limits; real-browser Room Hunting UI 9/9; header search at 3 widths 14/14 |

## 14. Not done in this round (needs a decision)

- **Public member, family or student directories:** not added. The earlier security requirement was that no family sees another family's data. Search therefore shows a member only their own family, and only admins can search everyone.
- **SMS / WhatsApp notifications:** not added. Matches use in-app notices plus email when SMTP is configured.
- **Generic "form engine":** not added. Validation was added form by form instead, on both client and server.
- **Production / test deployment:** none. Nothing has been committed, pushed or migrated on remote databases.
