import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { eventIdFromPath, parseRsvpForm, renderDonePage, renderInvitePage, renderMessagePage } from "./rsvpPage";

// Public web routes on the Convex site URL (https://convex-site.keanuc.net). The only one is the RSVP link
// for people without the app: GET shows the invite, POST records the answer through events.rsvpExternal,
// which already enforces the rules (sent events only, name 1 to 80 characters, three answers).
const http = httpRouter();

const html = (status: number, body: string) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

http.route({
  pathPrefix: "/rsvp/",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const eventId = eventIdFromPath(new URL(req.url).pathname);
    if (!eventId) return html(404, renderMessagePage("This invite link isn't valid."));
    const view = await ctx.runQuery(internal.rsvpWeb.inviteView, { eventId });
    if (!view) return html(404, renderMessagePage("This invite isn't open."));
    return html(200, renderInvitePage(view));
  }),
});

http.route({
  pathPrefix: "/rsvp/",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const eventId = eventIdFromPath(new URL(req.url).pathname);
    if (!eventId) return html(404, renderMessagePage("This invite link isn't valid."));
    const view = await ctx.runQuery(internal.rsvpWeb.inviteView, { eventId });
    if (!view) return html(404, renderMessagePage("This invite isn't open."));
    const answer = parseRsvpForm(new URLSearchParams(await req.text()));
    if (!answer) return html(400, renderInvitePage({ ...view, error: "Pick Going, Maybe or Can't go." }));
    try {
      await ctx.runMutation(api.events.rsvpExternal, { eventId, name: answer.name, status: answer.status });
    } catch (e) {
      const message = e instanceof Error ? e.message.replace(/^.*Uncaught Error: /s, "").split("\n")[0] : "That didn't save.";
      return html(400, renderInvitePage({ ...view, error: message }));
    }
    return html(200, renderDonePage(view, answer.status, answer.name));
  }),
});

export default http;
