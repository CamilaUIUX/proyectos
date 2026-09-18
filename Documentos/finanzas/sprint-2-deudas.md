# Finanzas — Sprint 2: "Deudas"

> Mapa completo de features y roadmap: `features.md` en esta misma carpeta.
> Este documento especifica **únicamente el Sprint 2**, con alcance
> completo (no solo el núcleo mínimo) — decisión explícita del usuario del
> 2026-09-07.
>
> Última actualización: 2026-09-09 · Estado: **construido + revisado a fondo**.
> `npm run build` y `npm run lint` pasan limpios. Pendiente: correr la sección
> 12 de `supabase/schema.sql` en el proyecto real y probarlo con datos reales.
> Ver §9 para cómo quedó y §11 para la segunda revisión (8 bugs + 8
> divergencias corregidos, incl. el mecanismo de ganancia al cobrar).

---

## 0. Decisiones tomadas para este sprint

Ninguna de estas se preguntó una por una — son la versión ya corregida de
cómo el repo de referencia terminó resolviendo estas mismas preguntas (su
primera versión mezcló "compartido" y "deuda" en una sola tabla y tuvo que
rehacerla). Si alguna no encaja con cómo pensás usar la app, se ajusta acá
antes de programar, no a mitad de camino.

| Tema | Decisión | Por qué |
|---|---|---|
| **Deuda es una entidad propia** | `fin_debts`, sin depender de ningún gasto. Puede existir suelta (alguien te debe por cualquier motivo) o nacer de un gasto compartido | Es el error que el repo de referencia ya cometió y corrigió — lo evitamos de entrada |
| **Crear una deuda suelta no toca ninguna cuenta** | El saldo no se mueve hasta que se cobra. Una deuda es "fuera de libros" mientras está pendiente | Prestaste plata, te deben un favor, alguien no te pagó un trabajo — el origen no siempre es un movimiento tuyo dentro de la app |
| **Gasto compartido: se registra el bruto, sin descontar nada** | Pagás $30, generás deudas por $10 y $10 (dos amigos); el gasto sigue anotado en $30. El "costo neto" ($10 tuyo real) es un cálculo de reportes, no algo que se reste del gasto original | Reportes (ítem 8 del roadmap) está congelado — no tiene sentido construir el cálculo de "neto" antes de tener dónde mostrarlo. El bruto ya es correcto para saldo y para "cuánto gasté" |
| **Cobrar una deuda mueve saldo pero no cuenta como ingreso real** | Se crea un `ingreso` con una columna nueva, `flow_type = 'movimiento'` (vs. `'consumo'` para todo lo demás). Los totales del mes solo suman `'consumo'` | Es plata que vuelve, no plata nueva — ya lo decidimos así en `features.md` |
| **Condonar no crea ningún movimiento** | Solo cambia el estado de la deuda a `condonada`. La plata ya salió de tu bolsillo cuando se hizo el gasto (si vino de uno); condonar no es un segundo gasto | Evita duplicar el costo |
| **Se permite repartir por encima del total** | Sin validación de que las partes sumen el 100% del gasto. Si repartís de más, tu parte queda negativa — eso es ganancia, es una decisión válida | Mismo criterio que ya cerró el repo de referencia; agregar la validación después es fácil, sacarla es más trabajo |
| **Un cobro puede saldar varias deudas a la vez** | Siempre de la **misma persona** y la **misma moneda** — no se mezclan monedas en un solo cobro | Cubre el caso real ("Ana me pagó todo lo que me debía") sin la complejidad de repartir un cobro entre monedas distintas |
| **Personas con creación inline** | Un combobox: escribís el nombre, si no existe se ofrece crearla ahí mismo, sin salir del formulario | Es el mismo estándar de "menos de 10 segundos" del quick-add — parar a ir a Ajustes a crear una persona rompería eso |
| **Deudas no entra a la tab bar de móvil todavía** | Se llega desde el tile "Te deben $X" de la Home, y desde la sidebar en desktop. La tab bar sigue en sus 5 slots fijos (Inicio · Movimientos · + · Cuentas · Ajustes) | Agregar un 6º ícono aprieta el diseño que ya está resuelto. Si hace falta un acceso más directo cuando existan más pantallas (Fijos, Presupuesto...), ahí sí conviene una pantalla "Más" — se resuelve ese día, no antes |
| **El toggle "Es compartido" vive en el quick-add de gasto** | Una casilla que aparece solo para `gasto`, no un flujo aparte | Sin Fijos (ítem 3) todavía construido, no hay otro lugar natural donde nacería un gasto compartido recurrente — el repo de referencia hizo lo mismo antes de tener Fijos, y bajó de prioridad esta casilla recién cuando Fijos existió |

---

## 1. Objetivo del sprint

> **Pagar algo completo sin perder de vista quién me tiene que devolver
> cuánto, y cargar cualquier otra plata que me deban por lo que sea.**

Al terminar, la app responde:

1. ¿Quién me debe plata, cuánto y desde cuándo?
2. ¿Cuánto de lo que gasté este mes en total, ya sé que voy a recuperar?
3. Cuando me pagan, ¿cómo lo registro sin que se mezcle con mi ingreso real?

### Definición de "terminado"

- [x] Puedo cargar una deuda suelta (persona, monto, moneda, concepto,
      fecha) sin que exista ningún gasto detrás
- [x] Puedo crear una persona nueva escribiendo su nombre, sin salir del
      formulario (y renombrarla / archivarla desde Ajustes → Personas)
- [x] Puedo registrar un gasto compartido: pago el 100%, reparto entre 1 o
      más personas (contándome a mí), y se generan sus deudas
- [x] El reparto por defecto es parejo, pero puedo editar cada monto; veo
      "Tu parte: $X" (o "Ganás $X" si reparto de más)
- [x] La Home me dice "Te deben $X" (lo que ya vence) y ese total **no** se
      suma al patrimonio; la pantalla Deudas muestra el total completo
- [x] Puedo cobrar una deuda: elijo la cuenta, el saldo sube, y el costo
      **no** cuenta como ingreso del mes (la ganancia de un reparto de más, sí)
- [x] Puedo cobrar varias deudas de la misma persona (misma moneda) en un
      solo movimiento
- [x] Puedo condonar una deuda — no genera ningún movimiento, solo cambia
      su estado (y guarda la fecha)
- [x] Borrar el cobro devuelve la deuda a pendiente y el saldo baja de
      nuevo (y se lleva el movimiento de ganancia si lo hubo)
- [x] El quick-add de gasto normal sigue registrando en menos de 10
      segundos cuando "Es compartido" no está marcado
- [x] `npm run build` y `npm run lint` pasan sin errores
- [~] Verificado contra un Supabase real con datos — **pendiente** (falta
      correr `schema.sql`)

---

## 2. Alcance

Entra todo lo de la tabla de la conversación previa a este documento — nada
quedó afuera:

| Pieza | Alcance exacto |
|---|---|
| **Deudas sueltas** | Persona, monto, moneda, concepto (obligatorio si no viene de un gasto), fecha. No afecta ninguna cuenta al crearse |
| **Pantalla "Deudas"** | Lista de pendientes agrupadas por persona + total general, con condonadas/cobradas en un historial plegado |
| **Cobrar** | Una o varias deudas de la misma persona y moneda a la vez, contra una cuenta elegida |
| **Condonar** | Cambia el estado, sin movimiento |
| **Aviso en Home** | Tile o línea "Te deben $X", con link a la pantalla Deudas |
| **Gasto compartido** | Casilla "Es compartido" en el quick-add de gasto; reparto parejo **contándote a vos**, editable; muestra tu parte / tu ganancia |
| **Gasto real del mes** | Bruto − lo que le toca a otros (§4.5) — en la Home y en Deudas |
| **Ganancia al cobrar** | Repartir de más y cobrarla reconoce el margen como ingreso real (§4.9) |
| **Personas** (`fin_people`) | Nombre, creación inline + gestión (renombrar / archivar) desde Ajustes |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| "Gasto neto" **por categoría** en reportes | El gasto real del mes **sí** se muestra (§4.5); el desglose por categoría depende de Reportes/Presupuesto, hoy congelados. El dato ya queda guardado (`principal_usd` + `origin_transaction_id`) |
| Planes de pago / cuotas sobre una deuda | Es la Feature 4 del roadmap, aparte — una deuda suelta de este sprint es exactamente lo que un plan de pago necesita como punto de partida el día que se construya |
| Recordatorios / notificaciones de deudas viejas | Es la Feature "Notificaciones" del roadmap, más adelante |
| Cobro que reparte entre monedas distintas en un solo movimiento | Ver §0 — se resuelve cobrando cada moneda por separado |
| Deudas dentro de la tab bar móvil | Ver §0 — se llega por link desde Home, no por ícono propio, en este sprint |

---

## 3. Modelo de datos

Migración: se agrega a `supabase/schema.sql` como **sección 12** (este
proyecto no usa `supabase/migrations/` — ver sprint-1-movimientos.md §0.1).

### 3.1 Cambio sobre `fin_transactions` (del Sprint 1)

```sql
-- 12.1
alter table public.fin_transactions
  add column if not exists flow_type text not null default 'consumo'
  check (flow_type in ('consumo', 'movimiento'));

-- 12.1b — forma de flow_type (revisión 2026-09-09). Que una transferencia sea
-- un "movimiento" es una propiedad del dato, no una decisión de quien escribe:
-- lo deriva un trigger. El check se queda con lo que SÍ es decisión.
update public.fin_transactions set flow_type = 'movimiento'
  where type = 'transferencia' and flow_type <> 'movimiento';

create or replace function public.fin_normalize_flow_type()
returns trigger language plpgsql as $$
begin
  if new.type = 'transferencia' then new.flow_type := 'movimiento'; end if;
  return new;
end; $$;

drop trigger if exists fin_tx_flow_type on public.fin_transactions;
create trigger fin_tx_flow_type
  before insert or update on public.fin_transactions
  for each row execute function public.fin_normalize_flow_type();

alter table public.fin_transactions add constraint fin_tx_flow_shape check (
  (type = 'transferencia' and flow_type = 'movimiento')
  or (type = 'ingreso' and flow_type = 'movimiento' and category_id is null)
  or (type in ('gasto','ingreso') and flow_type = 'consumo')
);
```

`'consumo'` es cualquier gasto/ingreso real (todo lo del Sprint 1 queda ahí
por default). `'movimiento'` es plata que cambia de forma sin ser gasto o
ingreso real — el **reembolso** de un cobro de deuda. Los totales del mes
(`monthTotals()`, `lib/finanzas/transactions.ts`) suman únicamente
`flow_type = 'consumo'`. El check exige además que un `ingreso · movimiento`
(reembolso) nunca lleve categoría — contaminaría un reporte futuro de
ingresos por categoría.

### 3.2 `fin_people`

```sql
create table public.fin_people (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index on public.fin_people (user_id, archived, sort_order);

-- Sin dos "Ana" y "ana" (el error más fácil de la creación inline por nombre).
-- Parcial sobre no-archivadas: un nombre se puede reusar tras archivar, y el
-- <PersonPicker> ofrece "Reactivar «Ana»" si escribís el nombre de una archivada.
create unique index fin_people_user_name_idx
  on public.fin_people (user_id, lower(name)) where not archived;
```

Se administran desde **Ajustes → Personas** (renombrar, archivar/borrar según
tengan deudas, reactivar) — `updatePerson` / `deleteOrArchivePerson` en
`data-context.tsx`.

### 3.3 `fin_debts`

```sql
create table public.fin_debts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  person_id              uuid not null references public.fin_people(id) on delete restrict,
  concept                text,
  amount                 numeric(24,8) not null check (amount > 0),
  currency               text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  exchange_rate          numeric(24,8) not null,
  amount_usd             numeric(14,2) not null,
  -- Cuánto de `amount_usd` es RECUPERAR costo real. La ganancia es siempre
  -- `amount_usd − principal_usd` — casi siempre 0, salvo un reparto por
  -- encima de lo pagado. Se reconoce como ingreso real recién AL COBRAR (§4.9).
  principal_usd          numeric(14,2) not null default 0,
  incurred_on            date not null default current_date,
  status                 text not null default 'pendiente' check (status in ('pendiente','cobrada','condonada')),
  waived_on              date,  -- cuándo se condonó (solo si status = 'condonada')
  -- restrict, no set null (ver §9): con set null, borrar el gasto de origen de
  -- una deuda de reparto la dejaría sin origin_transaction_id NI concept →
  -- violaría fin_debt_origin_shape. Mejor bloquear el borrado con un mensaje claro.
  origin_transaction_id  uuid references public.fin_transactions(id) on delete restrict,
  -- set null acá sí: la app ya des-salda la deuda ANTES de borrar el cobro (§4.6);
  -- el FK es solo la red de seguridad.
  settled_transaction_id uuid references public.fin_transactions(id) on delete set null,
  -- El OTRO movimiento de un cobro CON MARGEN: settled_transaction_id es el
  -- reembolso (flow_type movimiento), este es la ganancia (flow_type consumo).
  -- Solo para que des-saldar borre los dos (§4.6 / §4.9).
  settled_margin_transaction_id uuid references public.fin_transactions(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint fin_debt_origin_shape check (
    origin_transaction_id is not null or (concept is not null and length(trim(concept)) > 0)
  ),
  -- 'cobrada' siempre trae el movimiento que la saldó, y ningún otro estado
  -- lo trae. `status` nunca es null (tiene default) → comparar con `=` es seguro.
  constraint fin_debt_settle_shape check (
    (status = 'cobrada' and settled_transaction_id is not null)
    or (status <> 'cobrada' and settled_transaction_id is null)
  ),
  constraint fin_debt_principal_shape check (principal_usd >= 0 and principal_usd <= amount_usd),
  -- No hay "movimiento de margen" sin el cobro principal que lo trajo.
  constraint fin_debt_margin_needs_settle check (
    settled_margin_transaction_id is null or settled_transaction_id is not null
  )
);

create index on public.fin_debts (user_id, status, person_id);
create index on public.fin_debts (origin_transaction_id);
create index on public.fin_debts (settled_transaction_id);
create index on public.fin_debts (settled_margin_transaction_id);
-- Una persona no aparece dos veces en el reparto del mismo gasto.
create unique index on public.fin_debts (origin_transaction_id, person_id)
  where origin_transaction_id is not null;

drop trigger if exists fin_debts_touch_updated_at on public.fin_debts;
create trigger fin_debts_touch_updated_at
  before update on public.fin_debts
  for each row execute function public.touch_updated_at();
```

Las columnas `principal_usd` / `waived_on` / `settled_margin_transaction_id`
se agregaron en la revisión del 2026-09-09 — en `schema.sql` están también
como `alter … add column if not exists` idempotentes (§12.3b) con backfill
conservador (`principal_usd = amount_usd`, `waived_on = updated_at::date`).

**No hay tabla de "splits"** — un gasto compartido entre 2 personas es,
simplemente, 2 filas de `fin_debts` con el mismo `origin_transaction_id`.
Es la misma simplificación que el repo de referencia adoptó después de
tirar su primer intento.

**`exchange_rate`/`amount_usd` se congelan igual que en un movimiento**
(§4.2 del sprint 1) — necesario para poder sumar "Te deben $X" en USD sin
importar en qué moneda esté cada deuda.

⚠️ **Recordatorio de la revisión del Sprint 1:** `amount`, `exchange_rate`
y `amount_usd` son columnas `numeric` — Supabase las devuelve como texto,
no como número. Hay que pasarlas por `toNum()` (`lib/finanzas/types.ts`) al
leerlas, igual que ya se hace con `fin_transactions` en
`data-context.tsx`.

### 3.4 RLS — mismo criterio que el Sprint 1, sin excepciones

```sql
alter table public.fin_people enable row level security;
alter table public.fin_debts  enable row level security;

-- Las 4 policies por tabla (select/insert/update/delete), `to authenticated`,
-- `user_id = auth.uid()`, `with check` en el update — copiadas de fin_accounts
-- (sprint-1 §3.5). Sin excepción de admin.
```

---

## 4. Reglas de negocio

### 4.1 Deuda suelta

Se carga con persona (existente o creada ahí mismo), monto, moneda,
concepto y fecha. Se congela `exchange_rate`/`amount_usd` igual que un
movimiento (§4.2 del sprint 1). **No se crea ninguna fila en
`fin_transactions`** — no hay cuenta de origen, no hay saldo que mover.

### 4.2 Gasto compartido

Al marcar "Es compartido" en el quick-add de un `gasto`:

1. El gasto se registra **tal cual** — bruto completo, `flow_type =
   'consumo'`, misma cuenta y categoría de siempre. Nada de esto cambia.
2. Por cada persona elegida con un monto > 0 (validado **después** de
   redondear a la moneda — un split que redondea a 0 no genera fila), se
   crea una fila en `fin_debts` con `origin_transaction_id` = el id de ese
   gasto, `incurred_on` = la fecha del gasto, `concept` = null.
3. El reparto por defecto es parejo **contándote a vos** (`sharedSplitEven`,
   `lib/finanzas/debts.ts`): N+1 participantes, cada uno de los demás recibe
   la parte redondeada **hacia abajo**, tu parte es el resto — así el
   redondeo, si lo hay, va a tu favor. El editor muestra "Tu parte: $X" (o
   "Ganás $X" si repartiste de más). Cada monto es editable; **sin validar
   que sume el total** (§0).
4. `principal_usd` de cada deuda se congela prorrateado: si
   `Σ reparto > gasto`, `ratio = gasto / Σ reparto` y
   `principal_usd = min(amount_usd, round2(amount_usd × ratio))`. Si
   repartiste ≤ lo que pagaste, `ratio = 1` y `principal_usd = amount_usd`
   (el caso de siempre). El margen se reconoce recién al cobrar (§4.9).

### 4.3 Cobrar (una o varias deudas)

Solo se pueden seleccionar juntas deudas de la **misma persona y la misma
moneda**. `settleDebts` (`data-context.tsx`):

1. Chequea el monto contra una **banda de cordura** (0,5×–2× de lo esperado
   en USD) — solo atrapa un typo de orden de magnitud ("15" por "150"); una
   propina o un redondeo pasan y la diferencia va sola al patrimonio, como
   en la referencia.
2. Parte el cobro según el margen de las deudas elegidas (§4.9): el costo va
   como `ingreso · flow_type='movimiento'` (**reembolso**), el excedente como
   `ingreso · flow_type='consumo'` (**ganancia** — sí cuenta como ingreso
   real). Si no hay margen, es un solo movimiento.
3. `update` de las deudas a `status='cobrada'` con `settled_transaction_id`
   (= el reembolso, o la ganancia si el cobro fue 100% margen) y
   `settled_margin_transaction_id` (= el otro, si hay dos). El `update` filtra
   `.eq('status','pendiente')` y verifica el conteo — si otra pestaña cobró
   alguna en el medio, se revierte y se borran los movimientos creados (B1).

Borrar cualquiera de esos `ingreso` (desde Movimientos) devuelve las deudas a
`pendiente` y se lleva también al otro movimiento del par — ver §4.6.

### 4.4 Condonar

Cambia `status` a `condonada` y guarda `waived_on` = hoy. No crea ni modifica
ningún movimiento, no mueve saldo. El `update` filtra `.eq('status','pendiente')`
— si se cobró en otra pestaña, avisa en vez de romper con un error crudo.

### 4.5 Gasto real del mes, y qué se muestra

```
gasto_bruto_usd = Σ amount_usd  donde type='gasto'   y flow_type='consumo'  y mes
ingreso_mes_usd = Σ amount_usd  donde type='ingreso' y flow_type='consumo'  y mes
repartido_usd   = Σ principal_usd  de las deudas NO condonadas cuyo gasto de
                                    origen cae en el mes          (incluye pendientes)
gasto_real_usd  = gasto_bruto_usd − repartido_usd
```

- `repartido_usd` suma `principal_usd` (no `amount_usd`): el margen no es
  costo de nadie. Incluye las **pendientes** — la parte de otro no es tu
  gasto, te la haya pagado o no. Excluye las **condonadas** — perdonarla es
  decidir gastarla vos, así vuelve a `gasto_real`.
- Un cobro (`ingreso · movimiento`) queda afuera de `ingreso_mes_usd` pero sí
  suma al saldo y al patrimonio. La **ganancia** de un cobro con margen
  (`ingreso · consumo`) sí entra a `ingreso_mes_usd`.
- La **Home** muestra el gasto **real** (con el bruto en chico debajo cuando
  hay reparto); el delta del mes usa el real. La pantalla **Deudas** muestra
  "de lo que gastaste este mes, $X le toca a otros".
- `repartidoUsd` / `gastoRealUsd` viven en `lib/finanzas/debts.ts`.

### 4.6 Borrar un cobro devuelve las deudas a pendiente

`deleteTransaction`, al borrar un movimiento que sea `settled_transaction_id`
**o** `settled_margin_transaction_id` de una o más deudas:

1. Devuelve esas deudas a `status='pendiente'`, `settled_transaction_id` y
   `settled_margin_transaction_id` en `null`. Este paso va **antes** del
   `delete` y el orden está forzado: un `on delete set null` directo sobre
   una fila `cobrada` la dejaría sin `settled_transaction_id` → violaría
   `fin_debt_settle_shape` y bloquearía el propio `delete`.
2. Si el cobro tenía margen (dos movimientos), borra también al **hermano**
   — si no, la ganancia quedaría huérfana contando como ingreso real de un
   cobro que ya no existe.
3. Recién entonces, `delete` de la transacción.

### 4.7 "Te deben $X" — dos números distintos

```
pendingDebtUsd = Σ amount_usd  donde status = 'pendiente'                    (TODAS)
dueDebtUsd     = Σ amount_usd  donde status = 'pendiente' y (no es cuota de plan
                               o incurred_on ≤ hoy + 7 días)
```

- La **pantalla Deudas** muestra `pendingDebtUsd` — el total real que te deben.
- La **alerta de la Home** muestra `dueDebtUsd` — no adelanta las cuotas
  futuras de un plan de pago (un préstamo de $1000 en 10 cuotas no dice "Te
  deben $1000" el día uno). Una deuda suelta cuenta siempre; una cuota de un
  plan, solo si venció o vence dentro de 7 días.

Ninguno se suma al patrimonio (§4.3 del sprint 1 no cambia): es dinero que
todavía no es tuyo. `pendingTotalUsd` / `dueDebtUsd` en `lib/finanzas/debts.ts`.

### 4.8 Borrado de personas

Mismo criterio que las cuentas (§4.6 del sprint 1): sin deudas asociadas se
borra; con deudas (de cualquier estado, incluidas cobradas o condonadas —
son historial) se archiva. Se hace desde **Ajustes → Personas**.

### 4.9 Ganancia al cobrar (margen)

Repartir un gasto por encima de lo que pagaste es válido (`features.md`):
cobrás $8 por algo que te costó $6, y esos $2 son ganancia. Pero la ganancia
**se reconoce al cobrar, no al crear el gasto** — si se contara antes,
estaría contada dos veces, y el "gasto real" del mes se iría en negativo sin
que nadie te haya pagado un centavo.

- Cada deuda congela `principal_usd` = cuánto de ella es recuperar costo
  (§4.2 paso 4). `amount_usd − principal_usd` es el margen.
- Al cobrar (`settleDebts`), el margen se prorratea sobre el monto **real**
  que entra: `marginRatio = Σ(amount_usd − principal_usd) / Σ amount_usd`,
  `ganancia = roundFor(monto × marginRatio, moneda)`, `reembolso = monto −
  ganancia`.
- El reembolso es `ingreso · flow_type='movimiento'` (no cuenta como ingreso
  real); la ganancia es `ingreso · flow_type='consumo'` (sí cuenta, con
  descripción "Ganancia — cobro de <persona>"). `settle-sheet` avisa
  "≈ $X de esto es ganancia".
- Una deuda suelta y las cuotas de un plan siempre tienen
  `principal_usd = amount_usd` → margen 0, un solo movimiento al cobrar.

---

## 5. Estructura de archivos

```
app/finanzas/deudas/page.tsx       — pantalla: lista por persona (con antigüedad)
                                     + historial + acciones + "repartido este mes"

app/finanzas/components/
├── person-picker.tsx    — combobox de persona con creación inline / reactivar archivada
├── debt-sheet.tsx        — alta de una deuda suelta
├── split-editor.tsx       — reparto parejo (contándote) editable, usado por quick-add
├── settle-sheet.tsx       — cobrar 1..n deudas de una persona (+ aviso de ganancia)
└── quick-add.tsx          — casilla "Es compartido" (gasto)

app/finanzas/ajustes/page.tsx      — sección "Personas" (renombrar / archivar / borrar)

lib/finanzas/debts.ts
├── pendingTotalUsd / dueDebtUsd       — "Te deben" total vs. lo que ya vence (§4.7)
├── groupByPerson(debts, people, hoy)  — con oldest_days, ordenado por deuda desc
├── splitEven (primitivo, number[])    — N partes que suman el total (planes / fijos)
├── sharedSplitEven → {shares, mine}   — reparto contándote (§4.2)
├── shareBreakdown / splitPrincipalRatio / marginUsdOf
├── repartidoUsd / gastoRealUsd        — el gasto real del mes (§4.5)
├── daysBetween
└── validateDebtShape                  — espejo de fin_debt_origin_shape
```

`data-context.tsx` crece con: `people` / `debts` en el estado;
`createPerson`, `updatePerson`, `createDebt`, `createSharedExpense`,
`settleDebts`, `waiveDebt`, `deleteDebt`, `deleteOrArchivePerson` como
mutaciones; y `pendingDebtUsd` / `dueDebtUsd` / `monthRepartidoUsd` /
`monthGastoRealUsd` como valores derivados. `load()` suma `fin_people` y
`fin_debts` (`select *`, así toma las columnas nuevas) al `Promise.all`.
`toNum()` se aplica a `amount` / `exchange_rate` / `amount_usd` /
`principal_usd`.

`tx-row.tsx` (del Sprint 1) necesita saber si un movimiento es el cobro de
una deuda, para mostrar "Cobro de <persona>" en vez de "Ingreso" — se
resuelve con un mapa `settledByTxId` que `data-context.tsx` deriva de
`debts` y expone junto al resto.

---

## 6. Cómo se leen y escriben los datos

Mismo patrón que el Sprint 1 (sprint-1-movimientos.md §6): sin rutas API,
todo `supabase.from('fin_...')` directo desde componentes cliente, RLS como
única barrera.

- **Deuda suelta**: `insert` directo en `fin_debts` con
  `origin_transaction_id: null`.
- **Gasto compartido**: dos pasos en la misma función de mutación —
  `insert` en `fin_transactions` (igual que cualquier gasto), leer el `id`
  insertado, y un segundo `insert` (con `.insert([...])` de varias filas a
  la vez) en `fin_debts` con ese `origin_transaction_id`. Si el segundo paso
  falla, el gasto ya quedó guardado — se avisa el error pero **no** se
  revierte el gasto (no hay transacciones multi-tabla del lado del cliente;
  es preferible un gasto sin deudas generadas, corregible a mano, a
  perder el registro del gasto).
- **Cobrar** (§4.3): 1..2 `insert` de `ingreso` (reembolso y/o ganancia),
  después `update` de las deudas con `.eq('status','pendiente')` + conteo; si
  no matchean todas, se revierten las linkeadas y se borran los movimientos.
- **Condonar**: `update` de `fin_debts` (`status` + `waived_on`) con
  `.eq('status','pendiente')`.
- **Borrar un movimiento que saldó deudas** (§4.6): `update` de las deudas
  (por `settled_transaction_id` **o** `settled_margin_transaction_id`) a
  `pendiente` + ambos punteros en `null`; borrar el movimiento hermano si el
  cobro tenía margen; recién después el `delete` de la transacción.

---

## 7. Antes de escribir la primera línea de código

Ya no quedan decisiones de diseño pendientes (§0 las cerró todas). Lo único
que falta es, si ya tenés alguna deuda real hoy, tener a mano: quién te
debe, cuánto, en qué moneda y desde cuándo — para cargarla el primer día
que se pruebe la pantalla.

---

## 8. Qué desbloquea

- **Planes de pago** (Feature 4): parte de una deuda **ya cargada** con
  este sprint — no necesita ningún cambio de modelo, solo reestructurar
  una fila de `fin_debts` en varias cuotas.
- **Fijos** (Feature 3), cuando se construya: podrá marcar un fijo como
  "compartido" y generar sus deudas automáticamente al registrarlo, con la
  misma tabla `fin_debts` — la casilla manual del quick-add (§0) deja de
  ser el único camino, pero sigue sirviendo para lo suelto.
- **Reportes** (Feature 8, hoy congelada): el gasto real del mes ya se
  calcula y se muestra (§4.5); cuando Reportes se retome, ya tiene todo para
  el desglose **por categoría** — `origin_transaction_id` + `principal_usd`
  conectan cada deuda con su gasto.

---

## 9. Cómo quedó construido, y qué se simplificó (2026-09-07)

Todo el código vive en `app/finanzas/deudas/`, en los componentes nuevos de
`app/finanzas/components/` listados en §5, en `lib/finanzas/debts.ts`, y en
la sección 12 de `supabase/schema.sql`.

**Fiel a la especificación:** las cuatro decisiones más importantes del §0
—deuda como entidad propia, deuda suelta sin tocar cuentas, `flow_type`
para separar cobro de ingreso real, y reparto sin exigir que sume el
total— quedaron exactamente como se definieron.

**Un ajuste sobre el esquema, encontrado al escribir el SQL (no cambia
nada de lo decidido en §0):** `origin_transaction_id` quedó con
`on delete restrict`, no `on delete set null` como sugería el borrador de
§3.3. Con `set null`, borrar el gasto de origen de una deuda compartida
hubiera dejado la fila violando `fin_debt_origin_shape` (sin
`origin_transaction_id` y sin `concept`, porque ese campo lo deja vacío el
reparto) — un error de Postgres confuso en vez de un bloqueo intencional.
Con `restrict`, el mensaje que ve el usuario es claro: "generó una o más
deudas, borralas primero" (mismo criterio que ya bloquea borrar una cuenta
con movimientos).

**Simplificado a propósito** (estado al 2026-09-09):

| Se simplificó | En vez de | Estado |
|---|---|---|
| Ícono de persona: círculo neutro con un glifo genérico (`IconUserCircle`) | Un monograma con la inicial | Sigue así |
| Sugerencia de "monto recibido" en Cobrar sin "Comisión ≈ $X" | + comparación contra la tasa de referencia | Sigue así (mismo recorte que el quick-add, `sprint-1` §0.2) |
| Sin modo "editar deuda" | Un formulario de edición completo | Sigue así — borrar y recrear |
| Fallo parcial en **gasto compartido / registrar fijo** no se revierte | Una transacción SQL | Sigue así (sin transacciones multi-tabla del cliente); se avisa con un error específico. **`settleDebts` sí compensa** desde la revisión del 2026-09-09 (§11 / B1) |

**Nota (2026-09-09):** varias de las decisiones de §0 se ajustaron en la
segunda revisión — el reparto ahora te cuenta como participante (§4.2), la
tolerancia de `settleDebts` se aflojó (§4.3), y se agregó el mecanismo de
ganancia al cobrar (§4.9). Ver **§11** para el detalle completo.

**Verificado:** `npm run build` y `npm run lint` limpios; las 6 rutas de
Finanzas responden 200. No se pudo probar contra datos reales — falta
correr la sección 12 de `supabase/schema.sql` en el proyecto de Supabase.

---

## 10. Revisión de código (2026-09-07) — 7 bugs reales corregidos

Mismo proceso que el Sprint 1: `/code-review high`, 7 buscadores. Bugs
confirmados y corregidos, todos en `lib/finanzas/` y `app/finanzas/`
(nada en el resto del hub):

1. **`roundFor`/`round2` redondeaban mal a partir de cierta magnitud**
   (`lib/finanzas/money.ts`). El truco de sumar `Number.EPSILON` antes de
   multiplicar solo corrige el error de punto flotante cerca de magnitud 1;
   confirmado con Node: `roundFor(35.855, 2)` daba `35.85` en vez de
   `35.86`. Afecta a `freeze()` (monto en USD de cualquier movimiento o
   deuda) y a cualquier total. Reescrito para redondear sobre la
   representación decimal (vía `toFixed` + corrimiento de exponente) en vez
   de la binaria — verificado también contra montos muy chicos en BTC
   (8 decimales), que rompían un primer intento de arreglo por convertirse
   a notación exponencial como string.
2. **Reordenar cuentas tenía una condición de carrera** — cada
   `updateAccount()` dentro del `Promise.all` del botón ↑/↓ hacía su propia
   recarga completa en paralelo; si una terminaba de leer antes de que otra
   terminara de escribir, el orden en pantalla quedaba ni el viejo ni el
   nuevo. Nueva función `reorderAccounts()` en el contexto: escribe todo
   primero, recarga una sola vez al final.
3. **Errores de mover/archivar/borrar una cuenta, y de condonar/borrar una
   deuda, se ignoraban en silencio** — la pantalla no mostraba nada aunque
   la operación fallara. Ambas pantallas (`cuentas`, `deudas`) ahora
   capturan el resultado y muestran el error.
4. **La tasa de cambio en Ajustes podía quedar vacía para siempre** — si el
   campo se vaciaba y perdía el foco, `save()` cortaba en silencio sin
   volver a mostrar la última tasa guardada; la sidebar seguía mostrando la
   correcta mientras Ajustes mostraba un campo en blanco. Corregido para
   resincronizar el campo tanto si falla como si guarda con éxito.
5. **`round2Usd()` en `lib/finanzas/accounts.ts` duplicaba `round2()`** de
   `money.ts` — eliminado, ahora importa la función real (y de paso hereda
   el fix del punto 1 automáticamente).

**No es un bug, es una aclaración de diseño:** un buscador marcó que
`computeBalance()` no filtra movimientos por `initial_balance_date`. Es a
propósito — ese campo es metadata ("el saldo inicial es a partir de esta
fecha"), no un corte del libro contable; filtrar rompería la regla más
simple del modelo ("el saldo es la suma de TODO lo registrado"). Se agregó
una aclaración en el código y un texto de ayuda en el formulario de
cuentas para que no genere la confusión que le generó al revisor.

**Documentado, no corregido:** el `.limit(2000)` en la consulta de
movimientos (heredado del Sprint 1) puede omitir historial viejo de un
usuario muy activo, y `computeBalance()` sumaría mal sin avisar. No hay
nadie cerca de ese volumen todavía; queda un comentario en el código
explicando el riesgo y por qué la salida correcta el día que haga falta es
agregar en SQL, no subir el número a mano.

**Fuera de alcance de nuevo:** el buscador de removed-behavior repitió los
2 hallazgos de `AuthProvider.tsx` ya reportados en la revisión del
Sprint 1 (errores de Supabase silenciados que pueden mostrar "sin acceso"
a alguien que sí lo tiene) — siguen siendo código que esta mini-app no
tocó.

---

## 11. Segunda revisión a fondo (2026-09-09) — 8 bugs + 8 divergencias con el clon estable

Comparado contra `Acero-Hub-ref/` (clon estable, commit `151ed4c`): su
`sprint_2_compartidos.md`, `lib/finanzas/{splits,shared}.ts`, las migraciones
`20260818040000` / `20260819000000` / `20260820100000` / `20260820110000`, y
las rutas `debts/settle` · `debts/unsettle`.

### Bugs de ejecución corregidos

| # | Bug | Fix |
|---|---|---|
| **B1** | `settleDebts` pisaba en silencio el `settled_transaction_id` de una deuda ya cobrada en otra pestaña (el CHECK no lo atrapa: viejo y nuevo estado lo satisfacen) → ingreso viejo huérfano, plata contada dos veces | `.eq('status','pendiente')` + conteo + compensación (borra los movimientos creados si no se enlazaron todas). Igual que la ruta `debts/settle` de la referencia |
| **B2** | `createSharedExpense` / `registerRecurring` filtraban `s.amount > 0` **antes** de normalizar — un split que redondea a 0 rompía el `check (amount > 0)` y dejaba el gasto sin repartir | Filtro después de normalizar |
| **B3** | No había UI para gestionar personas — `updatePerson` / `deleteOrArchivePerson` eran código muerto | Sección "Personas" en Ajustes: renombrar (onBlur), archivar/borrar según tenga deudas, reactivar archivadas |
| **B4** | La tolerancia de 5% de `settleDebts` rechazaba cobros legítimos (una propina, un redondeo a favor) | Banda de cordura 0,5×–2× (solo atrapa el typo de orden de magnitud); el resto se registra tal cual y la diferencia va al patrimonio, como en la referencia |
| **B5** | `deleteTransaction`: si el `delete` fallaba después de des-saldar, quedaba el ingreso + la deuda pendiente (doble conteo) | Comentario explicando por qué el orden está forzado (el CHECK bloquea un `set null` directo); + ahora maneja el par de movimientos de un cobro con margen |
| **B6** | "Te deben $X" en la Home sumaba **todas** las cuotas futuras de un plan (préstamo de $1000 en 10 cuotas → "Te deben $1000" desde el día uno) | `dueDebtUsd`: la Home solo cuenta deudas sueltas + cuotas vencidas o que vencen dentro de 7 días. La pantalla Deudas sigue mostrando el total (`pendingDebtUsd`) |
| **B7** | La lista de Deudas dejaba borrar una cuota de un plan suelta, dejando el plan con un hueco | Se oculta el botón de basura para cuotas de plan + guard en `deleteDebt` |
| **B8** | `PersonPicker` ofrecía "Crear ana" con una "Ana" archivada existente | Ofrece "Reactivar «Ana»" en su lugar; + índice único parcial `(user_id, lower(name)) where not archived` |

### Divergencias con la referencia cerradas

1. **Ganancia al cobrar (margen).** `fin_debts.principal_usd` congela cuánto de
   cada deuda es recuperar costo real (prorrateado si el reparto superó lo
   pagado); `settled_margin_transaction_id` apunta al segundo movimiento. Al
   cobrar, `settleDebts` parte el ingreso: el costo va como `flow_type =
   'movimiento'` (no cuenta como ingreso real), el margen como `'consumo'`
   (sí cuenta, y es donde se reconoce la ganancia — no al crear el gasto).
   Des-saldar borra los dos. `settle-sheet` avisa "≈ $X de esto es ganancia".
2. **`flow_type` con forma.** Trigger `fin_normalize_flow_type` (transferencia
   → movimiento) + check `fin_tx_flow_shape` + backfill. §12.1b del schema.
3. **`fin_people` con nombre único** — índice parcial (§12.2 / B8).
4. **`fin_debts` con `unique (origin_transaction_id, person_id)`** — una
   persona no aparece dos veces en el mismo reparto (§12.3b).
5. **Antigüedad.** La pantalla Deudas muestra "la más vieja hace X días" por
   persona (`groupByPerson` → `oldest_days`), y ordena de la que más debe a
   la que menos.
6. **Gasto real del mes.** `repartidoUsd` / `gastoRealUsd` en `debts.ts`. La
   Home muestra el gasto **real** (bruto − lo que le toca a otros, solo el
   costo, solo deudas no condonadas) con el bruto en chico debajo cuando hay
   reparto; el delta del mes usa el real. La pantalla Deudas muestra "de lo
   que gastaste este mes, $X le toca a otros".
7. **Reparto: sos participante.** El `SplitEditor` del quick-add ahora reparte
   contándote (N+1), redondeando **hacia abajo** las partes de los demás y
   dejando tu parte como el resto — el redondeo, si lo hay, va a tu favor.
   Muestra "Tu parte: $X" (o "Ganás $X" si repartiste de más).
   ⚠️ *Pendiente para la revisión del Sprint 3:* el reparto de un fijo
   compartido (`resolveSplitAmounts` en `recurring.ts`) sigue con el modelo
   viejo (los null-amount se reparten lo que sobra, sin contarte a vos) — hay
   que alinearlo ahí, con su editor.
8. **`condonada` con fecha** — columna `waived_on`, seteada en `waiveDebt`.

`npm run build` / `lint` limpios; las 6 rutas de Finanzas responden 200.
**Falta correr `supabase/schema.sql`** en Supabase (secciones 12.1b, 12.2,
12.3b agregan columnas, trigger, constraints e índices — todo idempotente).
