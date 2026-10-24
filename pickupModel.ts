import { readHistory, timestampMs, type JobEvent } from './jobHistory';
export const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],
  ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],
  ['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],
  ['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],
  ['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
  ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
  ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],
  ['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],
  ['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],
  ['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
] as const;
export type JobStatus = 'requested' | 'confirmed' | 'available' | 'assigned' | 'accepted' | 'en_route' | 'arrived' | 'loading' | 'completed';
export type PaymentMethod = 'card' | 'cash' | 'check';
export type PickupDetails = { street: string; city: string; state: string; phone: string; details: string };
export type PickupDraft = PickupDetails & { id: string; paymentMethod: PaymentMethod; photos: Record<string, string> };
export type Job = {
  id: string; pickup: string; dropoff: string; distance: string; load: string;
  payout: number; quote: number; eta: number; status: JobStatus; customer: string;
  paymentMethod: PaymentMethod; details: string; customerPhotos: string[]; proofPhotos: string[];
  customerId?: string; customerPhone?: string; street?: string; city?: string; state?: string;
  driverId?: string | null; driverName?: string | null; lastDeclinedDriverName?: string | null;
  customerPhotoUploads?: {label: string; url: string}[];
  createdAtMs?: number;
  history?: JobEvent[];
  etaUpdatedAtMs?: number | null;
};
export type DriverOption = { id: string; name: string };
export const statusLabels: Record<JobStatus, string> = {
  requested: 'Awaiting confirmation', confirmed: 'Confirmed · awaiting driver', available: 'Awaiting confirmation', assigned: 'Awaiting driver response',
  accepted: 'Driver accepted', en_route: 'Driver on the way', arrived: 'Driver arrived',
  loading: 'Loading', completed: 'Completed',
};
export function validatePickup(input: PickupDetails): string | null {
  if (!input.street.trim()) return 'Enter the street address, including the street number.';
  if (!input.city.trim()) return 'Enter the city.';
  if (!US_STATES.some(([code]) => code === input.state)) return 'Choose a state.';
  const digits = input.phone.replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits) && !/^1\d{10}$/.test(digits)) return 'Enter a 10-digit phone number, with optional +1 country code.';
  if (!input.details.trim()) return 'Describe the items to remove.';
  return null;
}
export function isAwaitingDispatch(status: JobStatus) { return status === 'requested' || status === 'available' || status === 'confirmed'; }
export function nextDeliveryStatus(status: JobStatus): JobStatus | null {
  const next: Partial<Record<JobStatus, JobStatus>> = { accepted: 'en_route', en_route: 'arrived', arrived: 'loading', loading: 'completed' };
  return next[status] || null;
}
export function canRespondToAssignment(job: Pick<Job, 'driverId' | 'status'>, uid: string) {
  return job.driverId === uid && job.status === 'assigned';
}
// Older bookings have only a formatted pickup string and the status "available".
export function readJob(id: string, data: Record<string, any>): Job {
  const status = Object.hasOwn(statusLabels, data.status) ? data.status as JobStatus : 'requested';
  return {
    id, status, history: readHistory(data), etaUpdatedAtMs: timestampMs(data.etaUpdatedAt), customer: data.customer || 'Customer', pickup: data.pickup || '',
    details: data.details || '', dropoff: data.dropoff || 'To be arranged', distance: data.distance || 'Pending',
    load: data.load || 'Junk removal', payout: data.payout || 0, quote: data.quote || 0, eta: data.eta || 0,
    paymentMethod: ['card','cash','check'].includes(data.paymentMethod) ? data.paymentMethod : 'card',
    customerPhotos: data.customerPhotos || [], proofPhotos: data.proofPhotos || [],
    customerId: data.customerId, customerPhone: data.customerPhone, street: data.street, city: data.city, state: data.state,
    driverId: data.driverId || null, driverName: data.driverName || null,
    lastDeclinedDriverName: data.lastDeclinedDriverName || null,
    customerPhotoUploads: data.customerPhotoUploads || [], createdAtMs: data.createdAt?.toMillis?.() || 0,
  };
}
