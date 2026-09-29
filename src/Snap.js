import {
  isValidDateSnapDuration,
  snapDateCoordinate,
} from "./snap/DateSnap.js";
import {
  isValidNumericSnapInterval,
  snapNumericCoordinate,
} from "./snap/NumericSnap.js";

function isDateSnap(interval, domain) {
  return (
    typeof interval === "object" &&
    domain &&
    domain[0] instanceof Date &&
    domain[1] instanceof Date
  );
}

export function isValidSnapInterval(interval, domain) {
  return isDateSnap(interval, domain)
    ? isValidDateSnapDuration(interval, domain)
    : isValidNumericSnapInterval(interval);
}

export function snapCoordinate(value, interval, domain) {
  return isDateSnap(interval, domain)
    ? snapDateCoordinate(value, interval, domain)
    : snapNumericCoordinate(value, interval, domain);
}
