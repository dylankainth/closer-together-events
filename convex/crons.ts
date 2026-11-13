// Scheduled work. Event discovery: fetch real nearby events from every source and re-rank
// everyone's Muse picks every 6 hours (docs/superpowers/specs/2026-11-13-event-discovery-design.md).
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("discover events", { hours: 6 }, internal.discoverySources.fetchAll, {});

export default crons;
