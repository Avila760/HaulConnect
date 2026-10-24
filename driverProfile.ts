export type DriverProfile = {
  vehicleType: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleLength: string;
  vehicleWidth: string;
  cargoCapacity: string;
  towCapacity: string;
  trailerType: string;
  trailerLength: string;
  trailerWidth: string;
  trailerCapacity: string;
  capabilities: string[];
  accessories: string[];
};

export const emptyDriverProfile = (): DriverProfile => ({
  vehicleType: '',
  vehicleMake: '',
  vehicleModel: '',
  vehicleLength: '',
  vehicleWidth: '',
  cargoCapacity: '',
  towCapacity: '',
  trailerType: '',
  trailerLength: '',
  trailerWidth: '',
  trailerCapacity: '',
  capabilities: [],
  accessories: [],
});

export function readDriverProfile(value: unknown): DriverProfile {
  const profile = emptyDriverProfile();
  if (!value || typeof value !== 'object') return profile;
  const data = value as Record<string, unknown>;
  if (typeof data.vehicleType === 'string') profile.vehicleType = data.vehicleType;
  if (typeof data.vehicleMake === 'string') profile.vehicleMake = data.vehicleMake;
  if (typeof data.vehicleModel === 'string') profile.vehicleModel = data.vehicleModel;
  if (typeof data.vehicleLength === 'string') profile.vehicleLength = data.vehicleLength;
  if (typeof data.vehicleWidth === 'string') profile.vehicleWidth = data.vehicleWidth;
  if (typeof data.cargoCapacity === 'string') profile.cargoCapacity = data.cargoCapacity;
  if (typeof data.towCapacity === 'string') profile.towCapacity = data.towCapacity;
  if (typeof data.trailerType === 'string') profile.trailerType = data.trailerType;
  if (typeof data.trailerLength === 'string') profile.trailerLength = data.trailerLength;
  if (typeof data.trailerWidth === 'string') profile.trailerWidth = data.trailerWidth;
  if (typeof data.trailerCapacity === 'string') profile.trailerCapacity = data.trailerCapacity;
  profile.capabilities = Array.isArray(data.capabilities) ? data.capabilities.filter((item): item is string => typeof item === 'string') : [];
  profile.accessories = Array.isArray(data.accessories) ? data.accessories.filter((item): item is string => typeof item === 'string') : [];
  return profile;
}
