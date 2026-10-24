# Pickup and dispatch verification

The app uses Firebase Auth plus users/{uid}.role (customer, driver, admin). Admin is not a public signup option. A trusted project operator must grant the admin role in Firebase Console after the account exists. Sign out/in after changing a role. The former unauthenticated Admin demo access button has been removed.

## Backend setup still requiring verification

- Inspect deployed Firestore rules before changing them. firestore.rules is a proposed policy, not confirmation of what is deployed. Do not replace unrelated rules without review. No Firebase rules, roles, or credentials were deployed/changed by this code task.
- Required reads: customers query jobs by customerId; drivers query jobs by driverId; admins read jobs and driver profiles. No composite indexes are needed for these single-field filters; sorting happens in the app.
- Required writes: customers create owned requested jobs; admins assign registered drivers; only the assigned driver can accept/decline and advance delivery. Profile updates must never allow changing role.
- Read/create transactions must allow a customer's read of a missing job document. Existing owned requests can be read on retry without overwriting status.
- Review Firebase Storage and Realtime Database rules separately. Photo uploads precede job creation and existing Storage rules may require adaptation. No changes to those deployed services are claimed.
- Unit tests use mocks; they do not prove deployed Firestore rules allow or deny operations. Test the proposed rules with the Firebase Emulator Suite before publishing.

## Device acceptance test (test accounts and test pickup)

1. Customer: enter street address, city, select US state, phone, and description. Blank fields and invalid phone must prevent booking.
2. Tap the one photo tile; take a photo. Add another using +. Remove one and add another; no photo should replace a different one.
3. Submit once, including rapid taps. Expect My pickups / Awaiting confirmation, not an empty booking form. Record one request ID; no charge occurs.
4. Force close/reopen. The same request should load. Sign out/in; the same request remains. A different customer must not see it.
5. Real admin: sign in to the operator-granted admin account. The request appears, including phone and photos. Tap customer phone to call only when appropriate.
6. Select a driver and Send to driver. Customer sees Awaiting driver response. Driver sees Accept pickup and Decline pickup. Another driver sees nothing.
7. Decline: request returns to Awaiting confirmation, admin sees the declined driver and can reassign. Former driver loses access to the request.
8. Reassign and accept: customer sees Driver accepted and the driver's name. It must not say On the way until the driver taps Start trip.
9. Driver: Start trip -> Arrived -> Loading -> Completed. Customer and admin should see each status live. Completed pickups appear in history.
10. Force close/reopen between steps and switch accounts; no prior-account records should remain. Permission/network errors should be visible, not disguised as success.

## Current limits

- Updates and status notices are live inside the open app; background push/SMS notifications are not implemented.
- US states and DC are offered; ZIP/country entry and international phone validation are not part of this change.
- Older bookings appear using their original formatted address and may lack phone/photo/structured fields.
- Jobs are durable in Firestore; an unconfirmed draft/request ID is still only retained in memory. After a lost confirmation and restart, check My pickups before submitting again.
- Driver GPS maps/routing, actual prices, payments and payouts remain separate unfinished work. Accepting a job does not automatically imply the driver has started driving.

## Navigation, ETA and history checks
- Confirm a request in admin before assigning; verify the customer sees confirmation. Assign directly on another test request and verify both confirmation and assignment timestamps are recorded.
- Driver opens the pickup link in Maps and returns. Accept, send 20-minute ETA, revise to 15 minutes. Customer sees the revised arrival and update time. Another driver cannot submit an ETA.
- Start trip, mark on scene, load and complete. All roles see each event's date/time/time-zone; earlier assignment and decline events remain.
- Share pickup timeline opens the OS chooser; cancel without sending.
- Choose camera roll and camera for both customer and driver photos; cancel and deny camera permission without losing form state. Verify PNG/JPEG uploads display.
- Driver signup vehicle fields must start blank; user-entered vehicle data should survive sign-in.

## Automated local database workflow (October 23, 2026)
Requires Node 20+ and Java 21. From the project root:

```sh
npm --prefix tests/integration install
npm --prefix tests/integration test
```

This runs the real dispatch transaction code against Firestore on localhost:8085 with the proposed firestore.rules and a demo project. It creates only synthetic local users/bookings. No login, real travel, or production Firebase writes are required. Permission-denied logs are expected when the test intentionally attempts forbidden actions. The emulator test does not cover Firebase Auth, Storage/photo uploads, Realtime Database GPS, native UI or deployed production rules. Unit tests remain `npm test`; type checking is `npm run typecheck`.

For iOS native compilation, run `eas build --platform ios --profile ios-simulator`. Simulator builds do not require an Apple distribution certificate, but cannot be installed on an iPhone or Android phone. Running one locally requires full Xcode and its iOS Simulator. Maps/camera/permissions still need native verification; a successful bundle/export alone is not enough.
