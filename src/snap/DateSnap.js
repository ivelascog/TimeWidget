import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addSeconds,
  addWeeks,
  addYears,
  closestTo,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInMonths,
  differenceInSeconds,
  differenceInWeeks,
  differenceInYears,
  isValid,
} from "date-fns";

const DATE_SNAP_UNITS = {
  years: { add: addYears, difference: differenceInYears },
  months: { add: addMonths, difference: differenceInMonths },
  weeks: { add: addWeeks, difference: differenceInWeeks },
  days: { add: addDays, difference: differenceInDays },
  hours: { add: addHours, difference: differenceInHours },
  minutes: { add: addMinutes, difference: differenceInMinutes },
  seconds: { add: addSeconds, difference: differenceInSeconds },
};

function parseDateSnapDuration(duration) {
  if (!duration || typeof duration !== "object" || Array.isArray(duration)) {
    return null;
  }

  const entries = Object.entries(duration);
  if (entries.length !== 1) return null;

  const [unit, rawAmount] = entries[0];
  const operations = DATE_SNAP_UNITS[unit];
  const amount = Number(rawAmount);
  if (!operations || !Number.isFinite(amount) || amount <= 0) return null;

  return { add: operations.add, difference: operations.difference, amount };
}

function isDateDomain(domain) {
  return (
    domain &&
    domain[0] instanceof Date &&
    domain[1] instanceof Date &&
    isValid(domain[0]) &&
    isValid(domain[1]) &&
    domain[0] < domain[1]
  );
}

export function isValidDateSnapDuration(duration, domain) {
  if (!isDateDomain(domain)) return false;

  const parsedDuration = parseDateSnapDuration(duration);
  if (!parsedDuration) return false;

  const firstPoint = parsedDuration.add(domain[0], parsedDuration.amount);
  return isValid(firstPoint) && firstPoint > domain[0];
}

export function expandDateDomainToSnap(domain, duration) {
  if (!isValidDateSnapDuration(duration, domain)) return domain;

  const { add, difference, amount } = parseDateSnapDuration(duration);
  const origin = domain[0];
  const end = domain[1];
  const index = Math.max(1, Math.ceil(difference(end, origin) / amount));
  const boundary = add(origin, index * amount);
  const expandedEnd =
    boundary < end ? add(origin, (index + 1) * amount) : boundary;

  return [domain[0], expandedEnd];
}

export function snapDateCoordinate(value, duration, domain) {
  if (!isValidDateSnapDuration(duration, domain) || !isValid(value)) {
    return value;
  }

  const { add, difference, amount } = parseDateSnapDuration(duration);
  const origin = domain[0];
  const approximateIndex = difference(value, origin) / amount;
  const firstCandidateIndex = Math.floor(approximateIndex) - 1;
  const lastCandidateIndex = Math.ceil(approximateIndex) + 1;
  const lowerBound = Math.min(+domain[0], +domain[1]);
  const upperBound = Math.max(+domain[0], +domain[1]);
  const candidates = [];

  for (let index = firstCandidateIndex; index <= lastCandidateIndex; index++) {
    const candidate = add(origin, index * amount);
    if (+candidate >= lowerBound && +candidate <= upperBound) {
      candidates.push(candidate);
    }
  }

  const closestCandidate = closestTo(value, candidates);
  return closestCandidate || value;
}
