// The web RSVP page served by convex/http.ts at https://<site>/rsvp/<eventId>, for people who don't have the
// app or a Muse. Same rules as the in-app page (app/rsvp/[eventId]/external.tsx): the event must have been
// sent, a name of 1 to 80 characters, and one of three answers; the mutation (events.rsvpExternal) enforces
// them. Pure: no imports, so it is tested directly and every piece of event text is escaped here.

export type RsvpStatus = "going" | "maybe" | "cant";

export interface InviteView {
  eventId: string;
  title: string;
  host: string;
  when: string | null;
  venue: string | null;
  error?: string;
}

const EVENT_ID = /^evt_[a-z0-9_]{1,40}$/;

/** "/rsvp/evt_x" or "/rsvp/evt_x/" -> "evt_x"; anything else -> null. */
export function eventIdFromPath(pathname: string): string | null {
  const m = /^\/rsvp\/([^/]+)\/?$/.exec(pathname);
  return m && EVENT_ID.test(m[1]) ? m[1] : null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function parseRsvpForm(form: URLSearchParams): { name: string; status: RsvpStatus } | null {
  const status = form.get("status");
  if (status !== "going" && status !== "maybe" && status !== "cant") return null;
  return { name: (form.get("name") ?? "").trim(), status };
}

export function rsvpLink(siteUrl: string, eventId: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/rsvp/${eventId}`;
}

const STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; background: #F0F2F5; font-family: -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif; color: #050505; }
  main { max-width: 440px; margin: 0 auto; padding: 24px 16px 40px; }
  .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
  .eyebrow { color: #65676B; font-size: 13px; font-weight: 600; margin: 0 0 6px; }
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 8px; line-height: 1.2; }
  .meta { color: #F3425F; font-weight: 600; font-size: 15px; margin: 0 0 4px; }
  .venue { color: #65676B; font-size: 15px; margin: 0 0 16px; }
  label { display: block; font-size: 13px; font-weight: 600; color: #65676B; margin: 12px 0 6px; }
  input[type=text] { width: 100%; box-sizing: border-box; font-size: 16px; padding: 12px; border: 1px solid #CED0D4; border-radius: 8px; }
  .answers { display: flex; gap: 8px; margin-top: 16px; }
  button { flex: 1; font-size: 15px; font-weight: 600; padding: 12px 0; border-radius: 8px; border: 0; background: #E4E6EB; color: #050505; }
  button.primary { background: #0866FF; color: #fff; }
  .error { color: #E41E3F; font-size: 14px; margin: 12px 0 0; }
  .foot { color: #65676B; font-size: 13px; text-align: center; margin-top: 16px; }
`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}` +
    `<p class="foot">Events by Muse</p></main></body></html>`;
}

function details(v: InviteView): string {
  return `<p class="eyebrow">${escapeHtml(v.host)} invited you</p><h1>${escapeHtml(v.title)}</h1>` +
    (v.when ? `<p class="meta">${escapeHtml(v.when)}</p>` : "") +
    (v.venue ? `<p class="venue">${escapeHtml(v.venue)}</p>` : "");
}

export function renderInvitePage(v: InviteView): string {
  const form = `<form method="post" action="/rsvp/${escapeHtml(v.eventId)}">` +
    `<label for="name">Your name</label><input id="name" name="name" type="text" required maxlength="80" autocomplete="name">` +
    `<div class="answers"><button class="primary" name="status" value="going">Going</button>` +
    `<button name="status" value="maybe">Maybe</button><button name="status" value="cant">Can't go</button></div>` +
    (v.error ? `<p class="error" role="alert">${escapeHtml(v.error)}</p>` : "") + `</form>`;
  return page(v.title, `<div class="card">${details(v)}${form}</div>`);
}

const ANSWER: Record<RsvpStatus, string> = { going: "You're going", maybe: "You said maybe", cant: "You can't make it" };

export function renderDonePage(v: InviteView, status: RsvpStatus, name: string): string {
  const body = `<div class="card">${details(v)}<h1>${ANSWER[status]}, ${escapeHtml(name)}.</h1>` +
    `<p class="venue">${escapeHtml(v.host)} can see your answer. Changed your mind? Open this link again and answer with the same name.</p>` +
    `<p class="venue">Want your own Muse to find events like this for you? It comes with Events by Muse on Facebook.</p></div>`;
  return page(v.title, body);
}

export function renderMessagePage(message: string): string {
  return page("Events by Muse", `<div class="card"><h1>${escapeHtml(message)}</h1></div>`);
}
