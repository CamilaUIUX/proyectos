# Finanzas — Sprint 9: "Notificaciones"

> Mapa completo de features y roadmap: `features.md` en esta misma carpeta.
> Este documento especifica **únicamente el Sprint 9**, con alcance completo
> — mismo criterio que los sprints 2–8.
>
> Última actualización: 2026-09-11 · Estado: **especificado, no construido**.
> Referencia: `Acero-Hub-ref/documentos/finanzas/sprint_9_notificaciones.md`
> (591 líneas, estado **construido**, cinco desviaciones respecto de lo
> especificado ahí, anotadas en su §0.3). Este documento arranca ya con esas
> lecciones incorporadas.
>
> ⚠️ **Es el primer sprint de Finanzas que toca infraestructura server-side
> de Supabase** (Edge Functions, `pg_cron`, `pg_net`). Del Sprint 1 al 8, la
> regla fue siempre "todo pasa por `supabase.from()` desde el cliente" — acá
> se rompe a propósito, porque es la única forma real de avisar sin que la
> app esté abierta. Confirmado con el usuario antes de escribir esto.

---

## 0. Decisiones tomadas para este sprint

| Tema | Decisión | Por qué |
|---|---|---|
| **Se adopta infraestructura nueva** | Edge Function + `pg_cron` + `pg_net`, igual que la referencia | Es la única forma de que un aviso llegue con la app cerrada — confirmado, no una decisión unilateral |
| **Sin capa de API** | Suscribirse/desuscribirse y leer/guardar preferencias son `supabase.from('fin_push_subscriptions'/'fin_notif_prefs')` directo desde `data-context.tsx` — no hay `app/api/finanzas/push/*` como en la referencia | Mismo criterio que los 8 sprints anteriores: no hay 50 puntos de llamada que puedan desincronizarse, hay un archivo |
| **La PWA ya existe entera** | `app/finanzas/manifest/route.ts` (standalone, íconos, `apple-touch-icon`), `public/finanzas/sw.js` (service worker registrado con scope `/finanzas/`) — y ese `sw.js` **ya tiene** el `addEventListener('push', …)` y el `addEventListener('notificationclick', …)` completos, escritos en el Sprint 1 a propósito para este día | La referencia construyó toda "la mitad PWA" desde cero (§5 de su doc: "no existe nada de esto"). Acá ese trabajo ya está hecho — el sprint se reduce a la mitad que falta: quién se suscribe, y quién manda |
| **5 tipos, no 6** | Fijos y cuotas · Presupuesto · Ahorro · Deudas · Recordar anotar | Sin Pasanaku (descartado en Sprint 5) — el sexto tipo de la referencia (cuota de Pasanaku) no tiene equivalente acá |
| **"Fijos y cuotas" cubre dos fuentes** | Un fijo (`fin_recurring`) que vence, **y** una cuota de plan (`fin_debts` con `plan_id`) que vence — cada una con su propio `dedupe_key` (§4.2) | Es lo que hacía la referencia también (su fila de la tabla dice "ídem cuota de plan") — un plan de pago es, para este propósito, otro tipo de vencimiento, no una deuda suelta |
| **"Deudas" son solo las sueltas** | `plan_id is null` — una cuota de plan ya se avisa por el tipo de arriba | Evita mandar dos avisos distintos por la misma fila; coincide con la distinción que ya traza `dueDebtUsd` en `debts.ts` |
| **`notify` por perfil: columna nueva en `fin_profiles`** | `alter table fin_profiles add column notify boolean not null default true` | Un booleano por perfil no necesita tabla aparte — mismo criterio que la referencia (§3.2) |
| **Excepción puntual a "sin perfil en la URL"** | El Sprint 8 decidió no meter el perfil en la URL (§2 de ese doc: "no hay un router que lo necesite"). Acá sí hace falta, pero acotado: la `url` de un aviso lleva `?p={profileId}` **solo** cuando el aviso no es del perfil activo, y un hook chico lo lee una vez al montar, llama `switchProfile`, y limpia el parámetro. Nunca aparece en un link interno de la app | Sin esto, tocar el aviso de "Alquiler venció · Acros Software LLC" abriría Fijos en el perfil personal, sin el fijo por ningún lado — el mismo problema que la referencia resolvió en su §4.4 |
| **El secreto del cron vive en Vault** | `FIN_CRON_SECRET`, no la service role key — igual que el arreglo que la referencia tuvo que hacer en su propia auditoría (§0.3 a) | Si se filtra, lo peor que permite es pedir que se evalúen notificaciones — no da acceso a la base |
| **`pg_net` en su propio esquema `net`** | `create extension pg_net with schema extensions` de cualquier modo, pero las funciones quedan en `net.http_post(…)`, no en `extensions.net.…` | Hallazgo ya hecho por la referencia (§0.3 b) — evita un ciclo de debugging repetido |
| **Timeout de `pg_net` a 60s** | El default son 5 | La referencia midió ~4s de evaluación con varios perfiles cargados — 5s corta corridas a la mitad. Se adopta su número medido, no una suposición nueva |
| **El aviso se registra aunque el envío falle** | Excepto 404/410 (el dispositivo dejó de existir → se borra la suscripción) | Reintentar un 5xx mandaría el mismo aviso de nuevo en 15 minutos — la forma más rápida de que alguien apague las notificaciones para siempre (razonamiento de la referencia, §0.3 d, adoptado tal cual) |
| **Sin suite de tests automatizada** | Este hub no tiene los suites `unit`/`api`/`db` que sí tiene la referencia (745+202+662 pruebas). La verificación #11 de la referencia ("el bridge a Deno está al día, si no falla la suite") se reemplaza por un **checklist manual** antes de cada deploy que toque `lib/finanzas/` o la Edge Function | No hay infraestructura de test que extender — mismo hub, misma limitación que ya aceptaron los sprints 1–8 (verificación por `tsc`/`build`/`eslint`/smoke manual) |
| **El recordatorio de anotar es incondicional** | Llega a las dos horas configuradas, anotaste o no | Mismo razonamiento que la referencia (§4.6): condicionarlo agrega una consulta y una definición de "ya anotaste" ambigua, a cambio de un aviso menos predecible. Si molesta, es una condición que se agrega después, no un rediseño |

### 0.1 Divergencias deliberadas con la referencia — resumen

1. **Sin `app/api/finanzas/push/*`** — las tres rutas de la referencia
   (`subscribe`, `prefs`) se reemplazan por mutaciones de
   `data-context.tsx`. La única pieza server-side real es la Edge Function,
   y esa la invoca únicamente `pg_cron` — el cliente nunca la llama.
2. **Sin `app/manifest.ts` ni `public/sw.js` nuevos** — ya existen, con
   scope `/finanzas/`, del Sprint 1. Este sprint no toca la mitad PWA.
3. **Sin Pasanaku** — 5 tipos, no 6; "Fijos y cuotas" absorbe las cuotas de
   plan de pago en vez de un tipo aparte.
4. **`?p=` en la URL del aviso** — la única excepción a la regla de Sprint 8
   de no meter el perfil en la URL, acotada a este único flujo de entrada.
5. **Sin script de CI que compare hashes** — el bridge a Deno
   (`scripts/build-edge-shared.mjs`) se corre a mano antes de deployar la
   Edge Function; no hay suite `unit` que lo automatice.
6. **`fin_notif_prefs`/`fin_push_subscriptions` referencian `public.profiles`,
   no `auth.users`** — mismo patrón que las 15 tablas `fin_*` anteriores de
   este esquema.

---

## 1. Objetivo del sprint

> **Que la app avise sin que la abras — un fijo por vencer, un presupuesto
> al límite, una deuda vieja, un mes de ahorro sin repartir — al celular y a
> la computadora, diciendo de qué perfil sale cada aviso.**

### Definición de "terminado"

- [ ] Se puede activar el push desde Ajustes en iPhone, Android y escritorio
- [ ] En iPhone sin la app instalada en la pantalla de inicio, el botón de
      activar no aparece — aparecen las instrucciones para instalarla
- [ ] Los cinco tipos llegan cuando corresponde, cada uno con su switch en
      Ajustes
- [ ] Ningún aviso llega dos veces, corra el job las veces que corra
- [ ] Cada aviso dice de qué perfil es; un perfil con `notify = false` no
      manda ninguno
- [ ] Tocar un aviso abre la pantalla que corresponde, cambiando de perfil
      solo si hace falta
- [ ] La lógica de "cuándo avisar" es la misma que ya usa la app
      (`lib/finanzas/`), nunca una copia
- [ ] `npm run build`, `npx tsc --noEmit` y `eslint` pasan sin errores

---

## 2. Alcance

### Entra

- Tres tablas nuevas (`fin_push_subscriptions`, `fin_notif_prefs`,
  `fin_notifications`) + columna `notify` en `fin_profiles`.
- `supabase/functions/finanzas-notificaciones` — evalúa los cinco tipos y
  manda, programada con `pg_cron` cada 15 minutos.
- El puente que compila `lib/finanzas/` para que la Edge Function lo importe
  sin reescribir ninguna decisión.
- Pantalla **Ajustes → Notificaciones**: activar/desactivar en este
  dispositivo, un switch por tipo con un ejemplo de texto, los dos horarios
  del recordatorio.
- Switch **"Notificar este perfil"** dentro de `<ProfileSheet>`.
- Deep link con cambio de perfil automático al tocar un aviso ajeno al
  activo.

### No entra en este sprint

| Fuera | Por qué |
|---|---|
| **Email** | El canal elegido es push. Se puede reconsiderar después, no ahora |
| **Panel de avisos dentro de la app** | Con push al momento, una bandeja aparte es otra cosa que mantener sin una pregunta que responda |
| **Resumen diario** | Los avisos van al momento, no agrupados |
| **Umbrales configurables** | Quedan fijos: 2 días, 90%/100%, 30 días. Están en un solo módulo (`lib/finanzas/notifications.ts`) para que hacerlos configurables después sea mover de dónde se leen, no rediseñar |
| **Notificaciones entre usuarios** | Sigue habiendo un solo usuario dueño de todos sus perfiles |
| **Reportes / Fondo de crecimiento / Reglas y automatismos** | Siguen congeladas — este sprint no las destraba, solo dejan `pg_cron`/`pg_net` montados para cuando vuelvan |

---

## 3. Modelo de datos

Tres tablas nuevas + una columna, en una sección nueva **§19** de
`supabase/schema.sql` (idempotente, re-pegable entera, mismo criterio que
§11–18).

### 3.1 `fin_push_subscriptions` — un dispositivo que aceptó recibir

```sql
create table if not exists public.fin_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,

  -- El endpoint ES la identidad del dispositivo para el navegador. Reinstalar
  -- la PWA genera uno nuevo; reactivar en el mismo navegador devuelve el
  -- mismo endpoint — sin este unique, cada visita a Ajustes sumaría una fila.
  unique (endpoint)
);
create index if not exists fin_push_subs_user_idx
  on public.fin_push_subscriptions (user_id);
```

**Es del usuario, no del perfil.** Un dispositivo recibe los avisos de todos
los perfiles que tengan `notify = true` — el perfil se decide al evaluar
cada aviso (§3.2), no al suscribirse. El cliente escribe acá directo con
`upsert(..., { onConflict: 'endpoint' })` — sin ruta API.

### 3.2 Preferencias: por usuario y por perfil

**Por usuario, qué tipos quiere** (el switch de Ajustes):

```sql
create table if not exists public.fin_notif_prefs (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  fijos              boolean not null default true,
  presupuesto        boolean not null default true,
  ahorro             boolean not null default true,
  deudas             boolean not null default true,
  recordar_anotar    boolean not null default true,
  -- Los dos horarios del recordatorio (§4.6), hora LOCAL del usuario.
  recordar_mediodia  time not null default '14:00',
  recordar_noche     time not null default '21:00',
  -- Sin esto, alguien en Bolivia recibe el de la noche a las 17:00 (el job
  -- corre en UTC) — mismo problema que ya resolvieron los sprints 6 y 7
  -- pasando `today` desde el cliente.
  timezone           text not null default 'America/La_Paz',
  updated_at         timestamptz not null default now()
);

drop trigger if exists fin_notif_prefs_touch_updated_at on public.fin_notif_prefs;
create trigger fin_notif_prefs_touch_updated_at
  before update on public.fin_notif_prefs
  for each row execute function public.touch_updated_at();
```

**Por perfil, si notifica o no**:

```sql
alter table public.fin_profiles add column if not exists notify boolean not null default true;
```

Los dos niveles se combinan con **y**: un aviso se manda si su tipo está
encendido en `fin_notif_prefs` **y** el perfil del que sale tiene
`notify = true`. El recordatorio de anotar no tiene perfil (§4.6), así que
solo mira `fin_notif_prefs.recordar_anotar`.

### 3.3 `fin_notifications` — lo que ya se mandó

```sql
create table if not exists public.fin_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  profile_id  uuid references public.fin_profiles(id) on delete cascade,
  kind        text not null check (kind in ('fijos', 'presupuesto', 'ahorro', 'deudas', 'recordar_anotar')),
  -- La identidad del HECHO, no del aviso — ver §4.2 para el formato de cada
  -- tipo. Es lo que evita que un job cada 15 minutos avise 96 veces al día
  -- de lo mismo.
  dedupe_key  text not null,
  title       text not null,
  body        text not null,
  url         text,
  sent_at     timestamptz not null default now(),

  unique (user_id, dedupe_key)
);
create index if not exists fin_notifications_user_idx
  on public.fin_notifications (user_id, sent_at desc);
```

`profile_id` es nullable a propósito: el recordatorio de anotar no sale de
ningún perfil. Se escribe desde la Edge Function con la **service role
key** (salta RLS — es un registro del sistema, no algo que el usuario
cree); su policy de `select` existe igual, por si algún día se muestra el
historial dentro de la app.

### 3.4 RLS

Las tres tablas con las 4 policies de siempre contra `user_id = auth.uid()`.
`fin_notifications` no necesita `insert`/`update` para el usuario — se
escriben solo desde la Edge Function.

### 3.5 Extensiones y el job

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;
```

⚠️ Sus funciones NO quedan en `extensions.*` — `pg_net` crea su propio
esquema `net` (`net.http_post(…)`), no importa con qué `schema` se haya
creado la extensión (§0, hallazgo ya hecho por la referencia).

```sql
select cron.schedule(
  'finanzas-notificaciones',
  '*/15 * * * *',
  $$
  select net.http_post(
    url      := '<https://TU_REF.supabase.co>/functions/v1/finanzas-notificaciones',
    headers  := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fin_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
```

El secreto se lee de **Vault** en tiempo de ejecución, no se escribe en el
`command` del job — quedaría en texto plano en `cron.job` y en el historial
de git. Guardarlo ahí (`select vault.create_secret('...', 'fin_cron_secret')`)
es un paso manual antes de correr esta migración, no algo que la migración
pueda hacer sola.

### 3.6 La migración en orden

1. Las tres tablas + RLS (§3.1–§3.4).
2. `alter table fin_profiles add column notify` (§3.2).
3. Extensiones (§3.5) — **verificar antes que estén disponibles en el
   proyecto** (se habilitan por proyecto, no vienen dadas).
4. El secreto en Vault (manual, una vez).
5. El `cron.schedule` (§3.5) — solo después de que la Edge Function ya esté
   deployada, si no el primer disparo pega contra una URL que no existe
   todavía.

---

## 4. Reglas de negocio

### 4.1 El aviso se calcula, no se guarda

Ningún tipo agrega una columna de estado a las tablas del dominio. El job
**recalcula** con las mismas funciones que usa la app y compara contra
`fin_notifications` para saber qué es nuevo — mismo principio que el saldo
de una cuenta (Sprint 1) o el estado de un plan de ahorro (Sprint 6):
derivado, nunca guardado. Un `ya_avisado` en `fin_recurring` se
desincronizaría el día que alguien edite el fijo, sin que nadie se entere.

### 4.2 Los cinco tipos

Todo lo que decide "¿corresponde avisar?" ya existe en `lib/finanzas/`. Lo
nuevo es un módulo — `lib/finanzas/notifications.ts` — que **compone** esas
funciones para decidir el umbral y arma el texto; no reimplementa ninguna
decisión que la app ya toma.

| Tipo | Cuándo | De dónde sale | `dedupe_key` |
|---|---|---|---|
| **Fijos** | `recurringStatus(recurring, allTx, todayISO)` devuelve `vencido`, o vence en ≤2 días | `recurring.ts` | `fijo:{recurring_id}:{período}` |
| **Cuotas de plan** | Una fila de `fin_debts` con `plan_id` no nulo y `status='pendiente'`: `daysBetween(todayISO, incurred_on)` vencida o ≤2 días — mismo criterio que ya usa `dueDebtUsd` | `debts.ts` (`daysBetween`) | `cuota:{debt_id}` (una sola vez — la cuota no se repite) |
| **Presupuesto — umbral** | `gastoRealForCategories(...).amountUsd / effectiveAmount(...).amountUsd` ≥ 0.9 (90%) o ≥ 1 (pasado) | `budgets.ts` (`gastoRealForCategories`, `effectiveAmount`) | `presu:{line_id}:{período}:{90\|100}` |
| **Presupuesto — cierre** | `needsClosure(line, closures, todayISO)` devuelve al menos un período | `budgets.ts` | `cierre:{line_id}:{período}` |
| **Ahorro — sobrante** | `pendingSavingsPeriod(todayISO)` señala un mes cerrado sin repartir, y `surplusUsd(...)` de ese mes es positivo | `savings.ts` | `ahorro-sobrante:{período}` |
| **Ahorro — meta** | `goalReached(balanceUsd, targetUsd)` pasa a `true` | `savings.ts` | `ahorro-meta:{goal_id}` (una sola vez por meta) |
| **Deudas** | Una deuda **suelta** (`plan_id is null`, `status='pendiente'`) cumple 30 días desde `incurred_on` | `debts.ts` (`daysBetween`) | `deuda:{debt_id}:30d` |
| **Recordar anotar** | A las dos horas configuradas (§4.6) | — | `anotar:{fecha}:{mediodia\|noche}` |

**Por qué el período va en la mayoría de las claves:** un fijo vence todos
los meses — sin el período, el aviso de septiembre nunca saldría porque el
de agosto ya está en la tabla. Una cuota de plan o una meta de ahorro NO se
repiten (una cuota vence una vez; una meta se cumple una vez), así que su
clave no lleva período — si se retira plata de una meta ya cumplida y se
vuelve a alcanzar después, no se avisa una segunda vez; es una
simplificación aceptada, no un caso que valga la pena resolver ahora.

**Los umbrales son fijos** — 2 días, 90%/100%, 30 días — viven todos en
`notifications.ts` para que convertirlos en configurables después sea mover
de dónde se leen, no rediseñar.

### 4.3 "Al momento" es cada 15 minutos

Ninguno de los ocho disparadores de arriba cambia de estado dentro del
minuto: un fijo vence un día entero; un presupuesto se pasa cuando
registrás un gasto —y ahí la app ya te lo muestra en pantalla, el push es
para cuando no la tenés abierta—; el recordatorio tiene hora fija. Correr
cada minuto despertaría la función 1.440 veces por día para que en 1.439 no
haya nada que hacer. Que el job sea idempotente (§3.3, `unique(user_id,
dedupe_key)`) es lo que permite subir o bajar esa frecuencia después sin
tocar nada más.

### 4.4 Un aviso, un toque, una pantalla

| Tipo | Abre |
|---|---|
| Fijos / cuotas de plan | `/finanzas/fijos` (fijo) o `/finanzas/deudas` (cuota de plan) |
| Presupuesto | `/finanzas/presupuesto` |
| Ahorro | `/finanzas/ahorro` |
| Deudas | `/finanzas/deudas` |
| Recordar anotar | `/finanzas` — el quick-add se abre solo (ver §4.6 de `sprint-1-movimientos.md` sobre `openQuickAdd`) |

Si el aviso es de un perfil que no es el activo, la `url` lleva `?p={profile_id}`
agregado (§0). Un hook chico, montado una vez en `<FzRoot>` (mismo lugar que
ya lee `activeAccent`), revisa el parámetro al montar: si difiere del
`activeProfileId` actual, llama `switchProfile(id)` y limpia el parámetro de
la URL con `router.replace`. Sin esto, tocar "Alquiler venció · Acros
Software LLC" dejaría mirando el perfil personal, sin el fijo por ningún
lado — exactamente el problema que la referencia resolvió en su propio
§4.4.

### 4.5 El texto

Corto, concreto, con el número adelante. Sin signos de admiración: un aviso
de plata que grita se apaga rápido.

| Tipo | Título | Cuerpo |
|---|---|---|
| Fijo vencido | `Alquiler venció` | `Bs 2.100 · vencía el 5 · Acros Software LLC` |
| Fijo por vencer | `Spotify vence en 2 días` | `$5,99 · Personal` |
| Cuota de plan vencida | `Cuota 3 de Préstamo Ana venció` | `$150 · vencía el 5 · Personal` |
| Presupuesto al 90% | `Comida al 90%` | `Te quedan $32 de $320 · Personal` |
| Presupuesto pasado | `Te pasaste en Comida` | `$38 por encima de $320 · Personal` |
| Cierre pendiente | `Agosto quedó sin cerrar` | `Decidí qué hacer con lo que sobró · Personal` |
| Sobrante sin repartir | `Te sobraron $214 en agosto` | `Sin repartir entre tus ahorros · Personal` |
| Meta cumplida | `Viaje llegó a su meta` | `$1.200 de $1.200 · Personal` |
| Deuda vieja | `Ana te debe hace 30 días` | `$20 · Le presté para el pasaje · Personal` |
| Recordar anotar | `¿Gastaste algo hoy?` | `Anotalo antes de que se te olvide` |

**El nombre del perfil va al final del cuerpo**, después de un `·`. Se lee
último porque casi siempre hay uno solo activo, pero está cuando hace
falta — mismo criterio que ya usa el título del quick-add desde el Sprint 8.
El recordatorio de anotar no lleva perfil (§4.6).

### 4.6 El recordatorio de anotar

Dos por día, a las horas configuradas, **siempre** — anotaste o no. Se
evaluó hacerlo condicional (que no llegue si ya registraste algo) y se
eligió lo simple a propósito: el costo aceptado es recibir a veces un
recordatorio de algo que ya hiciste; a cambio, el aviso es predecible y no
depende de definir qué cuenta como "ya anotaste" con varios perfiles
activos. Si con el uso resulta molesto, condicionarlo es agregar un filtro
al job, no rediseñar nada.

**El horario es del usuario, no del servidor.** El job corre en UTC; se
convierte con `timezone` (§3.2) — mismo problema que ya resolvieron los
Sprints 6 y 7 pasando `today` desde el cliente en vez de confiar en la hora
del servidor.

**No lleva perfil.** Es un recordatorio de hábito, no un hecho financiero de
un cajón en particular — mandarlo una vez por perfil sería avisar varias
veces lo mismo.

### 4.7 Cuando un dispositivo deja de existir

`web-push` devuelve 404 o 410 cuando la suscripción murió (desinstalaron la
PWA, limpiaron datos del navegador, expiró). Esa fila se borra en el
momento — sin esto la tabla se llena de endpoints muertos y cada corrida
gasta llamadas en ellos. Cualquier otro error (red, 5xx) no borra nada: se
reintenta en la corrida siguiente, 15 minutos después.

---

## 5. Estructura de archivos

### Nuevos — Supabase

| Archivo | Qué hace |
|---|---|
| `supabase/config.toml` | `verify_jwt = false` para la función del cron — no existe todavía en este repo |
| `supabase/functions/_shared/push.ts` | `web-push` + claves VAPID leídas de env, ~70 líneas — mismo patrón documentado por la referencia (§0.1), escrito de cero acá (no hay CRM del que copiar) |
| `supabase/functions/_shared/internal-auth.ts` | `requireInternal`: compara el header `x-cron-secret` contra `FIN_CRON_SECRET` |
| `supabase/functions/finanzas-notificaciones/index.ts` | Evalúa los cinco tipos (vía el bridge de abajo) y manda |
| `supabase/functions/_shared/finanzas/` | Copia generada de `lib/finanzas/` — no se edita a mano, la regenera el script de abajo |
| `scripts/build-edge-shared.mjs` | Copia `lib/finanzas/*.ts` a `_shared/finanzas/`, reescribiendo `from './x'` → `from './x.ts'` y el import de tipo de `SupabaseClient` a `https://esm.sh/@supabase/supabase-js@2` |

### Nuevos — la app

| Archivo | Qué hace |
|---|---|
| `lib/finanzas/notifications.ts` | Los ocho evaluadores de §4.2 + los umbrales + los textos de §4.5. Puro, sin red — se puede probar con datos de prueba a mano, igual que el resto de `lib/finanzas/` |
| `app/finanzas/components/push-setup.tsx` | Pedir permiso, `pushManager.subscribe()`, guardar en `fin_push_subscriptions`; detecta iOS-no-instalado y permiso-bloqueado (§7 de este doc) |
| `app/finanzas/ajustes/page.tsx` (`NotificacionesPanel`, sección nueva) | Estado del dispositivo (`<PushSetup>`), switch por tipo con ejemplo, los dos horarios — mismo patrón que `ProfilesPanel`/`PersonasPanel`, no una ruta nueva (corrección de implementación: §5 decía originalmente `ajustes/notificaciones/page.tsx`, pero "Ajustes → Perfiles" del Sprint 8 tampoco es una ruta — es una sección en la misma página) |

### Modificados

| Archivo | Cambio |
|---|---|
| `supabase/schema.sql` | Sección **§19** nueva |
| `lib/finanzas/types.ts` | `notify` en `FinProfile`; `NotifPrefs`, `PushSubscriptionRow` |
| `app/finanzas/components/data-context.tsx` | `notifPrefs`, `pushSubscribed` (de este dispositivo) en el estado; `subscribeToPush`/`unsubscribeFromPush`/`updateNotifPrefs`; `notify` se suma al payload de `createProfile`/`updateProfile` |
| `app/finanzas/components/profile-sheet.tsx` | Switch "Notificar este perfil" |
| `app/finanzas/components/shell.tsx` (`FzRoot`) | El hook que lee `?p=` y cambia de perfil al abrir un aviso ajeno (§4.4) |
| `app/finanzas/ajustes/page.tsx` | Fila/link a Notificaciones |
| `public/finanzas/sw.js` | **Sin cambios de código** — ya tiene `push`/`notificationclick`; se revisa que el `data.url` que arma la Edge Function siga el contrato que el listener ya espera |

### 5.1 Regla de independencia

`lib/finanzas/notifications.ts` sigue la misma regla que el resto de
`lib/finanzas/` (sprint-1 §5.1): sin imports de `next/*` ni del alias `@/`.
Es lo que permite que el bridge del script lo copie a Deno sin tocar una
línea de lógica, solo la ruta de los imports.

---

## 6. Cómo se leen y escriben los datos

Para todo lo que toca el cliente, mismo patrón que los Sprints 1–8: sin
rutas API, `supabase.from('fin_...')` directo desde `data-context.tsx`, RLS
como la barrera real.

- **Suscribirse** (`subscribeToPush`): pide permiso al navegador, obtiene la
  `PushSubscription`, la manda con `supabase.from('fin_push_subscriptions').upsert(..., { onConflict: 'endpoint' })`.
- **Desuscribirse en este dispositivo** (`unsubscribeFromPush`): `.delete().eq('endpoint', thisEndpoint)`.
- **Leer/guardar preferencias**: `select().eq('user_id', user.id).maybeSingle()` /
  `upsert({ user_id: user.id, ...patch })`.
- **El switch por perfil**: viaja en el mismo `update`/`insert` que ya usan
  `updateProfile`/`createProfile` — un campo más, como `profile_id` lo fue
  en el Sprint 8.

Lo único que **no** pasa por `data-context.tsx` es la Edge Function: la
invoca solo `pg_cron` vía `pg_net`, nunca el cliente. Adentro:

1. Trae todos los usuarios con al menos un tipo de aviso encendido (join
   `fin_notif_prefs` + `fin_profiles` + `fin_push_subscriptions`).
2. Por cada usuario, corre los ocho evaluadores de §4.2 con los mismos datos
   que ya carga `load()` (una consulta más ancha, sin filtrar por
   `profile_id` — la Edge Function sí necesita ver todos los perfiles de un
   usuario a la vez).
3. Descarta lo que ya está en `fin_notifications` (`dedupe_key`).
4. Manda lo que queda con `_shared/push.ts`, registra cada intento en
   `fin_notifications` (§4.1/§4.7 sobre qué hacer si falla).

---

## 7. Antes de escribir la primera línea de código

A diferencia de los sprints 1–8, esto no se resuelve pegando SQL en el SQL
Editor y listo:

1. **Confirmar que `pg_cron` y `pg_net` están habilitados** en el proyecto
   de Supabase del hub (`ovrtiqxxzpulertzdwnt`/el que corresponda) —
   Database → Extensions. Se habilitan por proyecto, no vienen dados.
2. **Instalar y linkear el Supabase CLI** (`supabase link`) — es la primera
   vez que este repo despliega una Edge Function; hasta ahora todo el
   trabajo de Supabase fue pegar SQL a mano.
3. **Generar las claves VAPID** (`npx web-push generate-vapid-keys` o
   equivalente) y guardarlas como secretos de la Edge Function
   (`supabase secrets set`), nunca en `.env.local` del lado del cliente
   salvo la pública.
4. **Crear el secreto `fin_cron_secret` en Vault** (§3.5) antes de correr la
   migración que programa el cron.
5. **Correr `scripts/build-edge-shared.mjs` antes de cada deploy** que toque
   `lib/finanzas/` — sin suite de tests que lo fuerce (§0), es disciplina
   manual, no automática. Vale la pena anotarlo en el propio script como
   advertencia al correrlo.

Ningún paso de este bloque es opcional para que el sprint funcione de
verdad — a diferencia de sprints anteriores, donde "todavía no corriste la
migración" dejaba la app funcionando igual salvo por lo nuevo.

---

## 8. Qué desbloquea

| Qué | Cómo se apoya |
|---|---|
| **Cualquier trabajo programado del hub** | `pg_cron` + `pg_net` quedan montados — el refresco de cotizaciones (Sprint 1) podría dejar de depender de que alguien tenga la pestaña abierta y correr solo, sin pelear por el único cron slot de Vercel |
| **Edge Functions con la lógica de Finanzas** | El puente de `lib/finanzas/` a Deno sirve para cualquier función futura que lo necesite, no solo esta |
| **Reportes** (Feature 8, congelada) | Si vuelve, ya hay dónde correr un cálculo pesado fuera del request del usuario |
| **Perfiles** (Sprint 8) | Cada aviso ya sabe de qué perfil es y puede abrir la app ahí — es exactamente lo que ese sprint dejó pendiente en su propio §8 |

⚠️ **`vercel.json` no se toca.** Sigue con un solo cron diario — el trabajo
de este sprint corre por completo adentro de Supabase, no en Vercel.

---

## 10. Changelog de desarrollo

Construido de punta a punta en la misma sesión que este documento. Dos
capas muy distintas en cuánto se pudo verificar:

**Verificado de verdad** (`tsc`/`build`/`eslint` en verde, dev server
sirviendo las rutas sin errores): todo el lado del cliente — schema §19,
`lib/finanzas/notifications.ts` (los 8 evaluadores + `DEFAULT_NOTIF_PREFS`),
`data-context.tsx` (`notifPrefs`/`pushSubscriptions` + las 3 mutaciones +
`notify` en las mutaciones de perfil), `<PushSetup>`, `<ProfileDeepLink>` en
`shell.tsx`, el switch en `<ProfileSheet>`, `<NotificacionesPanel>` en
Ajustes. Generé las claves VAPID reales (`npx web-push generate-vapid-keys`)
y guardé la pública en `.env.local`.

**Sin poder verificar** (no hay Deno instalado en este entorno, y desplegar
una Edge Function requiere el CLI de Supabase linkeado con las credenciales
del usuario): `supabase/functions/finanzas-notificaciones/index.ts`,
`_shared/push.ts`, `_shared/internal-auth.ts`. Están escritos completos y
revisados a mano línea por línea, pero **nunca corrieron** — ni siquiera un
`deno check` de sintaxis. `tsconfig.json` tuvo que excluir
`supabase/functions/` (agregué la línea) porque el `tsc` de la app Next no
entiende `Deno.*`, los imports `npm:`/`https://esm.sh/`, ni la extensión
`.ts` explícita que Deno exige — es la misma segregación que la referencia
resuelve con su propio `deno check` en CI, que este hub no tiene.

### Un bug real encontrado y corregido antes de terminar

**El `?p={profileId}` de §4.4 nunca se agregaba a ninguna URL.** Escribí
`<ProfileDeepLink>` (el hook que lee el parámetro y cambia de perfil) y los
8 evaluadores por separado, y cada uno asumía que el otro ya hacía su parte
— los evaluadores devolvían `url: '/finanzas/fijos'` a secas, sin el
parámetro que el hook necesita para saber que hay que cambiar de perfil.
Sin este arreglo, CUALQUIER aviso de un perfil que no fuera el activo habría
abierto la pantalla correcta pero en el perfil equivocado — exactamente el
bug que §4.4 existe para evitar. Encontrado releyendo el archivo completo
antes de considerar el sprint terminado, no por una prueba (no hay cómo
probarlo sin desplegar). Arreglado con un helper (`withProfileParam`) usado
en los 9 lugares que arman una `url` — 8 evaluadores más la excepción
correcta de "recordar anotar", que nunca lleva perfil.

### Otro hallazgo de la misma pasada: las tasas de cambio

`evaluateAhorro`/`targetAmountUsd` necesitan un `RatesMap` para convertir la
meta de un ahorro (en su moneda nativa) a USD. Mi primer borrador de la
Edge Function armaba un mapa falso (`{USD:1, BOB:1, ...}`) — habría hecho
que el aviso de "meta cumplida" mostrara mal el monto para cualquier meta
que no fuera en dólares. Arreglado consultando `fin_rates` de ese usuario y
reusando `buildRatesMap()` de `rates.ts` (bridgeado, no reimplementado) —
mismo patrón que ya usa `load()` en `data-context.tsx`.

### Una corrección al propio documento

§5 decía que la pantalla de Notificaciones sería una ruta nueva
(`app/finanzas/ajustes/notificaciones/page.tsx`). Al construirla noté que
eso no es lo que hace "Ajustes → Perfiles" del Sprint 8 (una sección en la
misma página, `ProfilesPanel`) — construí `NotificacionesPanel` con el mismo
criterio, sin ruta nueva. Corregido en §5 más arriba.

### Lo que falta para que esto funcione de verdad

Todo lo de §7, en orden — nada de esto lo puede hacer una sesión sin acceso
al proyecto real de Supabase:

1. Confirmar `pg_cron`/`pg_net` habilitados en el proyecto.
2. `supabase link` (primera vez que este repo usa el CLI).
3. `supabase secrets set FINANZAS_VAPID_PUBLIC_KEY=... FINANZAS_VAPID_PRIVATE_KEY=... FINANZAS_VAPID_SUBJECT=mailto:...` — la clave pública generada es la misma que ya quedó en `.env.local` (`NEXT_PUBLIC_FINANZAS_VAPID_KEY`); la privada NUNCA se escribió a un archivo, solo se mostró en la terminal al generarla.
4. Correr la §19 de `schema.sql` (con las §15–18 pendientes si todavía no corrieron, señaladas en los sprints anteriores).
5. `select vault.create_secret('<un secreto random>', 'fin_cron_secret')`.
6. `node scripts/build-edge-shared.mjs` (ya lo corrí una vez en esta sesión para confirmar que compila — hay que volver a correrlo si `lib/finanzas/` cambia antes del deploy real) + `supabase functions deploy finanzas-notificaciones`.
7. Reemplazar `<TU_REF>` en el `cron.schedule` de §19.7 por la referencia real del proyecto, y recién ahí correr esa sección.
8. Smoke test manual — activar en un dispositivo, forzar una de las condiciones (ej. un fijo vencido) y confirmar que llega.

Ningún paso de esta lista es opcional ni se puede saltar en una sesión sin
las credenciales del proyecto — a diferencia de los sprints 1–8, donde todo
el trabajo pendiente era "pegar esto en el SQL Editor".

---

## 11. Revisión contra el clon (2026-09-11) — 6 bugs + confirmaciones

A diferencia de los sprints 1–8, la referencia no tiene una sección de
"bugs encontrados después de construir" para Notificaciones — su §0.3 son
desviaciones encontradas **mientras lo construían**, no una revisión
posterior. Esta revisión usó esa lista como checklist (¿quedó todo
incorporado?) y, sobre todo, una lectura línea por línea de cada archivo
nuevo — la mitad de lo que hay en el Edge Function nunca corrió ni un
`deno check`, así que la única red que existe es leer con cuidado.

### Bugs corregidos

1. **⚠️ El sobrante de ahorro se mezclaba entre perfiles.** `evaluateAhorro`
   agrupaba las METAS por perfil correctamente, pero calculaba
   `surplusUsd`/`savingsBalancesUsd` sobre el `allTx` COMPLETO — todos los
   perfiles del usuario juntos, no solo el que se estaba evaluando.
   `savingsBalancesUsd` es segura igual (agrupa por `goal_id`, que ya
   resuelve a un solo perfil), pero `surplusUsd` es una suma ciega de
   ingreso/gasto/aportes sin ningún id de por medio. Con dos perfiles, uno
   con superávit y otro en rojo, el aviso de "sobrante sin repartir" de
   AMBOS habría mostrado el mismo número mezclado — justo la clase de fuga
   entre perfiles que el Sprint 8 existe para evitar. Arreglado filtrando
   `allTx` por `profile_id` antes de las dos llamadas, dentro del loop por
   perfil.
2. **La clave de esa misma notificación no distinguía perfiles.**
   Consecuencia directa del bug 1: `dedupe_key: 'ahorro-sobrante:{período}'`
   no llevaba el perfil. Con dos perfiles con sobrante en el mismo mes, el
   segundo candidato chocaba contra el `unique(user_id, dedupe_key)` que el
   primero ya había insertado — se leía como "ya se mandó" y ese perfil se
   quedaba sin avisar, para siempre (la fila ya existe, ninguna corrida
   futura la vuelve a intentar). Arreglado agregando `profileId` a la clave.
3. **⚠️ "Hoy" era el del servidor, no el del usuario.** La función calculaba
   un solo `todayISO` global, de la fecha UTC del momento en que corre el
   cron, y lo usaba para TODOS los usuarios sin importar su zona horaria —
   exactamente el problema que ya resolvieron los Sprints 6 y 7 pasando
   `today` desde el cliente en vez de confiar en el servidor. Acá no hay
   cliente (es un job programado), pero sí hay `prefs.timezone` por usuario.
   Cerca de la medianoche UTC (para Bolivia, desde las 20:00 hora local) todo
   evaluador que recibe `todayISO` — vencimientos de fijos y cuotas, el
   período vigente de presupuesto, el mes pendiente de ahorro, la antigüedad
   de una deuda — habría evaluado contra el día equivocado durante varias
   horas todos los días. Arreglado con `localDateISO()` (nuevo, mismo patrón
   `Intl` que ya usaba `localHHMM`), calculado una vez por usuario con SU
   `timezone`, no una vez por corrida con la del servidor.
4. **El horario del recordatorio se habría visto en blanco en Ajustes.**
   `fin_notif_prefs.recordar_mediodia`/`recordar_noche` son `time` en
   Postgres — PostgREST los devuelve como `"14:00:00"`, con segundos. El
   `<input type="time" step={900}>` de `<NotificacionesPanel>` exige
   exactamente `"HH:MM"`; con segundos de más, un navegador estricto
   muestra el campo vacío en vez del horario ya guardado — el usuario vería
   su elección "perdida" después de guardar, aunque en la base estuviera
   bien. Se recortó a 5 caracteres al leer en `load()`, mismo criterio que
   ya usa este archivo para `period`/`created_on` (más precisión de la que
   la UI necesita, se recorta una sola vez al entrar). La lógica de
   comparación de horarios (`sameQuarterHour`) nunca se vio afectada — solo
   lee los dos primeros campos separados por `:`, de más.
5. **§19.7 de `schema.sql` no era seguro de re-pegar entero**, a diferencia
   de cada otra sección de este archivo desde el Sprint 1. Tiene un
   placeholder (`<TU_REF>`) en la URL — pegarlo tal cual, antes de deployar
   la función, deja programado un cron que dispara cada 15 minutos contra
   una URL que no existe. Se comentó el `select cron.schedule(...)` (única
   sección de todo el archivo que queda así) con instrucciones de copiarlo
   aparte, completar la referencia real, y correrlo solo cuando corresponda.
6. **Un error de insert distinto de "ya se mandó" se contaba igual que uno.**
   El código original trataba CUALQUIER error al insertar en
   `fin_notifications` como "el índice único lo rechazó, ya se mandó" —
   pero un `kind` inválido, RLS mal configurado, o la base caída también
   entran por ese mismo `catch`, y quedarían escondidos para siempre detrás
   de un contador (`deduped`) que se ve perfectamente sano. Arreglado
   comprobando el código de Postgres (`23505`, unique_violation)
   específicamente; cualquier otro código se junta en un `insertErrors[]`
   que la corrida devuelve aparte.

### Confirmado sano

- Los cinco hallazgos de la referencia en su propia construcción (§0.3
  a–e) ya estaban incorporados desde el primer borrador y se re-verificaron
  acá: secreto del cron en Vault (no la service role key); `pg_net` deja sus
  funciones en su propio esquema `net`, no en `extensions.*`; timeout de
  `pg_net` a 60s; el aviso se registra ANTES de mandar el push, no después
  (para que dos corridas que empatan no manden dos veces); la PWA (manifest,
  ícono, `sw.js`) ya existía entera desde el Sprint 1.
- La clave de "fijos"/"cuotas de plan" no distingue "por vencer" de
  "vencido" para el mismo período/cuota — un aviso avisa una vez por
  ciclo, no dos. Verificado que esto **no es una divergencia**: la
  referencia usa exactamente el mismo criterio (`fijo:{id}:{período}` sin
  el estado en la clave).
- `evaluateFijos`, `evaluateCuotasDePlan`, `evaluateDeudas` y
  `evaluatePresupuesto` reciben `allTx`/`debts` sin filtrar por perfil (a
  propósito, la Edge Function necesita ver todo el usuario a la vez) — pero
  ninguno tiene el bug 1 de arriba: cada uno filtra por un id específico
  (`recurring_id`, `category_id`, `line_id`, el propio id de la fila) que ya
  resuelve a un solo perfil por construcción, a diferencia de `surplusUsd`
  que suma sin ningún id de por medio. Verificado leyendo la implementación
  real de cada función compuesta (`registeredIn` en `recurring.ts`,
  `gastoRealForCategories` en `budgets.ts`), no asumido.
- Las policies de las 3 tablas nuevas: `fin_notifications` deliberadamente
  sin policies de insert/update/delete (solo la Edge Function escribe, con
  la service role key) — confirmado que esto bloquea a un usuario
  autenticado normal de escribir ahí, no es un descuido.
- `subscribeToPush`'s `upsert(..., {onConflict:'endpoint'})` no puede
  "robar" la suscripción de otro usuario aunque adivinara su `endpoint`: la
  policy de `update` (`using (user_id = auth.uid())`) se evalúa contra la
  fila YA EXISTENTE, así que un conflicto que pertenece a otro usuario
  rechaza el upsert antes de tocar nada.

### Una observación menor, no un bug

En el primer montaje con un `?p=` en la URL, `<ProfileDeepLink>` (efecto de
un hijo) dispara `switchProfile()` antes que el efecto de montaje de
`FinanzasDataProvider` (un padre) — React corre los efectos de abajo hacia
arriba. Los dos terminan llamando a `load()`, y el segundo (el del
provider) gana por el contador de generación del Sprint 8 — pero como
`switchProfile` ya escribió el perfil nuevo en `localStorage` de forma
síncrona antes de que el segundo `load()` arranque, los dos convergen al
mismo perfil correcto. Un `load()` de más en ese primer render, sin
consecuencia visible — no vale la pena resolverlo.

`npx tsc --noEmit`, `npm run build` y `npx eslint app/finanzas lib/finanzas
supabase/functions` en verde después de los 6 arreglos; `node
scripts/build-edge-shared.mjs` corrido de nuevo para que la copia de la
Edge Function no quede desactualizada. Sigue sin poder probarse en un
navegador real ni en Deno (mismos motivos que §10) — los 6 bugs se
encontraron y corrigieron por lectura de código.
