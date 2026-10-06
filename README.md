# Groupy

**El trabajo en grupo, repartido y a la vista.** Un profesor prepara la plantilla
de un trabajo (tareas, bloques, fechas) y comparte un código de clase; cada grupo
entra **sin cuentas**, se reparte las tareas y registra su avance; al final el
grupo **entrega un informe** con la contribución de cada persona. El profesor
nunca ve el trabajo en curso, solo el informe entregado.

- **Guía para el profesor:** [docs/GUIA-PROFESOR.md](docs/GUIA-PROFESOR.md)
- **Puesta en marcha (Supabase + Vercel):** [docs/PUESTA-EN-MARCHA.md](docs/PUESTA-EN-MARCHA.md)
- **Contrato del proyecto y decisiones:** [CLAUDE.md](CLAUDE.md)

Producción: <https://groupy-eight.vercel.app>

## Rutas

| Ruta | Qué es |
|------|--------|
| `/` | Portada: crear proyecto, entrar con un código |
| `/dashboard` | Demo local (todo en `localStorage`, sin cuenta ni servidor) |
| `/setup` | Asistente para crear un proyecto de grupo independiente |
| `/p/<código>` | Código de **clase** (plantilla → crear/entrar en grupo) o de **grupo** (¿quién eres? → panel) |
| `/profesor` | Acceso y panel del profesor (plantillas, grupos, informes entregados) |
| `/profesor/plantilla/<id>` | Editor de plantilla |
| `/profesor/informe/<código>` | Informe entregado por un grupo |
| `/api/keepalive` | Latido diario (cron de Vercel) para que Supabase no se pause |

## Desarrollo

Requisitos: Node 20+.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Rellena `.env.local` con la URL y la *publishable key* del proyecto de Supabase.
Sin ellas, la portada y la demo local (`/dashboard`) funcionan igual; la parte en
la nube no.

```bash
npm run dev
```

Scripts:

| Script | Uso |
|--------|-----|
| `npm run dev` | Servidor de desarrollo en <http://localhost:3000> |
| `npm run build` | Build de producción (incluye comprobación de tipos) |
| `npm run lint` | ESLint |
| `npm run test:db` | Aplica **todas** las migraciones a un Postgres en memoria (PGlite) y comprueba las políticas RLS y las RPC (profesor, alumnos, extraños) |

## Stack

Next.js 16 (App Router, Server Actions; el *middleware* es `src/proxy.ts`) ·
React 19 · Tailwind v4 · dnd-kit · Supabase (Postgres + RLS, Auth anónima para
alumnos y email+contraseña para profesores, Realtime) · Zod.

## Estructura

```
src/
  app/                 rutas (App Router), iconos, manifest, cron
  components/          vistas: personal, organization, map, calendar, board,
                       team, report, teacher, cloud, setup, ui
  lib/data/            modelo, reducer, motor de flujo (flow.ts) e informe (report.ts)
  lib/data/cloud/      Server Actions, mapeo filas↔modelo, realtime, live room
  lib/supabase/        clientes de Supabase (servidor, navegador, carga diferida)
supabase/
  migrations/          esquema + RLS + RPC (aplicar con `npx supabase db push`)
  tests/db.test.mjs    pruebas de base de datos (`npm run test:db`)
```

`src/lib/supabase/database.types.ts` está escrito a mano (regenerarlo requiere
`npx supabase login`); mantenlo sincronizado al añadir migraciones.
