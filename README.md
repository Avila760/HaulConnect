# HaulConnect

Expo / React Native app for customer junk-removal bookings, admin dispatch, and driver job progression. Firebase provides authentication, user/job documents, photo storage, and driver location writes.

## Setup

Use Node 20.19+ and pnpm. Install dependencies with `pnpm install --frozen-lockfile`. Copy `.env.example` to `.env.local` and supply your own Firebase client configuration and Android Maps key. Never add service-account credentials or signing keys to these files. Client configuration is bundled into the app; backend rules and API-key restrictions provide protection.

Run `npm start`, `npm run android`, or `npm run ios`. Native simulators require their platform development tools; iOS Simulator requires full Xcode on macOS. The web target is not validated.

## Verification

- `npm run typecheck`: TypeScript validation.
- `npm test`: isolated workflow unit tests.
- `npm --prefix tests/integration install` then `npm --prefix tests/integration test`: real Firestore emulator workflow and authorization tests. Requires Java 21; uses only the `demo-haulconnect` project.
- See `docs/dispatch-testing.md` for device checks and test limitations.

## Builds

With access to the configured Expo organization:

```sh
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile ios-simulator
```

Android preview produces an installable test build. iOS simulator builds run on a Mac simulator, not a physical phone. Physical iOS distribution needs Apple signing and a separate device/TestFlight build.

`.env.local` is excluded from Git but explicitly included in private EAS build archives to supply publishable client configuration. Keep server secrets out of it. Change the Expo owner/project and bundle identifiers when creating an independent fork.

## Current scope

Customers book pickups with structured address, phone, payment preference, and photos. Admins assign registered drivers. Drivers accept/decline, open directions, send a manual ETA, and advance through en route, on scene, loading, and completed. Completed jobs appear in History. Payment choices do not charge a card. Background push notifications and complete automatic customer GPS tracking are unfinished.

Read `AGENTS.md` and `PROJECT_STATE.md` before continuing development. `firestore.rules` is tested locally but has not been deployed or reconciled with production policy. `docs/backend-schema.md` describes an old proposal, not the current Firebase implementation. This repository is a work in progress, not a store-approved release.
