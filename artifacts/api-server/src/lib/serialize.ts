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
    planTier: p.planTier,
    billingStatus: p.billingStatus,
    maxUsers: p.maxUsers,
    maxDevices: p.maxDevices,
    trialEndsAt: p.trialEndsAt ? p.trialEndsAt.toISOString() : null,
    nextBillingAt: p.nextBillingAt ? p.nextBillingAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function isDeviceOnline(
  lastSeenAt: Date | null,
  thresholdMinutes = 2,
): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < thresholdMinutes * 60 * 1000;
}

export function serializeDevice(
  d: DeviceRow,
  extra: {
    floorName: string | null;
    channelCount: number;
    onlineThresholdMinutes?: number;
  },
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
    online: isDeviceOnline(d.lastSeenAt, extra.onlineThresholdMinutes),
    lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
    channelCount: extra.channelCount,
  };
}
