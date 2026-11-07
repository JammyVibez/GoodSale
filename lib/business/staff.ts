/**
 * Business staff access. Roles are deliberately narrow: a staff member can only
 * do the jobs their role lists, and never touches payouts or the owner's bank
 * details. Shared by the staff API, the bulk-inventory route and the UI.
 */
export const STAFF_ROLES = ['MANAGER', 'INVENTORY', 'ANALYST'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export type StaffCapability = 'inventory' | 'analytics' | 'team';

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

export function staffRoleLabel(role: StaffRole): string {
  if (role === 'MANAGER') return 'Manager';
  if (role === 'INVENTORY') return 'Inventory';
  return 'Analyst';
}

export function staffRoleDescription(role: StaffRole): string {
  if (role === 'MANAGER') return 'Inventory updates, analytics and staff list changes.';
  if (role === 'INVENTORY') return 'Bulk stock and price updates plus listing analytics.';
  return 'Read-only listing and sales analytics.';
}

/** A suspended staff member keeps their record but loses every capability. */
export function staffCan(
  role: StaffRole | null | undefined,
  status: StaffStatus | null | undefined,
  capability: StaffCapability
): boolean {
  if (!role || status !== 'ACTIVE') return false;
  if (role === 'MANAGER') return true;
  if (role === 'INVENTORY') return capability === 'inventory' || capability === 'analytics';
  return capability === 'analytics';
}

/** Business plans that include the staff tool at all. */
export function planIncludesStaff(plan: string | null | undefined): boolean {
  const code = String(plan || '').toUpperCase();
  return code === 'PRO' || code === 'PREMIUM' || code === 'ENTERPRISE';
}
