# Finanzas — Sprint 5: "Presupuesto mensual"

> Mapa completo de features y roadmap: `features.md` en esta misma carpeta.
> Este documento especifica **únicamente el Sprint 5**, con alcance completo
> (no solo el núcleo mínimo) — mismo criterio que los sprints 2, 3 y 4.
>
> Última actualización: 2026-09-09 · Estado: **especificado, no construido**.
> Se apoya en `sprint-1-movimientos.md` (movimientos, tasa congelada, tope de
> saldo), `sprint-2-deudas.md` (gasto real = bruto − repartido) y
> `sprint-3-fijos.md` (`recurringStatus`, "comprometido").

---

## 0. Decisiones tomadas para este sprint

Igual que en Sprints 2–4: decisiones ya resueltas con el criterio del repo de
referencia (`Acero-Hub-ref/documentos/finanzas/sprint_6_presupuesto.md`)
adaptado a lo que ya construimos acá. **Se arranca del modelo ya corregido**
(su §0.3): la referencia construyó una primera versión y la rehízo en dos días
de uso — nos saltamos ese ida y vuelta. Si algo no encaja con tu uso real, se
ajusta acá antes de programar.

| Tema | Decisión | Por qué |
|---|---|---|
| **Por categoría + un tope general** | Ambos. El general suma **todo** el gasto real del mes, sin exigir que reconcilie con la suma de las categorías con línea | Un mes puede tener gasto en categorías sin presupuesto propio y el general igual lo tiene que ver |
| **El tope general NO es una línea** | Es un agregado derivado (`Σ gasto_real` de todas las categorías). No se crea, no se edita, no se puede desincronizar | Una línea general independiente flotaba respecto de la suma real; derivarla la hace imposible de desincronizar (referencia §0.3) |
| **Una línea puede cubrir varias categorías** | Tabla puente `fin_budget_line_categories`. Una categoría **no** puede estar en dos líneas a la vez (o el general la contaría doble) | Categorías chicas y relacionadas ("Salidas" + "Delivery") se presupuestan juntas sin perder detalle en Movimientos |
| **Alias de línea opcional** | `fin_budget_lines.name`; si no se pone, el título es la lista de categorías | "Salidas, Delivery" es peor título que "Gustos" |
| **Moneda propia por línea** | `input_currency` en la línea; el monto se guarda **nativo** (`fin_budget_periods.amount`) con `exchange_rate` congelado, igual que `fin_transactions`. `amount_usd` es el derivado, para sumar categorías de distinta moneda | El monto reconvertido desde USD "flotaba" con la tasa del paralelo — "2.400 Bs" se veía después como "2.400,02 Bs" |
| **Sin wizard** | Un solo sheet ("Nuevo presupuesto") con selector de categorías por chips, que sirve para el alta y la edición | El wizard forzaba a decidir las 12 categorías de una sentada; el alta suelta se volvió el único camino |
| **Monto editable mes a mes** | Con el mes anterior como default. Editar agosto no toca julio | El presupuesto real cambia; congelarlo obliga a re-crearlo |
| **Retroactividad, elegible una vez** | Al crear la línea a mitad de mes: "¿contar lo que ya gastaste desde el día 1, o arrancar hoy?" — **inmutable** después | Es una decisión de arranque, no una config que se toquetee |
| **El rollover es una pregunta mensual, no una config** | No hay `rollover_mode`. Al cerrar cada mes, la app pregunta por línea: "¿llevás el sobrante/sobregasto al mes que viene, o se queda así?" | La pregunta se responde con el número ya cerrado — el arrastre deja de ser recursivo (un solo salto atrás, §4.4) |
| **Bloqueo solo en categorías con línea** | Un `gasto·consumo` que hace pasar el disponible de su línea se **bloquea**, con opción de **ampliar** ese mes puntual. El tope **general nunca bloquea** — solo informa | Frenar antes de pasarse es el valor del sprint; el general es un termómetro, no un freno |
| **Ampliaciones en la moneda de la línea** | `fin_budget_extensions.amount` nativo + `exchange_rate` congelado (la referencia las dejó en USD; acá se sigue el mismo criterio nativo que los períodos) | Coherencia con todo el resto de la app — el usuario amplía "+200 Bs", no "+29 USD" |
| **La barra muestra solo el tick** | "Acá deberías estar hoy". Sin proyección a fin de mes | La referencia la quitó — ruido más que señal |
| **Toggle "gastado" vs "disponible"** | Configurable en Ajustes (`localStorage`), aplica igual en Presupuesto y en la Home | A veces querés ver cuánto te queda, no cuánto ya gastaste |
| **Solo sobre gasto** | Nada de presupuesto de ingresos | Decisión cerrada en `features.md` §3 |
| **Gasto neto** | En categorías con gasto compartido, cuenta el **real** (bruto − `principal_usd` de las deudas no condonadas) — reusa `repartidoUsd` del Sprint 2 | La parte de otro no es tu gasto |
| **Navegación** | Presupuesto se llega por un **tile en la Home** y la **sidebar** de escritorio, igual que Deudas y Fijos. **No** entra a la tab bar de móvil | Con Presupuesto son **3 pantallas sin slot** (Deudas, Fijos, Presupuesto). Ver §0.1 |
| **Detección de "mes por cerrar"** | Bajo demanda, al cargar `/finanzas/presupuesto` (o un badge liviano desde otra pantalla). **Sin cron** | Vercel Hobby permite 1 cron/día y no hay ninguno todavía; el aviso es pasivo |

### 0.1 La pantalla "Más" ahora sí hace falta — pero no en este sprint

La tab bar de móvil tiene sus 5 slots fijos (Inicio · Movimientos · + · Cuentas
· Ajustes). Deudas y Fijos ya se resolvieron con tiles de Home + sidebar
(sprint-2 §0, sprint-3 §0), anotando cada vez que "si sigue creciendo el número
de pantallas, conviene una pantalla 'Más'". **Presupuesto es la tercera.**

Este sprint sigue el mismo patrón (tile + sidebar) para no meter un rediseño de
navegación en medio de otra cosa. Pero queda **explícitamente marcado**: el
**Sprint 6 (Ahorro)** debe incluir una pantalla `/finanzas/mas` que agrupe
Deudas · Fijos · Presupuesto · Ahorro, y mover uno de los slots de la tab bar
(candidato: Cuentas, como hizo la referencia). No antes, no después.

---

## 1. Objetivo del sprint

> **Saber, con el mes todavía corriendo, si voy bien o me estoy pasando —
> por categoría y en general — y que la app me frene antes de pasarme.**

Al terminar, la app responde:

1. ¿Cuánto me queda para gastar este mes, por categoría?
2. ¿Voy a mi ritmo, o a este paso me paso?
3. Cuando cierro el mes, ¿qué hago con lo que me sobró o me pasé?

### Definición de "terminado"

- [ ] Puedo crear una línea de presupuesto para una o varias categorías de
      gasto, con su monto y su moneda
- [ ] Cada mes hereda el monto del anterior; puedo editarlo sin tocar los
      meses viejos
- [ ] Veo, por línea: gastado (neto), lo comprometido en fijos, y el
      disponible real — con su equivalente en la otra moneda
- [ ] Un gasto que me pasa del disponible de su línea se **bloquea**, con la
      opción de ampliar el límite de ese mes ahí mismo
- [ ] Veo el tope general (suma de todo el gasto real del mes) con su barra,
      pero nunca me bloquea
- [ ] Al terminar un mes, la app me pregunta por cada línea qué hacer con el
      sobrante/sobregasto, y lo que decido se congela
- [ ] Cada barra tiene un tick de "acá deberías estar hoy"
- [ ] Puedo alternar entre ver "gastado" y "disponible" desde Ajustes
- [ ] La Home muestra un tile con el estado del presupuesto del mes
- [ ] `npm run build` y `npm run lint` pasan sin errores

---

## 2. Alcance

Entra todo — decisión de alcance completo, mismo criterio que Sprints 2–4.

| Pieza | Alcance exacto |
|---|---|
| **Línea de presupuesto** | 1..N categorías de gasto (vía tabla puente), alias opcional, moneda propia, retroactividad elegible al crear |
| **Monto mensual** | `fin_budget_periods` — una fila por (línea, mes). Editable, hereda del mes anterior más reciente |
| **Ampliación** | `fin_budget_extensions` — cada aumento puntual de un mes, nativo + tasa congelada. Auditado, solo afecta ese período |
| **Gasto real por línea** | `Σ gasto·consumo` del mes de las categorías de la línea, menos `Σ principal_usd` de las deudas no condonadas de esos gastos |
| **Comprometido** | `Σ` monto de los fijos de esas categorías cuyo estado hoy es `pendiente`/`vencido` (sprint-3) |
| **Disponible** | `montoEfectivo − gasto_real − comprometido + carry_del_mes_anterior` |
| **Tope general** | Agregado derivado: `Σ gasto_real` de **todas** las categorías. Barra + carry propios; nunca bloquea |
| **Cierre mensual** | `fin_budget_closures` — por línea, al terminar el mes: "llevar / no llevar". Congela el disponible. Respondible en cualquier momento |
| **Bloqueo + ampliación** | En el quick-add: un `gasto·consumo` con categoría que tiene línea, si deja el disponible en negativo, abre el sheet de bloqueo |
| **Barra de ritmo** | Progreso + tick de referencia (día/días × montoEfectivo) |
| **Toggle gastado/disponible** | En Ajustes, `localStorage`, aplica en Presupuesto y Home |
| **Pantalla** | `/finanzas/presupuesto` + tile en la Home |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| Sugerencia de monto por historial + buffer % | Necesita 2–3 meses de `gasto_real` acumulado por categoría — hoy no existen. El sheet ya queda listo para recibirla: el día que haya datos, prellena en vez de arrancar vacío |
| Presupuesto de **ingresos** | Decisión cerrada: solo sobre gasto |
| Notificación push cuando te pasás | Feature 10 (Notificaciones) — se apoya en el estado ya calculado acá |
| "Llevar solo una parte" del sobrante al cerrar | Binario a propósito: repartir el sobrante se resuelve mejor bajando el monto del mes siguiente a mano |
| Deshacer un cierre ya respondido | Edge case raro — a mano en la base si hace falta |
| Presupuesto agrupado por bolsillo | Por categoría plana |
| Pantalla "Más" / rediseño de tab bar | Ver §0.1 — es del Sprint 6 |

---

## 3. Modelo de datos

Se agrega a `supabase/schema.sql` como **sección 15** (este proyecto no usa
`supabase/migrations/` — ver sprint-1-movimientos.md §0.1). 5 tablas nuevas;
nada de lo que existe cambia de forma.

⚠️ **Recordatorio de las revisiones anteriores:** todo monto `numeric` se lee
como texto — pasar por `toNum()` (`lib/finanzas/types.ts`) al cargar. Redondeo
por moneda con `roundFor` (BTC usa 8 decimales), **nunca `round2`** en montos
nativos.

### 3.1 `fin_budget_lines` — la plantilla

```sql
create table public.fin_budget_lines (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  name           text,                          -- alias opcional (§0)
  input_currency text not null check (input_currency in ('USD','BOB','USDT','USDC','BTC')),
  retroactive    boolean not null default true, -- contar el gasto anterior al created_on del período de creación
  created_on     date not null default current_date,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on public.fin_budget_lines (user_id, sort_order);
```

**Sin `archived`.** Borrar la línea la elimina de verdad, y la cascada se
lleva sus categorías, períodos, ampliaciones y cierres. Archivar la *categoría*
(sprint-1) no toca la línea — su gasto real futuro simplemente queda en 0 y
deja de pedir cierres (§4.10).

**Sin `rollover_mode`.** El arrastre pasó de config de la línea a decisión por
período (`fin_budget_closures`, §3.4).

### 3.2 `fin_budget_line_categories` — la puente

```sql
create table public.fin_budget_line_categories (
  id          uuid primary key default gen_random_uuid(),
  line_id     uuid not null references public.fin_budget_lines(id) on delete cascade,
  category_id uuid not null references public.fin_categories(id)  on delete cascade,
  created_at  timestamptz not null default now(),
  unique (line_id, category_id)
);

create index on public.fin_budget_line_categories (line_id);

-- ⚠️ La restricción que le da sentido al tope general: una categoría no puede
-- estar en dos líneas a la vez, o el general contaría su gasto doble. Como una
-- línea se borra de verdad (no un toggle), alcanza con un índice único plano —
-- y no hace falta acotarlo por usuario: un `category_id` (UUID) pertenece a un
-- solo usuario, así que "único global" ya es "único por usuario".
create unique index on public.fin_budget_line_categories (category_id);
```

`fin_budget_line_categories` no tiene `user_id` propio — cuelga de la línea, y
sus policies validan a través de ella, igual que `fin_recurring_splits`
(sprint-3 §3.4).

### 3.3 `fin_budget_periods` — los montos por mes

```sql
create table public.fin_budget_periods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  line_id       uuid not null references public.fin_budget_lines(id) on delete cascade,
  period        date not null,                 -- primer día del mes
  amount         numeric(24,8) not null check (amount > 0),
  exchange_rate numeric(24,8) not null,        -- congelada al escribir (USD por 1 unidad)
  amount_usd    numeric(14,2) not null,        -- derivado: amount × exchange_rate
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (line_id, period)
);

create index on public.fin_budget_periods (user_id, period);
```

Solo se guardan los meses que alguien tocó:

```
montoOriginal(línea, período) =
    si existe fila para (línea, período)              → esa fila
    si no → la fila del período anterior más reciente que sí exista (herencia)
    si no hay ninguna                                 → null (línea sin monto todavía)
```

`amount_usd` se congela igual que en un movimiento (sprint-1 §4.2). Editar el
monto de un período **re-congela** `exchange_rate`/`amount_usd` con la tasa de
ese momento; los otros períodos no se tocan (§4.9).

### 3.4 `fin_budget_extensions` — el rastro de cada ampliación

```sql
create table public.fin_budget_extensions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  period_id     uuid not null references public.fin_budget_periods(id) on delete cascade,
  amount         numeric(24,8) not null check (amount > 0),
  exchange_rate numeric(24,8) not null,
  amount_usd    numeric(14,2) not null,
  created_at    timestamptz not null default now()
);

create index on public.fin_budget_extensions (period_id);
```

```
montoAmpliado(línea, período) = Σ fin_budget_extensions.amount_usd de ese período
montoEfectivo(línea, período) = montoOriginal.amount_usd + montoAmpliado
```

Si el período todavía no tiene fila en `fin_budget_periods` y llega la primera
ampliación, la mutación **materializa** el período primero (con el monto
heredado de §3.3), y recién ahí inserta la extensión.

### 3.5 `fin_budget_closures` — la decisión de cierre de cada mes

```sql
create table public.fin_budget_closures (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  line_id    uuid not null references public.fin_budget_lines(id) on delete cascade,
  period     date not null,                 -- el período que se cierra
  carried    boolean not null,              -- true = se lleva al mes siguiente
  amount_usd numeric(14,2) not null,        -- el disponible CONGELADO al decidir (puede ser negativo)
  decided_at timestamptz not null default now(),
  unique (line_id, period)
);

create index on public.fin_budget_closures (user_id, period);
```

- **`amount_usd` puede ser negativo** — es el disponible real de ese mes al
  cerrar; un mes en rojo se cierra igual que uno en verde.
- **Se congela al responder, no se recalcula.** Si más adelante se edita o se
  backfillea un movimiento con fecha de ese mes ya cerrado, el número que se
  llevó no cambia — es historia, como `exchange_rate` en una fila vieja.
- **La ausencia de fila es la pregunta pendiente.** Un período terminado de
  una línea activa, sin fila acá, es lo que la UI detecta para el banner
  "tenés un mes por cerrar". Nunca un flag, siempre una existencia — mismo
  principio que el estado de un fijo o de una deuda.

### 3.6 RLS — mismo criterio, sin excepciones

```sql
alter table public.fin_budget_lines            enable row level security;
alter table public.fin_budget_line_categories  enable row level security;
alter table public.fin_budget_periods          enable row level security;
alter table public.fin_budget_extensions       enable row level security;
alter table public.fin_budget_closures         enable row level security;
```

Las 4 tablas con `user_id` propio: las 4 policies `to authenticated`,
`user_id = auth.uid()`, `with check` en el update (copiar el bloque de
`fin_accounts`). `fin_budget_line_categories` no tiene `user_id` — valida a
través de la línea, igual que `fin_recurring_splits` (sprint-3 §3.4):

```sql
create policy fin_budget_line_categories_select on public.fin_budget_line_categories
  for select to authenticated
  using (exists (select 1 from public.fin_budget_lines l where l.id = line_id and l.user_id = auth.uid()));
-- idem insert (with check) / update / delete
```

---

## 4. Reglas de negocio

### 4.1 Gasto real por línea

```
categorías(línea)          = las de fin_budget_line_categories

gasto_bruto(línea, período) = Σ tx.amount_usd
                              donde tx.category_id ∈ categorías(línea),
                                    tx.type = 'gasto', tx.flow_type = 'consumo',
                                    tx.date en el período
                              (y tx.date ≥ línea.created_on  si el período es el
                               de creación y línea.retroactive = false)

repartido(línea, período)   = Σ deuda.principal_usd
                              donde deuda.origin_transaction_id ∈ esos gastos,
                                    deuda.status ≠ 'condonada'

gasto_real(línea, período)  = gasto_bruto − repartido
```

`repartido` suma `principal_usd`, no `amount_usd` — el margen de un reparto
por encima del costo no descuenta presupuesto (misma lógica que `repartidoUsd`
en `lib/finanzas/debts.ts`, sprint-2 §4.5). Incluye las deudas **pendientes**:
la parte de otro no es tu gasto, te la haya pagado o no.

### 4.2 Comprometido — lo que Fijos ya avisa que vas a pagar

```
comprometido(línea, período) = Σ fijo.amount   (convertido a USD con la tasa de hoy)
                               donde fijo.category_id ∈ categorías(línea),
                                     fijo.active = true,
                                     recurringStatus(fijo).status ∈ {'pendiente','vencido'}
```

Reusa `recurringStatus` de `lib/finanzas/recurring.ts` (sprint-3). Un fijo ya
registrado este mes no está comprometido: su gasto ya cayó en `gasto_real`.

### 4.3 Disponible

```
disponibleSinCarry(línea, período) = montoEfectivo(línea, período)
                                     − gasto_real(línea, período)
                                     − comprometido(línea, período)

disponible(línea, período) = disponibleSinCarry + carriedInto(línea, período)
```

### 4.4 Carry — un solo salto atrás, no una cadena

```
carriedInto(línea, período) =
    si existe fin_budget_closures para (línea, período_anterior) con carried = true
        → su amount_usd
    si no → 0
```

**No es recursivo.** El `amount_usd` del cierre del mes anterior **ya es** su
`disponible(línea, período_anterior)` final, que a su vez ya incluía su propio
carry. Mirar un solo mes atrás alcanza siempre.

### 4.5 El cierre mensual — la pregunta, no una config

Un período de una línea activa está **listo para cerrar** cuando ya terminó
(`hoy > último día del período`) y no tiene fila en `fin_budget_closures`. La
UI lo detecta al cargar `/finanzas/presupuesto` y presenta, **una línea a la
vez** (encadenadas si hay varias):

```
Julio — Comida: te sobraron $12,50
[ Llevar a agosto ]   [ Que quede como ahorro ]

Julio — Ocio: te pasaste $4,00
[ Restar a agosto ]   [ Que no afecte nada ]
```

Cualquiera de las dos respuestas crea la fila con `carried` en true/false y
`amount_usd = disponible(línea, período)` **tal cual estaba al responder**. Sin
tercera opción de "llevar solo una parte" (§2).

**No fuerza nada.** Si se ignora el banner, el mes siguiente no recibe carry
hasta que se responda — respondible meses después, con el número de aquel
entonces.

### 4.6 Bloqueo y ampliación — solo en categorías con línea

Al guardar un `gasto·consumo` cuya `category_id` pertenece a alguna línea:

```
disponibleTrasElGasto = disponible(línea, período_actual) − monto_del_gasto_nuevo
```

Si da negativo, el quick-add **bloquea** y ofrece "Ampliar +$X" (el faltante,
prellenado y editable). Confirmar:
1. `extendBudget(line_id, período, faltante)` — materializa el período si hace
   falta, inserta la extensión.
2. `createTransaction(...)` — el gasto.

Dos escrituras sin transacción SQL (mismo límite ya aceptado en sprint-2 §6):
si la 2ª falla, se avisa; la ampliación queda y se corrige a mano.

Vive en el cliente (mismo principio que el tope de saldo, sprint-1 §4.5).
Editar un gasto que lo hace pasarse también dispara el bloqueo, revirtiendo el
efecto del propio movimiento (como `availableFrom`).

**El tope general nunca pasa por esto.**

### 4.7 El tope general — agregado, nunca restricción

```
gasto_real_total(período) = Σ gasto_real(cat, período)   para TODAS las categorías de gasto,
                            tengan o no línea propia

monto_general_efectivo(período) = Σ montoEfectivo(línea, período)   de las líneas con presupuesto
```

Se muestra con su propia barra. **No tiene carry ni cierre propios** — es un
agregado puro, sin fila en `fin_budget_lines` y por lo tanto sin lugar en
`fin_budget_closures` (§3, todas las tablas cuelgan de `line_id`). El carry y
el "cierre del general" que este documento planteó en su primera versión
quedaron **fuera del Sprint 5**: cerrar cada línea ya congela su propio
disponible, y el sobrante agregado que necesita el Ahorro (Feature 6) sale de
`disponibleSinCarry` sumado sobre las líneas, sin necesidad de una decisión de
cierre a nivel general. Si más adelante se quiere un rollover del tope global,
entra con su propia tabla en el sprint que lo pida.

### 4.8 Barra de ritmo: solo el tick

```
díasDelPeríodo  = días en el mes del período
díaDeReferencia = si el período es el actual → día de hoy;  si es pasado → díasDelPeríodo

posiciónDelTick = (díaDeReferencia / díasDelPeríodo) × montoEfectivo(línea, período)
```

El progreso de la barra es `gasto_real` (o `disponible`, según el toggle §0)
sobre `montoEfectivo`. Rojo cuando `gasto_real > montoEfectivo`.

### 4.9 Editar no toca el historial

`fin_budget_periods` es una fila por mes — cambiar agosto no toca julio. Un
cierre ya respondido no se recalcula (§3.5).

### 4.10 Categorías archivadas

Archivar una categoría (sprint-1) no borra la línea que la contiene ni sus
períodos. El historial se sigue mostrando; el gasto real futuro de esa
categoría queda en 0. Una línea **todas cuyas categorías están archivadas**
deja de mostrar preguntas de cierre pendientes (queda como "no" implícito).

### 4.11 Atomicidad

Crear una línea con sus categorías y su primer monto son 3 inserts; guardar un
gasto con ampliación son 2; responder un cierre es 1. Sin transacción SQL
(mismo caso de sprint-2 §6 / sprint-4 §9): si falla un paso posterior, se
deshace lo anterior cuando se puede y se avisa con un mensaje específico.

---

## 5. Estructura de archivos

```
app/finanzas/presupuesto/page.tsx      — progreso por línea + tope general +
                                         banner de cierres pendientes + "Nueva"

app/finanzas/components/
├── budget-line-sheet.tsx     — crear/editar una línea (categorías por chips,
│                                monto, moneda, retroactividad)
├── budget-closure-sheet.tsx  — la pregunta de fin de mes, una línea a la vez
└── (el bloqueo del quick-add vive INLINE en quick-add.tsx, no en un archivo
    aparte — mismo criterio que la referencia §0.3)

lib/finanzas/budgets.ts
├── periodStart / periodRange / nextPeriod / previousPeriod  — el mes como date
├── resolvePeriodAmount(line, periods, period)   — herencia del mes anterior (§3.3)
├── effectiveUsd(line, periods, extensions, period)          — montoEfectivo (§3.4)
├── gastoRealForLine(line, cats, allTx, debts, period)       — bruto − repartido (§4.1)
├── committedForLine(line, cats, recurring, allTx, rates, period)  — comprometido (§4.2)
├── carriedInto(line, closures, period)                      — un salto atrás (§4.4)
├── availableForLine(...)                                    — el disponible (§4.3)
├── generalAggregate(lines, ..., allCategories, period)      — el tope general (§4.7)
├── pendingClosures(lines, ..., todayISO)                    — meses por cerrar (§4.5)
├── budgetBar(spent, effective, period, todayISO, mode)      — progreso + tick (§4.8)
└── validateBudgetLine(...)                                  — categorías, monto, duplicados
```

`data-context.tsx` crece con: `budgetLines`, `budgetLineCategories`,
`budgetPeriods`, `budgetExtensions`, `budgetClosures` en el estado;
`createBudgetLine`, `updateBudgetLine`, `deleteBudgetLine`,
`setBudgetPeriodAmount`, `extendBudget`, `closeBudgetPeriod` como mutaciones; y
`budgetView` (el mapa línea → {spent, committed, available, effective, bar}
del período actual) + `availableForCategory(categoryId)` como valores
derivados — el quick-add lo necesita en cualquier pantalla. `load()` suma 5
consultas al `Promise.all`.

`app/finanzas/page.tsx` (Home) gana un tile de presupuesto (general + la línea
más "en rojo", con su barra).

`app/finanzas/ajustes/page.tsx` gana el toggle "gastado / disponible" y un
"Agregar presupuesto a las categorías que faltan" (abre el sheet con las
categorías sin línea).

`app/finanzas/components/quick-add.tsx`: antes de `createTransaction` para un
`gasto`, si `availableForCategory(categoryId) − amount < 0`, muestra el bloque
inline con "Ampliar +$X" en vez de guardar directo.

### 5.1 Regla de independencia

Sin cambios respecto de sprint-1 §5.1. `lib/finanzas/budgets.ts` no importa de
`next/*` ni del alias `@/`.

---

## 6. Cómo se leen y escriben los datos

Mismo patrón que Sprints 1–4 — sin rutas API, todo `supabase.from('fin_...')`
directo desde componentes cliente, RLS como única barrera.

- **Crear línea** (`createBudgetLine`): valida en el cliente que ninguna
  categoría elegida ya esté en otra línea (§3.2); `insert` en
  `fin_budget_lines`, después `insert` de las filas de
  `fin_budget_line_categories`, después `insert` del primer
  `fin_budget_periods` (con `exchange_rate`/`amount_usd` congelados). Si un
  paso falla, se borra la línea recién creada.
- **Editar línea**: `update` de `name`/categorías (reemplazo completo de la
  puente, como `setRecurringSplits`). `retroactive` **no** es editable.
- **Monto de un período** (`setBudgetPeriodAmount`): `upsert` sobre
  `(line_id, period)` con la tasa recongelada.
- **Ampliar** (`extendBudget`): si no hay fila para el período, materializarlo
  primero con el monto heredado; después `insert` en `fin_budget_extensions`.
- **Cerrar un mes** (`closeBudgetPeriod`): calcular `disponible(línea,
  período)` en el cliente y `insert` en `fin_budget_closures` con ese
  `amount_usd` + `carried`. Falla con un error claro si ya existe la fila
  (`unique (line_id, period)`).
- **Borrar línea**: `delete` sobre `fin_budget_lines` — la cascada hace el
  resto.

---

## 7. Antes de escribir la primera línea de código

Sin decisiones de diseño pendientes — §0 las cerró todas. Lo único que falta,
si querés arrancar con presupuestos reales: para cada categoría (o grupo) que
quieras controlar, tener a mano el monto mensual aproximado y en qué moneda lo
pensás.

Y, antes de nada: **correr la sección 15 de `supabase/schema.sql`** en el SQL
Editor.

---

## 8. Qué desbloquea

| Feature | Cómo se apoya |
|---|---|
| **Ahorro** (Feature 6, próximo) | El "sobrante del mes" para el reparto de ahorro sale directo de `disponibleSinCarry` del tope general; el presupuesto ya está construido |
| **Reportes** (Feature 8, congelada) | "Cuánto me sobró/faltó cada mes por categoría" ya está calculado acá, incluidas las decisiones de cierre |
| **Notificaciones** (Feature 10) | El estado de cada línea (en verde / cerca del tope / pasado) y los meses por cerrar ya están calculados; falta solo el envío pasivo |
| **Pantalla "Más"** | Con 3 pantallas sin slot, el Sprint 6 la construye (§0.1) |

⚠️ **Sin cron.** La detección de "mes listo para cerrar" es bajo demanda, al
cargar la pantalla — no un job. Vercel Hobby permite 1 cron/día y no hay
ninguno todavía.

⚠️ **El quick-add depende de los datos de presupuesto en cualquier pantalla**
(para poder bloquear), así que `budgetView` / `availableForCategory` se derivan
en `data-context.tsx` y viajan en el snapshot desde el día uno, no después.

---

## 9. Desarrollo (2026-09-09) — implementación completa

Sprint construido de una pasada sobre la spec de arriba. `npx tsc --noEmit`,
`npm run build` y `npx eslint app/finanzas lib/finanzas` en verde; humo de dev
sobre las 7 rutas de Finanzas (las 6 previas + `/finanzas/presupuesto`), todas
200.

### Qué se creó

- **`supabase/schema.sql` §15** — las 5 tablas (`fin_budget_lines`,
  `fin_budget_line_categories`, `fin_budget_periods`, `fin_budget_extensions`,
  `fin_budget_closures`), sus índices, el trigger `touch_updated_at` donde
  aplica, y las 4 policies RLS estándar por tabla (sin `is_admin()`, igual que
  §11–14). `fin_budget_line_categories` no tiene `user_id`: valida a través de
  la línea (`exists (… l.user_id = auth.uid())`), como `fin_recurring_splits`.
  El índice `unique (category_id)` global es lo que garantiza "una categoría en
  una sola línea" y evita el doble conteo del general.
- **`lib/finanzas/budgets.ts`** — módulo de cálculo puro (solo importa
  `./money` y `./types`). `periodStart` / `periodRange` / `nextPeriod` /
  `previousPeriod` / `periodLabel`; `resolvePeriodAmount` (herencia de un salto
  atrás); `effectiveAmount` (período + ampliaciones); `effectiveFromFor`
  (respeta `retroactive`); `gastoRealForCategories` (bruto − `principal_usd` de
  las deudas no condonadas, reusando el criterio de `debts.ts`);
  `committedForCategories`; `carriedInto` (un solo salto — el `amount_usd`
  congelado del cierre anterior ya incluye su propio arrastre);
  `availableUsd`; `budgetBar` (fill + reservado + tick de ritmo);
  `needsClosure`; `toNative`. Tipos: `BudgetLineView`, `BudgetGeneralView`,
  `PendingClosure`, `BudgetViewMode`, `BudgetBar`.
- **`app/finanzas/presupuesto/page.tsx`** — tope general (`<GeneralCard>`) +
  una tarjeta por línea (`<LineCard>`, clic → editar), banner de cierres
  pendientes (→ `<BudgetClosureSheet>`), enlace "Agregar presupuesto a N
  categorías más", botón "Nuevo".
- **`app/finanzas/components/budget-line-sheet.tsx`** — crear (chips de
  categorías, con las ya tomadas por otra línea deshabilitadas; alias; moneda;
  monto; check "contar lo ya gastado este mes") / editar (prefilled, sin
  cambiar moneda ni retroactividad, "monto de este mes" → `setBudgetPeriodAmount`,
  botón borrar).
- **`app/finanzas/components/budget-closure-sheet.tsx`** — la pregunta de fin
  de mes, una línea a la vez; encadena las pendientes; se cierra solo cuando la
  lista queda vacía.

### Qué se modificó

- **`data-context.tsx`** — 5 arrays nuevos en el estado y en el snapshot
  (`SNAPSHOT_VERSION = 2`), hidratados desde el cache; 5 consultas más en el
  `Promise.all` de `load()` (`fin_budget_lines` ordenado por `sort_order` y
  después `created_at` para que el orden sea estable con todos en 0);
  `budgetViewMode` en estado con persistencia en `localStorage` (`fz:budgetmode`);
  el memo `budgetView` (líneas + general + cierres pendientes + período);
  `availableForCategory(categoryId)`; y las 6 mutaciones (`createBudgetLine`,
  `updateBudgetLine`, `deleteBudgetLine`, `setBudgetPeriodAmount`,
  `extendBudget`, `closeBudgetPeriod`), cada una con compensación manual donde
  hay más de un insert.
- **`quick-add.tsx`** — antes de guardar un `gasto·consumo` nuevo con categoría
  que tiene línea, si `toUsd(monto) − disponible > 0` muestra el bloque inline
  "No alcanza el presupuesto" con "Ampliar $X" (convierte el faltante USD a la
  moneda de la línea, llama `extendBudget` y reintenta con `skipBudgetCheck`) y
  "Cancelar". Editar no dispara el bloqueo (recorte deliberado, ya anotado en
  §4.6 y en el código).
- **`nav-items.tsx`** — entrada "Presupuesto" (`IconChartBar`) entre Fijos y
  Cuentas, `mobileTab: false` (se llega desde la sidebar y el tile de la Home;
  la tab bar de móvil sigue con sus 5 slots — la pantalla "Más" es tarea del
  Sprint 6, §0.1).
- **`app/finanzas/page.tsx`** (Home) — tile de Presupuesto (general: gastado /
  efectivo + barra con tick) que enlaza a la pantalla; solo si hay al menos una
  línea con monto.
- **`app/finanzas/ajustes/page.tsx`** — panel "Presupuesto" con el toggle
  `gastado / disponible` (chips, `setBudgetViewMode`) y el atajo "Agregar
  presupuesto a N categorías que faltan" (abre `<BudgetLineSheet>` en modo
  crear).
- **`lib/finanzas/types.ts`** — `BudgetLine`, `BudgetLineCategory`,
  `BudgetPeriod`, `BudgetExtension`, `BudgetClosure`.

### Decisiones tomadas durante la implementación

1. **El tope general no tiene carry ni cierre propios.** La spec (§4.7, primera
   versión) los planteaba, pero `fin_budget_closures` cuelga de `line_id` y el
   general no es una fila. Cerrar cada línea ya congela su disponible, y el
   sobrante que necesita el Ahorro sale de sumar `disponibleSinCarry` por
   línea. §4.7 quedó reescrito para reflejarlo; un rollover del tope global,
   si se pide, entra con su propia tabla en otro sprint.
2. **`BudgetLineView.currency` es `Currency`, no `string`** — la UI la pasa
   directo a `formatMoney`, que exige el tipo estrecho.
3. **`sort_order` arranca en 0 para todas las líneas** (no hay UI de
   reordenamiento todavía); el desempate por `created_at` en `load()` hace que
   el orden no dependa de lo que devuelva Postgres.
4. **El bloqueo del quick-add es una barrera blanda** — tras ampliar, el gasto
   se guarda aunque el `amount_usd` recongelado de la extensión quede $0.01
   corto por redondeo. Es un freno de UX, no un invariante contable.
5. **La ampliación materializa el período heredado** antes de insertar la
   extensión (si la línea nunca tuvo fila para ese mes, primero se crea con el
   monto heredado y su tasa congelada).

### Pendiente para el usuario

**Correr `supabase/schema.sql` §15 en el SQL Editor** antes de abrir
`/finanzas/presupuesto` — las 5 tablas no existen todavía en la base.
