import { Redirect } from "expo-router";

// Opening Events (Menu row, setup buttons) lands on the recommended swipe stack. Everything the old
// Events home showed (your events, invites, other events, "Make an event") now lives in the feed,
// one swipe up from the stack: see app/events/recommended.tsx and app/events/feed.tsx.
export default function EventsLanding() {
  return <Redirect href="/events/recommended" />;
}
