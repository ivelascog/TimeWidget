import {
  expandDomainToSnap,
  isValidSnapInterval,
  snapCoordinate,
} from "../src/Snap.js";
import {
  expandDateDomainToSnap,
  isValidDateSnapDuration,
  snapDateCoordinate,
} from "../src/snap/DateSnap.js";
import {
  expandNumericDomainToSnap,
  snapNumericCoordinate,
} from "../src/snap/NumericSnap.js";

describe("calendar snapping", () => {
  const domain = [new Date(2023, 0, 1), new Date(2023, 11, 31)];

  test("snaps to real month boundaries instead of fixed 31-day intervals", () => {
    expect(
      snapDateCoordinate(new Date(2023, 4, 5), { months: 1 }, domain)
    ).toEqual(new Date(2023, 4, 1));
    expect(
      snapDateCoordinate(new Date(2023, 11, 8), { months: 1 }, domain)
    ).toEqual(new Date(2023, 11, 1));
  });

  test("uses the nearest calendar boundary", () => {
    expect(
      snapDateCoordinate(new Date(2023, 2, 20), { months: 1 }, domain)
    ).toEqual(new Date(2023, 3, 1));
  });

  test("preserves end-of-month semantics provided by date-fns", () => {
    const endOfMonthDomain = [new Date(2024, 0, 31), new Date(2024, 5, 30)];
    expect(
      snapDateCoordinate(new Date(2024, 1, 27), { months: 1 }, endOfMonthDomain)
    ).toEqual(new Date(2024, 1, 29));
    expect(
      snapDateCoordinate(new Date(2024, 2, 29), { months: 2 }, endOfMonthDomain)
    ).toEqual(new Date(2024, 2, 31));
  });

  test("corrects a non-aligned calendar domain to the next boundary", () => {
    const domainToCorrect = [new Date(2024, 0, 31), new Date(2024, 5, 29)];
    expect(expandDateDomainToSnap(domainToCorrect, { months: 1 })).toEqual([
      new Date(2024, 0, 31),
      new Date(2024, 5, 30),
    ]);

    const alignedDomain = [new Date(2023, 0, 1), new Date(2023, 6, 1)];
    expect(expandDateDomainToSnap(alignedDomain, { months: 3 })).toEqual(
      alignedDomain
    );
  });

  test("validates positive date-fns durations", () => {
    expect(isValidDateSnapDuration({ months: 1 }, domain)).toBe(true);
    expect(isValidDateSnapDuration({ months: 0 }, domain)).toBe(false);
    expect(isValidDateSnapDuration({ months: -1 }, domain)).toBe(false);
    expect(isValidDateSnapDuration({ months: 1, days: 2 }, domain)).toBe(false);
    expect(isValidDateSnapDuration({ fortnights: 1 }, domain)).toBe(false);
    expect(isValidDateSnapDuration({ months: 1 }, [domain[1], domain[0]])).toBe(
      false
    );
  });
});

describe("numeric snapping", () => {
  test("keeps snapping numeric values to fixed intervals", () => {
    expect(snapNumericCoordinate(12.4, 1, [-10, 40])).toBe(12);
    expect(snapNumericCoordinate(12.6, 1, [-10, 40])).toBe(13);
  });

  test("corrects a non-aligned millisecond domain", () => {
    const day = 24 * 60 * 60 * 1000;
    const domain = [new Date(2023, 0, 1), new Date(2023, 0, 10)];

    expect(
      snapNumericCoordinate(new Date(2023, 0, 8, 18), 7 * day, domain)
    ).toEqual(new Date(2023, 0, 8));
    expect(expandNumericDomainToSnap(domain, 7 * day)).toEqual([
      domain[0],
      new Date(2023, 0, 15),
    ]);
  });

  test("corrects non-aligned numeric domains without excluding values", () => {
    expect(expandNumericDomainToSnap([0, 100], 15)).toEqual([0, 105]);
    expect(expandNumericDomainToSnap([10, 40], 5)).toEqual([10, 40]);
    expect(expandNumericDomainToSnap([-10, 36], 10)).toEqual([-10, 40]);
  });

  test("does not change a domain when snapping is disabled", () => {
    const domain = [0, 100];
    expect(expandNumericDomainToSnap(domain, null)).toBe(domain);
  });
});

describe("snap dispatcher", () => {
  test("routes date-fns durations and numeric intervals independently", () => {
    const dateDomain = [new Date(2023, 0, 1), new Date(2023, 11, 31)];
    expect(isValidSnapInterval({ months: 1 }, dateDomain)).toBe(true);
    expect(
      snapCoordinate(new Date(2023, 4, 5), { months: 1 }, dateDomain)
    ).toEqual(new Date(2023, 4, 1));
    expect(snapCoordinate(12.6, 1, [-10, 40])).toBe(13);
    expect(expandDomainToSnap(dateDomain, { months: 1 })).toEqual([
      new Date(2023, 0, 1),
      new Date(2024, 0, 1),
    ]);
    expect(isValidSnapInterval(7 * 24 * 60 * 60 * 1000, dateDomain)).toBe(true);
    expect(
      expandDomainToSnap(
        [new Date(2023, 0, 1), new Date(2023, 0, 10)],
        7 * 24 * 60 * 60 * 1000
      )
    ).toEqual([new Date(2023, 0, 1), new Date(2023, 0, 15)]);
    expect(expandDomainToSnap([0, 100], 15)).toEqual([0, 105]);
  });
});
