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

## 14. Sagun Bandhan Digital Cards and printable booklet (migration `20261124000000_sagun_digital_cards`)

### How it fits the existing Sagun module
- **No duplicate data.** Personal details, approval status and photos stay where they were (`sagun_profiles`, `sagun_files`).
- **New table `sagun_digital_cards`.** It holds only the card's own identity:
  - the printed **Sagun profile ID** (`SB-<year>-<serial>`, e.g. `SB-2026-0001`);
  - a random **QR verification token**;
  - the design version;
  - the "selected for booklet" flag and when the card was last published in a booklet.
- **Card creation.**
  - A card is created the moment a profile is submitted, after the submission commits, so a card problem never blocks a member's form.
  - Profiles submitted before this feature get a card the first time an admin opens the page.
- **Approve / Reject.** These use the existing review API (`PATCH /sagun/admin/profiles/:id/review`).
- **Owner edits.** When a member edits an approved profile, it goes back for review as before. It drops out of the booklet until it is approved again, and it keeps the same card and profile ID.
- **New table `sagun_booklet_history`.** It is the print history: title, edition, profile ids, layout, page count, who generated the booklet and when, and the stored PDF.

### What the card shows
- **Only submitted, non-blank fields:**
  - photo, name and category;
  - age, height, education and occupation;
  - village, district and profile ID;
  - a QR code.
- **Father's name, parent's mobile and full date of birth** appear only if the owner ticked a new optional consent, `bookletContactConsent`. It is in the Privacy step of the Sagun form and is "locked", so admins can't change or remove it. Until then the card shows only the age. These three fields were already private (`contactKeys`).
- **Who can go into a booklet.** The same rule decides who members can see in the portal: approved, *Visible to Approved Members*, every consent given, an active owner account and a photo. Private, withdrawn or unapproved profiles can't be selected (409), and the admin sees the reason.
- **QR code.** It holds a real link: `<FRONTEND_URL>/sagun/verify/<token>`. The public check (`GET /sagun-cards/verifications/:token`, rate-limited) only says whether the card is genuine and active. While the card is active it also shows name, category and village. It never shows contact, family or document details.

### PDF generation
- **Library.** The PDF is built on the server with **pdfkit**: vector text, embedded and subset fonts, and Devanagari shaping, so text stays selectable. It is not a screenshot.
- **Fonts.** Noto Sans and Noto Sans Devanagari (SIL Open Font License, `src/assets/sagun-cards/fonts/OFL.txt`).
- **Logo.** The supplied official shield logo (`src/assets/sagun-cards/nps-logo.png`).
- **Assets on deploy.** nest-cli copies `src/assets` to `dist/assets`, so a normal `dist/` deploy includes them.
- **Photos.** **sharp** straightens photos (EXIF), crops them to the frame and limits them to 600 px, which keeps a large booklet a few MB. If sharp can't load on a server, JPEG and PNG photos are used as stored.
- **Card.** A 600 × 400 pt page (≈ 212 × 141 mm).
- **Booklet.** A4 portrait, in this order:
  - cover;
  - index (serial number, name, profile ID, category, page);
  - boys, then girls (or together);
  - closing page (social message, `info@npsindore.org`, optional admin contact line).
- **Layouts.** 1, 2 (recommended) or 4 cards per page. A card is never split across pages, and every page is numbered.
- **Preview.** The admin page renders the actual PDF with pdf.js (works on phones too), so the preview is what prints.
- **Storage.** Generated booklets are stored in the private Sagun folder (`SAGUN_PRIVATE_DIR/booklets`, mode 0600) and can be downloaded again from Print History.
- **Audit log.** Every selection, card generation, booklet generation and booklet download is written to `sagun_audits`.

### APIs (admin only unless noted)

| Method | Path | Purpose |
|---|---|---|
| GET | `/sagun-cards/stats` | Overview counts |
| GET | `/sagun-cards?state=&category=&q=&place=&selected=&eligible=&sort=` | Cards with printable details |
| PATCH | `/sagun-cards/selection` | Select / deselect for the booklet |
| GET | `/sagun-cards/:profileId/pdf` | One card as PDF (preview / print) |
| GET | `/sagun-cards/verifications/:token` | **Public** QR check |
| POST | `/sagun-booklets/plans` | Profile and page count before generating |
| POST | `/sagun-booklets/previews` | Booklet PDF, not saved |
| POST | `/sagun-booklets` | Generate, store and add to print history |
| GET | `/sagun-booklets` | Print history |
| GET | `/sagun-booklets/:id/pdf` | Download a stored booklet |

### Screens
- **`/admin/sagun-cards`** ("Sagun Digital Cards" in the admin sidebar). Tabs:
  - Overview;
  - All, Boys, Girls, Pending, Approved, Rejected;
  - Printable booklet;
  - Print history.
- **Actions:** card preview, print, PDF download, approve, reject (reason required), select for booklet (single or all shown) and edit (opens the existing Sagun admin).
- **Booklet options:** title, edition, contact line, cards per page, separate or together, boys and girls or only one, sort by name or date, and include cover, index or closing page. Large booklets ask for confirmation.
- **`/sagun/verify/:token`.** The public page behind the QR code.

### Rollback
`DROP TABLE sagun_booklet_history; DROP TABLE sagun_digital_cards;` Profiles, files and approvals are unaffected. Stored booklet PDFs can then be deleted from `SAGUN_PRIVATE_DIR/booklets`.

### Tests
- **Backend unit tests:** 232/232. New tests cover the booklet plan and index page numbers, consent rules, blank fields, booklet eligibility, mixed-script text and profile codes.
- **Live run on the local API and database: 29/29.**
  - Submit, card created, pending card can't be selected.
  - Members and plain users are refused (403).
  - Approval through the existing API.
  - Card PDF, booklet plan, preview (not saved), generate, history and download.
  - Validation errors (400).
  - Public QR check (valid, under review, unknown).
  - Owner edit with the new consent, re-approval keeps the same ID.
- **QR:** read back from the rendered card; it opens the verification page.
- **Real browser (desktop and phone):** card and booklet preview from the PDF, print history, no sideways scrolling, no page errors.
- **Frontend browser tests:** 150 pass, 2 skipped (4 new).

## 15. Event team members, Core Team, existing-profile reuse, audits (migration `20261125000000_event_team_members_core_team`)

"Dev Utsav" is the **Sneh Deepotsav 2026** event (confirmed with the owner). The Core Team is the Sangathan's own.

### Event team (Team Members on the event page)
- **New page `/events/:slug`.** It shows the event, its **Team Members** and a **Join the event team** form. Event cards on `/events` link to it.
- **No new team table.** Joinings go into the existing **event roster** (`event_roster`). New columns: `student_id`, `user_id`, `photo_url`, `area`, `show_mobile`, `show_on_website`, `review_status`, `review_remarks`, `source`.
- **Existing roster rows** default to `APPROVED`, not shown on the website. The admin-only roster is therefore not suddenly published.
- **Who can join:** a logged-in family owner, family member or student, picking from **their own family's members and own student record only** (`GET /event-teams/:event/candidates`).
- **What fills in automatically:** name, father/guardian, village, mobile, Family / Member / Student ID and photo, from the registration. Verified details can't be overwritten. The person adds their Indore area, optionally a new photo, and, if the record has none, a village or mobile.
- **Duplicates:**
  - The roster row is linked to the existing family member and student ids. A member who was a student appears **once**, carrying both ids.
  - One request per person: the unique index plus a double-click race test give 201 + 409.
  - Withdraw and re-join reuse the same row.
  - No family, member, student or user record is ever created (verified by row counts).
- **Admin review:** Admin → Event Finance → **Team Requests**.
  - Open or close team joining.
  - Approve, or reject (reason required).
  - Show on or hide from the website, and edit the area or photo.
  - Hide the mobile. Only the member can choose to show it.
- **Public cards:** only approved rows whose member agreed to be shown. The mobile appears only with the member's consent. No family, member or student ids are included.
- **Event switch:** `events.team_joining_open` (DTO, VO and the Team Requests switch).

### Core Team
- **New table `core_team_members`.**
  - Linked by foreign key to `family_members` (`member_id`). The student id is unique.
  - Display fields: Hindi and English name and designation, photo, village, area and mobile.
  - Status and order, with soft delete.
- **Public page:** `/core-team`, with a **"Core Team" link in the site footer** (every page, desktop and mobile) and a card on the event page.
- **Admin page:** `/admin/core-team`.
  - Add by **linking an existing member or student** through an admin-only search (name, mobile, Member / Family / Student ID; mobiles masked to the last 4 digits), or by hand.
  - Edit, activate or deactivate, remove (soft; adding again restores the same record), reorder and upload a photo.
  - The same person can't be added twice (409).
  - Showing a mobile requires the admin to confirm the member's consent.
- **Not a duplicate of the "Senior & Discipline Committee".** That is a separate About-page section with introductions; the two share only the card style.

### Reusable profile card
`components/team/ProfileCard.jsx`:
- a 4:5 photo, with initials when there is none;
- name and role;
- village, area and a consented mobile.

Empty fields are never shown. It is used by both the Core Team and the event team.

### Fixes found during the audit
- **Fake public forms.**
  - The **Contact Us (`/contact`) and Feedback (`/public-feedback`) forms were demo forms.** They saved to the browser only, and nothing reached the Sangathan.
  - Replaced with a real form, `POST /feedback/public`: no login, reCAPTCHA and a rate limit. An enquiry needs an email or mobile, and markup is rejected. Messages are saved with member feedback and answered in **Admin → Feedback**, and the visitor gets an `FB-…` reference.
  - The unused demo component and its sample data were removed.
- **Roster deactivation did nothing.** The roster save always wrote `ACTIVE`, so an admin could not deactivate a roster member. It now keeps the status sent.
- **Wrong father's name.** Roster and team suggestions used the family head's name as "father" for everyone, including the head. `guardianNameOf` now uses the head's name only for a son or daughter, and the family's "Father" member for the head. Nothing is guessed otherwise.
- **Second login account for students.** A student registering while logged in (same email) was not linked to that account, so approval tried to invite a second login. The application now records the account. A parent registering a child with another email is not linked.
- **Double submissions.** The six Event Finance forms (contributions, expenses and others) could be submitted twice by a double click. They now lock while saving.
- **Uploads checked up front.** Every image upload (11 forms through the shared helper) now checks type and 5 MB before sending, with a bilingual message. The server check is unchanged.
- **English names.** "Safar Saathi" is now **Transportation** and "Sehat Saathi" is now **Health Support** in pages, the menu ("Medical" became "Health Support"), sidebar, home cards, search, emails and notifications. Hindi was already यातायात सहयोग / स्वास्थ्य सहयोग. Internal routes, API paths and table names are unchanged.

### Admin navigation audit
- No duplicate sidebar entries; every entry has a route and every admin route is in the sidebar.
- The sidebar is now in logical order:
  1. Dashboard;
  2. registrations and members;
  3. services;
  4. events;
  5. organisation (Samiti, Core Team, Senior & Discipline Committee);
  6. content;
  7. communication;
  8. settings.
- Distinct icons replace the repeated "Users" icon.
- The dashboard has no duplicate widgets.

### Duplicate data report (read-only)
- **Script.** `node scripts/duplicate-report.mjs [--json]` uses the API's connection (`.env.local`, then `.env`) and **changes nothing**. It groups records only by reliable identifiers: membership id, mobile, email, and name + birth date + mobile. Names alone never count.
- **On the local copy of the test database it found:**
  - **3 membership ids each given to 2–3 different people** (legacy `PSI-MEM-…` imports);
  - one mobile number used in several families;
  - one probable double entry (same name, birth date and mobile);
  - families sharing an email.
- **These need an admin decision.** Back up the database, decide who keeps the id, then merge or renumber. Nothing was merged automatically.

### APIs

| Method | Path | Who |
|---|---|---|
| GET | `/event-teams/:event` | Public: event, teams, approved members |
| GET | `/event-teams/:event/candidates` | User: own family / own student with details |
| POST / DELETE | `/event-teams/:event/joinings[/:id]` | User: join (rate-limited) / withdraw |
| PATCH | `/event-finance/admin/events/:eventId/roster/:id/review` | Admin |
| GET | `/core-team` | Public |
| GET / POST / PATCH / DELETE / PUT | `/core-team/admin`, `/core-team/admin/people`, `/core-team/admin/:id`, `/core-team/admin/order` | Admin |
| POST | `/feedback/public` | Public (reCAPTCHA, rate-limited) |

### Rollback
See the header of the migration file. It drops `core_team_members`, `events.team_joining_open` and the new `event_roster` columns and indexes.

### Tests
- **Unit and browser tests:**
  - backend unit tests: 233/233;
  - frontend browser tests: 154 pass, 2 skipped (new: team page, join form, Core Team public and admin, real Contact/Feedback form);
  - lint: 0 errors; build passes.
- **Live checks on the local API and database:**
  - **Family member and Core Team: 41/41.** Joining while closed is refused. Only the own family is suggested, and a member who is also a student appears once. Another family's member can't be registered. Consent and photo are validated. A double click gives one request. Pending members are hidden, and approved ones appear with consent rules. The admin can hide but not force-show a mobile. Edit, reject and withdraw work, and re-joining reuses the row. Unauthorized access gets 401/403, and **no family, member, student or user records are created**.
  - **Student: 9/9.** A logged-in student registration is linked to the account on approval, with no second login. The student sees only their own record with autofill, joins the team, can't join twice and appears without a mobile.
  - **Public message:** saved as `FB-…` and visible in Admin → Feedback. Without reCAPTCHA or consent, or with an invalid kind, it is refused.
- **Real browser, desktop and phone:** event page, footer Core Team link, Core Team page, join form, admin Core Team and Team Requests. No sideways scrolling and no page errors.

### Not done (needs a decision or is out of scope for one round)
- **Autocomplete on public forms.** Smart suggestions of *other people's* records on public forms are not added. Suggestions are limited to the visitor's own family/student (team join) and to admin-only search (Core Team, roster), as the brief's privacy rule requires.
- **Duplicate cleanup** (merging or renumbering) awaits an admin decision on the report above.
- **Full CRUD and form audit.**
  - Every form was scanned for double-submit, loading, upload, mobile and date checks, and the problems found were fixed (above).
  - A full click-through of every admin CRUD screen was not repeated in this round. The earlier rounds' tests cover Sagun, Room Hunting, Transportation, Sandesh and registrations.
- **Contract tests:** the contract tests (`tests/contract`) were not extended for the new endpoints.

## 16. Family Member Login and Student Login separation (no migration)

**Root cause.** There is one `users` table and one login endpoint (`POST /auth/sessions`). It checked only the password; nothing compared the account with the portal the person used, and the frontend's "Student Login" was the same `/login` page with a different return address. A second path linked roles: approving a student application invites `application.email`, and `invite()` reuses an existing account with that email, so a student entered with a parent's email became a student of the parent's Family Member login.

**Account type, from the database only** (`src/common/eligibility/login-account.ts`, `loginAccount()`):

| Records attached to the login | Type |
|---|---|
| family owned (`owner_user_id`), family email, member email, or family application (user id / email) | FAMILY |
| student (user id / email, not TRANSFERRED) or student application (user id / email) | STUDENT |
| none | NONE (new account: may use either portal to start a registration) |
| `role = admin` | ADMIN (Family Member Login only) |

Status: ACTIVE, PENDING, CORRECTION_REQUIRED, REJECTED, SUSPENDED, INACTIVE. When both kinds exist the stronger status wins (an approved student who has only applied for a family stays a student until approval, the existing upgrade path); a tie goes to the family, as `communityAccount()` already does. Such logins are listed as `loginsWithFamilyAndStudent` by `scripts/duplicate-report.mjs` (none in the local copy).

**Rules now enforced by the server**
- `POST /auth/sessions` and `POST /auth/otp-verifications` take `portal` (`FAMILY` default, `STUDENT`). After the password/code check, a mismatch is a 403 with the exact messages from the brief; no session is created. Wrong password stays the generic 401 and the account type is not even looked up.
- Suspended/inactive family membership, inactive student, or a `users.status` other than `active`/`invited` → 403 with a status message. Such accounts also lose their existing sessions at once (`SessionService`).
- Pending / correction / rejected registrations may sign in to see their status; the restricted features keep checking for an ACTIVE family/student (`communityAccount`, `ownFamilyId`, which now also requires the member's family to be ACTIVE).
- `GET /auth/me` and the login response include `account: { type, status }`; the frontend routes by it and never trusts browser storage.
- A Family Member login can't submit a student registration for itself (`POST /me/registrations`, 409).
- A public student application can't use the email of a Family Member/admin login (409), unless it is the linked family member's own email.
- Approving a student application whose login would be a Family Member account is refused (409), asking the admin for a correction with the student's own email.
- Password reset is per login and its responses are unchanged (no account-type hint).

**Frontend.** The login page has a "Family Member Login / Student Login" switch (`?portal=student`; the public Student Login link uses it), sends the portal, shows the server message in English or Hindi with a "Go to …" button, and redirects by the returned account (admin → `/admin`, student → `/portal`, new account on Student Login → student registration). Family pages (`/portal/family`, `/portal/event-kharcha`) are hidden from and redirect away for Student accounts.

**Tests.** Backend unit 249/249 (new: `login-account.spec.ts`, portal cases in `auth.service.spec.ts`, crossover cases in the student application and review specs). Browser 157 passed, 2 skipped (3 new login tests). Live against the local API and database: 19/19 login/crossover scenarios and 4/4 suspended-account checks (status restored), no records created. Local login classification: 38 FAMILY, 12 STUDENT, 4 ADMIN, 8 NONE, 1 FAMILY pending.

## 17. Become an NPSI Event Member — one membership workflow (migration `20261126000000_event_member_applications`)

Replaces the separate event "Join the team" form, Event Finance → Team Requests and the Core Team admin page with one application workflow.

**Data.** `event_member_sections` (Core Team, Deepotsav Team, Maa Na Garba Team, Holi Milan Team, plus sections the admin adds; each optionally linked to an event page), `event_member_applications` (one per person per section; also the public card once approved: photo, name, mobile + `mobile_public`, email + `email_public`, village, area, visibility, status, reason, links to member / student / family / user, roster row) and `event_member_application_logs` (history). `active_key` (unique, set while PENDING/APPROVED) stops a second open application for the same member, student or mobile in the same section. The migration copies the live Core Team rows and the self-service roster requests into applications with their current status and visibility (no duplicate cards); `core_team_members` and `event_roster` keep their rows. Rollback SQL is in the migration header.

**Flow.** Footer "Become a Member" and the dashboard button "Become an NPSI Event Member" open the same popup (`BecomeMemberDialog`): section or Other + event name, photo, name, mobile, email, village, Indore area, mobile/email display consent, consent. Logged in, it lists the account's own people (family members, own student record) and fills their details; edits stay on the application, the master record never changes. Logged out: reCAPTCHA, no lookup of existing members. Admin (Super Admin → Become a NPSI Event Member): table with S. No., photo, name, mobile, email, village, area, event, date, status, actions; status/section filters, search, pagination, event-wise counts; view + history, approve (OTHER must be mapped to a section; confirmation), reject with reason, edit public details / section / order / photo, show-hide, hide mobile/email (never publish without consent), remove membership (records and login untouched), add for an existing member (people search), and a Sections tab to map teams to event pages, open/close them and add new ones. Approving shows the card in its section at once: `/events/<slug>` under the section heading (e.g. "Deepotsav Team"), `/core-team`, or `/teams/<key>` for teams without an event page (Holi Milan). For event-linked sections the approval also adds/updates one row in that event's roster (Event Finance), reusing an existing row for the same member/student; repeated approvals change nothing.

**Removed.** `event-teams` and `core-team` API modules, the roster review endpoint, the Team Requests tab, the event-page joining form, the Admin Core Team page (its URL redirects to the new menu filtered to Core Team). Event Finance is otherwise unchanged. The `events.team_joining_open` column from migration 20261125 is no longer used.

**Tests.** Backend unit 258/258 (new `event-members.service.spec.ts`); browser 158 + the gallery test on rerun, 2 skipped (6 new tests in `teams.spec.js`); live acceptance A–G against the local API and database 49/49 (existing members intact, linked records and counts unchanged, roster row reused, everything created by the test removed and the one migrated row it touched restored); end-to-end in a real browser: public popup → admin approval → card on `/teams/holi`.

## 19. Release check: both languages, reCAPTCHA, browsers, console errors (no migration)

- **reCAPTCHA v3 on every public form.** Already on registration, sign-up, contact, feedback, contact info, room requirements, event membership, student registration and anonymous uploads. Added: login (`POST /auth/sessions`), resend code (`POST /auth/otps`), password reset by email (`POST /auth/password-resets`) and by mobile (`POST /auth/mobile-otps` with `purpose: RESET`). Checked before credentials, so it is not an account probe. Unit test and browser test added.
- **`GET /auth/sessions/current`** (new, additive): `{ user: MeVo | null }`, always 200. The website checks the session with it, so visitors no longer get a 401 "Unauthorized" error in the browser console on every page. `GET /auth/me` is unchanged; the frontend falls back to it when the API is older (404). Unit, contract and browser tests added.
- **Bugs fixed**
  - Admin → Event Finance → Teams & Responsibilities: `AssignmentForm` used `saving` without receiving it (page crash on that tab). Lint now has `no-undef` so this cannot pass again.
  - Safari showed "Load failed" when the API could not be reached; every API call now raises one clear bilingual network message (`apiFetch`).
  - Admin → Page Content on phones (Firefox / Safari): the page list pushed the page sideways.
  - React warnings: key spread on Community Services; React Router v7 future-flag warnings (flags set).
  - 404 page: removed the leftover Base44 "AI hasn't implemented this page" admin note; now bilingual.
- **Admin banner photos** (Admin → Page Content → hero) now show on Transportation, Health Support and Sagun (faded behind the hero, `HeroBackdrop`) and Room Hunting (under the heading); before, only the heading and text changed there.
- **Lint clean:** frontend 0 errors and 0 warnings (unused `catch` bindings and variables removed). Backend Biome keeps 6 style warnings (optional chain / non-null assertion) that are intentional: the values are validated first and the checks keep TypeScript narrowing.
- **Hindi / English.** Translated: member portal menu and brand, Event Kharcha page (was Hindi only), Admin Event Finance (was English only, `lib/event-finance-copy.js`), status badges everywhere (`statusLabel`), admin notification and transaction types, registration payment statuses, home announcement badges, Senior Committee heading and placeholder, pagination / password / toast / carousel labels. Text still in English in Hindi mode is **data typed by admins or members** (names, colleges, news and event text without a Hindi version, old notifications); admins fill the Hindi fields to change it.
- **Testing**
  - Backend: unit 277/277, coverage 85.8 %, Biome clean.
  - Frontend: lint 0 errors, unit 14/14, browser 815 passed on Chrome, Firefox, Safari (WebKit), Pixel 7 and iPhone 13 (`npm run test:browser:all`).
  - Live crawl of every route as visitor, member, student and admin, in English and Hindi, desktop and phone, in all three browsers: no page errors, no console errors except the one local test event banner saved with `http://localhost:4000/uploads/…` (local data only), no sideways scroll.
  - Live admin CRUD (create, read, update, delete) on announcements, rules, principles, page blocks, home highlights, address options, community posts, samitis, events and the senior committee: all passed; test rows removed.
- **Not run:** `npm run test:e2e` and `npm run test:contract` need a MySQL user that may create the throwaway databases `npsi_e2e_test` / `npsi_contract_test`; the local `.env` user gets `ER_DBACCESS_DENIED_ERROR`.

## 20. Maa Na Garba finance statement in the Event Finance roster (migration `20261128000000_event_finance_statement`)

- **Schema (additive):** contributions get `serial_no`, `contribution_group` (`GENERAL` = Sahyog Rashi, `BHOG_PRASAD` = Mataji Bhog & Prasad), `notes`, `review_note` (admin-only flag), `import_key` (unique); expenses get `title_hi`, `description_hi`, `expense_group` (`EVENT` / `ORGANIZATION`), `serial_no`, `import_key`; categories get `name_hi`. Existing rows keep their values.
- **API:** the event summary adds `contributionGroups` and `expenseGroups` (approved totals per section, computed from the records). New `GET /event-finance/admin/events/:eventId/history[?entityId=]` (admin): audit log with the admin's name. Members never see review notes, family ids, payment references, full mobiles or import keys.
- **Import:** `npm run build && node scripts/import-event-finance.mjs --file database/finance/maa-na-garba-2026.json --actor <admin email> --void-existing-expenses [--apply]`. Dry run by default; it refuses to run when the file does not match the statement totals, skips lines already imported (import key) or already typed in by hand, and writes an audit entry per record. The data file lives in the git-ignored `database/finance/` (donor names and amounts).
- **Statement checks (both PDFs):** 186 Sahyog lines + 4 Bhog/Prasad lines; 10 Maa Na Garba expenses + 1 Swajan Samaroh expense.
  - The printed "Total Sahyog Rashi ₹11,09,477" leaves out lines 43, 49 and 54, whose amount is printed "51,00" (₹15,300 together if each is ₹5,100). They are imported as ₹5,100, **PENDING**, with a review note; the approved totals then equal the statement: received ₹12,32,977, spent ₹10,98,185, balance ₹1,34,792. Approving them after checking the receipts raises the totals by ₹15,300.
  - Informational review notes: same names on lines 43/181 and 63/123 (kept as separate entries, as printed), "Paidar" (145) and "Jitentra" (53) kept as printed.
  - The expense PDF says **स्वजन समारोह (Swajan Samaroh)**, not "वजन/weighing ceremony"; the PDF wording is used.
  - The event's 9 earlier draft expenses (₹8,79,269, an older version of the same statement) were **voided** (kept in history) and replaced by the 11 statement lines, as decided by the user.
- **UI:** `components/finance/FinanceStatement.jsx` on the member Event Kharcha page and Admin → Event Finance (summary cards, section subtotals, search, village / section / status / amount filters, sorting, 50 per page, totals under every table, Excel), admin row actions (edit, approve / reject, history, void), new form fields (S.No., section, notes, review note, Hindi title / description, category Hindi name), History tab. Reports: contributions, expenses and full summary as print-ready pages (logo, event, totals, page numbers, generation date; Hindi in Noto Sans Devanagari) saved as PDF from the browser.
- **Applied locally** (database `npsi_local`, event "Navratri Garba Mahotsav 2026"); every one of the 186 donor lines was compared with the PDF list: 0 differences. **Not applied to the live database.**
- Fixed on the way: nested `<main>` on the member Event Kharcha and Admin Event Finance pages.

## 18. Not done in this round (needs a decision)

- **Public member, family or student directories:** not added. The earlier security requirement was that no family sees another family's data. Search therefore shows a member only their own family, and only admins can search everyone.
- **SMS / WhatsApp notifications:** not added. Matches use in-app notices plus email when SMTP is configured.
- **Generic "form engine":** not added. Validation was added form by form instead, on both client and server.
- **Production / test deployment:** none. Nothing has been committed, pushed or migrated on remote databases.
