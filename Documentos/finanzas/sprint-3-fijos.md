# Finanzas — Sprint 3: "Fijos"

> Mapa completo de features y roadmap: `features.md` en esta misma carpeta.
> Este documento especifica **únicamente el Sprint 3**, con alcance
> completo (no solo el núcleo mínimo) — mismo criterio que pediste para
> Deudas (Sprint 2).
>
> Última actualización: 2026-09-09 · Estado: **construido + revisado a fondo**.
> `npm run build` y `npm run lint` pasan limpios. Pendiente: correr la sección
> 13 de `supabase/schema.sql` en el proyecto real. Ver §9 para la primera
> revisión y **§10** para la segunda (6 bugs + 5 divergencias con el clon
> estable, incl. `starts_on`, idempotencia al registrar y el reparto
> participante-inclusivo).

---

## 0. Decisiones tomadas para este sprint

Igual que en Sprint 2: decisiones ya resueltas con el criterio del repo de
referencia adaptado a lo que ya construimos acá. Si algo no encaja con tu
uso real, se ajusta acá antes de programar.

| Tema | Decisión | Por qué |
|---|---|---|
| **El monto es un default, no una ley** | Se edita libremente cada vez que se registra, sin tocar la plantilla | Si Spotify sube de precio, no hay que ir a editar la plantilla — se ajusta ese mes y listo |
| **La cuenta se elige al registrar, no vive fija en la plantilla** | `fin_recurring.account_id` es la **última usada** (se actualiza sola cada vez que registrás), no una cuenta obligatoria desde que se crea | Mismo criterio que el repo de referencia adoptó después de construirlo al revés — separar "cuánto y en qué categoría" (la plantilla) de "con qué plata" (se decide cada mes) |
| **La plantilla sí necesita su propia moneda** | Aunque la cuenta sea opcional, `currency` es obligatoria — sin ella no hay decimales que mostrar ni forma de precargar el monto mientras no elegiste cuenta todavía | Consecuencia directa del punto anterior |
| **Al registrar, solo se pueden elegir cuentas de la misma moneda que la plantilla** | Sin conversión cross-currency en el registro de un fijo | Ya existe esa complejidad en transferencias; sumarla acá no aporta nada que un gasto suelto no resuelva ya |
| **Fijo compartido reutiliza el mecanismo de Deudas (Sprint 2), tal cual** | La plantilla guarda un reparto **por defecto** (`fin_recurring_splits`, monto fijo o "parte pareja"); registrar genera el gasto + las deudas, exactamente como el checkbox "Es compartido" del quick-add — pero con el reparto ya precargado | No hay que inventar nada nuevo: es el mismo `createSharedExpense`, con un paso antes que rellena el formulario solo |
| **Se admite fijo de `gasto` y de `ingreso`** | El repo de referencia solo tenía gasto; acá se agrega ingreso (ej. sueldo) porque cuesta lo mismo y responde al mismo "qué me falta registrar este mes" | Decisión de alcance completo pedida para este sprint |
| **Borrar una plantilla nunca borra lo que ya generó** | `fin_transactions.recurring_id` es `on delete set null` — el gasto/ingreso queda, solo pierde el link hacia la plantilla | Mismo principio que ya rige cuentas, personas y deudas: la plantilla es descartable, la historia no |
| **Pausar (`active = false`) es reversible; borrar es permanente** | Pausar solo deja de pedir que la registres. Borrar elimina la plantilla, pero no lo que generó (punto anterior) | Dos acciones con intención distinta, no hace falta fusionarlas |
| **`day_of_month` se topea contra el largo real de cada mes** | Un fijo configurado en `31` cae el 28 en febrero y el 30 en abril — nunca se corre al mes siguiente ni se pierde | Mismo criterio que el repo de referencia, evita un mes sin aviso |
| **Fijos tampoco entra a la tab bar de móvil** | Se llega desde un tile en la Home ("2 de 3 fijos este mes") y desde la sidebar en desktop — mismo criterio que ya se aplicó a Deudas en Sprint 2 | La tab bar sigue en sus 5 slots fijos. Si sigue creciendo el número de pantallas (Presupuesto es el próximo candidato), ahí sí conviene evaluar una pantalla "Más" — no todavía |

---

## 1. Objetivo del sprint

> **Saber qué me falta pagar (o cobrar) este mes, y registrarlo en un toque
> cuando llegue el momento.**

Al terminar, la app responde:

1. ¿Qué fijos me faltan registrar este período?
2. ¿Cuánto me deben, acumulado, por cada fijo que comparto con alguien?

### Definición de "terminado"

- [x] Puedo crear una plantilla sin elegir cuenta todavía, con un "Desde"
      que define desde qué período aplica
- [x] La Home me avisa solo cuando hay un fijo vencido o a punto de vencer
- [x] Registrar es un toque: precargado con cuenta, monto, categoría y fecha
      — todo editable; bloquea si el monto supera el disponible
- [x] Dos toques (o dos pestañas) no generan dos movimientos
- [x] El movimiento queda visible en Movimientos con link a su plantilla
- [x] Si el fijo sube de precio, lo ajusto al registrar; puedo tildar
      "cambiar también el monto del fijo" si quiero
- [x] Fijo compartido con reparto por defecto, participante-inclusivo, que se
      re-resuelve en vivo contra el monto de este período
- [x] Puedo pausar un fijo sin perder su historial (pausado gana sobre todo)
- [x] Borrar una plantilla no borra los movimientos que ya generó
- [x] Un fijo cargado tarde deja recuperar los meses que ya pasaron; uno anual
      solo pide en su mes
- [x] `npm run build` y `npm run lint` pasan sin errores
- [~] Verificado contra Supabase real — **pendiente** (falta correr `schema.sql`)

---

## 2. Alcance

Entra todo — decisión explícita del usuario del 2026-09-07:

| Pieza | Alcance exacto |
|---|---|
| **Plantilla** | Nombre, ícono (mismo sistema de slugs que categorías), tipo (gasto/ingreso), monto default, moneda, categoría, frecuencia, día del mes, mes del año (solo anual), activa/pausada |
| **Registrar** | Un sheet precargado; confirma o edita monto/cuenta/categoría/fecha/descripción antes de guardar. Genera un movimiento normal con `recurring_id` |
| **Pantalla "Fijos"** | Lista por estado: pendientes/vencidos arriba (con días de atraso), ya registrados, programados, y pausados en un plegable |
| **Aviso en Home** | "N de M fijos" con link — solo cuando hay uno vencido o que vence pronto (§4.4) |
| **Pausar / reanudar** | `active` en la plantilla, reversible |
| **Borrar plantilla** | Elimina la fila; los movimientos que generó quedan intactos |
| **Fijo compartido** | Reparto por defecto (`fin_recurring_splits`) editable en cada registro; genera las mismas `fin_debts` que un gasto compartido suelto |
| **Fijo de ingreso** | Mismo mecanismo, `type = 'ingreso'` — sin reparto (no tiene sentido compartir un ingreso) |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| Registro automático (que la app postee el gasto sola) | Decisión ya cerrada en `features.md` §2: "Suscripciones recurrentes: solo recuerdan, nunca se auto-postea un gasto" |
| Notificación de "fijo por vencer" | Es la Feature "Notificaciones" del roadmap, requiere que Fijos ya exista primero |
| Frecuencias distintas de mensual/anual (semanal, quincenal) | Ningún caso real la pide todavía; agregar un valor nuevo a `frequency` es aditivo el día que haga falta |
| Reparto compartido en un fijo de ingreso | No tiene sentido: compartís algo que pagás, no algo que cobrás |
| Conversión cross-currency al registrar | Ver §0 — se elige entre cuentas de la misma moneda que la plantilla |

---

## 3. Modelo de datos

Se agrega a `supabase/schema.sql` como **sección 13**.

### 3.1 Cambio sobre `fin_transactions`

```sql
alter table public.fin_transactions
  add column if not exists recurring_id uuid references public.fin_recurring(id) on delete set null;
```

`on delete set null`, no `restrict`: a diferencia de `fin_debts.origin_transaction_id`
(Sprint 2 §9, donde `set null` rompía una constraint de forma), acá no hay
ningún CHECK que dependa de `recurring_id` — nulearlo al borrar la
plantilla es exactamente lo que dice §0: el movimiento sobrevive, solo
pierde el link.

### 3.2 `fin_recurring`

```sql
create table public.fin_recurring (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  name           text not null,
  icon           text,
  type           text not null default 'gasto' check (type in ('gasto','ingreso')),
  amount         numeric(24,8) not null check (amount > 0),
  currency       text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  account_id     uuid references public.fin_accounts(id) on delete set null,
  category_id    uuid references public.fin_categories(id) on delete set null,
  frequency      text not null check (frequency in ('mensual','anual')),
  day_of_month   integer not null check (day_of_month between 1 and 31),
  month_of_year  integer check (month_of_year between 1 and 12),
  -- Desde qué período aplica (revisión 2026-09-09). Un período que termina
  -- antes de esta fecha no es pendiente (el servicio no arrancó); una fecha en
  -- el pasado recupera los meses ya pasados. `alter … if not exists` en §13.1b.
  starts_on      date not null default current_date,
  active         boolean not null default true,
  note           text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint fin_recurring_anual_shape check (
    (frequency = 'anual' and month_of_year is not null)
    or (frequency = 'mensual' and month_of_year is null)
  )
);

-- 13.1b — alter idempotente para las bases que ya tienen la tabla.
alter table public.fin_recurring add column if not exists starts_on date not null default current_date;

create index on public.fin_recurring (user_id, active, sort_order);

drop trigger if exists fin_recurring_touch_updated_at on public.fin_recurring;
create trigger fin_recurring_touch_updated_at
  before update on public.fin_recurring
  for each row execute function public.touch_updated_at();
```

`account_id` en `set null` (no `restrict`): si la cuenta usada la última
vez se borra, la plantilla simplemente vuelve a no tener una cuenta
sugerida — no es un dato del que dependa ninguna otra fila.

### 3.3 `fin_recurring_splits` — el reparto por defecto de un fijo compartido

```sql
create table public.fin_recurring_splits (
  id            uuid primary key default gen_random_uuid(),
  recurring_id  uuid not null references public.fin_recurring(id) on delete cascade,
  person_id     uuid not null references public.fin_people(id) on delete restrict,
  amount        numeric(24,8) check (amount is null or amount > 0)
);

create index on public.fin_recurring_splits (recurring_id);
-- Una persona no aparece dos veces en el reparto de la misma plantilla
-- (revisión 2026-09-09).
create unique index on public.fin_recurring_splits (recurring_id, person_id);
```

`amount` nullable = "parte pareja" (reparto igualitario calculado al
registrar, sobre el monto de **ese** registro — no un valor congelado en
la plantilla). Un monto fijo pisa el reparto parejo para esa persona.

`person_id` en `restrict`, igual que en `fin_debts` (Sprint 2 §3.3): borrar
una persona que forma parte del reparto por defecto de un fijo se bloquea;
hay que sacarla del reparto primero, o archivarla en vez de borrarla (ver
§4.6).

### 3.4 RLS — mismo criterio, sin excepciones

```sql
alter table public.fin_recurring enable row level security;
alter table public.fin_recurring_splits enable row level security;

-- fin_recurring: las 4 policies, `user_id = auth.uid()`.
-- fin_recurring_splits: no tiene user_id propio (cuelga de fin_recurring),
-- así que sus policies validan a través de la plantilla:

create policy fin_recurring_splits_select on public.fin_recurring_splits
  for select to authenticated
  using (exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid()));
create policy fin_recurring_splits_insert on public.fin_recurring_splits
  for insert to authenticated
  with check (exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid()));
create policy fin_recurring_splits_update on public.fin_recurring_splits
  for update to authenticated
  using (exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid()));
create policy fin_recurring_splits_delete on public.fin_recurring_splits
  for delete to authenticated
  using (exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid()));
```

⚠️ **Trampa de `decisiones_tecnicas.md` §3 (Sprint 1/2), aplica de nuevo
acá:** ninguna de las columnas usadas en estos `exists` es nullable de
forma que pueda colarse un `NULL` silencioso — `recurring_id` es `not
null` en la propia tabla, así que no hace falta un `is not distinct from`.

---

## 4. Reglas de negocio

### 4.1 Estado de un fijo — todo derivado

No se guarda ningún flag de "ya lo hice" — se deriva de que exista un
`fin_transactions` con ese `recurring_id` dentro del período. `recurringStatus`
(`lib/finanzas/recurring.ts`) devuelve uno de cinco estados:

| Estado | Cuándo |
|---|---|
| `pausado` | `active = false` — gana sobre todo lo demás; no se lo pide más |
| `programado` | Todavía no arrancó (`starts_on` posterior al fin del período), o es anual y no le toca este mes |
| `pendiente` | Hay un período sin registrar y su fecha todavía no pasó |
| `vencido` | Hay un período sin registrar y su fecha ya pasó (`daysLate` cuenta el atraso) |
| `registrado` | Arrancó, le toca, y ya está |

`pendingPeriods()` lista **todos** los períodos sin registrar desde `starts_on`
hasta hoy, del más viejo al más nuevo (tope de 24). Un fijo cargado tarde
recupera los meses que ya pasaron; uno que arranca el mes que viene no aparece
como pendiente. El período que se propone registrar es siempre el **más viejo**
sin registrar. Un anual salta el año en curso hasta que llega su fecha.

### 4.2 Fecha del día que corresponde (topeada)

```
dueDay(fijo, year, month) = min(fijo.day_of_month, días_en(year, month))
```

Un fijo en `31` cae el 28 en febrero (o 29 en bisiesto) y el 30 en abril —
nunca se corre al mes siguiente ni desaparece. El gasto se registra con
esa fecha, no con la fecha en que tocaste el botón (mismo criterio que ya
usa Movimientos para cualquier movimiento con fecha editable).

### 4.3 Registrar — qué pasa exactamente

El sheet viene precargado con el período **más viejo** sin registrar (§4.1):
cuenta (la última usada), monto, categoría y la fecha topeada (§4.2), todo
editable.

1. **Tope de saldo** (revisión 2026-09-09): un fijo de `gasto` muestra
   "Disponible $X" y bloquea el botón si el monto lo supera — igual que el
   quick-add (§4.5 del sprint 1). Un `ingreso` no se topea.
2. **Idempotencia** (revisión 2026-09-09): antes de insertar, `registerRecurring`
   hace un `select` fresco de `fin_transactions` por `recurring_id` en el rango
   del período. Si ya hay uno y no viene `force: true`, devuelve
   `{ alreadyRegistered: true }` — el sheet ofrece "Registrar igual" (dos
   cobros reales el mismo período). Cubre la carrera entre dos pestañas, que el
   `disabled` del botón no.
3. Se arma el movimiento: `type` de la plantilla, `date` del período,
   `account_id` elegido (misma moneda), `category_id`, `amount`,
   `flow_type: 'consumo'`, `recurring_id`. Se congela `exchange_rate` /
   `amount_usd` (§4.2 del sprint 1).
4. Si la plantilla tiene reparto **y** es `gasto`: se resuelve cada parte
   (`resolveSplitAmounts`) y se generan las `fin_debts` con
   `origin_transaction_id` = el movimiento — exactamente `createSharedExpense`
   del Sprint 2, con el reparto prellenado. **Vos sos participante** (igual que
   `sharedSplitEven`): las partes fijas mandan tal cual, lo que sobra se
   reparte entre los "parejos" **y vos**, tu parte es el resto. Las partes
   parejas se **re-resuelven en vivo** contra el monto editado (Spotify subió a
   $12.99 → a cada uno le toca un poco más) hasta que edités el reparto a mano.
5. `fin_recurring.account_id` se actualiza a la cuenta usada esta vez.
6. Si tildaste "Cambiar también el monto del fijo" y el monto difiere, se hace
   un `updateRecurring` extra con el monto nuevo (no fatal si falla).

### 4.4 "N de M" y la alerta de la Home

```
M = fijos activos cuyo estado NO es 'programado' (los que de verdad tocan)
N = de esos, cuántos están 'registrado'
```

`pendingCount()` se muestra en el encabezado de Fijos y en el tile de la Home.
El **tile de la Home solo aparece** si hay un fijo `vencido`, o `pendiente`
que vence dentro de 3 días (`fijosNeedAttention`) — no el día 1 del mes con
todo "0 de N". Mismo criterio que `dueDebtUsd` del Sprint 2.

### 4.5 Pausar / reanudar

`active = false` → estado `pausado`, que **gana sobre todo**: no aparece en
pendientes ni cuenta en "N de M", aunque su período esté registrado. No
afecta nada de lo ya generado. Reanudar lo vuelve a evaluar contra
`starts_on` — si estuvo pausado meses, esos períodos vuelven a estar
pendientes (se puede mover `starts_on` para no reclamarlos).

### 4.6 Borrado de personas en un reparto por defecto

Mismo criterio que cuentas y personas ya establecido: si una persona
aparece en `fin_recurring_splits` de alguna plantilla (además de, o en vez
de, tener deudas reales), no se borra — se archiva. `deleteOrArchivePerson`
(Sprint 2) pasa a chequear las dos tablas, no solo `fin_debts`.

### 4.7 Editar una plantilla no re-escribe lo ya registrado

Cambiar el monto, la categoría o el reparto de una plantilla **nunca**
toca los movimientos o deudas que ya generó en períodos anteriores — solo
afecta el próximo registro. Es la misma invariante de
`decisiones_tecnicas.md` §5 del repo de referencia ("una regla nueva no
congela la historia que la precede"), aplicada en la dirección contraria:
un cambio nuevo tampoco reescribe la historia vieja.

---

## 5. Estructura de archivos

```
app/finanzas/fijos/page.tsx           — pantalla: pendientes / registrados /
                                        programados / pausados, con estado y
                                        días de atraso por fila (§4.1)

app/finanzas/components/
├── recurring-sheet.tsx        — crear/editar una plantilla (+ campo "Desde"
│                                + reparto por defecto vía <RecurringSplitEditor>)
├── recurring-split-editor.tsx — reparto POR DEFECTO (parte pareja vs. fija)
└── register-sheet.tsx         — confirmar un período: tope de saldo, reparto
                                 en vivo con <SplitEditor>, "cambiar el monto
                                 del fijo", "Registrar igual" (force)

lib/finanzas/recurring.ts
├── dueDayOf / dueDateISO / daysInMonth / daysBetween — fechas y tope de día (§4.2)
├── periodBounds(r, year, month)          — { from, to, due } de un período
├── currentPeriodOf(r, todayISO)          — el período vigente, o null
├── pendingPeriods(r, allTx, todayISO)    — todos los sin registrar, viejo→nuevo
├── recurringStatus(r, allTx, todayISO)   — { status, oldest, daysLate, pendingCount } (§4.1)
├── pendingCount / fijosNeedAttention     — "N de M" + la alerta de la Home (§4.4)
├── sortByStatus                          — vencidos y pendientes primero
├── openUsdForRecurring(r, allTx, debts)  — "te deben $X" de un fijo compartido
└── resolveSplitAmounts(...)              — reparto participante-inclusivo (§4.3)
```

`data-context.tsx` crece con: `recurringTemplates`, `recurringSplitsByTemplate`
(`Map<recurringId, {person_id, amount}[]>`) en el estado; `createRecurring`,
`updateRecurring`, `deleteRecurring`, `setRecurringSplits`, y
`registerRecurring` como mutaciones. La carga inicial suma dos consultas
más (`fin_recurring`, `fin_recurring_splits`) al mismo `Promise.all` que ya
trae todo lo demás.

`tx-row.tsx` gana un caso más: un movimiento con `recurring_id` puede
mostrar el nombre del fijo en el subtítulo en vez de la descripción libre
(mismo lugar donde ya se resuelve "Cobro de \<persona\>" para las deudas).

---

## 6. Cómo se leen y escriben los datos

Mismo patrón que Sprint 1/2 — sin rutas API, todo `supabase.from('fin_...')`
directo desde componentes cliente:

- **Crear/editar plantilla**: `insert`/`update` en `fin_recurring` (con
  `starts_on`); el reparto por defecto se guarda aparte con un `delete` de
  los splits viejos + `insert` de los nuevos (más simple que un diff, y son
  un puñado de personas). Si una plantilla compartida se pasa a `ingreso`,
  `setRecurringSplits` manda `[]` para no dejar el reparto huérfano.
- **Registrar** (`registerRecurring`, en orden):
  1. **Guarda de idempotencia** — `select` fresco de `fin_transactions` por
     `recurring_id` en el rango del período (usa el último día real del mes,
     no `-31`, que PostgREST rechazaría). Si hay uno y no viene `force`,
     corta con `{ alreadyRegistered: true }`.
  2. `insert` del movimiento (`gasto`/`ingreso` · `consumo` · `recurring_id`).
  3. Si hay reparto y es `gasto`: `insert` de las `fin_debts` (participante-
     inclusivo, `principal_usd` prorrateado como `createSharedExpense`). Si
     falla, no se revierte el movimiento — peor caso, un gasto sin reparto.
  4. `update` de `fin_recurring.account_id` a la cuenta usada (no fatal).
  5. Si el sheet tildó "cambiar el monto del fijo": `updateRecurring` extra
     con el monto nuevo (no fatal).
- **Pausar/reanudar/borrar**: `update`/`delete` directo sobre `fin_recurring`.

---

## 7. Antes de escribir la primera línea de código

Sin decisiones de diseño pendientes — §0 las cerró todas. Lo único que
falta, si ya tenés fijos reales para cargar, es tener a mano: nombre,
monto, moneda, categoría, frecuencia y día de cada uno (y, si alguno es
compartido, con quién y en qué proporción) para cargarlos el primer día
que se pruebe la pantalla.

---

## 8. Qué desbloquea

- **Presupuesto** (Feature 5): va a necesitar saber "cuánto me falta pagar
  de fijos este mes" para calcular el disponible real de una categoría —
  `fin_recurring` + `recurring_id` en las transacciones ya dejan ese dato
  listo, sin que Presupuesto tenga que inventar su propio mecanismo.
- **Notificaciones** (roadmap, sin especificar): "fijo por vencer" se apoya
  directo en `fijosNeedAttention()`/`recurringStatus()` de
  `lib/finanzas/recurring.ts` — la misma lógica que ya usa la Home.
- **Ahorro** (Feature 6, si se retoma): el repo de referencia terminó
  usando un "fijo de ahorro" (aportar a un plan todos los meses) como la
  forma principal de aportar — con `fin_recurring` ya construido, esa
  extensión es agregar `savings_goal_id` + `to_account_id` a la plantilla y
  un `flow_type` a la generación. ⚠️ **`resolveSplitAmounts` ya es
  participante-inclusivo** desde la revisión del 2026-09-09 (§10 B3) — al
  retomar Ahorro, no re-romperlo.

---

## 9. Revisión de código (2026-09-07) — 4 bugs reales corregidos

Mismo proceso que los sprints 1 y 2: `/code-review high`, 8 buscadores.

1. **Cambiar de cuenta en el quick-add no limpiaba "Monto"** — si la cuenta
   nueva era de otra moneda, el mismo número tipeado quedaba reinterpretado
   en silencio bajo la moneda nueva (ej. "100" pensado en USD se guardaba
   como 100 BOB, ≈7 veces menos). Corregido: cambiar de cuenta ahora
   también limpia el monto, igual que ya hacía con el "monto recibido" de
   una transferencia.
2. **`settleDebts` no validaba el monto contra el total de las deudas
   elegidas** — cualquier monto mayor a $0 marcaba TODAS las deudas
   seleccionadas como cobradas, sin importar si lo recibido alcanzaba.
   Tipear "15" en vez de "150" saldaba $150 de deuda real por $15
   recibidos. Corregido con una validación (tolerante al redondeo normal
   de una conversión entre monedas, no a un error de un orden de magnitud)
   que rechaza el cobro si el monto no coincide con lo esperado.
3. **Un reparto de plantilla con "parte pareja" destildada y sin monto
   tipeado mandaba `amount: 0`** a la base, que Postgres rechaza (`CHECK
   amount > 0`) con un mensaje crudo sin traducir. Corregido con
   validación en el formulario antes de guardar, más un mensaje amigable
   en `isPgError()` como red de seguridad.
4. **`PersonPicker` no mostraba nada si crear una persona fallaba** — el
   combobox se quedaba quieto, sin decir por qué. Corregido para mostrar
   el error.

**Documentado, no corregido (mismo límite ya conocido de `.limit(2000)`):**
la revisión encontró que ese límite también puede desactivar sin avisar el
bloqueo de "no cambiar la moneda de una cuenta con movimientos" y la
decisión archivar-vs-borrar, para una cuenta cuyos únicos movimientos
quedaran fuera de esa ventana de 2000. Anotado en el mismo comentario del
código — se resuelve junto con el límite, no antes.

**Simplificaciones aplicadas de paso** (señaladas dos veces ya en
revisiones anteriores, esta vez sí las resolví): `isNavActive()` compartido
entre `<TabBar>` y `<Sidebar>` en vez de copiado en los dos; la Home ahora
llama a `pendingCount()` en vez de reimplementar "cuántos fijos tocan este
mes" por su cuenta (la propia documentación de este sprint decía que la
Home ya hacía esto — no era cierto hasta ahora); se sacaron 4 `useMemo`
inútiles en `fijos/page.tsx` que memoizaban sobre un `new Date()` fresco
en cada render (no evitaban nada, solo tapaban la advertencia de ESLint).

**Fuera de alcance, pero real y vale la pena que lo sepas:** el buscador de
"removed-behavior" encontró que `daily_reports`/`weekly_reports` (las
tablas de Daily) tienen RLS que solo chequea `user_id = auth.uid()`, sin
consultar `app_access`. En la práctica: si un admin le quita el acceso a
Daily a alguien desde `/admin`, esa persona deja de ver la mini-app en la
UI, pero su sesión sigue pudiendo leer/escribir sus propios reportes
llamando a Supabase directo (con la clave `anon` que ya viaja al
navegador). Es un hueco real en el hub, no en Finanzas — no lo toqué
porque no es código de esta mini-app y cambiar las policies de Daily es
una decisión que te corresponde a vos, no algo para colar de paso en una
revisión de otra cosa.

---

## 10. Segunda revisión a fondo (2026-09-09) — 6 bugs + 5 divergencias con el clon estable

Comparado contra `Acero-Hub-ref/` (`sprint_3_fijos.md`, `lib/finanzas/recurring.ts`,
migraciones `20260818060000` / `20260819010000` / `20260820000000`).

### Bugs corregidos

| # | Bug | Fix |
|---|---|---|
| **B1** | Registrar no era idempotente — doble tap / dos pestañas = dos movimientos, saldo bajando dos veces | `registerRecurring` hace un `select` fresco por `recurring_id` en el rango del período antes de insertar; si existe, devuelve `{ alreadyRegistered: true }` y el sheet ofrece "Registrar igual" (`force: true`) |
| **B2** | El reparto "parte pareja" se resolvía contra el monto de la PLANTILLA, una sola vez, y no recalculaba al editar el monto | El register-sheet re-resuelve en vivo (`useMemo` sobre el monto editado) hasta que el usuario edita el reparto a mano — mismo patrón que el "monto recibido" del quick-add |
| **B3** | `resolveSplitAmounts` no te contaba como participante (los "parejos" se comían todo → tu parte $0), y chocaba con el `SplitEditor` del Sprint 2 que ya es participante-inclusivo | `resolveSplitAmounts` reescrito con `sharedSplitEven` (participante-inclusivo) + filtra montos ≤ 0. Cierra la divergencia #1 que había quedado pendiente del Sprint 2 |
| **B4** | Registrar un fijo no chequeaba el tope de saldo — un fijo de $500 contra una cuenta de $200 dejaba la cuenta en −$300 sin aviso | El register-sheet muestra "Disponible $X" + bloquea el botón cuando el monto lo supera, para `type = 'gasto'` — igual que el quick-add |
| **B5** | Sin "vencido" ni días de atraso | `recurringStatus` distingue `vencido` con `daysLate`; la fila muestra "venció hace X días" (en guindo) y "+N sin registrar"; `sortByStatus` pone los vencidos arriba |
| **B6** | El tile de la Home aparecía siempre que hubiera un fijo pendiente (nag toda la primera semana del mes) | `fijosNeedAttention`: solo si hay uno vencido o que vence en ≤ 3 días |

### Divergencias cerradas

1. **`starts_on`** — `fin_recurring` gana la columna (§13.1b). `pendingPeriods`
   lista todos los períodos sin registrar desde `starts_on` hasta hoy (tope 24,
   viejo→nuevo); un fijo cargado tarde recupera los meses pasados, uno que
   arranca el mes que viene queda `programado` y no molesta. Nuevo campo
   "Desde" en `recurring-sheet`.
2. **`unique (recurring_id, person_id)`** en `fin_recurring_splits` — una
   persona no aparece dos veces en el reparto de una plantilla (= el
   `fin_debts` unique del Sprint 2).
3. **"Te deben $X" por fijo** — `openUsdForRecurring` suma las deudas
   pendientes generadas por ese fijo; la fila lo muestra (`· te deben $X`),
   con un chip 👥N de personas.
4. **"Cambiar también el monto del fijo"** — checkbox en el register-sheet
   cuando el monto de este período difiere del de la plantilla.
5. **`resolveSplitAmounts` filtra `amount > 0`** — como la referencia (además
   del filtro que ya tenía `registerRecurring`).

### Divergencias deliberadas (siguen)
`icon` (slug) vs `emoji`; `type: gasto|ingreso` (la referencia solo `gasto`);
sin conversión cross-currency al registrar; sin fijo de ahorro
(`savings_goal_id`/`to_account_id` — Ahorro es Feature 6); sin `user_id` propio
en `fin_recurring_splits` (RLS por subquery).

`npm run build` / `lint` limpios; las 6 rutas de Finanzas responden 200.
**Falta correr `supabase/schema.sql`** — §13.1b (`starts_on`) y el índice único
de splits son idempotentes.
