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
 * Well-known cities per state, used by the address / onboarding pickers when an
 * admin has not configured coverage for that state yet. Keys are the state name
 * without the trailing “State”; lookups are case- and suffix-insensitive.
 * Admin-configured coverage always takes priority over this list.
 */
export const DEFAULT_CITIES_BY_STATE: Record<string, string[]> = {
  abia: ['Umuahia', 'Aba', 'Arochukwu', 'Ohafia'],
  adamawa: ['Yola', 'Jimeta', 'Mubi', 'Numan'],
  'akwa ibom': ['Uyo', 'Ikot Ekpene', 'Eket', 'Oron'],
  anambra: ['Awka', 'Onitsha', 'Nnewi', 'Ekwulobia'],
  bauchi: ['Bauchi', 'Azare', 'Misau', 'Jama’are'],
  bayelsa: ['Yenagoa', 'Ogbia', 'Sagbama', 'Brass'],
  benue: ['Makurdi', 'Gboko', 'Otukpo', 'Katsina-Ala'],
  borno: ['Maiduguri', 'Biu', 'Bama', 'Konduga'],
  'cross river': ['Calabar', 'Ikom', 'Ogoja', 'Ugep'],
  delta: ['Asaba', 'Warri', 'Sapele', 'Ughelli', 'Agbor'],
  ebonyi: ['Abakaliki', 'Afikpo', 'Onueke', 'Ishieke'],
  edo: ['Benin City', 'Auchi', 'Ekpoma', 'Uromi'],
  ekiti: ['Ado-Ekiti', 'Ikere-Ekiti', 'Ijero-Ekiti', 'Ikole-Ekiti'],
  enugu: ['Enugu', 'Nsukka', 'Awgu', 'Udi'],
  'fct abuja': ['Abuja CBD', 'Garki', 'Wuse', 'Maitama', 'Asokoro', 'Gwagwalada', 'Kubwa', 'Lugbe'],
  gombe: ['Gombe', 'Kaltungo', 'Billiri', 'Dukku'],
  imo: ['Owerri', 'Orlu', 'Okigwe', 'Mbaise'],
  jigawa: ['Dutse', 'Hadejia', 'Gumel', 'Birnin Kudu'],
  kaduna: ['Kaduna', 'Zaria', 'Kafanchan', 'Sabon Gari'],
  kano: ['Kano', 'Gwale', 'Fagge', 'Nassarawa', 'Wudil'],
  katsina: ['Katsina', 'Daura', 'Funtua', 'Malumfashi'],
  kebbi: ['Birnin Kebbi', 'Argungu', 'Yauri', 'Zuru'],
  kogi: ['Lokoja', 'Okene', 'Idah', 'Anyigba'],
  kwara: ['Ilorin', 'Offa', 'Omu-Aran', 'Jebba'],
  lagos: ['Ikeja', 'Lekki', 'Victoria Island', 'Ikoyi', 'Yaba', 'Surulere', 'Gbagada', 'Maryland', 'Agege', 'Ajah', 'Ikorodu'],
  nasarawa: ['Lafia', 'Keffi', 'Akwanga', 'Karu'],
  niger: ['Minna', 'Bida', 'Suleja', 'Kontagora', 'Chanchaga', 'Lapai', 'New Bussa'],
  ogun: ['Abeokuta', 'Sagamu', 'Ijebu-Ode', 'Ota', 'Ilaro'],
  ondo: ['Akure', 'Ondo City', 'Owo', 'Ikare', 'Okitipupa'],
  osun: ['Osogbo', 'Ile-Ife', 'Ilesa', 'Ede'],
  oyo: ['Ibadan', 'Ogbomosho', 'Oyo Town', 'Iseyin', 'Akinyele'],
  plateau: ['Jos', 'Bukuru', 'Pankshin', 'Shendam'],
  rivers: ['Port Harcourt', 'Obio-Akpor', 'Eleme', 'Bonny Island', 'Okrika'],
  sokoto: ['Sokoto', 'Tambuwal', 'Illela', 'Gwadabawa'],
  taraba: ['Jalingo', 'Wukari', 'Bali', 'Serti'],
  yobe: ['Damaturu', 'Potiskum', 'Gashua', 'Nguru'],
  zamfara: ['Gusau', 'Kaura Namoda', 'Talata Mafara', 'Anka'],
};

/** Common alternative spellings mapped onto the canonical city-list keys. */
const STATE_ALIASES: Record<string, string> = {
  abuja: 'fct abuja',
  fct: 'fct abuja',
  'federal capital territory': 'fct abuja',
};

function stateKey(stateName: string): string {
  return stateName.trim().toLowerCase().replace(/\s+state$/, '').replace(/\s+/g, ' ');
}

/**
 * Every state offered by the address / onboarding pickers: the full Nigerian
 * list plus anything an admin has added to Service coverage, so a state an
 * admin creates shows up for users immediately.
 */
export function addressStates(): string[] {
  const merged = new Set<string>([...NG_STATES, ...dbOperations.serviceStates()]);
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

/**
 * Cities offered for a state in the address / onboarding pickers. Admin coverage
 * wins; otherwise we fall back to the state's well-known cities (e.g. Minna for
 * Niger State) so the picker is never empty.
 */
export function addressCitiesFor(stateName: string): string[] {
  if (!stateName || !stateName.trim()) return [];
  const configured = salesCitiesFor(stateName);
  if (configured.length) return configured;
  const key = stateKey(stateName);
  return DEFAULT_CITIES_BY_STATE[key] || DEFAULT_CITIES_BY_STATE[STATE_ALIASES[key]] || [];
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
