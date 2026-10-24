# HaulConnect project state

Historical inspection notes follow; the latest dated section supersedes older implementation status. Inspected 2026-09-27 from actual source and Git state. This is a source inspection plus TypeScript check, not confirmation of deployed services or device behavior.

## Already completed in source
- Branded Expo/React Native application with customer, driver, and admin screens and role-based drawer navigation.
- Customer booking/payment-choice UI; driver deliveries, opportunities, status progression, proof-photo capture/preview, and test-job flow; tracking map and admin metrics UI.
- Firebase account creation, sign-in/out, session restoration, password reset, verification email, profile basics/avatar/photo helpers, and account deletion flow.
- Driver signup vehicle/capability fields; foreground GPS and reverse geocoding; Firebase location writes.
- Firebase job status and photo-upload helpers; native permissions, icons, application identifiers, and EAS preview/production configuration.

## Currently working / verification limits
- Existing source, dependencies, assets, and pnpm lockfile are present. Native functionality is implemented but was not launched or validated against Firebase during this inspection.
- Git is initialized on main, at initial commit 4c4c343 (2026-06-26); no remote is configured. Most app development remains uncommitted.
- Ignore checks confirm node_modules, .expo, .expo-home, dist-check-auth-timeout, and .env.local are excluded. No currently tracked files match current ignore rules.
- TypeScript check was run using the bundled Node runtime and local tsc; the initial inspection failed because clearUserProfilePhoto was not imported. Fixed 2026-10-02; tsc --noEmit now passes.

## Known problems
- Plain .env and .env.production are not ignored; only .env*.local currently covers environment files.
- API keys are embedded in app.json and firebaseBackend.ts. Values are intentionally omitted here. A full staged-tree and history secret review is still needed; deployed restrictions and backend rules were not inspected.
- .claude/settings.json is already tracked and should be reviewed for machine-specific or sensitive content before publishing.
- pnpm-workspace.yaml contains unresolved textual allowBuilds settings for two dependencies.
- README.md claims local-only state and proposes Supabase; docs/backend-schema.md proposes Supabase and Stripe fields. Both lag the actual Firebase implementation and Square UI policy.
- Jobs initialize from local demo data. Status/photo writes do not establish complete job loading or cross-device subscriptions; updates may be local even when backend calls fail.
- Signup seeds shared demo jobs. Photo removal is local in the inspected handlers. Account deletion can leave backend records/assets if cleanup fails.
- GPS capture is on demand; continuous tracking and remote customer subscriptions are unfinished. Map coordinates include demo locations.
- Existing shell launchers are tied to this machine. A declared web command is not a verified web build.

## Unfinished features
- Durable customer booking, backend-driven job lists/assignment, robust sync/retries, and production driver dispatch.
- Real Square checkout/authorization/capture, payment reconciliation, payouts, and cash/check review workflows.
- Production location tracking/routing, push notifications, dynamic history/earnings, and complete help/legal flows.
- Backend authorization/security-rule verification, complete deletion cleanup, and device validation of auth/photo/location flows.
- Automated tests, linting, CI, and confirmed store-ready builds.

## Important files
- App.tsx: main UI, types, local navigation/state, demo data, booking/driver/admin/profile/map screens.
- firebaseBackend.ts: Firebase initialization, auth/profile/job/photo/location helpers.
- index.ts: app registration.
- app.json / eas.json: Expo/native permissions and build configuration.
- package.json / pnpm-lock.yaml / pnpm-workspace.yaml / tsconfig.json: dependencies and tooling.
- assets/: app branding and icons.
- .gitignore: existing exclusions, with environment gaps noted above.
- run-expo.sh / run-expo-tunnel.sh: machine-specific launch helpers.
- README.md / docs/backend-schema.md: historical documentation requiring reconciliation.
- dist-check*/: prior generated exports; their presence does not prove current builds pass.

## Working-tree baseline before this documentation update
Modified tracked files: .gitignore, App.tsx, app.json, assets/android-icon-foreground.png, package.json, pnpm-lock.yaml.
Untracked: README.md, assets/haulconnect-logo.png, docs/, eas.json, firebaseBackend.ts, npm (empty file), pnpm-workspace.yaml, run-expo-tunnel.sh, run-expo.sh.
This task updates AGENTS.md and adds PROJECT_STATE.md only; no files are staged, committed, removed, or pushed.

## Safest next steps
1. Preserve the existing tree; review Git diffs and candidate files without broad staging.
2. Expand exclusions for all local environment/configuration secrets and generated output; retain only sanitized example configuration. Review tracked personal tool settings and the empty npm file without deleting work blindly.
3. Externalize embedded API keys into local/build configuration; verify service restrictions and backend access rules. Keep server secrets outside any client bundle. Review history as well as current content before pushing.
4. Fix the missing import, resolve package-manager configuration deliberately, and rerun type checking. Validate a suitable native build and device flows with test data.
5. Reconcile the README/schema documentation. Scan the exact staged file set for credentials, oversized generated assets, and personal data.
6. Confirm the intended GitHub owner/repository and visibility, configure the remote, then commit/push only the reviewed files. No repository destination has been supplied in this continuation.

## Android preview build — 2026-10-02
- Fixed missing clearUserProfilePhoto import; local TypeScript validation passed.
- Added .easignore based on existing Git exclusions, also excluding local environment files and .claude tooling settings from build uploads.
- Submitted Android preview build with existing EAS remote signing credentials; upload succeeded. Completion and device behavior are not yet verified.
- Build: https://expo.dev/accounts/junkbiz760s-organization/projects/haulconnect/builds/2c4f2759-cdcc-4af8-8777-17b8ae00c49b
- User tests an installed Android build and wants customer/driver account flows stabilized before dispatcher work. User accepts public GitHub visibility under Avila760; GitHub upload is still pending.

## Driver device testing and map marker follow-up
- User reports Android preview built and installed successfully. Driver sign-in rejects incorrect passwords; camera permission is retained; name/photo edits survive force close. User confirmed name change in Firebase. Customer account switching test is pending.
- GPS still requires Update GPS after reopening (current manual behavior).
- User requested profile photo on map instead of green dot. Existing photo marker was present in source but did not display as expected on device. Updated local marker to 52px with explicit image dimensions, Android redraw on image load/layout/profile changes, disabled image fade, and initial fallback if photo fails. TypeScript passes; native rendering still needs verification in a new build.
- These marker changes are not included in the previously installed APK. No new build submitted for this follow-up yet.

## Customer signup/sign-out correction
- User verified customer signup and email verification, but sign-out returned to populated signup and login forms.
- Fixed local auth-form reset: clears passwords/visibility, signup names/role/capabilities and navigation; sign-out also clears email, profile/photo, GPS and local job/photo state. Successful authentication clears password/signup fields while retaining authenticated email for Profile.
- Explicit login/signup now suppress competing auth-session restoration; late restore results after sign-out are ignored. Failed sign-out reports failure instead of pretending the session ended.
- Signup message explains current behavior: already signed in; return after email verification without signing in again. Verification email delivery to spam is still a separate service/template concern.
- TypeScript and targeted mocked reset/logout checks pass. Device retest and a new APK containing this fix and map-photo changes remain pending.

## Latest Android preview submission
- Submitted new preview APK build containing auth-form/sign-out cleanup and profile-photo marker fixes. Upload succeeded; completion and device behavior remain unverified.
- Build: https://expo.dev/accounts/junkbiz760s-organization/projects/haulconnect/builds/6d82e2a7-a1a0-4bf4-b155-e26a9e06864a

## Customer pickup booking
- Added controlled address/item fields and Book pickup button with required-field validation, submission lock, retry feedback, and confirmed request reference. Customer payment label is Card.
- Backend now creates owned jobs with selected payment preference and unpaid/pending-quote metadata; optional photos upload under the real job ID rather than a shared customer-draft record. Success is shown only after Firebase confirms the write.
- Transaction and retained request ID prevent retry overwrites/duplicate records during this session; retries retain original submitted details. Submission state is not persisted across app restarts.
- TypeScript and mocked backend checks pass (validation, ownership, photo association, unpaid state, idempotent retry, errors). Live Firebase rules and Android behavior still need testing in a new build. No live booking was created during verification.
- Booking does not collect card details or charge money. Driver job subscriptions/dispatch, durable customer booking history, pricing and payment processing remain unfinished. No APK containing booking changes has been submitted yet.

## Booking preview build submission
- Uploaded and submitted Android preview with Book pickup, Firebase request creation, Card label, and earlier fixes. Completion/device testing pending.
- Build: https://expo.dev/accounts/junkbiz760s-organization/projects/haulconnect/builds/f2b99da1-c68b-416e-9ee9-ee9cc265bdf3

## Pickup-to-dispatch workflow — 2026-10-04
Completed locally:
- Separate street/city/state selector and required customer phone; one photo-add tile followed by + for more photos.
- After booking, My pickups shows persistent requests and live status, including driver name. An explicit Book another pickup action opens the form.
- Real authenticated admin dispatch list, driver selector and assignment; removed unauthenticated admin demo access.
- Assigned drivers receive accept/decline cards. Decline returns to admin queue; acceptance and Start trip are separate transitions. Phone contact and customer photos are visible to dispatch/assigned driver.
- Role-scoped Firestore subscriptions, transaction checks, in-app status notices and completed-job history. Legacy available bookings remain visible as awaiting confirmation.
Validation: five mocked workflow tests and TypeScript pass. Android Metro export passed (675 modules); remote APK build submitted, not yet verified complete. No real jobs were modified in testing.
Outstanding: live admin role setup, production rules inspection and device acceptance tests. The user created the intended admin account as customer; its role change has NOT been confirmed. Previous Computer Use was interrupted while filtering users. No rules/role mutation was performed.
Backend policy: firestore.rules is a proposed undeployed policy, not verified against Firebase emulator or production. docs/dispatch-testing.md covers setup, test steps and limitations.
Limits: no background push notifications, live customer driver-map/routing integration, actual payments, or restart-persistent unconfirmed booking drafts. GitHub preparation remains unfinished; no commit/push was made.

Latest dispatch preview build (2026-10-04): https://expo.dev/accounts/junkbiz760s-organization/projects/haulconnect/builds/f0b6dfa1-6599-4e57-a25f-d75ad83adfd8
Upload and submission succeeded. Real admin setup and device workflow validation remain pending.

## Driver signup vehicle details — 2026-10-04
- User confirmed admin dispatch shows customer bookings. Existing older driver lacked a role; user deleted it and is creating a replacement.
- Removed hard-coded signup vehicle examples and preselected capabilities/accessories. Vehicle type, make, model, cargo/tow capacities and trailer are now controlled editable inputs saved with signup. Make/model are separate fields.
- Added driverProfile.ts for empty defaults and safe restoration of saved vehicle data on sign-in/session restoration. New signup and sign-out reset defaults; existing backend vehicle records are not erased.
- TypeScript and existing pickup-flow tests pass. This change is local only; not included in the last APK. Device signup verification remains pending. Profile-screen vehicle Edit/Save still only updates local state; backend persistence of subsequent edits remains unfinished.

## Driver navigation, ETA and timestamp history
- Added jobHistory.ts and JobWorkflow.tsx: server-timestamped booking, dispatch confirmation/assignment, accept/decline, en route, on scene, loading, completion and ETA revision history. Earlier events survive reassignment; legacy missing times are not fabricated.
- Added explicit Confirm booking admin action; assignment also records confirmation if not previously confirmed.
- Drivers can tap the pickup address to open Maps, enter ETA minutes, and send/revise the estimate after acceptance and before arrival. Customer/admin see estimated arrival and the last update time through existing live subscriptions. Maps does not supply ETA back to the app automatically.
- Timeline timestamps display device-local date/time/time-zone; Share pickup timeline opens the OS share sheet without sending automatically.
- Customer/driver job photos now offer camera or camera roll. Upload content type uses the returned image blob type instead of always declaring JPEG.
- Eight mocked workflow tests and TypeScript pass. Android export and EAS preview are pending at this entry. Native Maps/gallery/share behavior and deployed rules require device checks.
- Updated proposed firestore.rules for added workflow fields; not deployed or emulator-verified. No production access/rule changes made.

Android ETA/history preview: Metro export passed (678 modules), EAS upload/submission succeeded. Build completion and device verification pending.
https://expo.dev/accounts/junkbiz760s-organization/projects/haulconnect/builds/0bf585e1-0db3-47f3-9595-347c2ae2997f
Includes blank driver vehicle signup, Maps links/manual ETA, timestamp history/share and camera-roll selection.

## Admin list organization
- Dispatch now filters to requested/legacy available/confirmed bookings awaiting assignment. Assigned and in-progress jobs appear under Live jobs; completed jobs appear only in History. Renamed admin Reports to History. Declined jobs return to Dispatch.
- TypeScript checked. Changes not included in the last submitted APK; a new build is required.

## Latest preview and automation preference
- Submitted preview with Dispatch/Live jobs/History filtering: https://expo.dev/accounts/junkbiz760s-organization/projects/haulconnect/builds/43c2a2d8-8bdf-4ee3-b207-6459fbb4b3e1 . Upload succeeded; completion not yet verified.
- User wants free automated end-to-end testing with bug reports and simulated photos/location/ETA rather than humans driving. Suggested local Android Emulator + Maestro + Firebase Emulator Suite. Android Studio/SDK and Maestro were not found in standard locations/PATH; nothing installed this turn.
- Existing eight tests use mocks and do not replace real UI, Firebase rules, or network integration tests.


## Latest verified state — October 23, 2026
This section supersedes older configuration/test notes below or above.

Completed this session:
- Externalized Firebase/Maps client configuration into ignored .env.local; added safe .env.example and app.config.js.
- Expanded Git exclusions for environment files, signing/build outputs, local tooling and service-account files. Existing Git-history pattern scan found no matching Google keys/private keys/GitHub tokens; this is not a comprehensive secret audit.
- Fixed vehicle profile Edit/Save persistence and error handling.
- Fixed invalid pnpm allowBuilds placeholders by disabling those optional scripts.
- Added isolated Firestore emulator integration tests and iOS simulator build profile; refreshed README.

Verified working:
- TypeScript no-emit check and all eight unit tests passed.
- Three real Firestore emulator tests passed: lifecycle/ETA/authorization, driver directory/vehicle writes, concurrent dispatch assignment.
- iOS JavaScript export passed. Native iOS simulator cloud build a9fd6677-7df8-478d-8bec-346450ccfb73 finished successfully. Not yet launched; user is installing Xcode.

Known gaps / unfinished:
- Native iOS execution, camera/gallery uploads, GPS, permission denial/recovery, offline/restart recovery and push notifications are not covered by the database suite.
- Payment processing is not integrated. Automatic live customer tracking remains incomplete.
- Proposed Firestore rules are not deployed; reconcile with live policy and harden audit-history/timestamp integrity before release. Storage and Realtime Database policies also need review.
- Public GitHub repository Avila760/HaulConnect was not accessible through connector (404), no remote configured. User was asked to create the empty repository; upload is not complete.
- Full Xcode / Android emulator tools are not installed here. An iOS simulator build cannot run on the user's Android device.

Next steps:
1. Run the successful iOS simulator build once Xcode setup completes.
2. Run native UI smoke tests in iOS Simulator after installing full Xcode, including maps, photos and permissions; add UI automation and mock location for repeatability.
3. Verify Auth/Storage/location/restart and security rules in an isolated staging project.
4. Publish reviewed source and docs once GitHub repository is available; exclude all local environment and tool files.
5. Finish release requirements (payments if required, notifications, privacy disclosures, account deletion/data handling, store signing and review).

- Latest Android preview submitted: bc49ab31-6af9-43f1-956b-0fd601d3edb5 (vehicle-save fix and externalized client config).
- Emulator suite also executes the actual booking helper and verifies retry idempotency before dispatch and after completion. Photos are excluded from that helper test.


## GitHub handoff — October 23, 2026
- User created public Avila760/HaulConnect; connector confirms push access and an empty repository.
- Current source, assets, tests and persistent documentation are prepared for the initial source upload. Local environment configuration, generated builds, dependencies and personal tool settings are excluded.
- To continue with another assistant, read AGENTS.md, PROJECT_STATE.md and README.md first. Use synthetic test data and emulator tests; do not deploy backend rules or claim store readiness without the remaining checks.

- Published source snapshot: https://github.com/Avila760/HaulConnect on main. GitHub connector used because terminal credential lookup stalled. Local pre-upload history is retained on local-history-before-github; main tracks origin/main after synchronization. This entry supersedes earlier upload-pending notes.
