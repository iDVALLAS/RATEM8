import { describe, expect, it } from "vitest";
import { isoDate } from "./normalize";

const NOW = new Date("2026-11-21T12:00:00Z");

describe("isoDate never guesses a wrong date (D69)", () => {
  it("refuses a month over 12 instead of rolling into the next year", () => {
    expect(isoDate("15/03/2021", { now: NOW })).toBeNull();
    expect(isoDate("13/01/2022", { now: NOW })).toBeNull();
  });
  it("refuses a day past the end of its month", () => {
    expect(isoDate("2021-02-30", { now: NOW })).toBeNull();
    expect(isoDate("2/29/2021", { now: NOW })).toBeNull();
    expect(isoDate("4/31/2022", { now: NOW })).toBeNull();
    expect(isoDate("Feb 30 2021", { now: NOW })).toBeNull();
    expect(isoDate("2/29/2024", { now: NOW })).toBe("2024-02-29");
  });
  it("reads a two-digit year from next year on as the last century", () => {
    expect(isoDate("12/31/99", { now: NOW })).toBe("1999-12-31");
    expect(isoDate("1/1/27", { now: NOW })).toBe("1927-01-01");
    expect(isoDate("7/4/21", { now: NOW })).toBe("2021-07-04");
    expect(isoDate("3/1/26", { now: NOW })).toBe("2026-03-01");
  });
  it("still reads the formats exports use", () => {
    expect(isoDate("03/15/2021")).toBe("2021-03-15");
    expect(isoDate("2021-07-04")).toBe("2021-07-04");
    expect(isoDate("2021-07-04T00:00:00Z")).toBe("2021-07-04");
    expect(isoDate("2021-07-04 00:00:00")).toBe("2021-07-04");
    expect(isoDate("3/15/2021 12:00 AM")).toBe("2021-03-15");
    expect(isoDate("Jan 5 2020")).toBe("2020-01-05");
    expect(isoDate("January 5th, 2020")).toBe("2020-01-05");
    expect(isoDate("5 Jan 2020")).toBe("2020-01-05");
    expect(isoDate("44287")).toBe("2021-04-01");
  });
  it("reads a bare year only for a field that allows one, and nothing else loose", () => {
    expect(isoDate("2021")).toBeNull();
    expect(isoDate("2021", { allowYear: true })).toBe("2021-01-01");
    for (const s of ["1", "12", "soon", "Smarch 3 2020", "2021-13-01", "0/5/2021"]) expect(isoDate(s)).toBeNull();
  });
});
