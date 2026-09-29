export function isValidNumericSnapInterval(interval) {
  const numericInterval = Number(interval);
  return Number.isFinite(numericInterval) && numericInterval > 0;
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
