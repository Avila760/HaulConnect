# HaulConnect persistent project context

## Source of truth and preservation
- This directory is the HaulConnect project despite its legacy name `haulgreen-mvp`.
- Read PROJECT_STATE.md before continuing. Inspect Git status and diffs first; preserve all existing edits and untracked files. Do not reset, clean, or overwrite work.
- GitHub destination: https://github.com/Avila760/HaulConnect (public). Preserve local history and use normal non-force pushes.
- Keep GitHub handoff documentation current. Never put credentials or API-key values in documentation or tool output.

## Architecture and technologies
- Expo SDK 54 (~54.0.35), React 19.1.0, React Native 0.81.5, strict TypeScript (~6.0.3); pnpm with pnpm-lock.yaml.
- index.ts registers App.tsx. App.tsx contains navigation via React state, role-based screens, shared types, demo jobs, UI components, and StyleSheet styles. No routing library is configured.
- firebaseBackend.ts wraps Firebase Auth, Firestore user/job records, Storage photo uploads, and Realtime Database driver-location writes. AsyncStorage supports auth persistence when available.
- expo-image-picker supplies photos; expo-location supplies foreground GPS/reverse geocoding; react-native-maps supplies native maps. Manrope fonts and green branding are established UI conventions.
- Public signup roles: customer and driver. Admin exists internally; client role selection is not a substitute for backend authorization.
- Job progression: requested -> assigned -> accepted -> en_route -> arrived -> loading -> completed. Legacy available means awaiting dispatch. Decline returns assigned -> requested and clears driver assignment. Acceptance does not mean the driver has started driving.
- Payment choices: Card, cash, check. Payment processing is not integrated. Customer booking writes owned Firebase jobs via bookFirebasePickup; preserve retry IDs and only confirm after backend acknowledgement.
- README.md describes current setup. docs/backend-schema.md is a historical proposal; actual code uses Firebase, not Supabase.

## Run and verify
- From this directory: `pnpm install --frozen-lockfile` when dependencies need installation; preserve the lockfile. Optional dependency build scripts are disabled in pnpm-workspace.yaml.
- `pnpm start`, `pnpm android`, `pnpm ios`, `pnpm web` are declared scripts. Native device validation remains necessary; the web script does not establish web compatibility.
- Use a compatible Node runtime. Existing run-expo.sh and run-expo-tunnel.sh reference the bundled Codex Node/pnpm runtime, use port 8082, clear Metro cache, and redirect HOME to .expo-home. They are machine-specific; do not copy the HOME override into unrelated commands.
- Type check: `pnpm typecheck`. Run `pnpm test` for mocked pickup validation, role scoping and dispatch transition tests. These do not validate deployed Firebase rules. No lint script is configured.
- Check installed Expo versions before dependency/API changes and consult matching versioned Expo documentation. The former AGENTS.md pointed to SDK 56, which does not match installed SDK 54.
- Do not test against live backend data through account creation, deletion, seeding, or payment actions without an appropriate test scope.

## Important constraints
- Preserve demo/local fallback behavior until intentionally replacing it; do not describe Firebase write helpers as complete live synchronization.
- Client configuration now comes from ignored .env.local via EXPO_PUBLIC variables and app.config.js. Review key restrictions/backend rules before publication. Client-bundled configuration is not a place for server secrets.
- Ignore local environment files, dependency caches, Expo state, native generated outputs, build exports, signing files, and service-account credentials. Verify ignored files are not already tracked; .gitignore alone cannot untrack files or sanitize history.
- Do not publish .expo-home or personal tool settings. Personal .claude settings are untracked and ignored; do not add them.
- Keep persistent context up to date when architecture, verification results, or the GitHub preparation state changes.

## Pickup workflow (2026-10-04)
- pickupModel.ts owns shared job/status/address types, US state options, input validation and lifecycle helpers.
- PickupFlow.tsx contains booking, customer status, admin assignment and driver invitation UI. dispatchBackend.ts provides role-scoped Firestore subscriptions and transactional state changes.
- Customer jobs query customerId, driver jobs query driverId; authenticated admins subscribe to all jobs and driver users. Unsubscribe and clear state when accounts change. Never restore unauthenticated Admin demo access.
- Booked customers return to My pickups, including after restart via subscription. Live in-app notices exist; background push notifications do not.
- Admin role must be granted by a trusted Firebase operator on the existing users document. Public signup must remain customer/driver only.
- firestore.rules is a proposed policy, locally emulator-tested on October 23, 2026, but NOT deployed. Review current production rules before any publish. Read docs/dispatch-testing.md for setup and device checks.

- Driver vehicle defaults must be empty (driverProfile.ts); never prefill sample trucks, capacities, capabilities or accessories. Signup inputs save actual entries and sign-in restores saved driverProfile data.

- jobHistory.ts / JobWorkflow.tsx implement server-timestamped lifecycle history, local-time display/share sheet, Maps links and manual driver ETA. Never fabricate historical event times or treat Maps navigation as automatic ETA import. ETA is allowed only for the assigned driver after acceptance and before arrival. Job photos use a camera/camera-roll source selector.

## Automated verification and current limitations (2026-10-23)
- tests/integration/workflow.test.cjs exercises actual dispatch transactions against isolated Firestore with rules: lifecycle, ETA revisions, ownership, admin-role protection, signed-out driver directory, vehicle writes and concurrent assignment. See docs/dispatch-testing.md for commands. Never point these tests at production.
- Local emulator checks do not cover Auth, Storage, Realtime Database, native camera/maps/permissions, or production rules. Audit history/timestamp tampering before deploying the proposed rules.
- Driver vehicle profile Save now persists through saveDriverVehicleProfile and retains editing state on failure.
- eas.json has ios-simulator profile. iOS Metro export and native simulator cloud build passed October 23; native execution still awaits Xcode setup.
- No server credentials belong in .env.local: it is ignored by Git but included in private EAS upload for publishable Firebase/Maps config.
