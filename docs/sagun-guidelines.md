# Sagun: government guidance and implementation boundary

Reviewed 29 October 2026. Sagun is a community matrimonial introduction service, not a government marriage registration service or a legal certification system.

## Eligibility and required fields

The backend validates completed age: groom at least 21, bride at least 18. Source: [Prohibition of Child Marriage Act, 2006](https://www.indiacode.nic.in/bitstream/123456789/19301/1/576a376198f41prohibition_of_child_marriage_act.pdf). Other profile fields marked required are Sangathan workflow requirements from the product specification, not a claim that government mandates those fields. Optional documents and customary offerings cannot be made mandatory by admin settings.

## Customary presents

The [Dowry Prohibition Act and 1985 present-list rules](https://wcd.delhi.gov.in/wcd/dowry-prohibition-act) distinguish undemanded presents from prohibited dowry. Merely recording something as voluntary does not establish that it is lawful. Gift advertisements, compulsory amounts and payment collection are not supported.

Private item rows support description, approximate value, actual donor name, relationship, recipient and date. Planning entries remain separate from actually given presents. The private worksheet separates bride and groom lists and provides spaces for both signatures. Missing metadata is flagged. It is an unsigned worksheet to complete and sign offline, not an electronic signature, official filing or proof that a present meets the law. Thumb impressions and any necessary reader/witness signatures must be handled according to the actual rules outside this digital worksheet. Traditional free-text summary fields are planning notes, not substitutes for a completed list.

## Data use and privacy

The [notified DPDP Rules, 2025](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf), rule 1, specify phased commencement: rules 1, 2 and 17–21 immediately, rule 4 after one year, and rules 3, 5–16, 22 and 23 after eighteen months from publication. Do not describe all substantive provisions as already in force on the review date.

The interface explains purposes, exposure and available correction, withdrawal and deletion controls in both languages. Withdrawal is an owner-only transaction: clear consent flags, deactivate, set private and revoke pending/accepted inquiry grants. It does not delete the stored profile; Delete removes the profile and attached files. Minimal audit and notice metadata remains. Private files require authorization and live outside public uploads. Configure production HTTPS, private persistent storage and restricted backups as described in README. The Sangathan must own its actual retention schedule, privacy contact, incident response and any legally required review; code alone cannot certify organization-wide compliance.

## One-page operation

Open `/sagun` for registration, draft saving, preview, profile edits/deletion, searches, inquiries, privacy controls and private gift records. Admins can select **Manage Sagun here** on the same URL for approvals, CRUD, audit history and field settings. Existing `/admin/sagun` remains compatible. All actions use the authenticated backend and database; changing the UI mode never grants a role.

## Verification

`node scripts/verify-sagun-transaction.mjs` checks real database persistence and permissions in an always-rolled-back transaction, with temporary private storage and no external messages. Frontend browser tests cover both languages, mobile form flows, same-page admin switching, private worksheets and consent withdrawal. Unit tests validate age, required fields, optional offerings, gift metadata and protected configuration.

Matrimonial-purpose and truthful-information declarations are required before submission and cannot be bypassed by admin consent. Existing approved profiles without these declarations must be resubmitted before becoming visible. The government's matrimonial advisory is discussed in this [official parliamentary answer, paragraph xviii](https://sansad.in/getFile/loksabhaquestions/annex/10/AU127.pdf?source=pqals). The organization supplied info@npsindore.org as the privacy/complaint email. The page displays a mailto link in both languages. No officer name or phone number is published because these have not been supplied.
