import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";

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

type Props = {
  eventId: string;
  posterUrl?: string | null;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
};

/**
 * An event's picture. With a `posterUrl` it shows that, with the event's bundled banner kept underneath: if the
 * picture is slow, blocked, comes back blank or fails to load, the banner shows through instead of an empty tile.
 * (A failed load alone isn't enough: some links, like Facebook's expiring image links, can simply never paint
 * and never report an error.) The banner under a picture only appears after a short delay, so a normal load
 * doesn't flash a banner first. With no `posterUrl` it just shows the banner.
 *
 * It is keyed on the event and the picture, so when a screen reuses it for a different event (swiping from one
 * card to the next) it starts fresh instead of keeping the previous event's picture on screen until the new one
 * has loaded.
 */
export function EventBanner(props: Props) {
  // posterUrl "" means "this event has a big picture the list left out": fetch it on its own. Until it arrives (or
  // if it never does) the bundled banner shows.
  if (props.posterUrl === "") return <LazyBanner {...props} />;
  return <Banner key={`${props.eventId}|${props.posterUrl ?? ""}`} {...props} />;
}

function LazyBanner(props: Props) {
  const { viewerId } = useViewer();
  const url = useQuery(api.feed.poster, { eventId: props.eventId, personaId: viewerId });
  return <Banner key={`${props.eventId}|${url ?? "lazy"}`} {...props} posterUrl={url || null} />;
}

function Banner({ eventId, posterUrl, style, resizeMode = "cover" }: Props) {
  const [failed, setFailed] = useState(false);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 900);
    return () => clearTimeout(t);
  }, []);

  const banner = fallbackBanner(eventId);
  if (!posterUrl || failed) return <Image source={banner} style={style} resizeMode={resizeMode} />;
  return (
    <View style={[style as StyleProp<ViewStyle>, { overflow: "hidden" }]}>
      {waited && <Image source={banner} style={StyleSheet.absoluteFill} resizeMode={resizeMode} />}
      <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} resizeMode={resizeMode} onError={() => setFailed(true)} />
    </View>
  );
}
