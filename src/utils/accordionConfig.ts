/**
 * Configuration for accordion events and their mappings
 */

export interface AccordionEvent {
  id: string;
  displayName: string;
  description?: string;
}

/**
 * Complete mapping of accordion IDs to their display information
 */
export const ACCORDION_EVENTS: Record<string, AccordionEvent> = {
  'rae-sremmurd': {
    id: 'rae-sremmurd',
    displayName: 'Rae Sremmurd w/ No Strings, TGUT, Madison LST, Kazi',
    description: 'Fight Night at 99 Scott AVe',
  },
  vtss: {
    id: 'vtss',
    displayName: 'VTSS w/ Baauer, Moma Ready, girl_irl, Lisas',
    description: 'The 1986',
  },
  'chase-satus-venice-beach': {
    id: 'chase-satus-venice-beach',
    displayName: 'Chase and Satus w/ Nam, Star Eyes, Schuyler',
    description: 'Venice Beach Skatepark',
  },
  'sheck-wes': {
    id: 'sheck-wes',
    displayName: 'Sheck Wes w/ Zillion, TGUT, Swami Sound, Yazmine',
    description: 'Fight Night at 99 Scott AVe',
  },
  'i-hate-models': {
    id: 'i-hate-models',
    displayName: 'I Hate Models w/ KXAH, x3butterfly',
    description: 'Chinatown Mall',
  },
  beltran: {
    id: 'beltran',
    displayName: 'Beltran',
    description: 'The North Face Climb Fest at Brooklyn Bridge Park Pier 5',
  },
  'j-balvin': {
    id: 'j-balvin',
    displayName: 'J. Balvin',
    description: "'Rayo' Release at Le PÈRE",
  },
  converse: {
    id: 'converse',
    displayName: 'Dazegxd, KXAH, NAS LEBER',
    description: "Converse '24 Hours in the Making' at undisclosed Location",
  },
  'elements-festival': {
    id: 'elements-festival',
    displayName: 'Tape B b2b Disco Lines',
    description: 'Elements Music Festival at Long Pond, PA',
  },
  'denzel-curry': {
    id: 'denzel-curry',
    displayName: 'Denzel Curry W/ A$AP Ferg',
    description: "'King of the Mischievous South Vol. 2' Release at Le PÈRE",
  },
  mochakk: {
    id: 'mochakk',
    displayName: 'Mochakk',
    description: 'MJ Cafe (Dimes Square)',
  },
  'nia-archives': {
    id: 'nia-archives',
    displayName: 'Nia Archives W/ Dazegxd, Swami Sound, BRUX',
    description: 'Herbert von King Park',
  },
  'eli-brown': {
    id: 'eli-brown',
    displayName: 'Eli Brown w/ CHARLES D, KXAH',
    description: '99 Scott AVe',
  },
  skream: {
    id: 'skream',
    displayName: 'Skream w/ SGT Pokes, Joe Nice',
    description: 'H0L0',
  },
  carlita: {
    id: 'carlita',
    displayName: 'Carlita w/ DJ Tennis',
    description: 'LES Carriage House',
  },
  'chase-status-brooklyn-banks': {
    id: 'chase-status-brooklyn-banks',
    displayName: 'Chase & Status w/ AceMo, ariellenyc',
    description: 'Brooklyn Banks Skate Park',
  },
  '02-24-24': {
    id: '02-24-24',
    displayName:
      'DJ Sliink, Swami Sound, World Wide Wev, Lisas, JIMMY EDGAR, Nick Hadad, Izzy Camina',
    description: 'Undisclosed Location',
  },
  'fred-yachty': {
    id: 'fred-yachty',
    displayName: 'Fred Again..., w/ Lil Yachty, Overmono, AceMo',
    description: 'Knockdown Center',
  },
  'fred-again': {
    id: 'fred-again',
    displayName: 'Fred Again..., w/ AKANBI, LISAS, GUARI, NAS LEBER',
    description: 'Undisclosed Location',
  },
};

/**
 * Get all valid accordion event IDs
 */
export function getValidAccordionIds(): string[] {
  return Object.keys(ACCORDION_EVENTS);
}

/**
 * Check if an accordion ID is valid
 */
export function isValidAccordionId(id: string): boolean {
  return id in ACCORDION_EVENTS;
}

/**
 * Get accordion event information by ID
 */
export function getAccordionEvent(id: string): AccordionEvent | null {
  return ACCORDION_EVENTS[id] || null;
}

/**
 * Get display name for an accordion event
 */
export function getAccordionDisplayName(id: string): string {
  const event = getAccordionEvent(id);
  return event ? event.displayName : id;
}
