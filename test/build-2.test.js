import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addTier,
  bookTickets,
  createEvent,
  createStore,
  joinWaitlist,
  listEventSummaries,
  publishEvent,
  seatsLeft,
  unpublishEvent,
} from '../src/domain/inventory.js';
import { filterEvents, searchEvents, sortEvents } from '../src/domain/eventSearch.js';
import { DomainError } from '../src/domain/errors.js';
import { mergeSort } from '../src/domain/sorting.js';

function makeEvent(store, {
  title = 'Event',
  city = 'Lagos',
  venue = 'Main Hall',
  startsAt = '2026-12-05T17:00:00.000Z',
} = {}) {
  return createEvent(store, {
    title,
    city,
    venue,
    startsAt,
    organizerId: 'organizer-1',
  });
}

function makePublishedEvent(store, eventOptions, tierOptions = {}) {
  const event = makeEvent(store, eventOptions);
  const tier = addTier(store, event.id, {
    name: 'General',
    priceCents: 500_000,
    capacity: 3,
    ...tierOptions,
  });
  publishEvent(store, event.id);
  return { event, tier };
}

function expectDomainError(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

test('S02: a valid event gets a new id, is saved as a draft, and is not public', () => {
  const store = createStore();
  const event = makeEvent(store, { title: 'Lagos Tech Meetup' });

  assert.ok(event.id);
  assert.equal(event.status, 'draft');
  assert.equal(store.events.get(event.id), event);
  assert.deepEqual(listEventSummaries(store), []);
});

test('S02: missing title or city and invalid dates are rejected without saving', () => {
  for (const input of [
    { title: '', city: 'Lagos', startsAt: '2026-12-05T17:00:00Z', organizerId: 'host' },
    { title: 'Meetup', city: ' ', startsAt: '2026-12-05T17:00:00Z', organizerId: 'host' },
    { title: 'Meetup', city: 'Lagos', startsAt: '2026-02-30T17:00:00Z', organizerId: 'host' },
  ]) {
    const store = createStore();
    expectDomainError(() => createEvent(store, input), 'VALIDATION');
    assert.equal(store.events.size, 0);
  }
});

test('S03: adding a tier starts with zero sold and the full capacity available', () => {
  const store = createStore();
  const event = makeEvent(store);
  const tier = addTier(store, event.id, {
    name: 'General',
    priceCents: 500_000,
    capacity: 100,
  });

  assert.equal(tier.sold, 0);
  assert.equal(seatsLeft(tier), 100);
});

test('S03: fractional prices and capacities below one are rejected', () => {
  const store = createStore();
  const event = makeEvent(store);

  expectDomainError(
    () => addTier(store, event.id, { name: 'General', priceCents: 100.5, capacity: 10 }),
    'VALIDATION',
  );
  expectDomainError(
    () => addTier(store, event.id, { name: 'General', priceCents: 100, capacity: 0 }),
    'VALIDATION',
  );
  assert.equal(store.tiers.size, 0);
});

test('S03: adding a tier to an unknown event returns NOT_FOUND', () => {
  const store = createStore();
  expectDomainError(
    () => addTier(store, 'missing-event', { name: 'General', priceCents: 100, capacity: 10 }),
    'NOT_FOUND',
  );
});

test('S04: an event without tiers cannot be published', () => {
  const store = createStore();
  const event = makeEvent(store);

  expectDomainError(() => publishEvent(store, event.id), 'INVALID_STATE');
  assert.equal(event.status, 'draft');
  assert.deepEqual(listEventSummaries(store), []);
});

test('S04: publishing an event with tiers marks it published and makes it public', () => {
  const store = createStore();
  const { event } = makePublishedEvent(store, { title: 'Public Event' });

  assert.equal(event.status, 'published');
  assert.equal(listEventSummaries(store)[0].id, event.id);
});

test('S04: unpublishing hides an event from the public list', () => {
  const store = createStore();
  const { event } = makePublishedEvent(store);

  unpublishEvent(store, event.id);

  assert.equal(event.status, 'draft');
  assert.deepEqual(listEventSummaries(store), []);
  assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 1);
});

test('public summaries validate their listing options with DomainError codes', () => {
  const store = createStore();
  expectDomainError(() => listEventSummaries(store, null), 'VALIDATION');
  expectDomainError(() => listEventSummaries(store, { publishedOnly: 'yes' }), 'VALIDATION');
});

test('event summaries include tier prices and aggregate available seats', () => {
  const store = createStore();
  const event = makeEvent(store);
  const firstTier = addTier(store, event.id, {
    name: 'General',
    priceCents: 500,
    capacity: 3,
  });
  addTier(store, event.id, {
    name: 'Balcony',
    priceCents: 800,
    capacity: 2,
  });
  bookTickets(store, firstTier.id, 'attendee-1', 2);
  publishEvent(store, event.id);

  const [summary] = listEventSummaries(store);

  assert.equal(summary.cheapestPriceCents, 500);
  assert.equal(summary.availableSeats, 3);
  assert.deepEqual(summary.tiers.map((tier) => tier.seatsLeft), [1, 2]);
});

test('S05: case-insensitive text search matches event titles and venues', () => {
  const events = [
    { id: '1', title: 'Lagos Tech Meetup', venue: 'Main Hall' },
    { id: '2', title: 'Evening Show', venue: 'Abuja Jazz Lounge' },
  ];

  assert.deepEqual(filterEvents(events, { q: 'JAZZ' }).map((event) => event.id), ['2']);
});

test('S05: text search does not match by joining the end of a title to the venue', () => {
  const events = [{ id: '1', title: 'Abu', venue: 'Jazz Lounge' }];

  assert.deepEqual(filterEvents(events, { q: 'abu jazz' }), []);
});

test('S05: city filtering is exact and case-insensitive', () => {
  const events = [
    { id: '1', city: 'Lagos' },
    { id: '2', city: 'Abuja' },
    { id: '3', city: 'Lagos Island' },
  ];

  assert.deepEqual(filterEvents(events, { city: 'lagos' }).map((event) => event.id), ['1']);
});

test('S05: maximum price uses the cheapest tier, sorts cheapest first, and excludes tierless events', () => {
  const events = [
    { id: '1', title: 'Mid', startsAt: '2026-12-05T17:00:00Z', tiers: [{ priceCents: 500 }] },
    { id: '2', title: 'Cheap', startsAt: '2026-12-05T17:00:00Z', tiers: [{ priceCents: 100 }, { priceCents: 300 }] },
    { id: '3', title: 'No tier', startsAt: '2026-12-05T17:00:00Z', tiers: [] },
    { id: '4', title: 'Expensive', startsAt: '2026-12-05T17:00:00Z', tiers: [{ priceCents: 900 }] },
  ];

  assert.deepEqual(
    searchEvents(events, { maxPriceCents: 500 }, 'price').map((event) => event.id),
    ['2', '1'],
  );
});

test('S05: date sorting is earliest first and breaks ties by title then id', () => {
  const events = [
    { id: 'z', title: 'Zulu', startsAt: '2026-12-05T19:00:00Z' },
    { id: 'b', title: 'Alpha', startsAt: '2026-12-05T17:00:00Z' },
    { id: 'a', title: 'Alpha', startsAt: '2026-12-05T17:00:00Z' },
    { id: 'c', title: 'Early', startsAt: '2026-12-04T17:00:00Z' },
  ];

  assert.deepEqual(sortEvents(events, 'date').map((event) => event.id), ['c', 'a', 'b', 'z']);
});

test('S05: date-only upper bounds include the entire day', () => {
  const events = [
    { id: '1', startsAt: '2026-12-05T17:00:00.000Z' },
    { id: '2', startsAt: '2026-12-06T00:00:00.000Z' },
  ];

  assert.deepEqual(filterEvents(events, { to: '2026-12-05' }).map((event) => event.id), ['1']);
});

test('S05: date range bounds include events exactly at the from and to times', () => {
  const events = [
    { id: 'before', startsAt: '2026-12-05T16:59:59.999Z' },
    { id: 'from', startsAt: '2026-12-05T17:00:00.000Z' },
    { id: 'to', startsAt: '2026-12-05T18:00:00.000Z' },
    { id: 'after', startsAt: '2026-12-05T18:00:00.001Z' },
  ];

  assert.deepEqual(
    filterEvents(events, { from: '2026-12-05T17:00:00Z', to: '2026-12-05T18:00:00Z' })
      .map((event) => event.id),
    ['from', 'to'],
  );
});

test('S05: invalid dates, fractional prices, and unknown sort modes return VALIDATION', () => {
  expectDomainError(() => filterEvents([], { from: 'not-a-date' }), 'VALIDATION');
  expectDomainError(() => filterEvents([], { to: '2026-02-30' }), 'VALIDATION');
  expectDomainError(() => filterEvents([], { maxPriceCents: 10.5 }), 'VALIDATION');
  expectDomainError(
    () => filterEvents([{ tiers: [{ priceCents: 10.5 }] }], { maxPriceCents: 100 }),
    'VALIDATION',
  );
  expectDomainError(() => sortEvents([], 'popularity'), 'VALIDATION');
});

test('S05: filtering and sorting return new lists without changing the input', () => {
  const events = [
    { id: '2', title: 'Zulu', city: 'Lagos', startsAt: '2026-12-06T17:00:00Z' },
    { id: '1', title: 'Alpha', city: 'Lagos', startsAt: '2026-12-05T17:00:00Z' },
  ];
  const original = structuredClone(events);
  const filtered = filterEvents(events, { city: 'lagos' });
  const sorted = sortEvents(events, 'date');

  assert.notEqual(filtered, events);
  assert.notEqual(sorted, events);
  assert.deepEqual(events, original);
  assert.deepEqual(sorted.map((event) => event.id), ['1', '2']);
});

test('S05: availability sorting puts the most seats first and uses title/id for ties', () => {
  const events = [
    { id: 'b', title: 'Beta', availableSeats: 4 },
    { id: 'a', title: 'Alpha', availableSeats: 4 },
    { id: 'c', title: 'First', availableSeats: 8 },
    { id: 'd', title: 'Sold out', availableSeats: 0 },
  ];

  assert.deepEqual(sortEvents(events, 'availability').map((event) => event.id), ['c', 'a', 'b', 'd']);
  assert.deepEqual(filterEvents(events, { onlyAvailable: true }).map((event) => event.id), ['b', 'a', 'c']);
});

test('S05: price sorting places events without a price last and applies tie-breakers', () => {
  const events = [
    { id: 'b', title: 'Beta', cheapestPriceCents: 50 },
    { id: 'z', title: 'No price', cheapestPriceCents: null },
    { id: 'a', title: 'Alpha', cheapestPriceCents: 50 },
  ];

  assert.deepEqual(sortEvents(events, 'price').map((event) => event.id), ['a', 'b', 'z']);
});

test('S05: searching an empty list returns an empty new list', () => {
  const empty = [];
  const result = searchEvents(empty, {}, 'date');

  assert.deepEqual(result, []);
  assert.notEqual(result, empty);
});

test('S06: booking a published event creates a pending booking and releases correct inventory', () => {
  const store = createStore();
  const { tier } = makePublishedEvent(store, {}, { capacity: 3, priceCents: 500_000 });

  const booking = bookTickets(store, tier.id, 'attendee-1', 2);

  assert.equal(booking.status, 'pending');
  assert.equal(booking.quantity, 2);
  assert.equal(booking.amountCents, 1_000_000);
  assert.equal(seatsLeft(tier), 1);
});

test('S06: a sold-out booking returns SOLD_OUT and changes nothing', () => {
  const store = createStore();
  const { tier } = makePublishedEvent(store, {}, { capacity: 1 });
  bookTickets(store, tier.id, 'first-attendee', 1);
  const bookingCount = store.bookings.size;
  const referenceCount = store.bookingsByReference.size;

  expectDomainError(() => bookTickets(store, tier.id, 'second-attendee', 1), 'SOLD_OUT');

  assert.equal(tier.sold, 1);
  assert.equal(store.bookings.size, bookingCount);
  assert.equal(store.bookingsByReference.size, referenceCount);
});

test('S06: zero, negative, fractional, and over-limit quantities return VALIDATION', () => {
  const store = createStore();
  const { tier } = makePublishedEvent(store);

  for (const quantity of [0, -1, 1.5, 11]) {
    expectDomainError(() => bookTickets(store, tier.id, 'attendee-1', quantity), 'VALIDATION');
  }
  assert.equal(tier.sold, 0);
  assert.equal(store.bookings.size, 0);
});

test('every inventory domain error code is explicit', () => {
  const store = createStore();
  const event = makeEvent(store);
  const emptyEvent = makeEvent(store, { title: 'No tiers' });
  const tier = addTier(store, event.id, { name: 'General', priceCents: 100, capacity: 1 });

  expectDomainError(() => addTier(store, 'missing', { name: 'Tier', priceCents: 100, capacity: 1 }), 'NOT_FOUND');
  expectDomainError(() => publishEvent(store, emptyEvent.id), 'INVALID_STATE');
  expectDomainError(() => joinWaitlist(store, tier.id, 'attendee', 1), 'NOT_SOLD_OUT');
  bookTickets(store, tier.id, 'attendee', 1);
  expectDomainError(() => bookTickets(store, tier.id, 'another-attendee', 1), 'SOLD_OUT');
  expectDomainError(() => bookTickets(store, tier.id, 'attendee', 0), 'VALIDATION');
});

test('mergeSort is stable and returns a new array without modifying the input', () => {
  const items = [
    { group: 1, order: 'first' },
    { group: 0, order: 'middle' },
    { group: 1, order: 'second' },
    { group: 1, order: 'third' },
  ];
  const original = structuredClone(items);
  const result = mergeSort(items, (left, right) => left.group - right.group);

  assert.notEqual(result, items);
  assert.deepEqual(items, original);
  assert.deepEqual(result.map((item) => item.order), ['middle', 'first', 'second', 'third']);
});

test('mergeSort handles an empty list and rejects invalid arguments with VALIDATION', () => {
  const empty = [];
  assert.deepEqual(mergeSort(empty, () => 0), []);
  assert.notEqual(mergeSort(empty, () => 0), empty);
  expectDomainError(() => mergeSort({}, () => 0), 'VALIDATION');
  expectDomainError(() => mergeSort([], null), 'VALIDATION');
});
