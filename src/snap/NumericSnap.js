export function isValidNumericSnapInterval(interval) {
  const numericInterval = Number(interval);
  return Number.isFinite(numericInterval) && numericInterval > 0;
}

export function expandNumericDomainToSnap(domain, interval) {
  const numericInterval = Number(interval);
  if (!isValidNumericSnapInterval(numericInterval)) return domain;

  const start = Number(domain[0]);
  const end = Number(domain[1]);
  const stepCount = Math.ceil((end - start) / numericInterval);
  const expandedEnd = start + stepCount * numericInterval;
  return [
    domain[0],
    domain[0] instanceof Date ? new Date(expandedEnd) : expandedEnd,
  ];
}

export function snapNumericCoordinate(value, interval, domain) {
  const numericInterval = Number(interval);
  if (!isValidNumericSnapInterval(numericInterval)) return value;

  const numericValue = +value;
  const origin = +domain[0];
  const domainEnd = +domain[1];
  const lower = Math.min(origin, domainEnd);
  const upper = Math.max(origin, domainEnd);
  const minIndex = Math.ceil((lower - origin) / numericInterval);
  const maxIndex = Math.floor((upper - origin) / numericInterval);
  const index = Math.max(
    minIndex,
    Math.min(maxIndex, Math.round((numericValue - origin) / numericInterval))
  );
  const snapped = origin + index * numericInterval;
  return value instanceof Date || domain[0] instanceof Date
    ? new Date(snapped)
    : snapped;
}
