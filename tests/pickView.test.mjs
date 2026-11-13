// A discovered event + a pick -> the same card shape feed.forViewer returns for invited events.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPickView, formatWhen, eventKey } from "../convex/discoveryCore.ts";

const START = Date.UTC(2026, 10, 15, 3, 30); // Sat 14 Nov 2026, 7:30 PM in Los Angeles
const event = (o = {}) => {
  const e = {
    source: "hackradar", sourceId: "1", url: "https://lu.ma/abc", title: "Stanford Wind Symphony",
    description: "Big band night", startsAt: START, endsAt: null, venueName: "Bing Concert Hall",
    address: null, city: "Stanford", lat: null, lng: null, organizer: "Stanford Live",
    imageUrl: "https://img/x.jpg", category: "music", price: "paid", isOnline: false, isCancelled: false, ...o,
  };
  return { ...e, key: eventKey(e) };
};
const pick = (o = {}) => ({ verdict: "go", reason: "You're into jazz, and it's Saturday.", kind: "personal", status: "new", ...o });

test("formatWhen prints Pacific weekday, day, month and 12-hour time", () => {
  assert.equal(formatWhen(START), "Sat 14 Nov · 7:30 PM");
  assert.equal(formatWhen(Date.UTC(2026, 10, 20, 17, 0)), "Fri 20 Nov · 9:00 AM");
});

test("a pick becomes a card the swipe stack already understands", () => {
  const e = event();
  const v = toPickView(e, pick(), START - 86400e3);
  assert.equal(v.eventId, `pick:${e.key}`);
  assert.equal(v.relation, "pick");
  assert.equal(v.verdict, "worth");
  assert.deepEqual(v.reasons, ["You're into jazz, and it's Saturday."]);
  assert.equal(v.host.name, "Stanford Live");
  assert.deepEqual(v.poster, { url: "https://img/x.jpg" });
  assert.equal(v.whenLabel, "Sat 14 Nov · 7:30 PM");
  assert.equal(v.placeLabel, "Bing Concert Hall, Stanford");
  assert.equal(v.slotLabel, null);
  assert.deepEqual(v.chips, []);
  assert.equal(v.createdAt, START);
});

test("maybe stays maybe, organizer falls back, place falls back to the city", () => {
  const v = toPickView(event({ organizer: null, venueName: null, city: "Palo Alto, CA" }), pick({ verdict: "maybe" }), START - 1);
  assert.equal(v.verdict, "maybe");
  assert.equal(v.host.name, "Organizer");
  assert.equal(v.placeLabel, "Palo Alto");
});

test("snoozed picks report snoozed; friends going are passed through", () => {
  const now = START - 86400e3;
  const friends = [{ id: "sam", name: "Sam Lee", initials: "SL", color: "#123456" }];
  const v = toPickView(event(), pick({ status: "snoozed", snoozedUntil: now + 3600e3 }), now, friends);
  assert.equal(v.snoozed, true);
  assert.deepEqual(v.friendsGoing, friends);
});

test("no outside links leak into anything the card renders", () => {
  const v = toPickView(event({ title: "Night out", url: "https://www.eventbrite.com/e/1" }), pick(), START - 1);
  const shown = JSON.stringify({ ...v, poster: null });
  assert.doesNotMatch(shown, /lu\.ma|eventbrite|facebook\.com/);
});
