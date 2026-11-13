import { test } from "node:test";
import assert from "node:assert/strict";
import { eventIdFromPath, escapeHtml, parseRsvpForm, renderDonePage, renderInvitePage, renderMessagePage, rsvpLink } from "../convex/rsvpPage.ts";

const view = { eventId: "evt_demo2", title: "Tessa's vinyl & dumplings night", host: "Tessa", when: "Sat 21 Nov, 7pm", venue: "The Rec Room" };

test("event id comes from /rsvp/<id> and anything odd is rejected", () => {
  assert.equal(eventIdFromPath("/rsvp/evt_demo2"), "evt_demo2");
  assert.equal(eventIdFromPath("/rsvp/evt_mwf73bi9/"), "evt_mwf73bi9");
  for (const bad of ["/rsvp/", "/rsvp/evt_x/extra", "/rsvp/<script>", "/rsvp/../secrets", "/other/evt_demo2", `/rsvp/evt_${"a".repeat(80)}`]) {
    assert.equal(eventIdFromPath(bad), null, bad);
  }
});

test("html escaping covers the five special characters", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("the invite page shows the details escaped and posts back to its own link", () => {
  const html = renderInvitePage({ ...view, title: `<img src=x onerror=alert(1)>` });
  assert.ok(!html.includes("<img src=x"), "event text is escaped");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes(`action="/rsvp/evt_demo2"`) && html.includes(`method="post"`));
  for (const s of ["going", "maybe", "cant"]) assert.ok(html.includes(`value="${s}"`), s);
  assert.ok(html.includes("Tessa") && html.includes("Sat 21 Nov, 7pm") && html.includes("The Rec Room"));
  assert.ok(html.includes(`maxlength="80"`));
});

test("an error message is shown escaped on the invite page", () => {
  const html = renderInvitePage({ ...view, error: "<b>nope</b>" });
  assert.ok(html.includes("&lt;b&gt;nope&lt;/b&gt;"));
});

test("form parsing accepts only the three answers and trims the name", () => {
  assert.deepEqual(parseRsvpForm(new URLSearchParams("name=%20Alex%20&status=maybe")), { name: "Alex", status: "maybe" });
  assert.deepEqual(parseRsvpForm(new URLSearchParams("name=Alex&status=going")), { name: "Alex", status: "going" });
  assert.equal(parseRsvpForm(new URLSearchParams("name=Alex&status=skip")), null);
  assert.equal(parseRsvpForm(new URLSearchParams("name=Alex")), null);
});

test("the done page names the answer and the event, escaped", () => {
  const html = renderDonePage({ ...view, title: "<x>" }, "going", "Alex");
  assert.ok(html.includes("You're going") && html.includes("&lt;x&gt;") && html.includes("Alex"));
  assert.ok(renderDonePage(view, "cant", "Alex").includes("can't make it"));
});

test("message pages escape their text", () => {
  assert.ok(renderMessagePage("<b>gone</b>").includes("&lt;b&gt;gone&lt;/b&gt;"));
});

test("the share link is built from the site url and the event id", () => {
  assert.equal(rsvpLink("https://convex-site.keanuc.net", "evt_demo2"), "https://convex-site.keanuc.net/rsvp/evt_demo2");
  assert.equal(rsvpLink("https://convex-site.keanuc.net/", "evt_demo2"), "https://convex-site.keanuc.net/rsvp/evt_demo2");
});
