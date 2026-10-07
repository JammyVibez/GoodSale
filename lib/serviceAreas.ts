// lib/serviceAreas.ts
'use client';

/**
 * One source of truth for "where is GoodSale live?".
 *
 * Admins manage the list in the admin Coverage tab (backed by the
 * `service_areas` table). Every state/city picker in the app reads it from
 * here so sellers, buyers and riders all see the same coverage — and so an
 * area an admin switches off disappears everywhere at once.
 */

import { dbOperations } from '@/lib/store';

/** All Nigerian states, used whenever an admin has not narrowed coverage yet. */
export const NG_STATES: string[] = [
  'Abia State', 'Adamawa State', 'Akwa Ibom State', 'Anambra State', 'Bauchi State',
  'Bayelsa State', 'Benue State', 'Borno State', 'Cross River State', 'Delta State',
  'Ebonyi State', 'Edo State', 'Ekiti State', 'Enugu State', 'FCT Abuja',
  'Gombe State', 'Imo State', 'Jigawa State', 'Kaduna State', 'Kano State',
  'Katsina State', 'Kebbi State', 'Kogi State', 'Kwara State', 'Lagos State',
  'Nasarawa State', 'Niger State', 'Ogun State', 'Ondo State', 'Osun State',
  'Oyo State', 'Plateau State', 'Rivers State', 'Sokoto State', 'Taraba State',
  'Yobe State', 'Zamfara State',
];

/**
 * States where GoodSale operates. Falls back to every Nigerian state while the
 * admin list is still empty so the app is never blocked on configuration.
 */
export function salesStates(): string[] {
  const configured = dbOperations.serviceStates().filter((s) => dbOperations.salesCities(s).length);
  return configured.length ? configured : NG_STATES;
}

export function deliveryStates(): string[] {
  const configured = dbOperations.serviceStates().filter((s) => dbOperations.deliveryCities(s).length);
  return configured.length ? configured : NG_STATES;
}

/**
 * Cities within a state where selling is enabled. Falls back to the state's
 * coverage list when sales are switched off everywhere, so the picker is never
 * empty but still prefers exactly what the admin configured.
 */
export function salesCitiesFor(stateName: string): string[] {
  const sales = dbOperations.salesCities(stateName);
  if (sales.length) return sales;
  const all = dbOperations.serviceCities(stateName);
  return all.length ? all : [];
}

export function deliveryCitiesFor(stateName: string): string[] {
  const delivery = dbOperations.deliveryCities(stateName);
  if (delivery.length) return delivery;
  const all = dbOperations.serviceCities(stateName);
  return all.length ? all : [];
}

/** Human-readable coverage sentence for marketing surfaces. */
export function coverageSummary(max = 4): string {
  const cities = dbOperations.serviceCities();
  if (!cities.length) return 'Lagos, Abuja, Port Harcourt and more';
  if (cities.length <= max) return cities.join(', ');
  return `${cities.slice(0, max).join(', ')} and ${cities.length - max} more cities`;
}
