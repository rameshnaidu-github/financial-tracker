/*
 * Every date this server works out is a date in India.
 *
 * Vercel runs functions in UTC, so without this the server's "today" ran five and a half hours
 * behind the owner's: from midnight to 5:30 am IST a transaction dated today was refused as being
 * in the future, AutoPay and insurance debits were taken a day late, and "this month" was still
 * last month for the first hours of every month.
 *
 * Assigned, not defaulted: AWS Lambda sets TZ itself, so `??=` would keep UTC. Node re-reads the
 * zone when TZ is assigned at runtime. This module must be the first import of every entry point,
 * so the zone is set before anything computes a date.
 *
 * The application is INR-only and its people are in India. If that ever changes, this becomes a
 * per-person setting rather than a constant.
 */
process.env.TZ = "Asia/Kolkata";
