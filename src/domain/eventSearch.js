import { DomainError } from './errors.js';
import { mergeSort } from './sorting.js';

function requireSummaries(summaries) {
  if (!Array.isArray(summaries)) {
    throw new DomainError('VALIDATION', 'summaries must be an array');
  }
  for (const summary of summaries) {
    if (summary === null || typeof summary !== 'object' || Array.isArray(summary)) {
      throw new DomainError('VALIDATION', 'Each event summary must be an object');
    }
  }
  return summaries;
}

function requireCriteria(criteria) {
  if (criteria === null || typeof criteria !== 'object' || Array.isArray(criteria)) {
    throw new DomainError('VALIDATION', 'criteria must be an object');
  }
  return criteria;
}

function parseDate(value, field, dateOnlyEnd = false) {
  if (typeof value !== 'string') {
    throw new DomainError('VALIDATION', `${field} must be an ISO date string`);
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new DomainError('VALIDATION', `${field} must be a valid ISO date`);
    }
    if (dateOnlyEnd) parsed.setUTCHours(23, 59, 59, 999);
    return parsed.getTime();
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new DomainError('VALIDATION', `${field} must be an ISO date string`);
  }
  const datePart = value.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart) {
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date`);
  }
  return parsed.getTime();
}

function getCheapestPrice(summary) {
  if (summary.cheapestPriceCents !== undefined) {
    if (
      summary.cheapestPriceCents !== null
      && (!Number.isSafeInteger(summary.cheapestPriceCents) || summary.cheapestPriceCents < 0)
    ) {
      throw new DomainError('VALIDATION', 'cheapestPriceCents must be a non-negative whole number');
    }
    return summary.cheapestPriceCents;
  }
  if (summary.tiers === undefined) return null;
  if (!Array.isArray(summary.tiers)) {
    throw new DomainError('VALIDATION', 'tiers must be an array');
  }
  if (summary.tiers.length === 0) return null;
  let cheapest = Infinity;
  for (const tier of summary.tiers) {
    if (tier === null || typeof tier !== 'object' || Array.isArray(tier)) {
      throw new DomainError('VALIDATION', 'Each ticket tier summary must be an object');
    }
    if (!Number.isSafeInteger(tier.priceCents) || tier.priceCents < 0) {
      throw new DomainError('VALIDATION', 'Tier priceCents must be a non-negative whole number');
    }
    cheapest = Math.min(cheapest, tier.priceCents);
  }
  return cheapest;
}

function getAvailableSeats(summary) {
  if (summary.availableSeats !== undefined) {
    if (!Number.isSafeInteger(summary.availableSeats) || summary.availableSeats < 0) {
      throw new DomainError('VALIDATION', 'availableSeats must be a non-negative whole number');
    }
    return summary.availableSeats;
  }
  if (summary.tiers === undefined) return 0;
  if (!Array.isArray(summary.tiers)) {
    throw new DomainError('VALIDATION', 'tiers must be an array');
  }

  return summary.tiers.reduce((total, tier) => {
    if (tier === null || typeof tier !== 'object' || Array.isArray(tier)) {
      throw new DomainError('VALIDATION', 'Each ticket tier summary must be an object');
    }
    let available;
    if (tier.seatsLeft !== undefined) {
      available = tier.seatsLeft;
    } else {
      available = tier.capacity - tier.sold;
    }
    if (!Number.isSafeInteger(available) || available < 0) {
      throw new DomainError('VALIDATION', 'Tier availability must be a non-negative whole number');
    }
    const updatedTotal = total + available;
    if (!Number.isSafeInteger(updatedTotal)) {
      throw new DomainError('VALIDATION', 'Total availability exceeds the supported whole-number range');
    }
    return updatedTotal;
  }, 0);
}

export function filterEvents(summaries, criteria = {}) {
  requireSummaries(summaries);
  const {
    q,
    city,
    from,
    to,
    maxPriceCents,
    onlyAvailable = false,
  } = requireCriteria(criteria);

  if (q !== undefined && typeof q !== 'string') {
    throw new DomainError('VALIDATION', 'q must be text');
  }
  if (city !== undefined && typeof city !== 'string') {
    throw new DomainError('VALIDATION', 'city must be text');
  }
  if (maxPriceCents !== undefined && (!Number.isSafeInteger(maxPriceCents) || maxPriceCents < 0)) {
    throw new DomainError('VALIDATION', 'maxPriceCents must be a non-negative whole number');
  }
  if (typeof onlyAvailable !== 'boolean') {
    throw new DomainError('VALIDATION', 'onlyAvailable must be a boolean');
  }

  const fromTime = from === undefined ? undefined : parseDate(from, 'from');
  const toTime = to === undefined ? undefined : parseDate(to, 'to', true);
  if (fromTime !== undefined && toTime !== undefined && fromTime > toTime) {
    throw new DomainError('VALIDATION', 'from must be on or before to');
  }

  const query = q?.trim().toLowerCase();
  const normalizedCity = city?.trim().toLowerCase();

  return summaries.filter((summary) => {
    if (
      query
      && !String(summary.title ?? '').toLowerCase().includes(query)
      && !String(summary.venue ?? '').toLowerCase().includes(query)
    ) {
      return false;
    }
    if (normalizedCity && String(summary.city ?? '').toLowerCase() !== normalizedCity) {
      return false;
    }
    if (fromTime !== undefined || toTime !== undefined) {
      const startsAt = parseDate(summary.startsAt, 'event startsAt');
      if (fromTime !== undefined && startsAt < fromTime) return false;
      if (toTime !== undefined && startsAt > toTime) return false;
    }
    if (maxPriceCents !== undefined) {
      const cheapestPrice = getCheapestPrice(summary);
      if (cheapestPrice === null || cheapestPrice > maxPriceCents) return false;
    }
    if (onlyAvailable && getAvailableSeats(summary) === 0) return false;
    return true;
  });
}

function compareText(left, right) {
  const normalizedLeft = String(left ?? '').toLowerCase();
  const normalizedRight = String(right ?? '').toLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  const exactLeft = String(left ?? '');
  const exactRight = String(right ?? '');
  return exactLeft < exactRight ? -1 : exactLeft > exactRight ? 1 : 0;
}

function compareTitlesAndIds(left, right) {
  return compareText(left.title, right.title) || compareText(left.id, right.id);
}

function getSortPrice(summary) {
  const price = getCheapestPrice(summary);
  if (price !== null && (!Number.isSafeInteger(price) || price < 0)) {
    throw new DomainError('VALIDATION', 'cheapestPriceCents must be a non-negative whole number');
  }
  return price;
}

export function sortEvents(summaries, sortBy) {
  requireSummaries(summaries);
  if (!['date', 'price', 'availability'].includes(sortBy)) {
    throw new DomainError('VALIDATION', 'sortBy must be date, price, or availability');
  }

  const compare = (left, right) => {
    let primary = 0;
    if (sortBy === 'date') {
      primary = parseDate(left.startsAt, 'event startsAt') - parseDate(right.startsAt, 'event startsAt');
    } else if (sortBy === 'price') {
      const leftPrice = getSortPrice(left);
      const rightPrice = getSortPrice(right);
      if (leftPrice === null && rightPrice !== null) primary = 1;
      else if (leftPrice !== null && rightPrice === null) primary = -1;
      else if (leftPrice !== null && rightPrice !== null) primary = leftPrice - rightPrice;
    } else {
      primary = getAvailableSeats(right) - getAvailableSeats(left);
    }
    return primary || compareTitlesAndIds(left, right);
  };

  return mergeSort(summaries, compare);
}

export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
