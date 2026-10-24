import { DriverEta, JobTimeline } from './JobWorkflow';
import { emptyDriverProfile, type DriverProfile } from './driverProfile';
import { AdminDispatch, ContactPhone, CustomerPickups, DriverInvitations, JobPhotos, PickupBookingForm } from './PickupFlow';
import { assignDriver, advanceAssignedJob, respondToAssignment, subscribeToJobs, subscribeToDrivers } from './dispatchBackend';
import { readJob, validatePickup, nextDeliveryStatus, statusLabels, type DriverOption, type Job, type JobStatus, type PaymentMethod, type PickupDetails, type PickupDraft } from './pickupModel';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as RNStatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';
import {
  auth,
  bookFirebasePickup,
  newPickupRequestId,
  clearUserProfilePhoto,
  createHaulConnectAccount,
  deleteCurrentUserAccount,
  getBackendErrorMessage,
  listenForAuthSession,
  loadCurrentUserProfile,
  saveUserProfileBasics,
  saveDriverVehicleProfile,
  saveFirebaseJobPhoto,
  sendCurrentUserVerificationEmail,
  sendHaulConnectPasswordReset,
  signInHaulConnect,
  signOutCurrentUser,
  updateDriverLiveLocation,
  uploadJobPhoto,
  uploadUserProfilePhoto,
} from './firebaseBackend';

type Screen =
  | 'home'
  | 'deliveries'
  | 'opportunities'
  | 'history'
  | 'earnings'
  | 'notifications'
  | 'profile'
  | 'customer'
  | 'tracking'
  | 'admin'
  | 'legal'
  | 'help';

type Role = 'customer' | 'driver' | 'admin';
type PublicRole = Exclude<Role, 'admin'>;
type AvatarKey = 'green' | 'forest' | 'mint' | 'blue' | 'gold';
type BackendProfile = NonNullable<Awaited<ReturnType<typeof loadCurrentUserProfile>>>;
type DriverLocation = {
  address?: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
};
type JobCoordinates = {
  driverFallback: LatLng;
  dropoff: LatLng;
  pickup: LatLng;
};
type HaulMapType = 'standard' | 'satellite' | 'hybrid' | 'terrain';
type SelectedPhoto = {
  jobId?: string;
  kind: 'customer' | 'proof';
  label: string;
  uri: string;
} | null;




const green = '#19DFA3';
const darkGreen = '#0E8A5A';
const forestGreen = '#0B3B2E';
const leafGreen = '#116B37';
const softGreen = '#EAF8EF';
const fontRegular = 'Manrope_400Regular';
const fontMedium = 'Manrope_500Medium';
const fontSemiBold = 'Manrope_600SemiBold';
const fontBold = 'Manrope_700Bold';
const fontExtraBold = 'Manrope_800ExtraBold';
const logoSource = require('./assets/haulconnect-logo.png');

const paymentLabels: Record<PaymentMethod, string> = {
  card: 'Card',
  cash: 'Cash',
  check: 'Check',
};

const roleLabels: Record<Role, string> = {
  customer: 'Customer',
  driver: 'Driver',
  admin: 'Admin',
};

const demoJobCoordinates: JobCoordinates = {
  driverFallback: {
    latitude: 33.82242,
    longitude: -116.53226,
  },
  pickup: {
    latitude: 33.8303,
    longitude: -116.54529,
  },
  dropoff: {
    latitude: 33.81209,
    longitude: -116.48988,
  },
};

const avatarOptions: { key: AvatarKey; label: string; color: string }[] = [
  { key: 'green', label: 'Green', color: leafGreen },
  { key: 'forest', label: 'Forest', color: forestGreen },
  { key: 'mint', label: 'Mint', color: green },
  { key: 'blue', label: 'Blue', color: '#2563EB' },
  { key: 'gold', label: 'Gold', color: '#D89A00' },
];

const avatarColorByKey: Record<AvatarKey, string> = avatarOptions.reduce(
  (colors, option) => ({ ...colors, [option.key]: option.color }),
  {} as Record<AvatarKey, string>
);

const isAvatarKey = (value: string): value is AvatarKey => {
  return avatarOptions.some((option) => option.key === value);
};

const capabilityOptions = [
  'Load/unload 10-25 pounds',
  'Load/unload 25-50 pounds',
  'Load/unload 50-150 pounds',
  'Distance-Short',
  'Distance-Medium',
  'Distance-Long',
  'Hours-Morning',
  'Hours-Afternoon',
  'Hours-Evening',
  'Bilingual in Spanish',
];

const accessoryOptions = ['Gloves', 'Hard Hat (PPE)', 'Ratchet Straps', 'Moving Blankets'];



const roleHome: Record<Role, Screen> = {
  customer: 'customer',
  driver: 'home',
  admin: 'admin',
};

const menuByRole: Record<Role, { screen: Screen; label: string; count?: number }[]> = {
  customer: [
    { screen: 'customer', label: 'My pickups' },
    { screen: 'history', label: 'Job history' },
    { screen: 'profile', label: 'Profile' },
    { screen: 'help', label: 'Help center', count: 1 },
  ],
  driver: [
    { screen: 'home', label: 'Home' },
    { screen: 'deliveries', label: 'Deliveries' },
    { screen: 'history', label: 'History' },
    { screen: 'profile', label: 'Profile' },
    { screen: 'help', label: 'Help center', count: 1 },
  ],
  admin: [
    { screen: 'admin', label: 'Admin dispatch' },
    { screen: 'deliveries', label: 'Live jobs' },
    { screen: 'history', label: 'History' },
    { screen: 'profile', label: 'Profile' },
    { screen: 'help', label: 'Help center', count: 1 },
  ],
};

const initialJobs: Job[] = [];

const statusLabel = statusLabels;

const captureJobPhoto = async () => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();

  if (!permission.granted) {
    Alert.alert(
      'Camera permission needed',
      'HaulConnect needs camera access so customers and drivers can attach job photos.'
    );
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: false,
    quality: 0.75,
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  return result.assets[0].uri;
};

const selectJobPhoto = async (): Promise<string | null> => {
  const source = await new Promise<'camera' | 'library' | null>(resolve => {
    Alert.alert('Add photo', 'Choose a photo source', [
      { text: 'Take photo', onPress: () => resolve('camera') },
      { text: 'Camera roll', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
  if (!source) return null;
  try {
    if (source === 'camera') return await captureJobPhoto();
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.75 });
    return result.canceled ? null : result.assets[0]?.uri || null;
  } catch {
    Alert.alert('Unable to open photos', 'Please check the app permissions in your phone settings and try again.');
    return null;
  }
};

const pickProfilePhoto = async () => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    Alert.alert(
      'Photo library permission needed',
      'HaulConnect needs photo library access so you can choose a profile picture.'
    );
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  return result.assets[0].uri;
};

const formatLocationAddress = (address?: Location.LocationGeocodedAddress) => {
  if (!address) {
    return '';
  }

  return [
    address.name,
    address.street,
    address.city,
    address.region,
    address.postalCode,
  ].filter(Boolean).join(', ');
};

const reverseGeocodeWithTimeout = async (latitude: number, longitude: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const addresses = await Promise.race([
      Location.reverseGeocodeAsync({ latitude, longitude }),
      new Promise<Location.LocationGeocodedAddress[]>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Address lookup timed out.')), 5000);
      }),
    ]);

    return formatLocationAddress(addresses[0]);
  } catch {
    return '';
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const authActionInProgress = useRef(false);
  const [role, setRole] = useState<Role | null>(null);
  const [sessionUid, setSessionUid] = useState<string | null>(null);
  const [jobsReady, setJobsReady] = useState(false);
  const [jobsError, setJobsError] = useState('');
  const [jobNotice, setJobNotice] = useState('');
  const [driverOptions, setDriverOptions] = useState<DriverOption[]>([]);
  const [driversError, setDriversError] = useState('');
  const [showBookingForm, setShowBookingForm] = useState(false);
  const advancingJobs = useRef(new Set<string>());
  const [accountName, setAccountName] = useState('Cristian Estrada');
  const [accountFirstName, setAccountFirstName] = useState('Cristian');
  const [accountLastName, setAccountLastName] = useState('Estrada');
  const [avatarKey, setAvatarKey] = useState<AvatarKey>('green');
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>('driver');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [newAccountRole, setNewAccountRole] = useState<PublicRole | null>(null);
  const [signupCapabilities, setSignupCapabilities] = useState<string[]>([]);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [newAccountFirstName, setNewAccountFirstName] = useState('');
  const [newAccountLastName, setNewAccountLastName] = useState('');
  const [isRecoveringAccount, setIsRecoveringAccount] = useState(false);
  const [loginNotice, setLoginNotice] = useState('');
  const [screen, setScreen] = useState<Screen>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const pendingPickup = useRef<PickupDraft | null>(null);
  const bookingBusy = useRef(false);
  const [customerPhotos, setCustomerPhotos] = useState<string[]>([]);
  const [customerPhotoUris, setCustomerPhotoUris] = useState<Record<string, string>>({});
  const [proofPhotoUris, setProofPhotoUris] = useState<Record<string, Record<string, string>>>({});
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState('GPS not started');
  const [driverProfile, setDriverProfile] = useState<DriverProfile>(emptyDriverProfile);
  const activeJob = jobs.find((job) => ['accepted','en_route','arrived','loading'].includes(job.status)) || null;
  const menuItems = role ? menuByRole[role] : menuByRole.driver;
  const displayName = `${accountFirstName} ${accountLastName}`.trim() || accountName;
  const drawerName = role === 'admin' ? 'Admin Console' : displayName;

  const title = useMemo(() => {
    const item = menuItems.find((menuItem) => menuItem.screen === screen);
    return item?.label || 'HaulConnect';
  }, [menuItems, screen]);

  const clearAuthForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setPasswordVisible(false);
    setConfirmPasswordVisible(false);
    setIsCreatingAccount(false);
    setIsRecoveringAccount(false);
    setNewAccountRole(null);
    setNewAccountFirstName('');
    setNewAccountLastName('');
    setSignupCapabilities([]);
    setLoginNotice('');
  };

  const applyBackendProfile = (profile: BackendProfile) => {
    clearAuthForm();
    setEmail(auth.currentUser?.email || '');
    setSessionUid(profile.uid);
    setSelectedRole(profile.role);
    setRole(profile.role);
    setAccountName(profile.name);
    setAccountFirstName(profile.firstName || profile.name.split(/\s+/)[0] || profile.name);
    setAccountLastName(profile.lastName || profile.name.split(/\s+/).slice(1).join(' '));
    setAvatarKey(isAvatarKey(profile.avatarKey) ? profile.avatarKey : 'green');
    setProfilePhotoUri(profile.profilePhotoUrl);
    setDriverProfile(profile.driverProfile);
    setScreen(roleHome[profile.role]);
    setDrawerOpen(false);
  };

  const resetSignedOutState = () => {
    clearAuthForm();
    setSelectedRole('driver');
    setAccountName('');
    setAccountFirstName('');
    setAccountLastName('');
    setAvatarKey('green');
    setDriverProfile(emptyDriverProfile());
    setDriverLocation(null);
    setLocationStatus('GPS not started');
    setJobs(initialJobs);
    pendingPickup.current = null;
    setCustomerPhotos([]);
    setCustomerPhotoUris({});
    setProofPhotoUris({});
    setSelectedPhoto(null);
    setPaymentMethod('card');
    setOnline(false);
    setSessionUid(null);
    setShowBookingForm(false);
    setJobsReady(false);
    setJobsError('');
    setJobNotice('');
    setDriverOptions([]);
    setRole(null);
    setDrawerOpen(false);
    setScreen('home');
    setLoginNotice('');
    setProfilePhotoUri(null);
  };

  useEffect(() => {
    const unsubscribe = listenForAuthSession(async (user) => {
      if (!user || authActionInProgress.current) {
        return;
      }

      setLoginNotice('Restoring saved session...');

      try {
        const profile = await loadCurrentUserProfile('driver');

        if (profile && auth.currentUser?.uid === user.uid && !authActionInProgress.current) {
          applyBackendProfile(profile);
          setLoginNotice(profile.profileWarning ? `Signed in. Profile sync delayed: ${profile.profileWarning}` : '');
        }
      } catch (error) {
        if (auth.currentUser?.uid === user.uid && !authActionInProgress.current) {
          setLoginNotice(`Saved session restore failed: ${getBackendErrorMessage(error)}`);
        }
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    setJobs([]); setJobsReady(false); setJobsError(''); setJobNotice(''); setDriverOptions([]); setDriversError('');
    if (!role || !sessionUid) return;
    let active = true;
    let previous: Map<string, string> | null = null;
    const unsubscribe = subscribeToJobs(role, sessionUid, (incoming) => {
      if (!active || auth.currentUser?.uid !== sessionUid) return;
      if (previous) {
        const changed = incoming.find(job => previous!.get(job.id) !== `${job.status}:${job.etaUpdatedAtMs || 0}`);
        if (changed) setJobNotice(`${previous.get(changed.id)?.startsWith(`${changed.status}:`) && changed.etaUpdatedAtMs ? `ETA updated: ${changed.eta} minutes` : role === 'driver' && changed.status === 'assigned' ? 'New pickup assignment' : statusLabel[changed.status]} · ${changed.pickup}`);
      }
      previous = new Map(incoming.map(job => [job.id, `${job.status}:${job.etaUpdatedAtMs || 0}`]));
      setJobs(incoming); setJobsReady(true); setJobsError('');
    }, (error) => {
      if (active) { setJobs([]); setJobsError(`Unable to load pickups: ${getBackendErrorMessage(error)}`); }
    });
    const unsubscribeDrivers = role === 'admin' ? subscribeToDrivers((drivers) => {
      if (active) setDriverOptions(drivers);
    }, (error) => { if (active) setDriversError(`Unable to load drivers: ${getBackendErrorMessage(error)}`); }) : undefined;
    return () => { active = false; unsubscribe(); unsubscribeDrivers?.(); };
  }, [role, sessionUid]);

  const login = async () => {
    if (authActionInProgress.current) return;
    authActionInProgress.current = true;
    setLoginNotice('Signing in...');

    try {
      const fallbackRole: PublicRole = selectedRole === 'customer' ? 'customer' : 'driver';
      const profile = await signInHaulConnect(email.trim(), password, fallbackRole);
      applyBackendProfile(profile);
      setLoginNotice(profile.profileWarning ? `Signed in. Profile sync delayed: ${profile.profileWarning}` : '');
    } catch (error) {
      setLoginNotice(`Firebase sign in failed: ${getBackendErrorMessage(error)}`);
    } finally {
      authActionInProgress.current = false;
    }
  };

  const logout = async () => {
    try {
      await signOutCurrentUser();
    } catch (error) {
      Alert.alert('Sign out failed', 'Please try again. You are still signed in.');
      return;
    }

    resetSignedOutState();
  };

  const deleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes the signed-in HaulConnect login. You will need to create a new account to use the app again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCurrentUserAccount();
              resetSignedOutState();
              Alert.alert('Account deleted', 'This HaulConnect account has been deleted.');
            } catch (error) {
              Alert.alert(
                'Delete account failed',
                `${getBackendErrorMessage(error)} If Firebase asks for a recent login, sign out, sign back in, and try Delete account again.`
              );
            }
          },
        },
      ]
    );
  };

  const navigate = (nextScreen: Screen) => {
    setScreen(nextScreen);
    setDrawerOpen(false);
  };

  const updateJob = (jobId: string, updater: (job: Job) => Job) => {
    setJobs((current) => current.map((job) => (job.id === jobId ? updater(job) : job)));
  };

  const createAccount = async (accountRole: PublicRole) => {
    if (authActionInProgress.current) return;
    authActionInProgress.current = true;
    setLoginNotice('Creating account...');

    try {
      const cleanFirstName = newAccountFirstName.trim();
      const cleanLastName = newAccountLastName.trim();
      const name = `${cleanFirstName} ${cleanLastName}`.trim() || email.split('@')[0] || 'HaulConnect user';
      const nextDriverProfile = accountRole === 'driver'
        ? {
            ...driverProfile,
            capabilities: [...signupCapabilities],
          }
        : undefined;
      const profile = await createHaulConnectAccount({
        driverProfile: nextDriverProfile,
        email: email.trim(),
        firstName: cleanFirstName,
        lastName: cleanLastName,
        name,
        password,
        role: accountRole,
      });

      if (nextDriverProfile) {
        setDriverProfile(nextDriverProfile);
      }

      clearAuthForm();
      setEmail(auth.currentUser?.email || email.trim());
      setAvatarKey('green');
      setProfilePhotoUri(null);
      setSessionUid(profile.uid);
      setSelectedRole(profile.role);
      setRole(profile.role);
      setAccountName(profile.name);
      setAccountFirstName(profile.firstName || cleanFirstName || profile.name.split(/\s+/)[0] || profile.name);
      setAccountLastName(profile.lastName || cleanLastName || profile.name.split(/\s+/).slice(1).join(' '));
      setScreen(roleHome[profile.role]);
      setDrawerOpen(false);
      setLoginNotice('');

      Alert.alert(
        'Account created',
        profile.setupWarnings.length
          ? `You are signed in. Backend setup note: ${profile.setupWarnings.join(' ')}`
          : `You are signed in. A verification email was sent to ${email.trim()}. Check your spam folder too. After verifying, return to the app; you do not need to sign in again.`
      );

    } catch (error) {
      setLoginNotice(`Firebase account creation failed: ${getBackendErrorMessage(error)}`);
    } finally {
      authActionInProgress.current = false;
    }
  };

  const recoverAccount = async () => {
    setLoginNotice('Sending password reset...');

    try {
      await sendHaulConnectPasswordReset(email.trim());
      setLoginNotice(`Password reset email sent to ${email}.`);
    } catch (error) {
      setLoginNotice(`Firebase password reset failed: ${getBackendErrorMessage(error)}`);
    }
  };

  const resendVerificationEmail = async () => {
    try {
      const result = await sendCurrentUserVerificationEmail();
      Alert.alert(
        'Verification email',
        result.alreadyVerified
          ? 'This email is already verified.'
          : `A verification email was sent to ${auth.currentUser?.email || email.trim()}.`
      );
    } catch (error) {
      Alert.alert('Verification email failed', getBackendErrorMessage(error));
    }
  };

  const testCamera = async () => {
    const photoUri = await captureJobPhoto();

    if (photoUri) {
      setSelectedPhoto({ kind: 'customer', label: 'Camera test', uri: photoUri });
    }
  };

  const chooseProfilePhoto = async () => {
    const photoUri = await pickProfilePhoto();

    if (photoUri) {
      setProfilePhotoUri(photoUri);

      if (auth.currentUser) {
        try {
          const uploadResult = await uploadUserProfilePhoto(photoUri);
          setProfilePhotoUri(uploadResult.url);

          if (uploadResult.profileSyncWarning) {
            console.warn('Profile photo sync delayed', uploadResult.profileSyncWarning);
          }
        } catch (error) {
          console.warn('Profile photo cloud sync failed', getBackendErrorMessage(error));
        }
      }
    }
  };

  const syncProfilePhotoIfNeeded = async () => {
    if (!auth.currentUser || !profilePhotoUri || !/^(file|content):/.test(profilePhotoUri)) {
      return;
    }

    try {
      const uploadResult = await uploadUserProfilePhoto(profilePhotoUri);
      setProfilePhotoUri(uploadResult.url);

      if (uploadResult.profileSyncWarning) {
        console.warn('Profile photo sync delayed', uploadResult.profileSyncWarning);
      }
    } catch (error) {
      console.warn('Profile photo cloud sync failed', getBackendErrorMessage(error));
    }
  };

  const saveAccountBasics = async () => {
    const firstName = accountFirstName.trim();
    const lastName = accountLastName.trim();
    const name = `${firstName} ${lastName}`.trim() || accountName;
    let syncedProfilePhotoUri: string | null | undefined = profilePhotoUri;

    setAccountFirstName(firstName);
    setAccountLastName(lastName);
    setAccountName(name);

    if (auth.currentUser) {
      if (profilePhotoUri && /^(file|content):/.test(profilePhotoUri)) {
        try {
          const uploadResult = await uploadUserProfilePhoto(profilePhotoUri);
          syncedProfilePhotoUri = uploadResult.url;
          setProfilePhotoUri(uploadResult.url);

          if (uploadResult.profileSyncWarning) {
            console.warn('Profile photo sync delayed', uploadResult.profileSyncWarning);
          }
        } catch (error) {
          syncedProfilePhotoUri = undefined;
          console.warn('Profile photo cloud sync failed', getBackendErrorMessage(error));
        }
      }

      try {
        await saveUserProfileBasics({
          avatarKey,
          email: email.trim(),
          firstName,
          lastName,
          name,
          profilePhotoUrl: syncedProfilePhotoUri === undefined
            ? undefined
            : syncedProfilePhotoUri && !/^(file|content):/.test(syncedProfilePhotoUri)
              ? syncedProfilePhotoUri
              : null,
        });
      } catch (error) {
        Alert.alert('Profile save delayed', getBackendErrorMessage(error));
      }
    }
  };

  const useColorDotProfilePhoto = async () => {
    setProfilePhotoUri(null);

    if (auth.currentUser) {
      try {
        await clearUserProfilePhoto();
      } catch (error) {
        Alert.alert('Profile photo update failed', getBackendErrorMessage(error));
      }
    }
  };

  const startTestJob = () => {
    const testJob: Job = {
      customer: 'Test customer',
      customerPhotos: [],
      details: 'Temporary test job for checking driver proof photos. This is not a real delivery.',
      distance: '-',
      dropoff: 'Test dropoff',
      eta: 0,
      id: `test_${Date.now()}`,
      load: 'Test photo job',
      paymentMethod: 'card',
      payout: 0,
      pickup: 'Test pickup',
      proofPhotos: [],
      quote: 0,
      status: 'accepted',
    };

    setJobs((current) => [
      testJob,
      ...current.filter((job) => !job.id.startsWith('test_')),
    ]);
    setScreen('deliveries');
  };

  const requestDriverLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (!permission.granted) {
      setLocationStatus('GPS permission denied');
      Alert.alert(
        'Location permission needed',
        'HaulConnect needs location access so customers can track driver arrival.'
      );
      return;
    }

    setLocationStatus('Getting GPS location...');
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const updatedAt = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const address = await reverseGeocodeWithTimeout(position.coords.latitude, position.coords.longitude);
    const nextLocation = {
      address,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      updatedAt,
    };

    setDriverLocation(nextLocation);
    setLocationStatus(`GPS updated at ${updatedAt}`);

    updateDriverLiveLocation({
      address: nextLocation.address,
      heading: position.coords.heading,
      jobId: activeJob?.id || 'unassigned',
      latitude: nextLocation.latitude,
      longitude: nextLocation.longitude,
      speed: position.coords.speed,
      uid: auth.currentUser?.uid || 'demo-driver',
    }).catch((error) => {
      setLocationStatus(`GPS local only: ${updatedAt}`);
      Alert.alert('Firebase GPS update failed', getBackendErrorMessage(error));
    });
  };

  const advanceJob = async (jobId: string) => {
    if (advancingJobs.current.has(jobId)) return;
    advancingJobs.current.add(jobId);
    try {
      if (jobId.startsWith('test_')) {
        updateJob(jobId, job => ({ ...job, status: nextDeliveryStatus(job.status) || job.status }));
      } else { await advanceAssignedJob(jobId); }
    } catch (error) { Alert.alert('Status update failed', getBackendErrorMessage(error)); }
    finally { advancingJobs.current.delete(jobId); }
  };

  const addProofPhoto = async (jobId: string, label: string) => {
    const photoUri = await selectJobPhoto();
    if (!photoUri) {
      return;
    }

    setProofPhotoUris((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] || {}),
        [label]: photoUri,
      },
    }));
    updateJob(jobId, (job) => ({
      ...job,
      proofPhotos: job.proofPhotos.includes(label) ? job.proofPhotos : [...job.proofPhotos, label],
    }));

    try {
      const photoUrl = await uploadJobPhoto({ jobId, kind: 'proof', label, uri: photoUri });
      await saveFirebaseJobPhoto({ jobId, kind: 'proof', label, url: photoUrl });
    } catch (error) {
      console.warn('Firebase proof photo upload failed', getBackendErrorMessage(error));
    }
  };

  const deleteProofPhoto = (jobId: string, label: string) => {
    setProofPhotoUris((current) => {
      const nextJobPhotos = { ...(current[jobId] || {}) };
      delete nextJobPhotos[label];
      return {
        ...current,
        [jobId]: nextJobPhotos,
      };
    });
    updateJob(jobId, (job) => ({
      ...job,
      proofPhotos: job.proofPhotos.filter((photo) => photo !== label),
    }));
  };

  const addCustomerPhoto = async (label: string) => {
    const photoUri = await selectJobPhoto();
    if (!photoUri) {
      return;
    }

    setCustomerPhotoUris((current) => ({ ...current, [label]: photoUri }));
    setCustomerPhotos((currentPhotos) => (
      currentPhotos.includes(label) ? currentPhotos : [...currentPhotos, label]
    ));


  };

  const bookPickup = async (input: PickupDetails) => {
    if (bookingBusy.current) throw new Error('A booking is already being submitted.');
    if (role !== 'customer' || !auth.currentUser) throw new Error('Sign in as a customer to book a pickup.');
    const validation = validatePickup(input);
    if (validation) throw new Error(validation);
    const uid = auth.currentUser.uid;
    bookingBusy.current = true;
    // Keep the submitted details and ID together so retry cannot create duplicates.
    pendingPickup.current ??= {
      id: newPickupRequestId(), ...input,
      paymentMethod, photos: { ...customerPhotoUris },
    };
    try {
      const request = pendingPickup.current;
      const saved = await bookFirebasePickup({ ...request, customer: displayName });
      if (auth.currentUser?.uid !== uid) throw new Error('Your session changed. Sign in to view the request.');
      const job = readJob(saved.id, saved);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      pendingPickup.current = null;
      setCustomerPhotos([]);
      setCustomerPhotoUris({});
      setShowBookingForm(false);
      return job.id;
    } finally {
      bookingBusy.current = false;
    }
  };

  const deleteCustomerPhoto = (label: string) => {
    setCustomerPhotoUris((current) => {
      const nextPhotos = { ...current };
      delete nextPhotos[label];
      return nextPhotos;
    });
    setCustomerPhotos((currentPhotos) => (
      currentPhotos.filter((photo) => photo !== label)
    ));
  };

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="light" />
        <View style={styles.loadingScreen}>
          <Text style={styles.loadingText}>Loading HaulConnect</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!role) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="light" />
        <LoginScreen
          driverProfile={driverProfile}
          setDriverProfile={setDriverProfile}
          confirmPassword={confirmPassword}
          confirmPasswordVisible={confirmPasswordVisible}
          createAccount={createAccount}
          email={email}
          isCreatingAccount={isCreatingAccount}
          isRecoveringAccount={isRecoveringAccount}
          login={login}
          loginNotice={loginNotice}
          newAccountRole={newAccountRole}
          password={password}
          passwordVisible={passwordVisible}
          recoverAccount={recoverAccount}
          selectedRole={selectedRole}
          setEmail={setEmail}
          setConfirmPassword={setConfirmPassword}
          setConfirmPasswordVisible={setConfirmPasswordVisible}
          setIsCreatingAccount={setIsCreatingAccount}
          setIsRecoveringAccount={setIsRecoveringAccount}
          setLoginNotice={setLoginNotice}
          setNewAccountRole={setNewAccountRole}
          setNewAccountFirstName={setNewAccountFirstName}
          setNewAccountLastName={setNewAccountLastName}
          setPassword={setPassword}
          setPasswordVisible={setPasswordVisible}
          setSelectedRole={setSelectedRole}
          setSignupCapabilities={setSignupCapabilities}
          signupCapabilities={signupCapabilities}
          newAccountFirstName={newAccountFirstName}
          newAccountLastName={newAccountLastName}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuButton}>
          <Text style={styles.menuIcon}>☰</Text>
        </Pressable>
        <Text style={styles.topTitle}>{title}</Text>
        <View style={[styles.onlineDot, online ? styles.onlineDotActive : styles.onlineDotOff]} />
      </View>

      <ScrollView contentContainerStyle={styles.screen}>
        {!!jobNotice && <Pressable accessibilityRole="button" onPress={() => { setJobNotice(''); setScreen(roleHome[role]); }} style={styles.card}><Text accessibilityLiveRegion="polite" style={styles.noticeText}>{jobNotice}</Text><Text style={styles.metaText}>Tap to view pickup</Text></Pressable>}
        {!jobsReady && !jobsError && <Text style={styles.noticeText}>Loading pickups…</Text>}
        {!!jobsError && <Text accessibilityLiveRegion="polite" style={styles.errorText}>{jobsError}</Text>}
        {role === 'admin' && !!driversError && <Text style={styles.errorText}>{driversError}</Text>}
        {role === 'driver' && (screen === 'home' || screen === 'deliveries') && <DriverInvitations jobs={jobs} onRespond={respondToAssignment} />}

        {screen === 'home' && (
          <HomeScreen
            activeJob={activeJob}
            advanceJob={advanceJob}
            avatarKey={avatarKey}
            driverName={displayName}
            driverLocation={driverLocation}
            locationStatus={locationStatus}
            online={online}
            profilePhotoUri={profilePhotoUri}
            requestDriverLocation={requestDriverLocation}
            setOnline={setOnline}
            startTestJob={startTestJob}
            testCamera={testCamera}
          />
        )}
        {screen === 'deliveries' && (
          <DeliveriesScreen
            canUpdate={role === 'driver'}
            addProofPhoto={addProofPhoto}
            advanceJob={advanceJob}
            deleteProofPhoto={deleteProofPhoto}
            jobs={jobs}
            openPhotoPreview={setSelectedPhoto}
            proofPhotoUris={proofPhotoUris}
          />
        )}
        {screen === 'opportunities' && <DriverInvitations jobs={jobs} onRespond={respondToAssignment} />}
        {screen === 'history' && <HistoryScreen jobs={jobs} />}
        {screen === 'earnings' && <EarningsScreen />}
        {screen === 'notifications' && <SimpleScreen title="Notifications" body="New same-day haul request near Cathedral City." />}
        {screen === 'profile' && (
          <ProfileScreen
            accountName={accountName}
            accountFirstName={accountFirstName}
            accountLastName={accountLastName}
            avatarKey={avatarKey}
            deleteAccount={deleteAccount}
            driverProfile={driverProfile}
            email={email}
            password={password}
            passwordVisible={passwordVisible}
            profilePhotoUri={profilePhotoUri}
            resendVerificationEmail={resendVerificationEmail}
            role={role}
            saveAccountBasics={saveAccountBasics}
            setAccountName={setAccountName}
            setAccountFirstName={setAccountFirstName}
            setAccountLastName={setAccountLastName}
            setAvatarKey={setAvatarKey}
            setDriverProfile={setDriverProfile}
            setEmail={setEmail}
            setPassword={setPassword}
            setPasswordVisible={setPasswordVisible}
            chooseProfilePhoto={chooseProfilePhoto}
            useColorDotProfilePhoto={useColorDotProfilePhoto}
          />
        )}
        {screen === 'customer' && role === 'customer' && jobsReady && (
          !showBookingForm && jobs.length > 0
            ? <CustomerPickups jobs={jobs} onBookAnother={() => setShowBookingForm(true)} />
            : <PickupBookingForm
                bookPickup={bookPickup} pendingRequest={pendingPickup.current}
                photoUris={customerPhotoUris} addPhoto={addCustomerPhoto} deletePhoto={deleteCustomerPhoto}
                paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
                onBack={jobs.length ? () => setShowBookingForm(false) : undefined}
              />
        )}
        {screen === 'tracking' && (
          <TrackingScreen
            activeJob={activeJob}
            avatarKey={avatarKey}
            driverName={displayName}
            driverLocation={driverLocation}
            locationStatus={locationStatus}
            profilePhotoUri={profilePhotoUri}
          />
        )}
        {screen === 'admin' && role === 'admin' && <AdminDispatch jobs={jobs} drivers={driverOptions} onAssign={assignDriver} />}
        {screen === 'legal' && <SimpleScreen title="Legal" body="Driver agreement, insurance requirements, privacy policy, and payment terms will live here." />}
        {screen === 'help' && <SimpleScreen title="Help center" body="Support tickets, damaged item reports, payment questions, and job dispute tools." />}
      </ScrollView>

      {drawerOpen && (
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerScrim} onPress={() => setDrawerOpen(false)} />
          <View style={styles.drawer}>
            <View style={styles.driverBlock}>
              <ProfileAvatar avatarKey={avatarKey} name={drawerName} photoUri={profilePhotoUri} size={58} />
              <View>
                <Text style={styles.driverName}>{drawerName}</Text>
                <Text style={styles.roleCaption}>{roleLabels[role]}</Text>
              </View>
            </View>

            {menuItems.map((item) => (
              <Pressable key={item.screen} onPress={() => navigate(item.screen)} style={styles.drawerItem}>
                <Text style={[styles.drawerText, screen === item.screen && styles.drawerTextActive]}>
                  {item.label}
                </Text>
                {typeof item.count === 'number' && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{item.count}</Text>
                  </View>
                )}
              </Pressable>
            ))}

            <View style={styles.drawerFooter}>
              <Pressable onPress={logout}>
                <Text style={styles.logout}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <PhotoPreviewModal
        deleteCustomerPhoto={deleteCustomerPhoto}
        deleteProofPhoto={deleteProofPhoto}
        photo={selectedPhoto}
        setPhoto={setSelectedPhoto}
      />
    </SafeAreaView>
  );
}

function HomeScreen({
  activeJob,
  advanceJob,
  avatarKey,
  driverName,
  driverLocation,
  locationStatus,
  online,
  profilePhotoUri,
  requestDriverLocation,
  setOnline,
  startTestJob,
  testCamera,
}: {
  activeJob: Job | null;
  advanceJob: (jobId: string) => void;
  avatarKey: AvatarKey;
  driverName: string;
  driverLocation: DriverLocation | null;
  locationStatus: string;
  online: boolean;
  profilePhotoUri: string | null;
  requestDriverLocation: () => void;
  setOnline: (value: boolean) => void;
  startTestJob: () => void;
  testCamera: () => void;
}) {
  return (
    <View style={styles.stack}>
      <View style={styles.map}>
        <TrackingMap
          avatarKey={avatarKey}
          driverLocation={driverLocation}
          driverName={driverName}
          hasActiveJob={!!activeJob}
          profilePhotoUri={profilePhotoUri}
        />
      </View>

      <View style={styles.gpsPanel}>
        <View style={styles.gpsDetails}>
          <Text style={styles.kicker}>Driver GPS</Text>
          <Text style={styles.gpsStatus}>{locationStatus}</Text>
          {driverLocation?.address && <Text style={styles.gpsAddress}>{driverLocation.address}</Text>}
          {driverLocation && (
            <Text style={styles.metaText}>
              {driverLocation.latitude.toFixed(5)}, {driverLocation.longitude.toFixed(5)}
            </Text>
          )}
        </View>
        <Pressable onPress={requestDriverLocation} style={styles.gpsButton}>
          <Text style={styles.gpsButtonText}>Update GPS</Text>
        </Pressable>
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.kicker}>Current delivery</Text>
            <Text style={styles.sheetTitle}>{activeJob?.load || 'No active delivery'}</Text>
          </View>
          <Pressable onPress={() => setOnline(!online)} style={[styles.statusSwitch, online && styles.statusSwitchOn]}>
            <Text style={[styles.statusSwitchText, online && styles.statusSwitchTextOn]}>
              {online ? 'Online' : 'Offline'}
            </Text>
          </Pressable>
        </View>

        {activeJob ? (
          <View><JobRoute job={activeJob} /><DriverEta key={activeJob.id} job={activeJob}/><JobTimeline job={activeJob}/></View>
        ) : (
          <Text style={styles.emptyText}>Accepted jobs will appear here once they are assigned.</Text>
        )}

        <View style={styles.rowBetween}>
          <Stat label="Payout" value={activeJob ? `$${activeJob.payout}` : '-'} />
          <Stat label="Distance" value={activeJob?.distance || '-'} />
          <Stat label="ETA" value={activeJob?.etaUpdatedAtMs && activeJob.eta ? `${activeJob.eta}m` : '-'} />
        </View>

        <Pressable
          disabled={!activeJob}
          onPress={() => activeJob && advanceJob(activeJob.id)}
          style={[styles.primaryButton, !activeJob && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonText}>
            {activeJob ? activeJob.status === 'accepted' ? 'Start trip · On my way' : `Update: ${statusLabel[nextDeliveryStatus(activeJob.status) || activeJob.status]}` : 'No active job'}
          </Text>
        </Pressable>

        {!activeJob && (
          <View style={styles.noJobActions}>
            <Pressable onPress={startTestJob} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Create test job</Text>
            </Pressable>
            <Pressable onPress={testCamera} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Test camera only</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function LoginScreen({
  driverProfile,
  setDriverProfile,
  confirmPassword,
  confirmPasswordVisible,
  createAccount,
  email,
  isCreatingAccount,
  isRecoveringAccount,
  login,
  loginNotice,
  newAccountFirstName,
  newAccountLastName,
  newAccountRole,
  password,
  passwordVisible,
  recoverAccount,
  selectedRole,
  setEmail,
  setConfirmPassword,
  setConfirmPasswordVisible,
  setIsCreatingAccount,
  setIsRecoveringAccount,
  setLoginNotice,
  setNewAccountFirstName,
  setNewAccountLastName,
  setNewAccountRole,
  setPassword,
  setPasswordVisible,
  setSelectedRole,
  setSignupCapabilities,
  signupCapabilities,
}: {
  driverProfile: DriverProfile;
  setDriverProfile: (value: DriverProfile) => void;
  confirmPassword: string;
  confirmPasswordVisible: boolean;
  createAccount: (role: PublicRole) => Promise<void>;
  email: string;
  isCreatingAccount: boolean;
  isRecoveringAccount: boolean;
  login: () => Promise<void>;
  loginNotice: string;
  newAccountFirstName: string;
  newAccountLastName: string;
  newAccountRole: PublicRole | null;
  password: string;
  passwordVisible: boolean;
  recoverAccount: () => Promise<void>;
  selectedRole: Role;
  setEmail: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  setConfirmPasswordVisible: (value: boolean) => void;
  setIsCreatingAccount: (value: boolean) => void;
  setIsRecoveringAccount: (value: boolean) => void;
  setLoginNotice: (value: string) => void;
  setNewAccountFirstName: (value: string) => void;
  setNewAccountLastName: (value: string) => void;
  setNewAccountRole: (value: PublicRole | null) => void;
  setPassword: (value: string) => void;
  setPasswordVisible: (value: boolean) => void;
  setSelectedRole: (value: Role) => void;
  setSignupCapabilities: (value: string[]) => void;
  signupCapabilities: string[];
}) {
  const passwordMismatch = Boolean(newAccountRole && confirmPassword && password !== confirmPassword);

  const selectNewAccountRole = (roleOption: PublicRole) => {
    setNewAccountRole(roleOption);
    setSelectedRole(roleOption);
    setLoginNotice('');
  };

  const switchToCreateAccount = () => {
    setDriverProfile(emptyDriverProfile());
    setIsCreatingAccount(true);
    setIsRecoveringAccount(false);
    setNewAccountRole(null);
    setLoginNotice('');
    setConfirmPassword('');
    setNewAccountFirstName('');
    setNewAccountLastName('');
    setSignupCapabilities([]);
  };

  const switchToSignIn = () => {
    setDriverProfile(emptyDriverProfile());
    setEmail('');
    setPassword('');
    setPasswordVisible(false);
    setConfirmPasswordVisible(false);
    setIsCreatingAccount(false);
    setIsRecoveringAccount(false);
    setNewAccountRole(null);
    setLoginNotice('');
    setConfirmPassword('');
    setNewAccountFirstName('');
    setNewAccountLastName('');
    setSelectedRole('driver');
    setSignupCapabilities([]);
  };

  const switchToRecoverAccount = () => {
    setIsCreatingAccount(false);
    setIsRecoveringAccount(true);
    setLoginNotice('');
  };

  const submitCreateAccount = () => {
    if (password !== confirmPassword) {
      setLoginNotice('Passwords do not match.');
      return;
    }

    if (!newAccountRole) {
      setLoginNotice('Choose customer or driver first.');
      return;
    }

    if (!newAccountFirstName.trim() || !newAccountLastName.trim()) {
      setLoginNotice('Enter first and last name.');
      return;
    }

    createAccount(newAccountRole);
  };

  return (
    <ScrollView contentContainerStyle={styles.loginScreen}>
      <Image source={logoSource} style={styles.loginLogo} />
      <Text style={styles.loginTitle}>HaulConnect</Text>

      <View style={styles.loginCard}>
        {loginNotice ? <Text style={styles.noticeText}>{loginNotice}</Text> : null}

        {isRecoveringAccount ? (
          <>
            <Text style={styles.createAccountTitle}>Recover account</Text>
            <Text style={styles.helperText}>Enter your account email and we will send a password reset link.</Text>
            <Text style={styles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              style={styles.input}
              value={email}
            />

            <Pressable onPress={recoverAccount} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Send reset email</Text>
            </Pressable>

            <Pressable onPress={switchToSignIn} style={styles.createAccountButton}>
              <Text style={styles.createAccountText}>Back to sign in</Text>
            </Pressable>
          </>
        ) : !isCreatingAccount ? (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              style={styles.input}
              value={email}
            />

            <Text style={styles.label}>Password</Text>
            <PasswordField
              password={password}
              passwordVisible={passwordVisible}
              setPassword={setPassword}
              setPasswordVisible={setPasswordVisible}
            />

            <Pressable onPress={login} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Sign in</Text>
            </Pressable>

            <Text style={styles.helperText}>Customers, drivers, and admins sign in here. Your account determines which screens you can access.</Text>

            <Pressable onPress={switchToRecoverAccount} style={styles.createAccountButton}>
              <Text style={styles.createAccountText}>Forgot password?</Text>
            </Pressable>

            <Pressable onPress={switchToCreateAccount} style={styles.createAccountButton}>
              <Text style={styles.createAccountText}>Create account</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.createAccountTitle}>Create account</Text>
            <View style={styles.roleGrid}>
              {(['customer', 'driver'] as PublicRole[]).map((roleOption) => (
                <Pressable
                  key={roleOption}
                  onPress={() => selectNewAccountRole(roleOption)}
                  style={[
                    styles.roleChoice,
                    newAccountRole === roleOption && styles.roleChoiceActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.roleChoiceText,
                      newAccountRole === roleOption && styles.roleChoiceTextActive,
                    ]}
                  >
                    {roleLabels[roleOption]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {newAccountRole && (
              <View style={styles.newAccountFields}>
                <Text style={styles.label}>First name</Text>
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setNewAccountFirstName}
                  style={styles.input}
                  value={newAccountFirstName}
                />

                <Text style={styles.label}>Last name</Text>
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setNewAccountLastName}
                  style={styles.input}
                  value={newAccountLastName}
                />

                <Text style={styles.label}>Email</Text>
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  style={styles.input}
                  value={email}
                />

                <Text style={styles.label}>Password</Text>
                <PasswordField
                  password={password}
                  passwordVisible={passwordVisible}
                  setPassword={setPassword}
                  setPasswordVisible={setPasswordVisible}
                />

                <Text style={styles.label}>Confirm password</Text>
                <PasswordField
                  password={confirmPassword}
                  passwordVisible={confirmPasswordVisible}
                  setPassword={setConfirmPassword}
                  setPasswordVisible={setConfirmPasswordVisible}
                />
                {passwordMismatch && <Text style={styles.errorText}>Passwords do not match.</Text>}

                {newAccountRole === 'driver' && (
                  <DriverSignupDetails
                    driverProfile={driverProfile}
                    setDriverProfile={setDriverProfile}
                    setSignupCapabilities={setSignupCapabilities}
                    signupCapabilities={signupCapabilities}
                  />
                )}

                <Pressable
                  disabled={passwordMismatch}
                  onPress={submitCreateAccount}
                  style={[styles.primaryButton, passwordMismatch && styles.primaryButtonDisabled]}
                >
                  <Text style={styles.primaryButtonText}>Create account</Text>
                </Pressable>
              </View>
            )}

            <Pressable onPress={switchToSignIn} style={styles.createAccountButton}>
              <Text style={styles.createAccountText}>Back to sign in</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function DriverSignupDetails({
  driverProfile,
  setDriverProfile,
  setSignupCapabilities,
  signupCapabilities,
}: {
  driverProfile: DriverProfile;
  setDriverProfile: (value: DriverProfile) => void;
  setSignupCapabilities: (value: string[]) => void;
  signupCapabilities: string[];
}) {
  const toggleSignupCapability = (item: string) => {
    setSignupCapabilities(
      signupCapabilities.includes(item)
        ? signupCapabilities.filter((capability) => capability !== item)
        : [...signupCapabilities, item]
    );
  };

  return (
    <View style={styles.driverSignupDetails}>
      <Text style={styles.createAccountTitle}>Vehicle details</Text>
      <Text style={styles.label}>Vehicle type</Text>
      <TextInput accessibilityLabel="Vehicle type" style={styles.input} value={driverProfile.vehicleType} onChangeText={value => setDriverProfile({ ...driverProfile, vehicleType: value })} />

      <Text style={styles.label}>Vehicle make</Text>
      <TextInput accessibilityLabel="Vehicle make" style={styles.input} value={driverProfile.vehicleMake} onChangeText={value => setDriverProfile({ ...driverProfile, vehicleMake: value })} />

      <Text style={styles.label}>Vehicle model</Text>
      <TextInput accessibilityLabel="Vehicle model" style={styles.input} value={driverProfile.vehicleModel} onChangeText={value => setDriverProfile({ ...driverProfile, vehicleModel: value })} />

      <Text style={styles.label}>Cargo capacity (lbs)</Text>
      <TextInput accessibilityLabel="Cargo capacity (lbs)" style={styles.input} value={driverProfile.cargoCapacity} onChangeText={value => setDriverProfile({ ...driverProfile, cargoCapacity: value })} />

      <Text style={styles.label}>Tow capacity (lbs)</Text>
      <TextInput accessibilityLabel="Tow capacity (lbs)" style={styles.input} value={driverProfile.towCapacity} onChangeText={value => setDriverProfile({ ...driverProfile, towCapacity: value })} />

      <Text style={styles.label}>Trailer type (optional)</Text>
      <TextInput accessibilityLabel="Trailer type (optional)" style={styles.input} value={driverProfile.trailerType} onChangeText={value => setDriverProfile({ ...driverProfile, trailerType: value })} />

      <Text style={styles.label}>Capabilities</Text>
      <View style={styles.capabilityGrid}>
        {[
          'Heavy lifting',
          'Trailer available',
          'Construction debris',
          'Donation drop-off',
          'Appliance removal',
          'Same-day pickup',
        ].map((item) => {
          const selected = signupCapabilities.includes(item);
          return (
            <Pressable
              key={item}
              onPress={() => toggleSignupCapability(item)}
              style={[styles.capabilityChoice, selected && styles.capabilityChoiceActive]}
            >
              <Text style={[styles.capabilityChoiceText, selected && styles.capabilityChoiceTextActive]}>
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PasswordField({
  password,
  passwordVisible,
  setPassword,
  setPasswordVisible,
}: {
  password: string;
  passwordVisible: boolean;
  setPassword: (value: string) => void;
  setPasswordVisible: (value: boolean) => void;
}) {
  return (
    <View style={styles.passwordField}>
      <TextInput
        onChangeText={setPassword}
        secureTextEntry={!passwordVisible}
        style={styles.passwordInput}
        value={password}
      />
      <Pressable
        accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
        onPress={() => setPasswordVisible(!passwordVisible)}
        style={styles.passwordToggle}
      >
        <PasswordEyeIcon visible={passwordVisible} />
      </Pressable>
    </View>
  );
}

function PasswordEyeIcon({ visible }: { visible: boolean }) {
  return (
    <View style={styles.eyeIcon}>
      <View style={styles.eyePupil} />
      {!visible && <View style={styles.eyeSlash} />}
    </View>
  );
}

function PhotoPreviewModal({
  deleteCustomerPhoto,
  deleteProofPhoto,
  photo,
  setPhoto,
}: {
  deleteCustomerPhoto: (label: string) => void;
  deleteProofPhoto: (jobId: string, label: string) => void;
  photo: SelectedPhoto;
  setPhoto: (photo: SelectedPhoto) => void;
}) {
  const deletePhoto = () => {
    if (!photo) {
      return;
    }

    if (photo.kind === 'proof' && photo.jobId) {
      deleteProofPhoto(photo.jobId, photo.label);
    } else {
      deleteCustomerPhoto(photo.label);
    }

    setPhoto(null);
  };

  return (
    <Modal animationType="fade" transparent visible={!!photo} onRequestClose={() => setPhoto(null)}>
      <View style={styles.photoModalBackdrop}>
        <View style={styles.photoModalCard}>
          <Text style={styles.photoModalTitle}>{photo?.label}</Text>
          {photo && <Image source={{ uri: photo.uri }} style={styles.photoModalImage} />}
          <View style={styles.photoModalActions}>
            <Pressable onPress={() => setPhoto(null)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
            <Pressable onPress={deletePhoto} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>Delete photo</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ProfileAvatar({
  avatarKey,
  name,
  photoUri,
  size,
}: {
  avatarKey: AvatarKey;
  name: string;
  photoUri: string | null;
  size: number;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || 'H';

  return (
    <View
      style={[
        styles.profileAvatar,
        {
          backgroundColor: avatarColorByKey[avatarKey],
          borderRadius: Math.round(size / 5),
          height: size,
          width: size,
        },
      ]}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.profileAvatarImage} />
      ) : (
        <Text style={[styles.profileAvatarText, { fontSize: Math.max(18, Math.round(size * 0.42)) }]}>
          {initial}
        </Text>
      )}
    </View>
  );
}

function DeliveriesScreen({
  canUpdate,
  addProofPhoto,
  advanceJob,
  deleteProofPhoto,
  jobs,
  openPhotoPreview,
  proofPhotoUris,
}: {
  canUpdate: boolean;
  addProofPhoto: (jobId: string, label: string) => void;
  advanceJob: (jobId: string) => void;
  deleteProofPhoto: (jobId: string, label: string) => void;
  jobs: Job[];
  openPhotoPreview: (photo: SelectedPhoto) => void;
  proofPhotoUris: Record<string, Record<string, string>>;
}) {
  const deliveries = jobs.filter((job) => (canUpdate
    ? ['accepted','en_route','arrived','loading']
    : ['assigned','accepted','en_route','arrived','loading']).includes(job.status));

  return (
    <View style={styles.stack}>
      {deliveries.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No active deliveries</Text>
          <Text style={styles.emptyText}>Assigned jobs will show here with photos, route details, and status controls.</Text>
        </View>
      )}
      {deliveries.map((job) => {
        const jobPhotoUris = proofPhotoUris[job.id] || {};
        const proofPhotoLabels = Object.keys(jobPhotoUris);
        const nextProofPhotoLabel = `Photo ${Date.now()}`;
        const addPhotoTile = (
          <Pressable
            disabled={!canUpdate}
            onPress={() => addProofPhoto(job.id, nextProofPhotoLabel)}
            style={[styles.photoUploadBox, proofPhotoLabels.length > 0 && styles.photoAddTile]}
          >
            <Text style={styles.photoAddIcon}>+</Text>
            <Text style={styles.photoTitle}>{proofPhotoLabels.length > 0 ? 'Add photo' : 'Upload photos'}</Text>
            {proofPhotoLabels.length === 0 && (
              <Text style={styles.photoMeta}>Tap to add pickup, loaded truck, receipt, or other job photos.</Text>
            )}
          </Pressable>
        );

        return (
          <View key={job.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{job.load}</Text>
              <StatusBadge label={statusLabel[job.status]} />
            </View>
            <JobRoute job={job} />
            <Text style={styles.bodyText}>{job.details}</Text>
            <ContactPhone phone={job.customerPhone} />
            <JobPhotos job={job} />
            {canUpdate && <DriverEta job={job} />}
            <JobTimeline job={job} />
            <Text style={styles.metaText}>Customer photos: {job.customerPhotos.length || 'none attached'}</Text>

            {job.customerPhotos.length > 0 && (
              <View style={styles.tagRow}>
                {job.customerPhotos.map((photo) => (
                  <Text key={photo} style={styles.greenTag}>{photo}</Text>
                ))}
              </View>
            )}

            <Text style={styles.sectionLabel}>Job photos</Text>
            {proofPhotoLabels.length === 0 ? (
              addPhotoTile
            ) : (
              <View style={styles.photoGrid}>
                {proofPhotoLabels.map((label, index) => {
                  const photoUri = jobPhotoUris[label];
                  return (
                    <Pressable
                      key={label}
                      onPress={() => openPhotoPreview({ jobId: job.id, kind: 'proof', label, uri: photoUri })}
                      style={[styles.photoSlot, styles.photoSlotDone]}
                    >
                      <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                      <View style={styles.photoTextOverlay}>
                        <Text style={[styles.photoTitle, styles.photoTitleOnImage]}>{`Photo ${index + 1}`}</Text>
                        <Text style={[styles.photoMeta, styles.photoMetaOnImage]}>Tap to view</Text>
                      </View>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          deleteProofPhoto(job.id, label);
                        }}
                        style={styles.photoDeleteButton}
                      >
                        <Text style={styles.photoDeleteText}>Delete</Text>
                      </Pressable>
                    </Pressable>
                  );
                })}
                {addPhotoTile}
              </View>
            )}

            {canUpdate && nextDeliveryStatus(job.status) && <Pressable onPress={() => advanceJob(job.id)} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{job.status === 'accepted' ? 'Start trip · On my way' : `Update: ${statusLabel[nextDeliveryStatus(job.status)!]}`}</Text>
            </Pressable>}
          </View>
        );
      })}
    </View>
  );
}

function HistoryScreen({jobs}: {jobs: Job[]}) {
  const completed = jobs.filter(job => job.status === 'completed');
  return <View style={styles.stack}>
    {!completed.length && <View style={styles.card}><Text style={styles.cardTitle}>No completed pickups</Text><Text style={styles.emptyText}>Completed pickups will appear here.</Text></View>}
    {completed.map(job => <View key={job.id} style={styles.card}><Text style={styles.cardTitle}>{job.load}</Text><Text>{job.pickup}</Text><Text>{job.details}</Text><Text style={styles.metaText}>Reference: {job.id}</Text><JobTimeline job={job}/></View>)}
  </View>;
}

function EarningsScreen() {
  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>No earnings yet</Text>
        <Text style={styles.emptyText}>Payouts will appear here after completed jobs are paid.</Text>
      </View>
    </View>
  );
}

function ProfileScreen({
  accountFirstName,
  accountLastName,
  accountName,
  avatarKey,
  chooseProfilePhoto,
  deleteAccount,
  driverProfile,
  email,
  password,
  passwordVisible,
  profilePhotoUri,
  resendVerificationEmail,
  role,
  saveAccountBasics,
  setAccountFirstName,
  setAccountLastName,
  setAccountName,
  setAvatarKey,
  setDriverProfile,
  setEmail,
  setPassword,
  setPasswordVisible,
  useColorDotProfilePhoto,
}: {
  accountFirstName: string;
  accountLastName: string;
  accountName: string;
  avatarKey: AvatarKey;
  chooseProfilePhoto: () => void;
  deleteAccount: () => void;
  driverProfile: DriverProfile;
  email: string;
  password: string;
  passwordVisible: boolean;
  profilePhotoUri: string | null;
  resendVerificationEmail: () => void;
  role: Role;
  saveAccountBasics: () => Promise<void>;
  setAccountFirstName: (value: string) => void;
  setAccountLastName: (value: string) => void;
  setAccountName: (value: string) => void;
  setAvatarKey: (value: AvatarKey) => void;
  setDriverProfile: (value: DriverProfile) => void;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setPasswordVisible: (value: boolean) => void;
  useColorDotProfilePhoto: () => void;
}) {
  const [accountEditing, setAccountEditing] = useState(false);
  const [driverProfileEditing, setDriverProfileEditing] = useState(false);
  const profileName = `${accountFirstName} ${accountLastName}`.trim() || accountName;
  const toggleAccountEditing = async () => {
    if (accountEditing) {
      setAccountEditing(false);
      void saveAccountBasics();
      return;
    }

    setDriverProfileEditing(false);
    setAccountEditing(true);
  };

  const [vehicleSaving, setVehicleSaving] = useState(false);
  const toggleDriverProfileEditing = async () => {
    if (vehicleSaving) return;
    if (driverProfileEditing) {
      setVehicleSaving(true);
      try {
        await saveDriverVehicleProfile(driverProfile);
        setDriverProfileEditing(false);
      } catch (error) {
        Alert.alert('Vehicle details not saved', getBackendErrorMessage(error));
      } finally {
        setVehicleSaving(false);
      }
      return;
    }

    setAccountEditing(false);
    setDriverProfileEditing(true);
  };

  const updateDriverProfile = (field: keyof DriverProfile, value: string) => {
    setDriverProfile({ ...driverProfile, [field]: value });
  };

  const toggleDriverProfileItem = (field: 'capabilities' | 'accessories', item: string) => {
    const currentItems = driverProfile[field];
    setDriverProfile({
      ...driverProfile,
      [field]: currentItems.includes(item)
        ? currentItems.filter((currentItem) => currentItem !== item)
        : [...currentItems, item],
    });
  };

  return (
    <View style={styles.profilePage}>
      <ProfileSection
        actionLabel={accountEditing ? 'Save' : 'Edit'}
        onAction={toggleAccountEditing}
        title="Account basics"
      >
        {accountEditing ? (
          <>
            <Text style={styles.label}>Profile picture</Text>
            <View style={styles.profilePhotoEditRow}>
              <ProfileAvatar avatarKey={avatarKey} name={profileName} photoUri={profilePhotoUri} size={76} />
              <View style={styles.profilePhotoActions}>
                <Pressable onPress={chooseProfilePhoto} style={styles.secondaryButtonCompact}>
                  <Text style={styles.secondaryButtonText}>Upload photo</Text>
                </Pressable>
                {profilePhotoUri && (
                  <Pressable onPress={useColorDotProfilePhoto} style={styles.secondaryButtonCompact}>
                    <Text style={styles.secondaryButtonText}>Use color dot</Text>
                  </Pressable>
                )}
              </View>
            </View>
            <Text style={styles.helperText}>Use a color dot, or upload a profile photo from the camera roll.</Text>
            <Text style={styles.label}>Color dot</Text>
            <View style={styles.avatarOptionGrid}>
              {avatarOptions.map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => setAvatarKey(option.key)}
                  style={[
                    styles.avatarOption,
                    avatarKey === option.key && styles.avatarOptionActive,
                  ]}
                >
                  <View style={[styles.avatarOptionSwatch, { backgroundColor: option.color }]} />
                  <Text
                    style={[
                      styles.avatarOptionText,
                      avatarKey === option.key && styles.avatarOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>First name</Text>
            <TextInput
              onChangeText={setAccountFirstName}
              style={styles.input}
              value={accountFirstName}
            />

            <Text style={styles.label}>Last name</Text>
            <TextInput
              onChangeText={setAccountLastName}
              style={styles.input}
              value={accountLastName}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              style={styles.input}
              value={email}
            />

            <Text style={styles.label}>Password</Text>
            <PasswordField
              password={password}
              passwordVisible={passwordVisible}
              setPassword={setPassword}
              setPasswordVisible={setPasswordVisible}
            />
          </>
        ) : (
          <>
            <View style={styles.profileAvatarPreview}>
              <ProfileAvatar avatarKey={avatarKey} name={profileName} photoUri={profilePhotoUri} size={76} />
            </View>
            <ProfileLine label="First Name" value={accountFirstName || '-'} />
            <ProfileLine label="Last Name" value={accountLastName || '-'} />
            <ProfileLine label="Email" value={email} />
            <Pressable onPress={resendVerificationEmail} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Resend verification email</Text>
            </Pressable>
            <ProfileLine label="Password" value="••••••••" />
          </>
        )}
      </ProfileSection>

      {role === 'driver' && (
        <>
          <ProfileSection
            actionLabel={vehicleSaving ? 'Saving…' : driverProfileEditing ? 'Save' : 'Edit'}
            onAction={toggleDriverProfileEditing}
            title="Truck and capabilities"
          >
            {driverProfileEditing ? (
              <>
                <Text style={styles.label}>Vehicle type</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('vehicleType', value)}
                  style={styles.input}
                  value={driverProfile.vehicleType}
                />

                <Text style={styles.label}>Make</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('vehicleMake', value)}
                  style={styles.input}
                  value={driverProfile.vehicleMake}
                />

                <Text style={styles.label}>Model</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('vehicleModel', value)}
                  style={styles.input}
                  value={driverProfile.vehicleModel}
                />

                <Text style={styles.label}>Vehicle length</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('vehicleLength', value)}
                  style={styles.input}
                  value={driverProfile.vehicleLength}
                />

                <Text style={styles.label}>Vehicle width</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('vehicleWidth', value)}
                  style={styles.input}
                  value={driverProfile.vehicleWidth}
                />

                <Text style={styles.label}>Cargo capacity</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('cargoCapacity', value)}
                  style={styles.input}
                  value={driverProfile.cargoCapacity}
                />

                <Text style={styles.label}>Tow capacity</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('towCapacity', value)}
                  style={styles.input}
                  value={driverProfile.towCapacity}
                />

                <Text style={styles.label}>Trailer type</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('trailerType', value)}
                  style={styles.input}
                  value={driverProfile.trailerType}
                />

                <Text style={styles.label}>Trailer length</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('trailerLength', value)}
                  style={styles.input}
                  value={driverProfile.trailerLength}
                />

                <Text style={styles.label}>Trailer width</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('trailerWidth', value)}
                  style={styles.input}
                  value={driverProfile.trailerWidth}
                />

                <Text style={styles.label}>Trailer capacity</Text>
                <TextInput
                  onChangeText={(value) => updateDriverProfile('trailerCapacity', value)}
                  style={styles.input}
                  value={driverProfile.trailerCapacity}
                />

                <Text style={styles.label}>Capabilities</Text>
                <View style={styles.capabilityGrid}>
                  {capabilityOptions.map((item) => {
                    const selected = driverProfile.capabilities.includes(item);
                    return (
                      <Pressable
                        key={item}
                        onPress={() => toggleDriverProfileItem('capabilities', item)}
                        style={[styles.capabilityChoice, selected && styles.capabilityChoiceActive]}
                      >
                        <Text style={[styles.capabilityChoiceText, selected && styles.capabilityChoiceTextActive]}>
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>Accessories</Text>
                <View style={styles.capabilityGrid}>
                  {accessoryOptions.map((item) => {
                    const selected = driverProfile.accessories.includes(item);
                    return (
                      <Pressable
                        key={item}
                        onPress={() => toggleDriverProfileItem('accessories', item)}
                        style={[styles.capabilityChoice, selected && styles.capabilityChoiceActive]}
                      >
                        <Text style={[styles.capabilityChoiceText, selected && styles.capabilityChoiceTextActive]}>
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.profileTitle}>{driverProfile.vehicleType.toUpperCase()}</Text>
                <ProfileLine label="Length" value={driverProfile.vehicleLength} />
                <ProfileLine label="Width" value={driverProfile.vehicleWidth} />
                <ProfileLine label="Cargo capacity" value={driverProfile.cargoCapacity} />
                <ProfileLine label="Tow capacity" value={driverProfile.towCapacity} />
                <ProfileLine label="Make" value={driverProfile.vehicleMake} />
                <ProfileLine label="Model" value={driverProfile.vehicleModel} />

                <Text style={styles.profileSubTitle}>{driverProfile.trailerType.toUpperCase()}</Text>
                <ProfileLine label="Length" value={driverProfile.trailerLength} />
                <ProfileLine label="Width" value={driverProfile.trailerWidth} />
                <ProfileLine label="Weight capacity" value={driverProfile.trailerCapacity} />

                <Text style={styles.profileSubTitle}>Capabilities</Text>
                {driverProfile.capabilities.map((item) => (
                  <Text key={item} style={styles.capability}>{item}</Text>
                ))}

                <Text style={styles.profileSubTitle}>Accessories</Text>
                {driverProfile.accessories.map((item) => (
                  <Text key={item} style={styles.capability}>{item}</Text>
                ))}
              </>
            )}
          </ProfileSection>
        </>
      )}

      <View style={styles.deleteAccountSection}>
        <Pressable onPress={deleteAccount} style={styles.deleteAccountButton}>
          <Text style={styles.deleteAccountButtonText}>Delete account</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TrackingMap({
  avatarKey,
  driverLocation,
  driverName,
  hasActiveJob,
  profilePhotoUri,
}: {
  avatarKey: AvatarKey;
  driverLocation: DriverLocation | null;
  driverName: string;
  hasActiveJob: boolean;
  profilePhotoUri: string | null;
}) {
  const mapRef = useRef<MapView>(null);
  const [mapType, setMapType] = useState<HaulMapType>('standard');
  const driverMarkerRef = useRef<ComponentRef<typeof Marker>>(null);
  const [failedPhotoUri, setFailedPhotoUri] = useState<string | null>(null);
  const markerPhotoUri = profilePhotoUri !== failedPhotoUri ? profilePhotoUri : null;
  const hasDriverLocation = !!driverLocation;
  const driverCoordinate = driverLocation
    ? { latitude: driverLocation.latitude, longitude: driverLocation.longitude }
    : demoJobCoordinates.driverFallback;
  const centerOnDriver = () => {
    mapRef.current?.animateToRegion({
      latitude: driverCoordinate.latitude,
      latitudeDelta: 0.035,
      longitude: driverCoordinate.longitude,
      longitudeDelta: 0.045,
    }, 450);
  };

  useEffect(() => {
    if (hasDriverLocation) {
      centerOnDriver();
    }
  }, [hasDriverLocation, driverCoordinate.latitude, driverCoordinate.longitude]);

  useEffect(() => {
    // Android snapshots custom marker views; refresh after profile changes.
    driverMarkerRef.current?.redraw();
  }, [avatarKey, driverName, profilePhotoUri, failedPhotoUri]);

  const routeCoordinates = [
    demoJobCoordinates.pickup,
    driverCoordinate,
    demoJobCoordinates.dropoff,
  ];

  return (
    <View style={styles.mapShell}>
      <MapView
        ref={mapRef}
        initialRegion={{
          latitude: driverCoordinate.latitude,
          latitudeDelta: 0.035,
          longitude: driverCoordinate.longitude,
          longitudeDelta: 0.045,
        }}
        mapType={mapType}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        showsCompass
        showsScale
        showsTraffic={mapType === 'standard'}
        style={styles.nativeMap}
      >
        {hasActiveJob && (
          <>
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={leafGreen}
              strokeWidth={5}
            />
            <Marker coordinate={demoJobCoordinates.pickup} title="Pickup" />
            <Marker coordinate={demoJobCoordinates.dropoff} title="Dropoff" />
          </>
        )}
        {hasDriverLocation && (
          <Marker
            ref={driverMarkerRef}
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={driverCoordinate}
            title={driverName.trim() || 'Driver'}
            tracksViewChanges
          >
            <View
              collapsable={false}
              onLayout={() => driverMarkerRef.current?.redraw()}
              style={[
                styles.driverMapMarker,
                { backgroundColor: avatarColorByKey[avatarKey] },
              ]}
            >
              <Text style={styles.driverMapMarkerText}>
                {driverName.trim().charAt(0).toUpperCase() || 'D'}
              </Text>
              {markerPhotoUri && (
                <Image
                  key={markerPhotoUri}
                  resizeMode="cover"
                  source={{ uri: markerPhotoUri }}
                  fadeDuration={0}
                  onLoad={() => driverMarkerRef.current?.redraw()}
                  onError={() => setFailedPhotoUri(markerPhotoUri)}
                  style={styles.driverMapMarkerImage}
                />
              )}
            </View>
          </Marker>
        )}
      </MapView>
      <View style={styles.mapTypeControl}>
        {(['standard', 'satellite', 'hybrid', 'terrain'] as HaulMapType[]).map((type) => (
          <Pressable
            key={type}
            onPress={() => setMapType(type)}
            style={[styles.mapTypeButton, mapType === type && styles.mapTypeButtonActive]}
          >
            <Text style={[styles.mapTypeText, mapType === type && styles.mapTypeTextActive]}>
              {type === 'standard' ? 'Map' : type}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={centerOnDriver} style={styles.mapRecenterButton}>
        <Text style={styles.mapRecenterText}>Driver</Text>
      </Pressable>
    </View>
  );
}

function TrackingScreen({
  activeJob,
  avatarKey,
  driverName,
  driverLocation,
  locationStatus,
  profilePhotoUri,
}: {
  activeJob: Job | null;
  avatarKey: AvatarKey;
  driverName: string;
  driverLocation: DriverLocation | null;
  locationStatus: string;
  profilePhotoUri: string | null;
}) {
  return (
    <View style={styles.stack}>
      <View style={styles.trackingMapFrame}>
        <TrackingMap
          avatarKey={avatarKey}
          driverLocation={driverLocation}
          driverName={driverName}
          hasActiveJob={!!activeJob}
          profilePhotoUri={profilePhotoUri}
        />
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.kicker}>Live tracking</Text>
            <Text style={styles.cardTitle}>{activeJob?.load || 'No active delivery'}</Text>
          </View>
          <StatusBadge label={activeJob ? statusLabel[activeJob.status] : 'Waiting'} />
        </View>
        {activeJob ? <JobRoute job={activeJob} /> : <Text style={styles.emptyText}>A live customer route will appear here after a job is assigned.</Text>}
        <Text style={styles.bodyText}>
          Driver location updates from Firebase Realtime Database will move the driver marker on this map.
        </Text>
        <Text style={styles.metaText}>{locationStatus}</Text>
        {driverLocation?.address && <Text style={styles.gpsAddress}>{driverLocation.address}</Text>}
        {driverLocation && (
          <Text style={styles.metaText}>
            Last GPS: {driverLocation.latitude.toFixed(5)}, {driverLocation.longitude.toFixed(5)}
          </Text>
        )}
      </View>
    </View>
  );
}

function SimpleScreen({ body, title }: { body: string; title: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.bodyText}>{body}</Text>
    </View>
  );
}

function JobRoute({ job }: { job: Job }) {
  return (
    <View style={styles.routeBlock}>
      <View style={styles.routeRow}>
        <View style={styles.smallDot} />
        <Text style={styles.routeText}>{job.pickup}</Text>
      </View>
      <View style={styles.routeStem} />
      <View style={styles.routeRow}>
        <View style={styles.squareDot} />
        <Text style={styles.routeText}>{job.dropoff}</Text>
      </View>
    </View>
  );
}

function Stat({ dark = false, label, value }: { dark?: boolean; label: string; value: string }) {
  return (
    <View>
      <Text style={[styles.statLabel, dark && styles.statLabelDark]}>{label}</Text>
      <Text style={[styles.statValue, dark && styles.statValueDark]}>{value}</Text>
    </View>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <View style={styles.statusBadge}>
      <Text style={styles.statusBadgeText}>{label}</Text>
    </View>
  );
}

function HistoryRow({ amount, date, id }: { amount: string; date: string; id: string }) {
  return (
    <View>
      <Text style={styles.dateLabel}>{date}</Text>
      <View style={styles.listRow}>
        <StatusBadge label="Paid" />
        <Text style={styles.listId}>{id}</Text>
        <Text style={styles.listAmount}>{amount}</Text>
      </View>
    </View>
  );
}

function PayoutRow({ amount, date, fee, id }: { amount: string; date: string; fee: string; id: string }) {
  return (
    <View>
      <Text style={styles.dateLabel}>{date}</Text>
      <View style={styles.listRow}>
        <StatusBadge label="Paid" />
        <Text style={styles.listId}>{id}</Text>
        <View>
          <Text style={styles.listAmount}>{amount}</Text>
          <Text style={styles.feeText}>Payout Fee: {fee}</Text>
        </View>
      </View>
    </View>
  );
}

function ProfileSection({
  actionLabel,
  children,
  onAction,
  title,
}: {
  actionLabel?: string;
  children: React.ReactNode;
  onAction?: () => void;
  title: string;
}) {
  return (
    <View style={styles.profileSection}>
      <View style={styles.profileSectionHeader}>
        <Text style={styles.profileSectionTitle}>{title}</Text>
        {actionLabel && onAction && (
          <Pressable onPress={onAction} style={styles.profileEditButton}>
            <Text style={styles.profileEditButtonText}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function ProfileLine({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.profileLine}>
      <Text style={styles.profileLineLabel}>{label}:</Text> {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  app: {
    backgroundColor: '#F3F4F6',
    flex: 1,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: darkGreen,
    borderRadius: 8,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  avatarText: {
    color: '#FFFFFF',
    fontFamily: fontExtraBold,
    fontSize: 17,
  },
  avatarOption: {
    alignItems: 'center',
    borderColor: '#D6D8DC',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '30%',
    gap: 8,
    minHeight: 72,
    justifyContent: 'center',
    padding: 10,
  },
  avatarOptionActive: {
    backgroundColor: softGreen,
    borderColor: leafGreen,
  },
  avatarOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  avatarOptionSwatch: {
    borderRadius: 14,
    height: 28,
    width: 28,
  },
  avatarOptionText: {
    color: '#425149',
    fontFamily: fontSemiBold,
    fontSize: 12,
  },
  avatarOptionTextActive: {
    color: leafGreen,
    fontFamily: fontBold,
  },
  blackStats: {
    backgroundColor: forestGreen,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 26,
  },
  bodyText: {
    color: '#25272A',
    fontFamily: fontRegular,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 10,
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    marginTop: -20,
    padding: 18,
  },
  capability: {
    color: '#111111',
    fontFamily: fontRegular,
    fontSize: 24,
    lineHeight: 42,
  },
  capabilityChoice: {
    backgroundColor: softGreen,
    borderColor: '#C9EBD7',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  capabilityChoiceActive: {
    backgroundColor: leafGreen,
    borderColor: leafGreen,
  },
  capabilityChoiceText: {
    color: leafGreen,
    fontFamily: fontSemiBold,
    fontSize: 13,
  },
  capabilityChoiceTextActive: {
    color: '#FFFFFF',
    fontFamily: fontBold,
  },
  capabilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E4E7',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  cardTitle: {
    color: '#000000',
    fontFamily: fontBold,
    fontSize: 20,
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: green,
    borderRadius: 6,
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  countText: {
    color: '#000000',
    fontFamily: fontBold,
    fontSize: 14,
  },
  dateLabel: {
    color: '#6D6F73',
    fontFamily: fontBold,
    fontSize: 17,
    letterSpacing: 0,
    marginBottom: 10,
    marginTop: 20,
    textTransform: 'uppercase',
  },
  drawer: {
    backgroundColor: forestGreen,
    bottom: 0,
    left: 0,
    padding: 24,
    paddingTop: 24 + (Platform.OS === 'android' ? RNStatusBar.currentHeight || 0 : 0),
    position: 'absolute',
    top: 0,
    width: '86%',
  },
  drawerFooter: {
    marginTop: 'auto',
  },
  drawerItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  drawerLogo: {
    borderRadius: 10,
    height: 58,
    width: 58,
  },
  drawerOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  drawerScrim: {
    backgroundColor: 'rgba(11,59,46,0.42)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  drawerText: {
    color: '#D7F3E2',
    fontFamily: fontSemiBold,
    fontSize: 24,
  },
  drawerTextActive: {
    color: '#FFFFFF',
    fontFamily: fontBold,
  },
  driverBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 26,
    marginTop: 6,
  },
  driverName: {
    color: '#FFFFFF',
    fontFamily: fontBold,
    fontSize: 22,
  },
  driverMapMarker: {
    alignItems: 'center',
    backgroundColor: leafGreen,
    borderColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 3,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52,
  },
  driverMapMarkerText: {
    color: '#FFFFFF',
    fontFamily: fontBold,
    fontSize: 14,
  },
  driverMapMarkerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 23,
    height: 46,
    width: 46,
  },
  driverPhone: {
    color: '#BFE7D1',
    fontFamily: fontRegular,
    fontSize: 17,
    marginTop: 4,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  deleteButtonText: {
    color: '#B91C1C',
    fontFamily: fontBold,
    fontSize: 15,
  },
  deleteAccountSection: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    paddingBottom: 34,
  },
  deleteAccountButton: {
    alignItems: 'center',
    borderColor: '#B91C1C',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  deleteAccountButtonText: {
    color: '#B91C1C',
    fontFamily: fontBold,
    fontSize: 15,
  },
  emptyText: {
    color: '#6D6F73',
    fontFamily: fontRegular,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 12,
  },
  driverPin: {
    alignItems: 'center',
    backgroundColor: leafGreen,
    borderColor: '#FFFFFF',
    borderRadius: 19,
    borderWidth: 3,
    height: 38,
    justifyContent: 'center',
    left: '30%',
    position: 'absolute',
    top: 92,
    width: 38,
  },
  driverSignupDetails: {
    borderTopColor: '#E1E8E3',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 14,
  },
  earningsAmount: {
    color: '#000000',
    fontFamily: fontExtraBold,
    fontSize: 46,
    textAlign: 'center',
  },
  earningsHeader: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 24,
  },
  createAccountButton: {
    alignItems: 'center',
    marginTop: 18,
    minHeight: 44,
    justifyContent: 'center',
  },
  createAccountText: {
    color: leafGreen,
    fontFamily: fontBold,
    fontSize: 15,
  },
  createAccountTitle: {
    color: '#333333',
    fontFamily: fontBold,
    fontSize: 17,
    marginBottom: 14,
  },
  eyeIcon: {
    alignItems: 'center',
    borderColor: leafGreen,
    borderRadius: 12,
    borderWidth: 2,
    height: 18,
    justifyContent: 'center',
    transform: [{ scaleX: 1.35 }],
    width: 18,
  },
  eyePupil: {
    backgroundColor: leafGreen,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  eyeSlash: {
    backgroundColor: leafGreen,
    borderRadius: 1,
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '-42deg' }],
    width: 24,
  },
  errorText: {
    color: '#B42318',
    fontFamily: fontSemiBold,
    fontSize: 13,
    marginBottom: 8,
    marginTop: -4,
  },
  feeText: {
    color: '#111111',
    fontFamily: fontRegular,
    fontSize: 13,
    marginTop: 3,
    textAlign: 'right',
  },
  greenTag: {
    backgroundColor: '#E9FFF6',
    borderRadius: 6,
    color: darkGreen,
    fontFamily: fontBold,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  helperText: {
    color: '#52635A',
    fontFamily: fontRegular,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  gridLineOne: {
    backgroundColor: '#D4D8DD',
    height: 7,
    left: -12,
    position: 'absolute',
    right: -12,
    top: 118,
    transform: [{ rotate: '-18deg' }],
  },
  gridLineTwo: {
    backgroundColor: '#D4D8DD',
    bottom: 80,
    left: -18,
    position: 'absolute',
    right: -18,
    height: 7,
    transform: [{ rotate: '20deg' }],
  },
  gpsButton: {
    alignItems: 'center',
    backgroundColor: leafGreen,
    borderRadius: 8,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  gpsButtonText: {
    color: '#FFFFFF',
    fontFamily: fontBold,
    fontSize: 13,
  },
  gpsDetails: {
    flex: 1,
    paddingRight: 12,
  },
  gpsPanel: {
    alignItems: 'center',
    backgroundColor: softGreen,
    borderColor: '#C9EBD7',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 8,
    padding: 12,
  },
  gpsStatus: {
    color: '#111111',
    fontFamily: fontBold,
    fontSize: 14,
    marginTop: 2,
  },
  gpsAddress: {
    color: forestGreen,
    fontFamily: fontSemiBold,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: '#D6D8DC',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111111',
    fontFamily: fontRegular,
    fontSize: 16,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  passwordField: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#D6D8DC',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 14,
  },
  passwordInput: {
    color: '#111111',
    flex: 1,
    fontFamily: fontRegular,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  passwordToggle: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  kicker: {
    color: '#6D6F73',
    fontFamily: fontBold,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  label: {
    color: '#333333',
    fontFamily: fontBold,
    fontSize: 13,
    marginBottom: 6,
    marginTop: 12,
  },
  loginCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE6DF',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    width: '100%',
  },
  loginLogo: {
    borderRadius: 24,
    height: 128,
    marginBottom: 18,
    width: 128,
  },
  noticeText: {
    backgroundColor: softGreen,
    borderColor: '#BFE7D1',
    borderRadius: 8,
    borderWidth: 1,
    color: forestGreen,
    fontFamily: fontSemiBold,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  loginScreen: {
    alignItems: 'center',
    backgroundColor: '#F3F8F5',
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  loginTitle: {
    color: forestGreen,
    fontFamily: fontExtraBold,
    fontSize: 32,
    marginBottom: 22,
  },
  linkText: {
    color: '#164AA8',
    fontFamily: fontSemiBold,
    fontSize: 18,
    marginTop: 10,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: forestGreen,
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontFamily: fontSemiBold,
    fontSize: 18,
  },
  newAccountFields: {
    marginTop: 14,
  },
  listAmount: {
    color: '#000000',
    fontFamily: fontSemiBold,
    fontSize: 22,
    textAlign: 'right',
  },
  listId: {
    color: '#6D6F73',
    flex: 1,
    fontFamily: fontRegular,
    fontSize: 16,
    marginLeft: 12,
  },
  listRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E4E7',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 14,
  },
  logout: {
    color: '#FFFFFF',
    fontFamily: fontBold,
    fontSize: 22,
    marginBottom: 22,
  },
  map: {
    backgroundColor: '#E2E5E8',
    height: 330,
    overflow: 'hidden',
    position: 'relative',
  },
  mapShell: {
    height: '100%',
    position: 'relative',
    width: '100%',
  },
  mapTypeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: '#D6D8DC',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  mapTypeButtonActive: {
    backgroundColor: leafGreen,
    borderColor: leafGreen,
  },
  mapTypeControl: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    left: 10,
    position: 'absolute',
    right: 10,
    top: 10,
  },
  mapTypeText: {
    color: forestGreen,
    fontFamily: fontBold,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  mapTypeTextActive: {
    color: '#FFFFFF',
  },
  mapRecenterButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#D6D8DC',
    borderRadius: 8,
    borderWidth: 1,
    bottom: 12,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    position: 'absolute',
    right: 12,
  },
  mapRecenterText: {
    color: leafGreen,
    fontFamily: fontBold,
    fontSize: 13,
  },
  nativeMap: {
    height: '100%',
    width: '100%',
  },
  noJobActions: {
    gap: 10,
    marginTop: 14,
  },
  menuButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  menuIcon: {
    color: '#FFFFFF',
    fontFamily: fontRegular,
    fontSize: 34,
    lineHeight: 36,
  },
  metaText: {
    color: '#6D6F73',
    fontFamily: fontRegular,
    fontSize: 14,
    marginTop: 6,
  },
  monthBar: {
    alignItems: 'center',
    backgroundColor: leafGreen,
    paddingVertical: 22,
  },
  monthText: {
    color: '#FFFFFF',
    fontFamily: fontRegular,
    fontSize: 30,
  },
  onlineDot: {
    borderRadius: 7,
    height: 14,
    marginRight: 16,
    width: 14,
  },
  onlineDotActive: {
    backgroundColor: green,
  },
  onlineDotOff: {
    backgroundColor: '#A1A1AA',
  },
  paymentRow: {
    borderColor: '#E2E4E7',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 14,
  },
  paymentRowActive: {
    backgroundColor: '#E9FFF6',
    borderColor: green,
  },
  paymentTitle: {
    color: '#000000',
    fontFamily: fontBold,
    fontSize: 16,
  },
  payout: {
    color: '#000000',
    fontFamily: fontExtraBold,
    fontSize: 30,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  photoMeta: {
    color: '#6D6F73',
    fontFamily: fontRegular,
    fontSize: 12,
    marginTop: 5,
  },
  photoMetaOnImage: {
    color: '#FFFFFF',
  },
  photoModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  photoModalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  photoModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  photoModalImage: {
    aspectRatio: 0.75,
    backgroundColor: '#111827',
    borderRadius: 8,
    width: '100%',
  },
  photoModalTitle: {
    color: '#000000',
    fontFamily: fontBold,
    fontSize: 18,
    marginBottom: 12,
  },
  photoDeleteButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 6,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'absolute',
    right: 8,
  },
  photoDeleteText: {
    color: '#B91C1C',
    fontFamily: fontBold,
    fontSize: 11,
  },
  photoPreview: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  photoSlot: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CED2D7',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexBasis: '48%',
    minHeight: 78,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 12,
  },
  photoSlotDone: {
    backgroundColor: '#E9FFF6',
    borderColor: green,
    borderStyle: 'solid',
  },
  photoTitle: {
    color: '#000000',
    fontFamily: fontBold,
    fontSize: 14,
  },
  photoTitleOnImage: {
    color: '#FFFFFF',
  },
  photoTextOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    borderRadius: 6,
    padding: 7,
  },
  photoUploadBox: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: green,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    marginTop: 12,
    minHeight: 82,
    justifyContent: 'center',
    padding: 14,
  },
  photoAddTile: {
    minHeight: 118,
    width: '48%',
  },
  photoAddIcon: {
    color: green,
    fontFamily: fontBold,
    fontSize: 30,
    lineHeight: 34,
    marginBottom: 4,
  },
  pickupPin: {
    alignItems: 'center',
    backgroundColor: green,
    borderColor: '#FFFFFF',
    borderRadius: 19,
    borderWidth: 3,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    right: '24%',
    top: 190,
    width: 38,
  },
  pinText: {
    color: '#FFFFFF',
    fontFamily: fontBold,
    fontSize: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: green,
    borderRadius: 8,
    marginTop: 16,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonDisabled: {
    backgroundColor: '#B9D8CB',
  },
  primaryButtonText: {
    color: '#000000',
    fontFamily: fontBold,
    fontSize: 16,
  },
  profileLine: {
    color: '#000000',
    fontFamily: fontRegular,
    fontSize: 22,
    lineHeight: 34,
  },
  profileLineLabel: {
    fontFamily: fontBold,
  },
  profileAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileAvatarImage: {
    height: '100%',
    width: '100%',
  },
  profileAvatarPreview: {
    marginBottom: 18,
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontFamily: fontExtraBold,
  },
  profilePage: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: -16,
    marginTop: -16,
  },
  profileSection: {
    borderBottomColor: '#EFF0F1',
    borderBottomWidth: 8,
    padding: 22,
  },
  profileEditButton: {
    alignItems: 'center',
    borderColor: leafGreen,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  profileEditButtonText: {
    color: leafGreen,
    fontFamily: fontBold,
    fontSize: 14,
  },
  profileSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  profileSectionTitle: {
    color: '#8A8D91',
    flex: 1,
    fontFamily: fontMedium,
    fontSize: 18,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  profileSubTitle: {
    color: '#000000',
    fontFamily: fontBold,
    fontSize: 18,
    marginBottom: 8,
    marginTop: 20,
  },
  profileTitle: {
    color: '#000000',
    fontFamily: fontMedium,
    fontSize: 24,
    marginBottom: 18,
  },
  profilePhotoEditRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 8,
  },
  profilePhotoActions: {
    flex: 1,
    gap: 10,
  },
  route: {
    backgroundColor: leafGreen,
    borderRadius: 4,
    height: 8,
    left: '31%',
    position: 'absolute',
    top: 154,
    transform: [{ rotate: '28deg' }],
    width: 170,
  },
  routeBlock: {
    marginTop: 16,
  },
  routeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  routeStem: {
    backgroundColor: '#D5D8DC',
    height: 24,
    marginLeft: 6,
    width: 2,
  },
  routeText: {
    color: '#000000',
    flex: 1,
    fontFamily: fontSemiBold,
    fontSize: 16,
  },
  roleCaption: {
    color: '#BFE7D1',
    fontFamily: fontRegular,
    fontSize: 14,
    marginTop: 4,
  },
  roleChoice: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#D6D8DC',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  roleChoiceActive: {
    backgroundColor: softGreen,
    borderColor: leafGreen,
  },
  roleChoiceText: {
    color: '#425149',
    fontFamily: fontSemiBold,
    fontSize: 13,
  },
  roleChoiceTextActive: {
    color: leafGreen,
    fontFamily: fontBold,
  },
  roleGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  screen: {
    padding: 16,
    paddingBottom: 28,
  },
  sectionLabel: {
    color: '#6D6F73',
    fontFamily: fontBold,
    fontSize: 13,
    marginTop: 16,
    textTransform: 'uppercase',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: leafGreen,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: leafGreen,
    fontFamily: fontBold,
    fontSize: 15,
  },
  secondaryButtonCompact: {
    alignItems: 'center',
    borderColor: leafGreen,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  sheetTitle: {
    color: '#000000',
    fontFamily: fontExtraBold,
    fontSize: 23,
    marginTop: 2,
  },
  smallDot: {
    backgroundColor: leafGreen,
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  squareDot: {
    backgroundColor: forestGreen,
    height: 12,
    width: 12,
  },
  stack: {
    gap: 14,
  },
  statLabel: {
    color: '#6D6F73',
    fontFamily: fontBold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  statLabelDark: {
    color: '#FFFFFF',
  },
  statValue: {
    color: '#000000',
    fontFamily: fontExtraBold,
    fontSize: 25,
    marginTop: 4,
  },
  statValueDark: {
    color: '#FFFFFF',
    fontSize: 42,
  },
  statusBadge: {
    backgroundColor: softGreen,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusBadgeText: {
    color: leafGreen,
    fontFamily: fontBold,
    fontSize: 13,
  },
  statusSwitch: {
    backgroundColor: '#E6E7EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusSwitchOn: {
    backgroundColor: '#E9FFF6',
  },
  statusSwitchText: {
    color: '#44474D',
    fontFamily: fontBold,
    fontSize: 13,
  },
  statusSwitchTextOn: {
    color: darkGreen,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  trackingMapFrame: {
    backgroundColor: '#E2E5E8',
    borderColor: '#D6D8DC',
    borderRadius: 8,
    borderWidth: 1,
    height: 360,
    overflow: 'hidden',
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: forestGreen,
    flexDirection: 'row',
    minHeight: 72 + (Platform.OS === 'android' ? RNStatusBar.currentHeight || 0 : 0),
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight || 0 : 0,
  },
  topTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: fontBold,
    fontSize: 22,
    textAlign: 'center',
  },
  version: {
    color: '#BFE7D1',
    fontFamily: fontRegular,
    fontSize: 15,
  },
});
