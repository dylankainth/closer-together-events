import type { ConfigContext, ExpoConfig } from "expo/config";

// Extends app.json. Login with Facebook is switched on only when the Facebook app id and client
// token are present at build time, so builds without them (and Expo Go) keep working.
//
//   EXPO_PUBLIC_FB_APP_ID   Facebook app id (also read by the app at runtime)
//   FB_CLIENT_TOKEN         Facebook client token (Settings > Advanced in the Facebook app)
//   IOS_BUNDLE_ID / ANDROID_PACKAGE   must match what's registered in the Facebook app
export default ({ config }: ConfigContext): ExpoConfig => {
  const appID = process.env.EXPO_PUBLIC_FB_APP_ID;
  const clientToken = process.env.FB_CLIENT_TOKEN;
  const plugins = [...(config.plugins ?? [])];
  if (appID && clientToken) {
    plugins.push([
      "react-native-fbsdk-next",
      {
        appID,
        clientToken,
        displayName: "Muse Events",
        scheme: `fb${appID}`,
        isAutoInitEnabled: true,
        autoLogAppEventsEnabled: false,
        advertiserIDCollectionEnabled: false,
      },
    ]);
  }
  return {
    ...config,
    // Read by lib/facebookLogin.ts: true only when the native Facebook plugin was configured.
    extra: { ...config.extra, fbConfigured: Boolean(appID && clientToken) },
    name: config.name ?? "Muse Events",
    slug: config.slug ?? "muse-events",
    plugins,
    ios: { ...config.ios, bundleIdentifier: process.env.IOS_BUNDLE_ID ?? config.ios?.bundleIdentifier ?? "com.closertogether.museevents" },
    android: { ...config.android, package: process.env.ANDROID_PACKAGE ?? config.android?.package ?? "com.closertogether.museevents" },
  };
};
