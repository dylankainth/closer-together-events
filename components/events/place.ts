/**
 * A short place to show on a card or row: the venue or the city, never the whole street address.
 *   "Restaurant of the Night, Alto, CA 94301, US"          -> "Restaurant of the Night"
 *   "655 Bryant St, San Francisco, CA 94107, US"            -> "San Francisco"   (the first part is a street)
 *   "Mission Lanes" / "San Francisco" / "Menlo Park, CA"   -> unchanged / unchanged / "Menlo Park"
 */
export function shortPlace(label: string | null | undefined): string | null {
  if (!label) return null;
  const parts = label.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const street = /^\d/.test(parts[0]) || /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|pl|place|ct|court|hwy|suite|ste|floor|fl)\.?$/i.test(parts[0]);
  const region = (s: string) => /^[A-Z]{2}(\s+\d{4,5})?$/.test(s) || /^\d{4,5}/.test(s) || /^(US|USA|United States|UK|United Kingdom|Canada)$/i.test(s);

  if (street && parts.length > 1) {
    // a street address first: the city that follows it is more useful
    const unit = (s: string) => /^(suite|ste|unit|floor|fl|apt|apartment|room|rm|#)\b/i.test(s);
    const city = parts.slice(1).find((p) => !/^\d/.test(p) && !region(p) && !unit(p));
    if (city) return city;
  }
  return parts[0];
}
