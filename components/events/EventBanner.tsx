import React, { useState } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";

// The 16 banners in assets/banners, bundled with the app. Every event shows a banner: its own picture when it
// has one, otherwise one of these. The same event always gets the same one, so it doesn't change between
// screens or reloads.
const BUNDLED = [
  require("../../assets/banners/banner-01.jpg"),
  require("../../assets/banners/banner-02.jpg"),
  require("../../assets/banners/banner-03.jpg"),
  require("../../assets/banners/banner-04.jpg"),
  require("../../assets/banners/banner-05.jpg"),
  require("../../assets/banners/banner-06.jpg"),
  require("../../assets/banners/banner-07.jpg"),
  require("../../assets/banners/banner-08.jpg"),
  require("../../assets/banners/banner-09.jpg"),
  require("../../assets/banners/banner-10.jpg"),
  require("../../assets/banners/banner-11.jpg"),
  require("../../assets/banners/banner-12.jpg"),
  require("../../assets/banners/banner-13.jpg"),
  require("../../assets/banners/banner-14.jpg"),
  require("../../assets/banners/banner-15.jpg"),
  require("../../assets/banners/banner-16.jpg"),
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** The bundled banner for an event id (same id, same banner). */
export const fallbackBanner = (eventId: string) => BUNDLED[hash(eventId || "event") % BUNDLED.length];

/**
 * An event's picture. Shows `posterUrl` when there is one; if there isn't, or it fails to load (a dead link,
 * a bad image), shows the event's bundled banner instead, so no event is ever left with an empty tile.
 */
export function EventBanner({
  eventId,
  posterUrl,
  style,
  resizeMode = "cover",
}: {
  eventId: string;
  posterUrl?: string | null;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
}) {
  const [failed, setFailed] = useState(false);
  const source = posterUrl && !failed ? { uri: posterUrl } : fallbackBanner(eventId);
  return <Image source={source} style={style} resizeMode={resizeMode} onError={() => setFailed(true)} />;
}
