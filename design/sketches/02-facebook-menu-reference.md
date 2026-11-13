# Facebook Menu screen clone (dylan, 2026-11-12)

Real Facebook app screenshot (`02-facebook-menu-reference.jpg`), used to pixel-clone the app's
new landing screen: `app/(tabs)/menu/index.tsx`.

## Why this screen
Per dylan: the UI needed to look convincingly embedded in Facebook, not like a generic app. This
screen is now the app's default landing tab; tapping "Events" is the one functional row, opening
Muse Events' own Events home (`app/events/index.tsx`) as a pushed screen with its own back button.

## Structure cloned
- Header: "Menu" (bold, large) + search + settings icons.
- Profile card (light-gray rounded card): avatar + name + chevron-down badge (red "1" dot) → tapping
  it opens Settings; divider; "Create Facebook Page" row (decorative, not wired up).
- Menu list: Events (functional), Marketplace / Meta AI / Dating / Groups (decorative, matches the
  real app's layout but out of scope for this product).
- "See more" pill button (decorative).
- Collapsible rows: Help and support / Settings and privacy (decorative) / Upgrades (expanded by
  default, showing two promo cards — built as generic gradient placeholders rather than cloning
  the real screenshot's specific photo content).

## Navigation restructure this required
Events/Settings/Setup moved out of the `(tabs)` group entirely (`app/events/`, `app/settings/`,
`app/setup/`) so they're reached via the root Stack with proper back-button navigation, rather
than being sibling tabs with no way back. The `(tabs)` group now holds only the 6-icon Facebook-
style bottom bar (home/watch/friends/profile/notifications/menu), of which only `menu` is a real
screen — the rest are inert chrome placeholders matching the reference screenshot's bar, since
Muse Events only replaces the Events entry point inside Facebook, not the whole app.
