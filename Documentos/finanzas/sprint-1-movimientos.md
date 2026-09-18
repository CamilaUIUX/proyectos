# Finanzas — Sprint 1: "Movimientos y Cuentas"

> Mapa completo de features y roadmap: `features.md` en esta misma carpeta.
> Este documento especifica **únicamente el Sprint 1** — la primera feature,
> de la que dependen todas las demás — con lo suficiente para empezar a
> programar sin volver a decidir nada.
>
> Última actualización: 2026-09-09 · Estado: **construido + todas las
> divergencias cerradas**. `npm run build` / `npm run lint` limpios.
> Pendiente: correr la sección 11 de `supabase/schema.sql` en el proyecto de
> Supabase real y cargar cuentas reales (§7). El cuerpo del documento (§2,
> §3, §5, §6) ya refleja lo construido; §0.2 es el registro de cambios.
>
> **2026-09-08 — cambio de dirección:** el usuario decidió **cerrar todas las
> divergencias** que este sprint había dejado como "fuera de alcance por
> tiempo". Ya no son recortes deliberados: se construyeron. Estado de cada
> uno en §0.2; el detalle de tasas automáticas y PWA en §6.8 / §6.9.

---

## 0.2 Cómo quedó construido, y qué se simplificó (2026-09-06)

Todo el código vive en `app/finanzas/`, `lib/finanzas/` y la sección 11 de
`supabase/schema.sql` (no en `supabase/migrations/`, ver §0.1). `npm run
build` y `npm run lint` pasan limpios.

**Fiel al repo de referencia:**
- Los 4 colores del sistema (marca, lima, semántica de dinero con el
  guindo revisado `#B8434A`, neutro), la tipografía, los radios y sombras
  de `contexto_ui_finanzas.md` — en `app/finanzas/theme.css`.
- Categorías **sin emoji**: `icon` guarda un slug, `<CategoryIcon>` lo
  resuelve contra `@tabler/icons-react` (decisión del repo de referencia,
  §13-15 de su documento de UI — adoptada acá también, ver §6.7).
- Tab bar liquid-glass flotante (5 slots, FAB central) en móvil; sidebar
  fija + tarjeta de tasas en desktop; quick-add como bottom sheet /
  modal centrado; hero con delta del mes y micro-línea de tipo de cambio;
  acciones rápidas Gasto/Ingreso/Transferencia bajo el hero, cada una
  abriendo el quick-add con el tipo ya fijado (sin selector).
- El tope de saldo vive solo en el cliente (§4.5); recongelado de tasa al
  editar monto/cuenta; saldo siempre derivado, nunca guardado.

**Divergencias con el repo de referencia — estado al 2026-09-08:**

| Divergencia | Estado |
|---|---|
| **Congelar el lado que llega de una transferencia entre monedas** (`to_amount_usd` / `to_exchange_rate`) | ✅ **Hecho.** Columnas nuevas en `fin_transactions` (§3.4), congeladas en `createTransaction`/`updateTransaction`. `transferFeeUsd()` en `lib/finanzas/transactions.ts` para el cálculo de comisión |
| **Comisión en transferencia de la misma moneda** (`to_amount` opcional: mandás 100, llegan 98) | ✅ **Hecho.** El quick-add muestra "Monto recibido (opcional)" para transferencias misma-moneda; validado (`to_amount ≤ amount`) en cliente y en `validateShape` |
| **Validación de fecha** (rechazar `2026-02-30`) | ✅ **Hecho.** `isValidDate()` en `lib/finanzas/dates.ts`, usada por `validateShape` |
| **Guard en `usdPerUnit`** contra tasa faltante/inválida | ✅ **Hecho.** Se cae al fallback |
| **Botones que fallaban en silencio** (reactivar cuenta, crear/archivar categoría) | ✅ **Hecho.** Todos muestran el error |
| **`computeBalance` de un solo recorrido** (`computeBalances` batch) | ✅ **Hecho** |
| **Grilla visual de íconos en Ajustes** (en vez de `<select>`) | ✅ **Hecho** (`IconPicker`) |
| **Ícono de moneda: bandera/logo real embebido como SVG** | ✅ **Hecho.** `CurrencyIcon` porta los SVG de la referencia (banderas circle-flags para USD/BOB, logos cryptocurrency-icons para USDT/USDC/BTC), inline, ~4 KB, sin `<mask>`/`id` (la trampa del iPhone) |
| **Tasas automáticas** desde fuentes públicas | ✅ **Hecho.** `fin_rates` gana `auto` + `quote_pair` (§3.3). `lib/finanzas/quotes.ts` trae Bs de `bo.dolarapi.com` (oficial + Binance P2P) y cripto de CoinGecko en un request, ambas CORS abiertas y sin key. Fetch **en el cliente** (sin servidor, fiel al patrón del hub): al abrir, si una `auto` venció el TTL (6 h) se trae y se guarda en las propias `fin_rates` del usuario. Ajustes: toggle Auto/Manual por moneda, selector de cotización para el Bs, "Actualizar ahora". Fijar una a mano la pasa a manual |
| **PWA / manifest / service worker / snapshot en `localStorage`** | ✅ **Hecho.** `app/finanzas/manifest` (scope `/finanzas`, no toca al resto del hub), `public/finanzas/sw.js` (scope `/finanzas/`, network-first con respaldo offline del app-shell + push listener inerte para cuando exista Notificaciones), íconos en `public/finanzas/` (regenerables con `scripts/finanzas-icon.mjs`). El pintado instantáneo lo da un snapshot del último `load()` en `localStorage` (`fz:snapshot:<userId>`), hidratado en el primer render |
| **Capa de API** (`app/api/finanzas/*`) | ⛔ **NO se hace.** No es un recorte de este sprint, es una alineación deliberada con el patrón del hub: Daily y todo el resto llaman a `supabase.from()` directo desde el cliente y confían en RLS. Reintroducir rutas API haría a Finanzas la única mini-app inconsistente y obligaría a reescribir la capa de datos de los 4 sprints ya construidos, sin ganar seguridad (RLS ya es la barrera real). Ver §0.1 |

**Corrección de arquitectura que sí importa (detalle completo en §0.1):**
sin `app/api/finanzas/*` — todo pasa por `supabase.from('fin_...')` en
componentes cliente, igual que ya hace Daily en este mismo hub.

---

## 0.1 Corrección de arquitectura (2026-09-06, al empezar a construir)

El repo de referencia usa rutas `app/api/finanzas/*` con `requireUser()` en
cada una. **Este hub no tiene ninguna ruta API** — Daily llama a Supabase
**directo desde componentes cliente** (`import { supabase } from
'@/lib/supabaseClient'`) y confía enteramente en RLS para la seguridad, sin
una sola verificación de sesión hecha a mano en un servidor propio.

Finanzas sigue ese mismo patrón, no el del repo de referencia: sin capa de
API, todas las lecturas y escrituras pasan por `supabase.from('fin_...')`
dentro de `app/finanzas/components/data-context.tsx` y los formularios que
escriben. La sección 5 (estructura de archivos) y la 6 (antes "Contratos de
API") de este documento reflejan esto — ya no hay `app/api/finanzas/`.

Esto no cambia ninguna decisión de producto ni de modelo de datos (secciones
0, 3 y 4 siguen intactas): solo cambia *dónde* vive el código que llama a
Supabase.

---

## 0. Decisiones cerradas para este sprint (2026-08-27)

Cuatro preguntas de alcance, resueltas antes de escribir la primera línea:

| Pregunta | Decisión |
|---|---|
| ¿Un admin ve las finanzas de otra persona, como sí ve los reportes de Daily? | **No, nunca.** Finanzas queda 100% privada por usuario — la única mini-app del hub sin excepción de admin en sus RLS |
| ¿Con qué monedas arranca `fin_rates`? | **Las 5 desde el día 1** — BOB, USDT, USDC y BTC quedan con una tasa cargada en Ajustes aunque todavía no exista ninguna cuenta en cripto |
| ¿Dónde se aplica el tope de saldo (que un gasto no supere lo disponible)? | **Solo en el cliente.** La API queda permisiva a propósito: siempre tiene que haber forma de corregir un saldo inicial mal cargado sin quedar trabado |
| ¿Qué categorías se siembran? | **El set propuesto** (§5.2) — 8 de gasto, 4 de ingreso |

Estas cuatro dejan de ser preguntas abiertas: el resto del documento las da por
resueltas.

---

## 1. Objetivo del sprint

> **Registrar plata que entra y sale en menos de 10 segundos, y ver dónde
> estoy parado.**

Al terminar, cualquier usuario con acceso a Finanzas puede responder, sin
ayuda de ninguna feature posterior:

1. ¿Cuánto tengo, y dónde?
2. ¿Cuánto llevo gastado este mes?
3. ¿En qué se me fue?

### Definición de "terminado"

- [x] Puedo cargar mis cuentas reales con su saldo inicial, en cualquiera de
      las 5 monedas (BOB, USD, USDT, USDC, BTC)
- [x] Puedo registrar un gasto desde el celular en menos de 10 segundos
- [x] El saldo de la cuenta baja al registrar un gasto, y sube si lo borro
- [x] Veo mi patrimonio total en USD en la pantalla principal
- [x] Veo el total gastado del mes en curso
- [x] Puedo editar y borrar cualquier movimiento propio
- [x] Una transferencia entre dos cuentas propias **no cambia** el
      patrimonio total
- [x] Las tasas se traen solas de una fuente pública; puedo fijar cualquiera
      a mano (§6.8)
- [x] La app es instalable y abre con datos al instante (§6.9)
- [~] Cada usuario ve únicamente sus propias cuentas y movimientos — RLS
      escrita; **falta verificar con dos cuentas de prueba reales** contra un
      Supabase con datos
- [x] `npm run build` y `npm run lint` pasan sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **Cuentas** | Nombre, moneda (cualquiera de las 5), saldo inicial, orden, archivar. Nada más |
| **Movimientos** | Solo 3 tipos: `gasto`, `ingreso`, `transferencia` |
| **Monedas** | USD (referencia), BOB, USDT, USDC, BTC — las 5 disponibles desde el arranque |
| **Tasas** | **Automáticas** desde fuentes públicas (Bs de `bo.dolarapi.com`, cripto de CoinGecko) con override manual por moneda — ver §6.8. Se siembran solas la primera vez que la app carga sin ellas |
| **Categorías** | Lista plana, sembrada con el set de §6.7. Renombrar y archivar |
| **Home** | Patrimonio total en USD + saldo por cuenta + gasto del mes + últimos movimientos |
| **PWA** | Manifest + service worker con scope `/finanzas/` (instalable, offline básico) + snapshot en `localStorage` para pintado instantáneo — ver §6.9 |

### No entra todavía (y por qué)

| Fuera | Razón |
|---|---|
| Categorías jerárquicas | Plano resuelve el día 1; agregar `parent_id` después es aditivo |
| Deudas, fijos, planes de pago, presupuesto, ahorro, cuentas de inversión, reportes | Cada una es su propia feature (ver `features.md`) que no cambia el modelo base — se apoyan en `fin_transactions` sin modificar su forma |
| ~~Tasas automáticas desde fuentes públicas~~ | **Construido el 2026-09-08** (§6.8) — el usuario decidió cerrar las divergencias con el repo de referencia |
| Vista de admin sobre finanzas ajenas | Cerrado en §0: no existe, ni en este sprint ni en ninguno posterior salvo decisión explícita en contrario |
| Notificaciones push | El `sw.js` ya trae el listener de `push` **inerte** para no tener que reinstalarlo cuando exista la feature (roadmap ítem 10), pero hoy no llega ningún push |

---

## 3. Modelo de datos

4 tablas nuevas, prefijo `fin_`, cada una con `user_id` y **RLS activo con
las 4 policies reales** (select/insert/update/delete, todas con
`user_id = auth.uid()`, sin excepción de admin — §0).

### 3.1 `fin_accounts`

```sql
create table public.fin_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  name                  text not null,
  currency              text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  initial_balance       numeric(24,8) not null default 0,
  initial_balance_date  date not null default current_date,
  sort_order            integer not null default 0,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on public.fin_accounts (user_id, archived, sort_order);
```

`currency` es la moneda **nativa** de la cuenta. Todo movimiento sobre esa
cuenta va en esa moneda — no se mezcla dentro de una misma cuenta.

### 3.2 `fin_categories`

```sql
create table public.fin_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('gasto','ingreso')),
  icon        text,
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.fin_categories (user_id, kind, archived, sort_order);
```

Plana a propósito, sin `parent_id`. `icon` guarda un **slug** (`comida`,
`transporte`…), no un emoji ni un carácter Unicode — `<CategoryIcon>` lo
resuelve contra `@tabler/icons-react` (§6.7). El nombre de la columna es
`icon`, no `emoji`.

### 3.3 `fin_rates`

```sql
create table public.fin_rates (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  currency    text not null check (currency in ('BOB','USDT','USDC','BTC')),
  rate        numeric(24,8) not null check (rate > 0),
  auto        boolean not null default true,
  quote_pair  text check (quote_pair in ('BOB_USD','BOB_BINANCE','USDT_USD','USDC_USD','BTC_USD')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, currency)
);
```

USD no aparece: es la unidad de referencia y su tasa es siempre 1. Las
**cuatro filas restantes se siembran solas** la primera vez que la app carga
sin ellas (en `data-context.tsx`, no en una migración — ninguna conoce el
`auth.uid()`), para que Ajustes nunca muestre una moneda sin tasa.

`auto = true` (default): la app trae el valor de una fuente pública al abrir
si `updated_at` superó el TTL (6 h) y lo guarda acá mismo — el fetch se hace
**en el cliente** (`lib/finanzas/quotes.ts` → `bo.dolarapi.com` para el Bs,
CoinGecko para la cripto), sin servidor, porque el hub no tiene rutas API.
`updated_at` hace de "última vez que se trajo". `auto = false`: manda el
número que el usuario fijó y el refrescador no lo pisa. `quote_pair`: qué
cotización sigue — solo el Bs tiene más de una (oficial vs. P2P Binance);
`null` = la default de esa moneda.

La tasa se guarda tal como la persona la piensa, no uniformizada:

| Moneda | Se guarda como | Significa | Conversión a USD |
|---|---|---|---|
| BOB | `11.55` | Bs por 1 USD | `usd = monto ÷ tasa` |
| BTC | `68000` | USD por 1 BTC | `usd = monto × tasa` |
| USDT | `1.00` | USD por 1 USDT | `usd = monto × tasa` |
| USDC | `1.00` | USD por 1 USDC | `usd = monto × tasa` |

Uniformizar todo a "USD por unidad" sería prolijo pero ilegible: nadie dice
que el boliviano vale 0,0865 dólares, dice que el dólar está a 11,55. La
lógica de dirección vive en cuatro líneas de código (`CURRENCY_META`), no en
la base.

### 3.4 `fin_transactions`

```sql
create table public.fin_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  type           text not null check (type in ('gasto','ingreso','transferencia')),
  date           date not null,
  account_id     uuid not null references public.fin_accounts(id) on delete restrict,
  to_account_id  uuid references public.fin_accounts(id) on delete restrict,
  category_id    uuid references public.fin_categories(id) on delete set null,
  amount         numeric(24,8) not null check (amount > 0),
  currency       text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  to_amount      numeric(24,8) check (to_amount is null or to_amount > 0),
  exchange_rate  numeric(24,8) not null,
  amount_usd     numeric(14,2) not null,
  to_exchange_rate numeric(24,8),          -- congela el lado que LLEGA
  to_amount_usd    numeric(14,2),          -- (solo si hay to_amount)
  description    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint fin_tx_shape check (
    (type = 'transferencia'
      and to_account_id is not null
      and to_account_id <> account_id
      and category_id is null)
    or
    (type in ('gasto','ingreso')
      and to_account_id is null
      and to_amount is null)
  )
);
create index on public.fin_transactions (user_id, date desc);
create index on public.fin_transactions (account_id);
create index on public.fin_transactions (to_account_id);
```

**Notas de diseño (no negociables, vienen de un modelo ya probado):**

- `amount` es **siempre positivo**. El signo lo determina `type`. Guardar
  negativos hace que todo cálculo futuro dependa de recordar la convención.
- `currency` siempre iguala la moneda de `account_id` — se valida en el
  servidor, nunca se confía en lo que manda el cliente.
- `to_amount` se usa en transferencias **entre monedas distintas** (ej. sacar
  $50 de una cuenta y que a la de Bolivianos le lleguen 348 Bs, obligatorio) y
  también, **opcionalmente, entre cuentas de la misma moneda** para anotar la
  comisión que se comió el banco (mandás 100, llegan 98). Si va `null`, el
  destino recibe `amount`. En misma moneda no puede llegar **más** de lo que
  salió (validado en cliente y en `validateShape`).
- **Precisión de 8 decimales** en `amount`, `to_amount` e
  `initial_balance` — necesaria para BTC (`0.00042195` no entra en 2
  decimales). `amount_usd` queda en 2, porque el dólar no tiene más.
- `exchange_rate` y `amount_usd` se **congelan al escribir y nunca se
  recalculan**. Un gasto de hace tres meses no cambia de valor porque hoy
  cambió la tasa.
- `to_exchange_rate` y `to_amount_usd` **congelan el lado que llega** de una
  transferencia con `to_amount`, cada uno a la tasa de su día — igual que
  `exchange_rate`/`amount_usd` congelan el que sale. Sin esto, el valor
  histórico en USD de lo recibido en una transferencia entre monedas es
  irreconstruible (no se sabe qué tasa regía ese día), y la comisión efectiva
  (`amount_usd − to_amount_usd`, ver `transferFeeUsd()`) no se puede calcular
  después. Nullable: las filas sin `to_amount` no los tienen. En una edición
  se recongelan solo si el monto recibido, las cuentas o el tipo cambiaron —
  una edición que no los toca los deja tal cual.

⚠️ **Trampa conocida de Postgres:** un `CHECK` solo se viola cuando da
`false` — si alguna comparación da `NULL` (por ejemplo, comparar una
columna nullable con `=`), la fila **pasa igual**. Cuando este constraint
se extienda con columnas nuevas y nullable (en features futuras), usar
`is not distinct from` en vez de `=`, y agregar una prueba que inserte por
SQL directo una fila que debería rechazarse.

### 3.5 RLS — sin excepciones (§0)

```sql
alter table public.fin_accounts enable row level security;
alter table public.fin_categories enable row level security;
alter table public.fin_rates enable row level security;
alter table public.fin_transactions enable row level security;

-- Repetir para las 4 tablas, con esta forma (ejemplo sobre fin_accounts).
-- `to authenticated` + `with check` en el update, como el resto del hub:
create policy fin_accounts_select on public.fin_accounts
  for select to authenticated using (user_id = auth.uid());
create policy fin_accounts_insert on public.fin_accounts
  for insert to authenticated with check (user_id = auth.uid());
create policy fin_accounts_update on public.fin_accounts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy fin_accounts_delete on public.fin_accounts
  for delete to authenticated using (user_id = auth.uid());
```

Nunca usar un cliente admin (`createAdminClient()` o equivalente) en las
rutas de datos de Finanzas: no hay ningún acceso cruzado entre usuarios que
lo justifique, a diferencia de `/admin` en el resto del hub.

---

## 4. Reglas de negocio

### 4.1 Saldo de una cuenta — derivado, nunca guardado

No existe una columna `balance`. Se calcula siempre a partir del historial:

```
saldo(A) =   initial_balance
           − Σ amount               donde type='gasto'         y account_id    = A
           + Σ amount               donde type='ingreso'       y account_id    = A
           − Σ amount               donde type='transferencia' y account_id    = A
           + Σ (to_amount ?? amount) donde type='transferencia' y to_account_id = A
```

Editar o borrar un movimiento recalcula el saldo solo, sin lógica de
compensación.

### 4.2 Conversión a USD (al escribir)

```
amount_usd    = round(amount × usdPerUnit(moneda, tasas), 2)
exchange_rate = usdPerUnit(moneda, tasas)   // se congela
```

`usdPerUnit` invierte la tasa del Bs (`1 / 11.55`) y usa directo la de BTC y
las stablecoins (tabla del §3.3).

### 4.3 Patrimonio total

```
patrimonio_usd = Σ ( saldo(A) convertido a USD con la tasa ACTUAL )
```

Distinto de las transacciones (que congelan su tasa): el patrimonio es una
foto del presente, así que usa la tasa de **hoy**.

### 4.4 Gasto del mes

```
gasto_mes_usd = Σ amount_usd  donde type='gasto' y date dentro del mes en curso
```

Solo `gasto`. Las transferencias no cuentan como gasto — mueven plata, no la
consumen.

### 4.5 Tope de saldo — solo en el cliente (§0)

Un `gasto` o una `transferencia` no puede superar el saldo disponible de la
cuenta de origen. Un `ingreso` nunca se topea. El tope se aplica **en la
pantalla** (mensaje claro + botón "usar el máximo" + bloqueo del botón de
guardar); la API no lo hace cumplir. Así siempre hay forma de corregir un
saldo inicial mal cargado sin quedar trabado — el costo es confiar en que la
UI es la única puerta de entrada, aceptable porque cada usuario solo puede
tocar sus propios datos.

### 4.6 Borrado de cuentas

- Sin movimientos → se puede borrar (`DELETE`).
- Con movimientos → no se borra, se archiva (`archived = true`). El
  `on delete restrict` de la foreign key lo garantiza a nivel de base de
  datos aunque falle la validación del servidor.

---

## 5. Estructura de archivos

```
app/finanzas/
├── layout.tsx                — <MiniAppGate slug="finanzas"> + <ServiceWorker/> + shell
├── page.tsx                   — Home
├── movimientos/page.tsx       — lista + filtros + editar/borrar
├── cuentas/page.tsx           — CRUD de cuentas
├── ajustes/page.tsx           — tasas (auto/manual) + categorías (+ personas, Sprint 2)
├── manifest/route.ts          — el manifest de la PWA (scope /finanzas) — §6.9
└── components/
    ├── data-context.tsx       — fetch + estado compartido + mutaciones, todo
    │                            contra supabase.from('fin_...') directo
    ├── service-worker.tsx     — registra public/finanzas/sw.js (scope /finanzas/)
    ├── category-icon.tsx      — slug → ícono de línea (@tabler/icons-react)
    ├── currency-icon.tsx      — bandera/logo real embebido como SVG (§0.2)
    ├── tab-bar.tsx / sidebar.tsx — navegación móvil (liquid glass) / desktop + tarjeta de tasas
    ├── quick-add.tsx          — registro rápido (< 10 s)
    ├── tx-row.tsx             — fila de movimiento (Home y Movimientos)
    └── ui.tsx                 — primitivas propias (Panel, Sheet, Skeleton, Btn…)

lib/finanzas/
├── types.ts          — tipos compartidos + categorías semilla + `toNum()` + `decimalsFor()`
├── money.ts           — formateo, parseo de decimales (coma y punto), redondeo decimal
├── dates.ts           — todayISO / localDateKey / currentMonthKey / isValidDate
├── accounts.ts        — computeBalances (batch) + computeBalance + withBalances + totalUsd
├── transactions.ts    — validateShape, freeze / freezeReceived, transferFeeUsd, agrupado por día
├── rates.ts           — buildRatesMap, usdPerUnit (con guard), toUsd, FALLBACK_RATES
└── quotes.ts          — fetch de cotizaciones públicas para las tasas automáticas — §6.8

public/finanzas/
├── sw.js              — service worker (network-first + offline app-shell + push inerte)
└── icon-{180,192,512,512-maskable}.png — íconos de la PWA (regenerables)

scripts/finanzas-icon.mjs  — regenera los PNG del ícono a partir de un SVG inline (usa `sharp`)

supabase/schema.sql
└── sección 11 — se agrega ahí, no en un archivo de migración aparte
    (este proyecto no usa `supabase/migrations/`: un solo `schema.sql`
    idempotente que se vuelve a pegar entero en el SQL Editor cada vez
    que cambia — ver §0.1 y el README del proyecto). Subsecciones 11.3b y
    11.4b son `alter … add column if not exists` idempotentes para las
    columnas agregadas después del Sprint 1.
```

### 5.1 Regla de independencia

Finanzas no reutiliza componentes, utilidades, lógica de negocio, CSS ni
tipos de `app/daily/`. Lo único compartido son las primitivas del Hub que no
pertenecen a ninguna mini-app: `lib/supabaseClient.ts`, `AuthProvider`,
`MiniAppGate`, y las tablas `profiles` / `app_access`.

---

## 6. Cómo se leen y escriben los datos (sin API, §0.1)

Todo pasa por `supabase.from('fin_...')` dentro de componentes cliente
(`'use client'`), igual que `app/daily/WeeklyModal.tsx`. RLS (§3.5) es la
única barrera real — no hay una capa de servidor propia que revalide nada.

- **Cargar todo al montar** (`data-context.tsx` → `load()`): un `Promise.all`
  de `select` en paralelo — cuentas, categorías, tasas, movimientos
  (`.limit(2000)`), y desde el Sprint 2+ también personas, deudas, fijos y
  planes — y deriva `balance`/`balance_usd`/`totalUsd` con
  `lib/finanzas/accounts.ts` en el cliente. Al terminar guarda un **snapshot**
  en `localStorage` (§6.9) y dispara el **refresco de tasas automáticas
  vencidas** aparte, sin bloquear el render (§6.8).
- **Crear/editar/borrar una cuenta**: `insert` / `update` / `delete` sobre
  `fin_accounts` directo desde la pantalla de Cuentas. Cambiar `currency`
  con movimientos ya cargados se bloquea **en la UI** (deshabilitando el
  campo si `computeBalance` encuentra algún movimiento sobre esa cuenta) —
  no hay un `409` de servidor que lo impida, así que la pantalla es la
  única puerta.
- **Registrar un movimiento** (quick-add): el componente ya tiene `rates` y
  la cuenta elegida en memoria (vienen de `data-context.tsx`), así que
  resuelve `currency` (la de la cuenta elegida, nunca un valor del
  formulario) y calcula `exchange_rate`/`amount_usd` con
  `lib/finanzas/transactions.ts` → `freeze()` **antes** del `insert`. El
  tope de saldo (§4.5) también se valida ahí, con `availableFrom()`.
- **Editar un movimiento**: si cambian `amount`, `account_id` o la tasa fue
  tocada a mano, se vuelve a llamar `freeze()`; si solo cambia la
  descripción o la categoría, se manda el `exchange_rate`/`amount_usd` tal
  como ya estaban en la fila.
- **Tasas** (Ajustes): `upsert` sobre `fin_rates`. Fijar un valor a mano
  (`updateRate`) pasa la fila a `auto = false`. `setRateMode` alterna
  auto/manual y (para el Bs) qué cotización sigue; `refreshRatesNow` fuerza
  un refresco. Ver §6.8.
- **Sembrar categorías**: un botón en Ajustes que hace `insert` de las 12
  filas de §6.7 si `fin_categories` todavía está vacía para ese usuario —
  ninguna migración puede hacer esto porque no conoce el `auth.uid()` de
  quien la corre. Las 4 filas de `fin_rates` se siembran igual, pero solas
  (sin botón), la primera vez que `load()` no las encuentra.

**Lo que se pierde al no tener servidor propio, y por qué es aceptable
acá:** nada valida en un segundo lugar que `currency` de la transacción
coincida con la de la cuenta — depende de que el código del cliente arme
bien el `insert`. Es el mismo trato que ya acepta Daily (ej. nada impide que
un cliente manipulado mande cualquier `report_date`): RLS protege que cada
quien solo toque *sus propios* datos, no que los datos bien formados que esa
persona decide guardar sean coherentes entre sí. Para una app personal de un
solo dueño por fila, ese riesgo es aceptable.

### 6.7 Categorías semilla (decisión cerrada, §0)

`icon` guarda un **slug**, no un emoji — decisión de UI adoptada del repo de
referencia (contexto_ui_finanzas.md §13-15: los emojis rompen el sistema de
tintes, cambian de dibujo según el sistema operativo y no se alinean entre
sí). `<CategoryIcon slug>` resuelve cada slug a un ícono de línea de
`@tabler/icons-react`, con un único fallback: monograma con la inicial.

- **Gasto (8):** `comida` (Comida) · `transporte` (Transporte) ·
  `vivienda` (Vivienda) · `servicios` (Servicios) ·
  `suscripciones` (Suscripciones) · `salud` (Salud) · `ocio` (Ocio) ·
  `otros_gasto` (Otros)
- **Ingreso (4):** `sueldo` (Sueldo) · `freelance` (Freelance) ·
  `extraordinario` (Extraordinario) · `otros_ingreso` (Otros)

El mapa slug → ícono vive en `lib/finanzas/types.ts` (`CATEGORY_ICON_MAP`).

### 6.8 Tasas automáticas (2026-09-08)

La referencia refresca las tasas con un servidor propio. Este hub no tiene
rutas API, así que el fetch se hace **desde el navegador**, hacia dos APIs
públicas con CORS abierto y sin key:

| Par (`quote_pair`) | Fuente | Qué es |
|---|---|---|
| `BOB_USD` | `bo.dolarapi.com/v1/dolares` (`casa: 'oficial'`) | Bs por 1 USD, oficial del BCB |
| `BOB_BINANCE` | `bo.dolarapi.com/v1/dolares` (`casa: 'binance'`) | Bs por 1 USD, paralelo P2P |
| `USDT_USD` · `USDC_USD` · `BTC_USD` | `api.coingecko.com/api/v3/simple/price` | USD por unidad — los tres en **un** request |

El número que devuelve cada par ya está en la misma dirección en que
`fin_rates.rate` guarda esa moneda (§3.3) — no hay que invertir nada. Cada
fuente tiene timeout de 4 s y **falla en silencio**: si el mercado no
responde, se sigue con la última tasa buena.

**Cómo se dispara** (`lib/finanzas/quotes.ts` + `data-context.tsx`):
- `load()` siembra las filas que falten (con el fallback, `updated_at`
  vencida) y termina.
- `refreshStaleRates()` corre **después** de `load()`, sin bloquear el
  render: relee `fin_rates`, y si alguna fila `auto` superó el TTL (**6 h** —
  más generoso que los 30 min de la referencia porque acá no hay cron de
  respaldo), trae las cotizaciones, hace `upsert` de las que resolvieron, y
  actualiza el estado con un `setRateRows` puntual.
- El TTL corta antes de cualquier request, así que en el uso normal esto no
  toca la red.
- "Actualizar ahora" en Ajustes (`refreshRatesNow`) vence todas las `auto` y
  llama a `refreshStaleRates()` en el acto. Poner una tasa a mano
  (`updateRate`) la pasa a `auto = false` y el refrescador ya no la toca.

### 6.9 PWA, service worker y snapshot (2026-09-08)

- **`app/finanzas/manifest/route.ts`** sirve el manifest con `scope` y
  `start_url` en `/finanzas` — va como ruta de la mini-app, no como
  `app/manifest.ts`, para no inyectar el `<link rel="manifest">` en todas las
  páginas del hub. Lo enlaza solo el `layout.tsx` de Finanzas, junto con los
  metadatos `appleWebApp` y el `apple-touch-icon`.
- **`public/finanzas/sw.js`** (registrado por `<ServiceWorker/>` con scope
  `/finanzas/`): `skipWaiting` + `clients.claim`, un caché de "app shell"
  network-first (la red manda cuando hay; el caché es solo respaldo offline
  de las 6 rutas), y un listener de `push` **inerte** — listo para la feature
  de Notificaciones sin tener que reinstalar el SW.
- **Snapshot en `localStorage`** (`fz:snapshot:<userId>`, con número de
  versión): al final de cada `load()` bueno se guarda una foto de todo el
  estado; en el primer render `FinanzasDataProvider` la hidrata, así la app
  aparece con datos en vez de en blanco y `load()` los reemplaza en silencio
  un instante después (si hubo snapshot, `loading` arranca en `false` — nada
  de skeletons). El `try/catch` cubre cuota llena y navegación privada.
- Los íconos (`public/finanzas/icon-*.png`) se regeneran con
  `node scripts/finanzas-icon.mjs` (barras lima ascendentes sobre verde
  oscuro, con `sharp`).

---

## 7. Antes de escribir la primera línea de código

Lo único que falta y que **no** es una decisión de diseño, sino datos reales
a cargar el primer día de uso:

1. Nombre, moneda y saldo inicial de cada cuenta real.
2. Las tasas ya no hace falta cargarlas: se traen solas al abrir (§6.8). Solo
   si querés fijar una manualmente (ej. la paralela a un valor negociado),
   se hace en Ajustes.

Y, antes de nada: **correr `supabase/schema.sql` en el SQL Editor** — la
sección 11 (más las subsecciones idempotentes 11.3b / 11.4b).

Todo lo demás en este documento es una decisión ya tomada.

---

## 8. Qué desbloquea

Este sprint deja `fin_transactions`, `fin_accounts`, `fin_categories` y
`fin_rates` con una forma estable. Las features siguientes (ver
`features.md`) se apoyan en estas cuatro tablas agregando columnas nullable
o tablas satélite — ninguna necesita cambiar lo que este sprint ya
construyó.
