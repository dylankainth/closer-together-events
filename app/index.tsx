import { Redirect } from "expo-router";

// "/" has no screen of its own — the app's landing page is the Menu tab.
export default function Index() {
  return <Redirect href="/menu" />;
}
