import assert from "node:assert/strict";
import test from "node:test";
import type { TravelEmail } from "@homeos/shared";
import { emailMatchesTrip } from "./travelEmailMatching.js";

const trip = { startDate: "2026-10-10", endDate: "2026-10-15" };
function email(text: string | null, subject = "Booking", html: string | null = null): TravelEmail {
  return { id: "mail", sender: "airline@example.com", recipients: [], subject, text, html, receivedAt: "2026-01-01T00:00:00Z", attachments: [] };
}

test("matches common travel dates, inclusive trip boundaries, and same-month ranges", () => {
  for (const text of ["Depart 2026-10-10", "Check-out 10/15/2026", "October 12, 2026", "Oct. 12th 2026", "12 October 2026", "Oct 12", "October 9–11, 2026"])
    assert.equal(emailMatchesTrip(email(text), trip), true, text);
  assert.equal(emailMatchesTrip(email("Details", "Flight on Oct 11, 2026"), trip), true);
  assert.equal(emailMatchesTrip(email(null, "Booking", "<p>October&nbsp;12, 2026</p>"), trip), true);
});

test("does not match arrival timestamps, invalid dates, another year, or out-of-trip dates", () => {
  for (const text of ["October 9, 2026", "October 16, 2026", "Oct 12, 2025", "12 October 2025", "2025-10-12", "10/12/2025", "Flight at 10/12", "No dates", "Date: October 12, 2026\nDepart November 1, 2026", "Sent: October 12, 2026\nNo travel dates"])
    assert.equal(emailMatchesTrip(email(text), trip), false, text);
  assert.equal(emailMatchesTrip({ ...email("No dates"), receivedAt: "2026-10-12T00:00:00Z" }, trip), false);
  const february = { startDate: "2026-02-01", endDate: "2026-03-05" };
  for (const text of ["2026-02-30", "February 30, 2026", "02/30/2026"])
    assert.equal(emailMatchesTrip(email(text), february), false, text);
});

test("matches yearless dates across New Year and ignores hidden HTML", () => {
  const newYear = { startDate: "2026-12-29", endDate: "2027-01-03" };
  assert.equal(emailMatchesTrip(email("January 2"), newYear), true);
  assert.equal(emailMatchesTrip(email("Dec 30"), newYear), true);
  assert.equal(emailMatchesTrip(email("January 2, 2026"), newYear), false);
  assert.equal(emailMatchesTrip(email(null, "Booking", "<style>October 12, 2026</style><p>No dates</p>"), trip), false);
});
