import { appendEvent, validateEta } from './jobHistory';
import { collection, doc, onSnapshot, query, where, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, firestore, type BackendRole } from './firebaseBackend';
import { canRespondToAssignment, isAwaitingDispatch, nextDeliveryStatus, readJob, type DriverOption, type Job } from './pickupModel';

export function subscribeToJobs(role: BackendRole, uid: string, receive: (jobs: Job[]) => void, onError: (error: Error) => void) {
  const jobs = collection(firestore, 'jobs');
  const scoped = role === 'admin' ? jobs : query(jobs, where(role === 'customer' ? 'customerId' : 'driverId', '==', uid));
  return onSnapshot(scoped, (snapshot) => receive(snapshot.docs.map((item) => readJob(item.id, item.data()))
    .sort((a,b) => (b.createdAtMs || 0) - (a.createdAtMs || 0) || a.id.localeCompare(b.id))), onError);
}
export function subscribeToDrivers(receive: (drivers: DriverOption[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(firestore, 'users'), where('role', '==', 'driver')), (snapshot) => {
    receive(snapshot.docs.map((item) => ({ id: item.id, name: item.data().name || item.data().email || 'Driver' })));
  }, onError);
}
export async function assignDriver(jobId: string, driverId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in as an admin.');
  await runTransaction(firestore, async (tx) => {
    const [actor, driver, booking] = await Promise.all([
      tx.get(doc(firestore, 'users', uid)), tx.get(doc(firestore, 'users', driverId)), tx.get(doc(firestore, 'jobs', jobId)),
    ]);
    if (actor.data()?.role !== 'admin') throw new Error('Admin access is required.');
    if (driver.data()?.role !== 'driver') throw new Error('Choose a driver account.');
    if (!booking.exists() || !isAwaitingDispatch(booking.data().status)) throw new Error('This pickup has already been assigned. Refresh and try again.');
    const at = serverTimestamp();
    const history = booking.data().confirmedAt ? booking.data().history : appendEvent(booking.data().history, 'confirmed', uid, at);
    tx.update(booking.ref, { driverId, driverName: driver.data()?.name || 'Driver', status: 'assigned',
      confirmedAt: booking.data().confirmedAt || at, assignedAt: at, updatedAt: at,
      history: appendEvent(history, 'assigned', uid, at, driver.data()?.name || 'Driver'),
      eta: 0, etaUpdatedAt: null,
    });
  });
}
export async function respondToAssignment(jobId: string, accept: boolean) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in as the assigned driver.');
  await runTransaction(firestore, async (tx) => {
    const [booking, driver] = await Promise.all([tx.get(doc(firestore, 'jobs', jobId)), tx.get(doc(firestore, 'users', uid))]);
    if (driver.data()?.role !== 'driver') throw new Error('A driver account is required.');
    if (!booking.exists() || !canRespondToAssignment(booking.data() as Job, uid)) throw new Error('This assignment is no longer available to you.');
    const at = serverTimestamp();
    const history = appendEvent(booking.data().history, accept ? 'accepted' : 'declined', uid, at, booking.data().driverName || 'Driver');
    tx.update(booking.ref, accept
      ? { status: 'accepted', acceptedAt: at, history, updatedAt: at }
      : { status: 'requested', driverId: null, driverName: null, lastDeclinedDriverName: booking.data().driverName || 'Driver', declinedAt: at, history, updatedAt: at, eta: 0, etaUpdatedAt: null });
  });
}
export async function advanceAssignedJob(jobId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in as the assigned driver.');
  await runTransaction(firestore, async (tx) => {
    const [booking, driver] = await Promise.all([tx.get(doc(firestore, 'jobs', jobId)), tx.get(doc(firestore, 'users', uid))]);
    if (driver.data()?.role !== 'driver') throw new Error('A driver account is required.');
    if (!booking.exists() || booking.data().driverId !== uid) throw new Error('This pickup is not assigned to you.');
    const next = nextDeliveryStatus(booking.data().status);
    if (!next) throw new Error('Accept the assignment before starting the pickup.');
    const at = serverTimestamp();
    tx.update(booking.ref, { status: next, [`${next}At`]: at, updatedAt: at, history: appendEvent(booking.data().history, next, uid, at) });
  });
}


export async function confirmPickup(jobId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in as an admin.');
  await runTransaction(firestore, async tx => {
    const [actor, booking] = await Promise.all([tx.get(doc(firestore, 'users', uid)), tx.get(doc(firestore, 'jobs', jobId))]);
    if (actor.data()?.role !== 'admin') throw new Error('Admin access is required.');
    if (!booking.exists() || !isAwaitingDispatch(booking.data().status)) throw new Error('This booking has already progressed.');
    if (booking.data().status === 'confirmed') return;
    const at = serverTimestamp();
    tx.update(booking.ref, {status:'confirmed', confirmedAt:at, updatedAt:at, history:appendEvent(booking.data().history,'confirmed',uid,at)});
  });
}
export async function sendDriverEta(jobId: string, minutes: number) {
  validateEta(minutes);
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in as the assigned driver.');
  await runTransaction(firestore, async tx => {
    const [actor, booking] = await Promise.all([tx.get(doc(firestore, 'users', uid)), tx.get(doc(firestore, 'jobs', jobId))]);
    if (actor.data()?.role !== 'driver' || !booking.exists() || booking.data().driverId !== uid) throw new Error('Only the assigned driver can send an ETA.');
    if (!['accepted','en_route'].includes(booking.data().status)) throw new Error('Send an ETA after accepting and before arriving.');
    const at = serverTimestamp();
    tx.update(booking.ref, {eta:minutes, etaUpdatedAt:at, updatedAt:at, history:appendEvent(booking.data().history,'eta',uid,at,`${minutes} minutes`)});
  });
}
