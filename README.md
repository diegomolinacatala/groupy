# groupy

Organise your group projects and collaborate with your teacher.

This is a [Next.js 16](https://nextjs.org) project. The end goal (see `CLAUDE.md`) is a
Supabase-backed tool, but the **current dashboard is a fully local, front-end-only
prototype** so it runs with zero configuration.

## The dashboard (local prototype)

A Talli-style **project panel** — a calendar of editable "modules" plus board, team and
strengths views. Everything is editable inline with low friction:

- **Calendar** — modules shown on their due date; **drag them between days** to reschedule,
  or drop them in the "Sin fecha" tray to unschedule. Click any day to add a module.
- **Board** — kanban by status (Pendiente / En curso / Hecho); **drag cards** between columns.
- **Team** — add/edit/remove members (name, email, role, colour, coordinator).
- **Strengths** — editable list of team strengths ("puntos fuertes").
- **Overview** — stats, progress, per-member contribution and upcoming deadlines.
- **Module editor** — a slide-over to edit type, status, due date, assignees, description
  and a checklist.

### How data is stored

State lives in the browser via **`localStorage`** and is seeded with dummy data on first
run (per the contract, never real class rosters). The data layer is isolated in
`src/lib/data/` (types → reducer → store → provider) so it can later be swapped for
Supabase Server Actions without reshaping the UI. There is **no AI** and **no backend**
yet. Use "Datos de ejemplo" in the sidebar to reset the demo.

> The Supabase middleware (`src/proxy.ts`) is a no-op until
> `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set, so the app
> runs without any `.env.local`.

## Getting Started

Run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the root redirects straight into the
panel at `/dashboard`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
