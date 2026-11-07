import { describe, expect, it } from 'vitest';
import { isStaffRole, planIncludesStaff, staffCan, staffRoleLabel } from '../../lib/business/staff';

describe('business staff permissions', () => {
  it('validates roles', () => {
    expect(isStaffRole('MANAGER')).toBe(true);
    expect(isStaffRole('OWNER')).toBe(false);
    expect(staffRoleLabel('INVENTORY')).toBe('Inventory');
  });

  it('gives managers every capability', () => {
    expect(staffCan('MANAGER', 'ACTIVE', 'inventory')).toBe(true);
    expect(staffCan('MANAGER', 'ACTIVE', 'analytics')).toBe(true);
    expect(staffCan('MANAGER', 'ACTIVE', 'team')).toBe(true);
  });

  it('limits inventory staff to stock and analytics', () => {
    expect(staffCan('INVENTORY', 'ACTIVE', 'inventory')).toBe(true);
    expect(staffCan('INVENTORY', 'ACTIVE', 'analytics')).toBe(true);
    expect(staffCan('INVENTORY', 'ACTIVE', 'team')).toBe(false);
  });

  it('keeps analysts read-only', () => {
    expect(staffCan('ANALYST', 'ACTIVE', 'analytics')).toBe(true);
    expect(staffCan('ANALYST', 'ACTIVE', 'inventory')).toBe(false);
  });

  it('removes every capability from suspended staff', () => {
    expect(staffCan('MANAGER', 'SUSPENDED', 'analytics')).toBe(false);
    expect(staffCan(null, 'ACTIVE', 'analytics')).toBe(false);
  });

  it('only treats paid Business plans as staff-including', () => {
    expect(planIncludesStaff('PRO')).toBe(true);
    expect(planIncludesStaff('ENTERPRISE')).toBe(true);
    expect(planIncludesStaff('FREE')).toBe(false);
    expect(planIncludesStaff(null)).toBe(false);
  });
});
