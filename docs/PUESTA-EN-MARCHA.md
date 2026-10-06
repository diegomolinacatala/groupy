# Puesta en marcha para el piloto — checklist técnica

Para quien administra Supabase y Vercel. Hazlo **en este orden**; en total son
unos 20 minutos. Estado a 2026-10-06: el código está listo en `main`; lo que
falta es configuración en los paneles (no se puede hacer desde el código).

## 0. Diagnóstico (2026-10-06)

- El proyecto de Supabase **GROUPY** (`etqrzekabjdtkpbeztoe`, `eu-west-1`) está
  **pausado**: su dominio ni siquiera resuelve DNS. Es la pausa automática del
  plan gratuito tras ~7 días sin actividad. Mientras siga así, **toda la parte
  en la nube falla** (profesor, códigos de clase, grupos). La demo local
  (`/dashboard`) sí funciona.
- Hay **dos migraciones nuevas** sin aplicar (entrega de informes y cambio de
  dispositivo). La app funciona sin ellas, pero esos dos botones mostrarán
  «aún no está activada en el servidor».

## 1. Reactivar Supabase

1. <https://supabase.com/dashboard> → proyecto **GROUPY** → **Restore project**.
   (Si lleva más de 90 días pausado puede no ser restaurable; entonces habría
   que crear un proyecto nuevo y aplicar todas las migraciones — ver §2 — y
   cambiar las variables de entorno de Vercel.)
2. Espera a que el estado sea **Active / Healthy**:
   ```bash
   npx supabase projects list
   ```

A partir del despliegue de este código, un **cron diario** (`/api/keepalive`,
ver `vercel.json`) hace una consulta mínima para que el proyecto **no se vuelva
a pausar** durante el piloto.

## 2. Aplicar las migraciones nuevas

Antes, comprueba que todas las migraciones pasan las pruebas (Postgres en
memoria, sin Docker):

```bash
npm run test:db
```

Debe terminar en `41 passed, 0 failed`. Después:

```bash
npx supabase link --project-ref etqrzekabjdtkpbeztoe
```

```bash
npx supabase db push
```

Aplica `20261006120000_report_delivery.sql` (RPC `submit_group_report`) y
`20261006130000_release_seat.sql` (RPC `release_member`). Ninguna modifica
tablas ni datos existentes: solo añaden funciones.

## 3. Autenticación (Supabase → Authentication)

1. **Sign In / Providers → Anonymous sign-ins: ON** (los alumnos entran así;
   ya estaba activado).
2. **Confirmación de correo del profesor** — elige una:
   - **Recomendado para el piloto:** Providers → Email → desactiva
     **«Confirm email»**. El profesor crea su cuenta y entra al momento.
   - Si se deja activada: el **SMTP por defecto de Supabase solo envía correos
     a miembros del equipo del proyecto** y con un límite de pocos correos por
     hora, así que **el correo de confirmación no le llegaría al profesor**.
     Habría que configurar un SMTP propio (Authentication → Emails → SMTP
     Settings; p. ej. Resend, Brevo…).
3. **URL Configuration:**
   - **Site URL:** `https://groupy-eight.vercel.app` (o el dominio definitivo).
   - **Redirect URLs:** añade `https://groupy-eight.vercel.app/auth/confirm`.

## 4. Vercel

1. Variables de entorno (Production):
   - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
     (las mismas de `.env.local`; ver `.env.example`).
   - Opcional: `CRON_SECRET` (cualquier cadena larga). Si existe, Vercel la
     envía al cron y nadie más puede llamar a `/api/keepalive`.
2. Despliega `main` (si el repo está conectado, basta con hacer push).
3. Comprueba en **Settings → Cron Jobs** que aparece `/api/keepalive` (diario).
4. Abre `https://groupy-eight.vercel.app/api/keepalive` → debe responder
   `{"ok":true,…}` (o 401 si pusiste `CRON_SECRET`, lo cual también es correcto).

## 5. Prueba de humo completa (con datos ficticios, ~10 min)

Usa un móvil y un ordenador. **Nada de nombres reales de alumnos** hasta que
el piloto tenga el visto bueno ético (ver §7).

1. Ordenador → `/profesor` → **Crear cuenta** con un correo de prueba → entra.
2. **Nueva plantilla** → título, fechas, instrucciones, 3–4 tareas, una
   dependencia. Recarga: todo sigue ahí.
3. Copia el **código de clase**.
4. Móvil (ventana privada) → portada → escribe el código → **Crear vuestro
   grupo** con 2–3 nombres ficticios → toca uno.
5. En el móvil: arrastra una tarea a tu nombre (**mantén pulsado** ~0,2 s para
   coger una tarea; deslizar hace scroll), márcala **Hecha**.
6. Segundo dispositivo/ventana privada → enlace del grupo → otro nombre.
   Comprueba que los cambios se ven en tiempo real en ambos.
7. Prueba el cambio de dispositivo: desde «Equipo», **Liberar acceso** de un
   compañero → ese nombre vuelve a poder elegirse.
8. Pestaña **Informe** → **Entregar**.
9. Ordenador (profesor) → `/profesor` → en el grupo aparece **Ver informe** →
   ábrelo y prueba **Descargar PDF**.
10. Confirma que el profesor **no** puede ver tareas en curso de ningún grupo
    (solo el informe entregado).

## 6. Limpieza

Datos basura de pruebas anteriores, se pueden borrar desde el panel de
Supabase (Table editor → `projects`, borra la fila; el resto cae en cascada):
plantillas/grupos `MCC57RV`, `AM5ZQ4Y`, `R88U2TB`, `4ATLB3S` y el usuario
profesor de prueba `diegomolinacatala+profe@gmail.com` (Authentication → Users).

## 7. Antes de usarlo con alumnos reales

`CLAUDE.md` deja el piloto real condicionado a requisitos que **no son de
código** y siguen abiertos:

- [ ] Profesor patrocinador confirmado (asignatura, cuatrimestre).
- [ ] Flujo de consentimiento RGPD (nombres y aportaciones son datos personales).
- [ ] Solicitud al comité de ética (`comite.etica@upv.es`).
- [ ] Decisión de alojamiento en la UE (Supabase ya está en `eu-west-1`,
      Irlanda; Vercel sirve desde su red global).

## Limitaciones conocidas (aceptadas para el piloto)

- **Suplantación dentro del grupo:** «Liberar acceso» permite que un compañero
  libere el sitio de otro y lo ocupe desde un segundo dispositivo. Cada
  liberación queda registrada en `activity_log` (`seat_released`: quién, a
  quién, cuándo). Con datos ficticios no importa; con alumnos reales conviene
  revisarlo.
- **El profesor y los códigos de grupo:** el profesor ve los códigos de los
  grupos (y también aparecen en la página pública del código de clase). En una
  ventana privada podría ocupar un sitio libre de un grupo como si fuera un
  alumno. Es anterior a esta puesta a punto; cerrarlo exige ligar cada sitio a
  un secreto del alumno.
- **Zoom en Android:** el `viewport` fija `maximum-scale=1` para que iOS no
  haga zoom al tocar cada campo; en Android eso impide ampliar con dos dedos.
- **Si un compañero libera tu sitio** mientras tienes el panel abierto, tus
  siguientes cambios no se guardan hasta que recargues y vuelvas a entrar.

## Qué cambió en esta puesta a punto (resumen técnico)

- Eliminado el easter egg del air-hockey del mapa.
- Táctil: mantener pulsado para arrastrar, deslizar para hacer scroll (antes en
  el móvil no se podía hacer scroll sobre una tarea); sin zoom automático de iOS
  en los campos; alturas `dvh` para Safari; mapa usable a 320 px.
- Rendimiento: JS del panel 186 → 110 KB gz; vistas secundarias y cliente de
  Supabase cargados bajo demanda; el proxy ya no consulta Supabase en la
  portada ni en la demo.
- Robustez: errores de red en español en vez de `TypeError: fetch failed`,
  timeout de 10 s en el servidor, pantallas de carga y de error/404 propias.
- Seguridad: Next.js 16.4.0 (corrige una vulnerabilidad crítica de 16.3.5);
  `npm audit --omit=dev` sin vulnerabilidades.
- Nuevo: entrega del informe al profesor, cambio de dispositivo, cron
  anti-pausa, icono y manifest para «Añadir a pantalla de inicio», pruebas de
  base de datos (`npm run test:db`).
