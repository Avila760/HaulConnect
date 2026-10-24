export const eventLabels: Record<string, string> = {
  booked: 'Booking created', confirmed: 'Dispatch confirmed booking', assigned: 'Driver assigned',
  accepted: 'Driver accepted', declined: 'Driver declined', en_route: 'En route',
  arrived: 'On scene', loading: 'Loading', completed: 'Completed', eta: 'ETA sent',
};
export type JobEvent = { id: string; type: string; atMs: number | null; detail?: string };
export function timestampMs(value: any): number | null {
  const ms = value?.toMillis?.();
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
}
export function appendEvent(history: Record<string, any> | undefined, type: string, actorId: string, at: unknown, detail = '') {
  const previous = history || {};
  const key = `event_${Object.keys(previous).length + 1}`;
  return { ...previous, [key]: { type, actorId, at, detail } };
}
export function readHistory(data: Record<string, any>): JobEvent[] {
  const events = Object.entries(data.history || {}).map(([id, raw]) => {
    const event = raw as Record<string, any>;
    return {id, type: event.type, atMs: timestampMs(event.at), detail: event.detail || ''};
  });
  if (!events.some(e => e.type === 'booked') && timestampMs(data.createdAt) !== null) {
    events.unshift({id:'legacy-booked', type:'booked', atMs:timestampMs(data.createdAt), detail:''});
  }
  return events.sort((a,b) => (a.atMs ?? Number.MAX_SAFE_INTEGER) - (b.atMs ?? Number.MAX_SAFE_INTEGER) || (Number(a.id.split('_')[1]) || 0) - (Number(b.id.split('_')[1]) || 0));
}
export function formatEventTime(ms: number | null): string {
  if (ms === null) return 'Waiting for server time';
  return new Intl.DateTimeFormat(undefined, { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', second:'2-digit', timeZoneName:'short' }).format(new Date(ms));
}
export function validateEta(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('Enter an ETA from 1 to 1440 whole minutes.');
}
export function directionsUrl(address: string, platform: string) {
  const destination = encodeURIComponent(address);
  return platform === 'ios' ? `https://maps.apple.com/?daddr=${destination}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}
