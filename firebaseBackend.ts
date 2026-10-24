import { appendEvent } from './jobHistory';
import { readDriverProfile, type DriverProfile } from './driverProfile';
import { validatePickup } from './pickupModel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import * as FirebaseAuth from 'firebase/auth';
import {
  arrayUnion,
  collection,
  runTransaction,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDatabase, ref, set } from 'firebase/database';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';

export type BackendRole = 'customer' | 'driver' | 'admin';

type DriverProfilePayload = DriverProfile;

type BackendJob = {
  customer: string;
  customerPhotos: string[];
  details: string;
  distance: string;
  dropoff: string;
  eta: number;
  load: string;
  paymentMethod: string;
  payout: number;
  pickup: string;
  proofPhotos: string[];
  quote: number;
  status: string;
};

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

type ReactNativeAuthModule = typeof FirebaseAuth & {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => unknown;
};

const authModule = FirebaseAuth as ReactNativeAuthModule;

export const auth = (() => {
  try {
    const persistence = authModule.getReactNativePersistence?.(AsyncStorage);

    if (persistence) {
      return initializeAuth(app, { persistence: persistence as never });
    }
  } catch {
    // Auth may already be initialized during fast refresh or tests.
  }

  return getAuth(app);
})();
export const firestore = (() => {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
  } catch {
    return getFirestore(app);
  }
})();
export const realtimeDatabase = getDatabase(app);
export const storage = getStorage(app);

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const getBackendErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Firebase could not complete the request.';
};

const profileFromUserData = ({
  email,
  fallbackRole,
  profileWarning = '',
  uid,
  userData,
}: {
  email?: string | null;
  fallbackRole: Exclude<BackendRole, 'admin'>;
  profileWarning?: string;
  uid: string;
  userData: Record<string, unknown>;
}) => {
  const backendRole: BackendRole = userData.role === 'customer' || userData.role === 'driver' || userData.role === 'admin'
    ? userData.role
    : fallbackRole;
  const storedName = typeof userData.name === 'string' ? userData.name : '';
  const parsedNameParts = storedName.trim().split(/\s+/).filter(Boolean);
  const firstName = typeof userData.firstName === 'string'
    ? userData.firstName
    : parsedNameParts[0] || '';
  const lastName = typeof userData.lastName === 'string'
    ? userData.lastName
    : parsedNameParts.slice(1).join(' ');
  const fallbackName = email?.split('@')[0] || 'HaulConnect user';
  const name = `${firstName} ${lastName}`.trim() || storedName || fallbackName;

  return {
    avatarKey: typeof userData.avatarKey === 'string' ? userData.avatarKey : 'green',
    firstName,
    lastName,
    name,
    profilePhotoUrl: typeof userData.profilePhotoUrl === 'string' ? userData.profilePhotoUrl : null,
    profileWarning,
    role: backendRole,
    driverProfile: readDriverProfile(userData.driverProfile),
    uid,
  };
};

export const createHaulConnectAccount = async ({
  driverProfile,
  email,
  firstName,
  lastName,
  name,
  password,
  role,
}: {
  driverProfile?: DriverProfilePayload;
  email: string;
  firstName?: string;
  lastName?: string;
  name: string;
  password: string;
  role: Exclude<BackendRole, 'admin'>;
}) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const userDoc = {
    avatarKey: 'green',
    createdAt: serverTimestamp(),
    driverProfile: role === 'driver' ? driverProfile : null,
    email,
    firstName: firstName || '',
    lastName: lastName || '',
    name,
    profilePhotoUrl: null,
    role,
    updatedAt: serverTimestamp(),
  };
  const setupWarnings: string[] = [];

  try {
    await withTimeout(
      setDoc(doc(firestore, 'users', credential.user.uid), userDoc),
      7000,
      'Profile save timed out. Your account was created, but the profile will need to sync again.'
    );
  } catch (error) {
    setupWarnings.push(`Profile save failed: ${getBackendErrorMessage(error)}`);
  }

  try {
    await withTimeout(
      sendEmailVerification(credential.user),
      7000,
      'Verification email timed out. You can resend it from Profile.'
    );
  } catch (error) {
    setupWarnings.push(`Verification email failed: ${getBackendErrorMessage(error)}`);
  }

  return {
    firstName: firstName || '',
    lastName: lastName || '',
    name,
    role,
    setupWarnings,
    uid: credential.user.uid,
  };
};

export const signInHaulConnect = async (
  email: string,
  password: string,
  fallbackRole: Exclude<BackendRole, 'admin'> = 'driver'
) => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  let profileWarning = '';
  let userData: Record<string, unknown> = {};

  try {
    const userSnapshot = await withTimeout(
      getDoc(doc(firestore, 'users', credential.user.uid)),
      7000,
      'Profile lookup timed out. Check Firebase/Firestore connection.'
    );
    userData = userSnapshot.exists() ? userSnapshot.data() : {};
  } catch (error) {
    profileWarning = getBackendErrorMessage(error);
  }

  return profileFromUserData({
    email: credential.user.email,
    fallbackRole,
    profileWarning,
    uid: credential.user.uid,
    userData,
  });
};

export const loadCurrentUserProfile = async (
  fallbackRole: Exclude<BackendRole, 'admin'> = 'driver'
) => {
  if (!auth.currentUser) {
    return null;
  }

  let profileWarning = '';
  let userData: Record<string, unknown> = {};

  try {
    const userSnapshot = await withTimeout(
      getDoc(doc(firestore, 'users', auth.currentUser.uid)),
      7000,
      'Profile lookup timed out. Check Firebase/Firestore connection.'
    );
    userData = userSnapshot.exists() ? userSnapshot.data() : {};
  } catch (error) {
    profileWarning = getBackendErrorMessage(error);
  }

  return profileFromUserData({
    email: auth.currentUser.email,
    fallbackRole,
    profileWarning,
    uid: auth.currentUser.uid,
    userData,
  });
};

export const listenForAuthSession = (
  callback: (user: FirebaseAuth.User | null) => void
) => {
  return onAuthStateChanged(auth, callback);
};

export const signOutCurrentUser = () => {
  return signOut(auth);
};

export const deleteCurrentUserAccount = async () => {
  if (!auth.currentUser) {
    throw new Error('No signed-in user is available to delete.');
  }

  const user = auth.currentUser;

  await withTimeout(
    setDoc(doc(firestore, 'users', user.uid), {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true }),
    7000,
    'Account delete started, but the profile cleanup timed out.'
  ).catch(() => {
    // Auth deletion is the important user-facing step; profile cleanup can be retried later.
  });

  await deleteUser(user);
  await deleteDoc(doc(firestore, 'users', user.uid)).catch(() => {
    // This can fail after auth deletion if rules require a signed-in user.
  });
};

export const sendHaulConnectPasswordReset = (email: string) => {
  return sendPasswordResetEmail(auth, email);
};

export const sendCurrentUserVerificationEmail = async () => {
  if (!auth.currentUser) {
    throw new Error('No signed-in user is available for email verification.');
  }

  await auth.currentUser.reload();

  if (auth.currentUser.emailVerified) {
    return { alreadyVerified: true };
  }

  await sendEmailVerification(auth.currentUser);

  return { alreadyVerified: false };
};

export const seedFirebaseJob = async (jobId: string, job: BackendJob) => {
  await setDoc(
    doc(firestore, 'jobs', jobId),
    {
      ...job,
      seededAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const updateFirebaseJobStatus = async (jobId: string, status: string) => {
  await updateDoc(doc(firestore, 'jobs', jobId), {
    status,
    updatedAt: serverTimestamp(),
  });
};

export const uploadJobPhoto = async ({
  jobId,
  kind,
  label,
  uri,
}: {
  jobId: string;
  kind: 'customer' | 'proof';
  label: string;
  uri: string;
}) => {
  const response = await fetch(uri);
  const blob = await response.blob();
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const contentType = blob.type || 'image/jpeg';
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/heic' ? 'heic' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `jobs/${jobId}/${kind}/${Date.now()}-${safeLabel}.${extension}`;
  const fileRef = storageRef(storage, path);

  await uploadBytes(fileRef, blob, {
    contentType,
    customMetadata: {
      label,
    },
  });

  return getDownloadURL(fileRef);
};

export const saveFirebaseJobPhoto = async ({
  jobId,
  kind,
  label,
  url,
}: {
  jobId: string;
  kind: 'customer' | 'proof';
  label: string;
  url: string;
}) => {
  const field = kind === 'customer' ? 'customerPhotoUploads' : 'proofPhotoUploads';

  await setDoc(
    doc(firestore, 'jobs', jobId),
    {
      [field]: arrayUnion({
        label,
        uploadedAt: new Date().toISOString(),
        url,
      }),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const uploadUserProfilePhoto = async (uri: string) => {
  if (!auth.currentUser) {
    throw new Error('No signed-in user is available for profile photo upload.');
  }

  const response = await fetch(uri);
  const blob = await response.blob();
  const path = `users/${auth.currentUser.uid}/profile/avatar-${Date.now()}.jpg`;
  const fileRef = storageRef(storage, path);

  await uploadBytes(fileRef, blob, {
    contentType: 'image/jpeg',
  });

  const url = await getDownloadURL(fileRef);

  let profileSyncWarning = '';

  try {
    await withTimeout(
      setDoc(
        doc(firestore, 'users', auth.currentUser.uid),
        {
          profilePhotoUrl: url,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      7000,
      'Profile photo saved, but profile sync timed out.'
    );
  } catch (error) {
    profileSyncWarning = getBackendErrorMessage(error);
  }

  return { profileSyncWarning, url };
};

export const saveUserProfileBasics = async ({
  avatarKey,
  email,
  firstName,
  lastName,
  name,
  profilePhotoUrl,
}: {
  avatarKey: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  profilePhotoUrl?: string | null;
}) => {
  if (!auth.currentUser) {
    throw new Error('No signed-in user is available for profile update.');
  }

  await setDoc(
    doc(firestore, 'users', auth.currentUser.uid),
    {
      avatarKey,
      email,
      firstName,
      lastName,
      name,
      ...(profilePhotoUrl !== undefined ? { profilePhotoUrl } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const clearUserProfilePhoto = async () => {
  if (!auth.currentUser) {
    throw new Error('No signed-in user is available for profile photo update.');
  }

  await setDoc(
    doc(firestore, 'users', auth.currentUser.uid),
    {
      profilePhotoUrl: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const updateDriverLiveLocation = async ({
  address,
  heading,
  jobId,
  latitude,
  longitude,
  speed,
  uid,
}: {
  address?: string;
  heading?: number | null;
  jobId: string;
  latitude: number;
  longitude: number;
  speed?: number | null;
  uid: string;
}) => {
  const updatedAt = new Date().toISOString();

  await set(ref(realtimeDatabase, `jobs/${jobId}/driverLocation`), {
    address: address || null,
    heading: heading ?? null,
    latitude,
    longitude,
    speed: speed ?? null,
    updatedAt,
    uid,
  });

  await set(ref(realtimeDatabase, `drivers/${uid}/currentLocation`), {
    address: address || null,
    heading: heading ?? null,
    jobId,
    latitude,
    longitude,
    speed: speed ?? null,
    updatedAt,
  });
};


export const newPickupRequestId = () => doc(collection(firestore, 'jobs')).id;

export const bookFirebasePickup = async ({
  id, customer, street, city, state, phone, details, paymentMethod, photos,
}: {
  id: string;
  customer: string;
  street: string;
  city: string;
  state: string;
  phone: string;
  details: string;
  paymentMethod: 'card' | 'cash' | 'check';
  photos: Record<string, string>;
}) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to book a pickup.');
  const validation = validatePickup({street, city, state, phone, details});
  if (validation) throw new Error(validation);
  const profile = await withTimeout(getDoc(doc(firestore, 'users', user.uid)), 7000, 'Unable to confirm your account. Check your connection and retry.');
  if (profile.data()?.role !== 'customer') throw new Error('Use a customer account to book a pickup.');
  const customerPhotoUploads = await withTimeout(Promise.all(
    Object.entries(photos).map(async ([label, uri]) => ({
      label,
      url: await uploadJobPhoto({ jobId: id, kind: 'customer', label, uri }),
    }))
  ), 30000, 'Photo upload took too long. Your form is saved here; please retry.');
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your session changed. Sign in again.');
  const job: BackendJob = {
    customer, pickup: `${street.trim()}, ${city.trim()}, ${state}`, details: details.trim(), paymentMethod,
    customerPhotos: Object.keys(photos), proofPhotos: [], distance: 'Pending',
    dropoff: 'To be arranged', eta: 0, load: 'Junk removal',
    payout: 0, quote: 0, status: 'requested',
  };
  // A retry uses the same document and never resets an already-dispatched job.
  const savedJob = await withTimeout(runTransaction(firestore, async (transaction) => {
    const jobRef = doc(firestore, 'jobs', id);
    const existing = await transaction.get(jobRef);
    if (existing.exists()) {
      if (existing.data().customerId !== user.uid) throw new Error('This booking belongs to another account.');
      return existing.data() as BackendJob;
    }
    transaction.set(jobRef, {
      ...job, customerId: user.uid, customerPhone: phone.trim(),
      street: street.trim(), city: city.trim(), state, driverId: null, driverName: null, customerPhotoUploads,
      paymentStatus: 'unpaid', quoteStatus: 'pending',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      history: appendEvent(undefined, 'booked', user.uid, serverTimestamp()),
    });
    return { ...job, customerId: user.uid, customerPhone: phone.trim(), street: street.trim(), city: city.trim(), state, customerPhotoUploads };
  }), 20000, 'Booking confirmation is taking longer than expected. Retry to check the same request.');
  return { ...savedJob, id };
};

export const saveDriverVehicleProfile = async (profile: import('./driverProfile').DriverProfile) => {
  if (!auth.currentUser) throw new Error('Sign in to save vehicle details.');
  await updateDoc(doc(firestore, 'users', auth.currentUser.uid), {
    driverProfile: profile,
    updatedAt: serverTimestamp(),
  });
};
