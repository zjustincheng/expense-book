# Website workflow review — 2026-09-09

Tested in installed Chrome against a fresh Next.js production build and isolated PGlite database. These checks do not exercise live AWS services.

## Fixes

- Project/category creation no longer reports a false failure after saving: the form element is retained before awaiting the request.
- Applied the same form-reset fix to split-template and recurring-transaction creation.
- Label creation clears stale messages, shows a saving state, and disables repeated submissions while saving.
- Dashboard action buttons wrap on small screens. Both existing mobile overflow checks now pass.
- Browser selectors use precise accessible combobox names rather than matching option text in surrounding labels.

## Browser coverage

- Group creation, zero balances, income preview/posting, partial settlement, member management and invitations.
- Draft persistence/discard, stale previews, lost-response retries, detailed allocations and mobile draft editing.
- Partial refunds, refund reversal and atomic corrections.
- Project and category creation, reset, persistence after reload and selection in entry forms.
- Equal split-template creation and application to participants.
- Empty report/export, search navigation, empty recurring schedule and bulk due action.
- CSV preview and creation of review drafts; account settings loading.

## Further verification needed

- Live Cognito sign-in, expiry and logout; SES delivery; S3 upload/download/delete.
- Full report export under concurrent posting and large datasets; charts across multiple pages.
- Individual recurring schedule edits/pause/resume and date edge cases in the browser.
- Cross-browser testing, full keyboard/screen-reader audit, and deployed container/network behavior.

Passing this suite is evidence for the listed flows, not a claim that every feature or error path is covered.
