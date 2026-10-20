import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';
import { DomainError } from './errors.js';

export const MAX_TICKETS_PER_BOOKING = 10;

const HOLDS_SEATS = new Set(['pending', 'paid']);

export function createStore() {
  return {
    events: new Map(),
    tiers: new Map(),
    bookings: new Map(),
    bookingsByReference: new Map(),
    waitlists: new Map(),
  };
}

function requireStore(store) {
  if (
    store === null
    || typeof store !== 'object'
    || !(store.events instanceof Map)
    || !(store.tiers instanceof Map)
    || !(store.bookings instanceof Map)
    || !(store.bookingsByReference instanceof Map)
    || !(store.waitlists instanceof Map)
  ) {
    throw new DomainError('VALIDATION', 'A valid store is required');
  }
  return store;
}

function requireObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', `${field} must be an object`);
  }
  return value;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

function requireWholeNumber(value, field, min) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${min}`);
  }
  return value;
}

function isValidIsoDate(value) {
  const datePart = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value)?.[1];
  if (!datePart) return false;
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  return !Number.isNaN(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === datePart;
}

function getTier(store, tierId) {
  requireStore(store);
  const normalizedTierId = requireText(tierId, 'Tier id');
  const tier = store.tiers.get(normalizedTierId);
  if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
  return tier;
}

export function createEvent(store, input) {
  requireStore(store);
  const { title, city, venue = '', startsAt, organizerId } = requireObject(input, 'Event');
  const normalizedTitle = requireText(title, 'Title');
  const normalizedCity = requireText(city, 'City');
  if (typeof venue !== 'string') {
    throw new DomainError('VALIDATION', 'Venue must be text');
  }
  const normalizedVenue = venue.trim();
  const normalizedOrganizerId = requireText(organizerId, 'Organizer id');
  const normalizedStartsAt = requireText(startsAt, 'startsAt');
  const date = new Date(normalizedStartsAt);
  if (Number.isNaN(date.getTime()) || !isValidIsoDate(normalizedStartsAt)) {
    throw new DomainError('VALIDATION', 'startsAt must be a valid date');
  }

  const event = {
    id: newId(),
    organizerId: normalizedOrganizerId,
    title: normalizedTitle,
    city: normalizedCity,
    venue: normalizedVenue,
    startsAt: date.toISOString(),
    status: 'draft',
    tierIds: [],
  };
  store.events.set(event.id, event);
  return event;
}

export function publishEvent(store, eventId) {
  requireStore(store);
  const normalizedEventId = requireText(eventId, 'Event id');
  const event = store.events.get(normalizedEventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
  if (!Array.isArray(event.tierIds) || event.tierIds.length === 0) {
    throw new DomainError('INVALID_STATE', 'An event needs at least one ticket tier before it can be published');
  }
  event.status = 'published';
  return event;
}

export function unpublishEvent(store, eventId) {
  requireStore(store);
  const normalizedEventId = requireText(eventId, 'Event id');
  const event = store.events.get(normalizedEventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
  event.status = 'draft';
  return event;
}

export function listEventSummaries(store, options = {}) {
  requireStore(store);
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new DomainError('VALIDATION', 'options must be an object');
  }
  const { publishedOnly = true } = options;
  if (typeof publishedOnly !== 'boolean') {
    throw new DomainError('VALIDATION', 'publishedOnly must be a boolean');
  }

  const summaries = [];
  for (const event of store.events.values()) {
    if (publishedOnly && event.status !== 'published') continue;
    const tiers = event.tierIds.map((tierId) => {
      const tier = store.tiers.get(tierId);
      if (!tier) throw new DomainError('INVALID_STATE', 'Event refers to a missing ticket tier');
      return {
        id: tier.id,
        name: tier.name,
        priceCents: tier.priceCents,
        capacity: tier.capacity,
        sold: tier.sold,
        seatsLeft: seatsLeft(tier),
      };
    });
    const cheapestPriceCents = tiers.reduce(
      (cheapest, tier) => Math.min(cheapest, tier.priceCents),
      Infinity,
    );
    const availableSeats = tiers.reduce((total, tier) => {
      const updatedTotal = total + tier.seatsLeft;
      if (!Number.isSafeInteger(updatedTotal)) {
        throw new DomainError('INVALID_STATE', 'Event availability exceeds the supported whole-number range');
      }
      return updatedTotal;
    }, 0);
    summaries.push({
      id: event.id,
      title: event.title,
      city: event.city,
      venue: event.venue,
      startsAt: event.startsAt,
      status: event.status,
      tiers,
      cheapestPriceCents: tiers.length > 0 ? cheapestPriceCents : null,
      availableSeats,
    });
  }
  return summaries;
}

export function addTier(store, eventId, input) {
  requireStore(store);
  const normalizedEventId = requireText(eventId, 'Event id');
  const { name, priceCents, capacity } = requireObject(input, 'Ticket tier');
  const event = store.events.get(normalizedEventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

  const tier = {
    id: newId(),
    eventId: normalizedEventId,
    name: requireText(name, 'Tier name'),
    priceCents: requireWholeNumber(priceCents, 'priceCents', 0),
    capacity: requireWholeNumber(capacity, 'capacity', 1),
    sold: 0,
  };
  store.tiers.set(tier.id, tier);
  store.waitlists.set(tier.id, new Queue());
  event.tierIds.push(tier.id);
  return tier;
}

export function seatsLeft(tier) {
  requireObject(tier, 'Ticket tier');
  requireWholeNumber(tier.capacity, 'capacity', 1);
  requireWholeNumber(tier.sold, 'sold', 0);
  if (tier.sold > tier.capacity) {
    throw new DomainError('INVALID_STATE', 'Sold tickets cannot exceed tier capacity');
  }
  return tier.capacity - tier.sold;
}

export function bookTickets(store, tierId, userId, quantity) {
  const tier = getTier(store, tierId);
  const normalizedUserId = requireText(userId, 'User id');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }
  if (!Number.isSafeInteger(tier.priceCents * quantity)) {
    throw new DomainError('VALIDATION', 'Booking amount exceeds the supported whole-cent range');
  }

  const left = seatsLeft(tier);
  if (left < quantity) {
    const message = left === 0 ? `${tier.name} is sold out` : `Only ${left} ticket(s) left in ${tier.name}`;
    throw new DomainError('SOLD_OUT', message, { seatsLeft: left });
  }

  let reference;
  do {
    reference = newReference();
  } while (store.bookingsByReference.has(reference));

  const booking = {
    id: newId(),
    reference,
    userId: normalizedUserId,
    tierId: tier.id,
    quantity,
    amountCents: tier.priceCents * quantity,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  store.bookings.set(booking.id, booking);
  store.bookingsByReference.set(reference, booking);
  tier.sold += quantity;
  return booking;
}

export function findBookingByReference(store, reference) {
  requireStore(store);
  const normalizedReference = requireText(reference, 'Booking reference');
  return store.bookingsByReference.get(normalizedReference);
}

export function cancelBooking(store, reference) {
  requireStore(store);
  const booking = findBookingByReference(store, reference);
  if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
  if (!HOLDS_SEATS.has(booking.status)) {
    throw new DomainError('INVALID_STATE', `A ${booking.status} booking cannot be cancelled`);
  }
  getTier(store, booking.tierId).sold -= booking.quantity;
  booking.status = 'cancelled';
  return booking;
}

export function joinWaitlist(store, tierId, userId, quantity) {
  const tier = getTier(store, tierId);
  const normalizedUserId = requireText(userId, 'User id');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }
  if (seatsLeft(tier) >= quantity) {
    throw new DomainError('NOT_SOLD_OUT', 'Seats are available, so book them instead');
  }
  const queue = store.waitlists.get(tier.id);
  if (!queue) throw new DomainError('INVALID_STATE', 'Waitlist is not available for this tier');
  queue.enqueue({ userId: normalizedUserId, quantity });
  return { position: queue.size };
}

export function offerNextOnWaitlist(store, tierId) {
  const tier = getTier(store, tierId);
  const queue = store.waitlists.get(tier.id);
  if (!queue) throw new DomainError('INVALID_STATE', 'Waitlist is not available for this tier');
  const head = queue.peek();
  if (!head || seatsLeft(tier) < head.quantity) return undefined;
  return queue.dequeue();
}
