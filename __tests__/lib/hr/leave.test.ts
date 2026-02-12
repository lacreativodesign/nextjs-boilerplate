import { calculateAccruedHours, calculateBusinessDaysInclusive, hasDateOverlap } from "@/lib/hr/leave";

describe("leave calculations", () => {
  it("calculates weekday leave days inclusively", () => {
    const days = calculateBusinessDaysInclusive(new Date("2026-05-04T00:00:00.000Z"), new Date("2026-05-08T00:00:00.000Z"));
    expect(days).toBe(5);
  });

  it("calculates monthly accrual for month range", () => {
    const hours = calculateAccruedHours({
      accrualSchedule: "monthly",
      accrualRateHours: 8,
      annualAllocationHours: 0,
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-03-31T00:00:00.000Z"),
    });
    expect(hours).toBe(24);
  });

  it("detects overlapping ranges", () => {
    expect(
      hasDateOverlap(
        { startDate: new Date("2026-06-10T00:00:00.000Z"), endDate: new Date("2026-06-12T00:00:00.000Z") },
        { startDate: new Date("2026-06-12T00:00:00.000Z"), endDate: new Date("2026-06-18T00:00:00.000Z") }
      )
    ).toBe(true);
  });
});
