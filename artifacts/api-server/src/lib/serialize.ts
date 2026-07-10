import type { PropertyRow, DeviceRow } from "@workspace/db";

export function serializeProperty(p: PropertyRow) {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    address: p.address,
    city: p.city,
    pincode: p.pincode,
    email: p.email,
    phone: p.phone,
    currency: p.currency,
    tariffPerKwh: p.tariffPerKwh,
    timezone: p.timezone,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

export function isDeviceOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < ONLINE_THRESHOLD_MS;
}

export function serializeDevice(
  d: DeviceRow,
  extra: { floorName: string | null; channelCount: number },
) {
  return {
    id: d.id,
    propertyId: d.propertyId,
    code: d.code,
    ipAddress: d.ipAddress,
    description: d.description,
    floorId: d.floorId,
    floorName: extra.floorName,
    active: d.active,
    online: isDeviceOnline(d.lastSeenAt),
    lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
    channelCount: extra.channelCount,
  };
}
