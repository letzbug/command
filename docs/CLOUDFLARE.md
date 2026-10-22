# Cloudflare deployment guide

## Pages (the app)

1. Push the repository to GitHub (e.g. `letzbug/unipop-command`).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repository.
3. Build command `npm run build`, output directory `dist`, Node 20+.
4. Environment variables (Production): `VITE_PUBLIC_APP_URL=https://<project>.pages.dev`, and later
   `VITE_COURSE_SOURCE_URL` pointing to the Worker below.

The app is a static SPA; no server is needed for the local-first version. Data stays in each user's
browser until Supabase is connected.

## Worker: course feed proxy (`workers/course-sync`)

The browser usually cannot read `trainings.json` directly (CORS). The Worker fetches it on a schedule,
keeps the last good copy in KV, and serves it with CORS for the Pages origin only.

```bash
cd workers/course-sync
npm install
npx wrangler kv namespace create COURSES   # put the id in wrangler.toml
npx wrangler deploy
```

Set `ALLOWED_ORIGIN` in `wrangler.toml` to the Pages URL. The cron (`0 */6 * * *`) means one upstream
request every six hours. Then set the course source in the app (Paramètres → Source des formations) to
`https://unipop-course-sync.<account>.workers.dev/trainings.json`.

## Cron reminders (planned)

`src/integrations/cloudflare/scheduling.ts` defines the dispatch contract. A second Worker with a daily
cron can load events and tasks from Supabase (service-role key as a Worker secret), run
`computeReminders` from `src/domain/reminders.ts`, call `planDispatches`, and send e-mails. Record sent
dispatch keys to keep it idempotent.
