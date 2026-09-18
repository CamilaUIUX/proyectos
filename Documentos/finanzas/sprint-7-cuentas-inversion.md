# Finanzas — Sprint 7: "Cuentas de inversión"

> Mapa completo de features y roadmap: `features.md` en esta misma carpeta.
> Este documento especifica **únicamente el Sprint 7**, con alcance completo —
> mismo criterio que los sprints 2–6.
>
> Última actualización: 2026-09-10 · Estado: **especificado, no construido**.
> Se apoya en `sprint-1-movimientos.md` (movimientos, `flow_type`, tope de
> saldo, patrimonio) y `sprint-2-deudas.md` (`flow_type = 'movimiento'` para el
> cobro de deuda — el mismo mecanismo que reusa este sprint).

---

## 0. Decisiones tomadas para este sprint

Criterio del repo de referencia (`Acero-Hub-ref/Documentos/finanzas/contexto_finanzas.md`
§7.1 "Feature 11" y §7.2 "Feature 11.1 — Actualizar valor") adaptado a lo que
ya construimos acá. **Se arranca del modelo ya refinado** (§7.2): la referencia
construyó una primera versión (§7.1, un flag + un aviso de texto) y a los dos
días la rehízo — nos saltamos ese ida y vuelta.

| Tema | Decisión | Por qué |
|---|---|---|
| **Un flag, no una tabla** | `fin_accounts.is_investment boolean not null default false`. Escala solo a N cuentas — no hay que marcar nada al cargar cada movimiento | Mismo patrón que `archived` / `is_investment` de la referencia |
| **Se hace directo la 11.1** | El sheet "Actualizar valor" + sacar las cuentas de inversión del picker de Gasto/Ingreso. **No** se pasa por la 11 con su aviso de texto ("esto no cuenta como real") | La referencia retiró ese aviso al sacar las cuentas del picker — hacerlo de una es menos trabajo y menos capas |
| **Sin histórico de rendimiento** | Nada de `fin_asset_valuations`, gráfico de evolución del patrimonio, ni ROI | Es la Feature 9 (Fondo de crecimiento), congelada. Este sprint es **el recorte chico**: que el ajuste no ensucie los reportes, nada más |
| **El ajuste no aparece en Movimientos** | Ni en "Últimos movimientos" de la Home. Sigue siendo, por debajo, la misma fila de `fin_transactions` que movió el saldo | Una actualización de valor no es un movimiento de plata, es un ajuste del valor de una cuenta — no tiene nada que hacer en una lista de movimientos |
| **Sin modo edición del ajuste** | Como nunca aparece en ninguna lista, no hay desde dónde tocarlo. Corregir uno = abrir "Actualizar valor" de nuevo con el número correcto de hoy (registra un ajuste nuevo) | Menos superficie, y coherente con "es una foto de hoy, no un registro histórico" |
| **Sin fecha editable** | Siempre `todayISO()`. El saldo de referencia contra el que se mide el cambio también es siempre el de hoy | El saldo de una cuenta es una suma acumulada sin orden, no algo reconstruible por fecha |
| **$0 o negativo permitido** como valor actual | Inversión liquidada, cuenta apalancada en rojo. Guardar se deshabilita **solo** cuando el delta da exactamente 0 (el valor tipeado coincide con el de referencia) | Son estados reales de una inversión |
| **El toggle se congela con el primer ajuste** | No→Sí libre siempre. Sí→No bloqueado una vez que hay al menos un `gasto`/`ingreso` con `flow_type: 'movimiento'` en esa cuenta | Destildar mezclaría historia: ajustes viejos volverían a contar como consumo. Mismo patrón que bloquear la moneda de una cuenta con movimientos |
| **La cuenta suma al patrimonio** | El saldo es real — lo único que no cuenta es que sus **ajustes** no son gasto/ingreso del mes | El dinero está ahí; solo el mercado moviéndose no es consumo |
| **Las transferencias no cambian** | Aportar o retirar plata real de una inversión sigue siendo una `transferencia` legítima, con el tope de saldo normal | Ahí sí sale/entra plata de verdad |
| **Sin pantalla propia ni slot de nav** | Todo se maneja desde Cuentas (el toggle en el form, un botón "Actualizar valor" por cuenta de inversión) | No lo amerita — es una propiedad de una cuenta, no una sección |

### 0.1 Prerrequisito de esquema — la enmienda a `fin_tx_flow_shape`

Hoy el CHECK de forma de `flow_type` (§12.1b) es:

```sql
(type = 'transferencia' and flow_type = 'movimiento')
or (type = 'ingreso' and flow_type = 'movimiento' and category_id is null)
or (type in ('gasto','ingreso') and flow_type = 'consumo')
```

Un **ajuste de valor a la baja** de una inversión es un `gasto` con
`flow_type: 'movimiento'` → **no encaja en ninguna rama** y Postgres lo rechaza
con un error crudo. Es exactamente el bug que la referencia tuvo en su primer
despliegue (`20260819070000_finanzas_flow_shape_inversion.sql`).

**La enmienda (§17):** agregar una rama:

```sql
or (type = 'gasto' and flow_type = 'movimiento')
```

El `category_id is null` de la rama de `ingreso·movimiento` **se deja como
está**: el sheet "Actualizar valor" no lleva categoría, así que un ajuste al
alza (`ingreso·movimiento`) siempre entra sin categoría. No se relaja esa
regla — sigue protegiendo un reporte de ingresos por categoría de que un
reembolso lo contamine (motivo original, §12.1b).

### 0.2 Divergencias deliberadas con la referencia

| Fuera | Razón |
|---|---|
| **Capa de API** (`app/api/finanzas/transactions/*`) | Patrón del hub: `flowTypeFor` / `flowTypeOnEdit` viven en `lib/finanzas/transactions.ts` y los llaman `createTransaction` / `updateTransaction` en `data-context`. Igual que Sprints 1–6 |
| **Exclusión `is_investment` ↔ `is_savings`** | No hay `is_savings` en este modelo (Ahorro quedó sin flags de cuenta, sprint-6 §0). No hay nada que excluir |
| **El ajuste se filtra de las listas en un derivado, no en el `load`** | La referencia lo excluye en `loadTransactions()`. Acá `allTx` alimenta el saldo y las listas a la vez, así que se deriva `feedTx = allTx.filter(!isInvestmentAdjustment)` y las pantallas de lista consumen ese |
| **El piso de saldo vive en la UI** (como todo, sprint-6 §9) | La referencia tuvo un bug donde `assertBalance` bloqueaba un ajuste a la baja. Acá no puede pasar: el quick-add ya no ofrece esas cuentas para gasto/ingreso (§4.6), y el sheet "Actualizar valor" no aplica ningún piso |

---

## 1. Objetivo del sprint

> **Marcar una cuenta como "de inversión" para que sus subas y bajas de valor
> —el mercado moviéndose— dejen de contar como gasto o ingreso real del mes, y
> registrarlas por una superficie propia ("Actualizar valor") en vez de
> disfrazarlas de movimiento con dirección.**

### Definición de "terminado"

- [ ] Puedo marcar cualquier cuenta existente como "de inversión" (y desmarcarla,
      mientras no tenga ningún ajuste de valor registrado)
- [ ] Un ajuste de valor de una cuenta de inversión **no** cambia el gasto ni el
      ingreso del mes, ni el gasto real de ninguna línea de presupuesto — pero
      **sí** mueve el saldo de la cuenta y el patrimonio total
- [ ] "Actualizar valor" es un sheet de un solo campo: el valor de hoy,
      precargado con el saldo actual, con la diferencia en vivo. Sin tipo,
      cuenta, categoría ni fecha
- [ ] Las cuentas de inversión no aparecen en el picker de cuenta de Gasto ni de
      Ingreso del quick-add; sí en Transferencia
- [ ] Un ajuste de valor no aparece en Movimientos ni en "Últimos movimientos"
- [ ] `npm run build`, `npx tsc --noEmit` y `eslint` pasan sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **`fin_accounts.is_investment`** | Columna nueva, default `false` |
| **Enmienda `fin_tx_flow_shape`** | La rama `(gasto, movimiento)` — §0.1 |
| **`flowTypeFor` / `flowTypeOnEdit`** | En `transactions.ts`, puras. Deciden el `flow_type` de un gasto/ingreso según la cuenta |
| **`isInvestmentAdjustment`** | En `transactions.ts`. Identifica un ajuste de valor (gasto/ingreso·movimiento en cuenta `is_investment`) |
| **`<AccountValueSheet>`** | El sheet "Actualizar valor" |
| **Toggle en el form de Cuentas** | "Cuenta de inversión", con indicador congelado si ya tiene ajustes |
| **Badge en la fila y el detalle de la cuenta** | "Inversión" |
| **Quick-add** | Filtra `is_investment` del picker de Gasto/Ingreso |
| **Movimientos + Home** | Consumen `feedTx` (sin los ajustes) |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| Histórico mensual de ganancia/pérdida por cuenta | Feature 9 (Fondo de crecimiento / ROI) — congelada en la referencia |
| Gráfico de evolución del patrimonio, `fin_asset_valuations` | `documento_maestro` de la referencia lo dejó explícitamente afuera; es otro sprint |
| Rendimiento esperado por cuenta, comparar inversiones | Feature 9 |
| Un tipo de movimiento nuevo | Cero columnas nuevas en `fin_transactions` — el ajuste es un `gasto`/`ingreso` común con `flow_type: 'movimiento'` |
| Editar/borrar un ajuste puntual | §0: se corrige registrando el valor correcto de hoy |

---

## 3. Modelo de datos

Una columna nueva y una enmienda a un CHECK. Todo en una sección nueva **§17**
de `supabase/schema.sql` (idempotente, re-pegable entera), mismo criterio que
§11–16. Nada de lo que existe cambia de forma más allá de esto.

### 3.1 `fin_accounts` — una columna

```sql
alter table public.fin_accounts
  add column if not exists is_investment boolean not null default false;
```

Sin índice nuevo: se filtra en memoria sobre las cuentas ya cargadas, que son
pocas. Sin `check` cruzado — no hay `is_savings` con el que sea excluyente.

### 3.2 `fin_tx_flow_shape` — la enmienda

```sql
-- Reemplaza el CHECK de §12.1b para que un ajuste de valor a la baja de una
-- cuenta de inversión (un `gasto` con flow_type 'movimiento') tenga una forma
-- válida (sprint-7 §0.1). El `drop if exists` lo hace re-pegable.
alter table public.fin_transactions drop constraint if exists fin_tx_flow_shape;
do $$ begin
  alter table public.fin_transactions add constraint fin_tx_flow_shape check (
    (type = 'transferencia' and flow_type = 'movimiento')
    or (type = 'ingreso' and flow_type = 'movimiento' and category_id is null)
    or (type = 'gasto' and flow_type = 'movimiento')
    or (type in ('gasto','ingreso') and flow_type = 'consumo')
  );
exception when duplicate_object then null;
end $$;
```

> ⚠️ **Toda transacción existente pasa el CHECK nuevo** — solo se agregó una
> rama, no se quitó ninguna. El `reembolso` de un cobro de deuda con margen
> (sprint-2, un `movimiento`) — si es un `gasto`, ahora también tiene rama
> propia y ya no depende de la de transferencia.

### 3.3 `fin_transactions` — sin cambios de forma

El ajuste de valor es una fila normal: `type` `gasto` o `ingreso`,
`category_id` null, `flow_type` `'movimiento'`, `recurring_id` null,
`savings_goal_id` null. Ninguna columna nueva.

### 3.4 RLS

Sin cambios. `fin_accounts` ya tiene sus 4 policies (`user_id = auth.uid()`,
§11.5); la columna nueva las hereda.

---

## 4. Reglas de negocio

Todo el criterio vive en `lib/finanzas/transactions.ts` (puro, sin `next/*` ni
`@/`). La UI solo pinta y llama.

### 4.1 `flowTypeFor` — quién decide el `flow_type`

```
flowTypeFor(type, account):
  type = 'transferencia'   → 'movimiento'   (el trigger igual lo fuerza)
  account.is_investment    → 'movimiento'
  cualquier otro caso      → 'consumo'
```

`createTransaction` pasa `flow_type: flowTypeFor(type, account)` en el insert de
un `gasto`/`ingreso`. Para una cuenta normal sigue siendo `'consumo'` — el
comportamiento de siempre.

### 4.2 `flowTypeOnEdit` — nunca degradar un `movimiento` a `consumo`

```
flowTypeOnEdit(flowActual, type, account):
  flowActual = 'movimiento'  → 'movimiento'    (se queda)
  cualquier otro caso        → flowTypeFor(type, account)
```

`updateTransaction` solo toca `flow_type` cuando cambió la **cuenta** o el
**tipo** (una edición de descripción no lo mueve), y lo hace con
`flowTypeOnEdit(tx.flow_type, nextType, nextAccount)`. Así:

- Mover un `gasto·consumo` a una cuenta de inversión → pasa a `'movimiento'`.
- Editar la descripción de un cobro de deuda (`ingreso·movimiento`) → **no** lo
  degrada a `'consumo'` (lo protege `flowActual = 'movimiento'`).
- Editar un aporte de ahorro (`transferencia·movimiento`) → ya bloqueado antes
  por el guard de sprint-6 §4.7, pero el trigger igual lo forzaría a
  `'movimiento'`.

### 4.3 Qué queda afuera de los totales, y qué no

`monthTotals` / `surplusUsd` (sprint-6) / `gastoRealForCategories` (sprint-5) ya
filtran `flow_type === 'consumo'` → un ajuste de inversión (`'movimiento'`)
**queda afuera automáticamente**, sin tocar ninguna de esas funciones.

`computeBalances` (`accounts.ts`) **no** filtra por `flow_type` → el saldo de la
cuenta **sí** se mueve con el ajuste, y el patrimonio total con él.

### 4.4 "Actualizar valor" — la superficie

`<AccountValueSheet>`: un solo campo — *"¿Cuánto hay en tu inversión hoy?"* —
precargado con `account.balance`, más una línea de diferencia en vivo (↑/↓,
verde/rojo, mismo tratamiento que el disponible del quick-add).

- **Sin selector de tipo, cuenta, categoría ni fecha.**
- Al guardar: `delta = valorTipeado − saldoDeHoy`.
  - `delta === 0` → no registra nada (Guardar deshabilitado).
  - `delta > 0` → `insert` de un `ingreso` de `delta`, `category_id: null`,
    `date: todayISO()`, `flow_type: 'movimiento'`.
  - `delta < 0` → `insert` de un `gasto` de `|delta|`, ídem.
- `freeze()` normal — el ajuste congela su tasa como cualquier fila.
- **Disponible desde el día 1**: sin movimientos, la referencia es
  `initial_balance`.
- Dos entradas: un botón "Actualizar valor" en la fila de la cuenta (solo si
  `is_investment`), y otro en su detalle si lo hubiera.

### 4.5 El piso de saldo no aplica a un ajuste a la baja

En este hub el tope de saldo vive en la UI (`over` en el quick-add /
register-sheet), no en un guard central. Un ajuste a la baja se registra por
`<AccountValueSheet>`, que **no aplica ningún piso** — una inversión puede
valer menos que el aporte, o cero, o negativo (apalancada).

Una **transferencia** que sale de una cuenta de inversión sí pasa por el tope
normal del quick-add: no se puede retirar más plata de la que la inversión
vale hoy.

### 4.6 Las cuentas de inversión salen del picker de Gasto/Ingreso

El quick-add filtra `activeAccounts.filter(a => !a.is_investment)` para el
selector de cuenta cuando `type` es `gasto` o `ingreso`. Para `transferencia`
se siguen mostrando (origen y destino).

Consecuencia: la única forma de registrar un `gasto`/`ingreso` en una cuenta de
inversión es `<AccountValueSheet>` — por eso `isInvestmentAdjustment` puede
identificarlos sin ambigüedad (§4.7).

### 4.7 `isInvestmentAdjustment` y las listas visibles

```
isInvestmentAdjustment(tx, account):
  account.is_investment
  Y tx.type ∈ ('gasto','ingreso')
  Y tx.flow_type = 'movimiento'
```

`data-context` deriva `feedTx = allTx.filter(t => !isInvestmentAdjustment(t, accountsById.get(t.account_id)))`.
`recentTx` pasa a ser `feedTx.slice(0, 5)`; la pantalla Movimientos consume
`feedTx`. `allTx` **no cambia** — sigue completo para el saldo, los totales y
todo lo derivado.

`<TxRow>` no necesita tratamiento especial: un ajuste ya no llega ahí. (Una
transferencia hacia/desde una cuenta de inversión sí se sigue listando, como
cualquier transferencia — no es un ajuste.)

### 4.8 El toggle "Cuenta de inversión" se congela con el primer ajuste

`data-context` deriva `investmentAdjustmentAccounts: Set<string>` — las cuentas
con al menos un `isInvestmentAdjustment`. El form de Cuentas:

- Si `!investmentAdjustmentAccounts.has(id)` → checkbox normal (marca y
  desmarca libremente).
- Si sí → indicador fijo "Cuenta de inversión", no interactivo.

`updateAccount` **igual rechaza** un `is_investment: false` que llegue para una
cuenta con ajustes (defensa en profundidad, mismo patrón que la moneda de una
cuenta con movimientos). No→Sí siempre libre.

### 4.9 Sin modo edición para un ajuste

`<AccountValueSheet>` tiene un solo modo, "registrar el valor de hoy". No hay
`editing`, ni botón Eliminar. Corregir un ajuste pasado = volver a abrirlo con
el número correcto, que registra un ajuste nuevo (el saldo converge al valor
tipeado igual).

### 4.10 Borrar / archivar una cuenta no cambia

`fin_transactions.account_id` es `on delete restrict`: cualquier cuenta con
movimientos —de inversión o no— ya rechazaba el borrado. La salida sigue
siendo archivar. Un fijo no debería apuntar a una cuenta de inversión; si el
caso aparece, `registerRecurring` lo trata como cualquier cuenta (el
register-sheet filtra por moneda, no por `is_investment` — se puede sumar el
filtro si molesta).

---

## 5. Estructura de archivos

### Nuevos

```
app/finanzas/components/account-value-sheet.tsx   — "Actualizar valor" (un campo, sin edición)

lib/finanzas/transactions.ts   (MODIFICADO)
├── flowTypeFor(type, account)          — el flow_type de un gasto/ingreso (§4.1)
├── flowTypeOnEdit(flow, type, account) — nunca degrada un 'movimiento' (§4.2)
└── isInvestmentAdjustment(tx, account) — ¿es un ajuste de valor? (§4.7)
```

### Modificados

| Archivo | Cambio |
|---|---|
| `lib/finanzas/types.ts` | `Account.is_investment: boolean` |
| `app/finanzas/components/data-context.tsx` | `createTransaction` / `updateTransaction` pasan `flow_type` vía `flowTypeFor` / `flowTypeOnEdit`; `feedTx` derivado; `recentTx = feedTx.slice(0,5)`; `investmentAdjustmentAccounts: Set<string>`; `setAccountValue(accountId, currentValue)` (o el sheet llama `createTransaction` directo con `flow_type` ya resuelto); `updateAccount` guard Sí→No |
| `app/finanzas/cuentas/page.tsx` | Toggle "Cuenta de inversión" en `AccountForm` (indicador congelado si tiene ajustes); badge en `AccountRow`; botón "Actualizar valor" para cuentas `is_investment` |
| `app/finanzas/movimientos/page.tsx` | Consume `feedTx` en vez de `allTx` |
| `app/finanzas/components/quick-add.tsx` | El picker de cuenta de Gasto/Ingreso filtra `!a.is_investment` |
| `supabase/schema.sql` | Sección **§17** nueva |

### 5.1 Regla de independencia

Sin cambios respecto de sprint-1 §5.1. Las funciones nuevas de
`transactions.ts` no importan de `next/*` ni del alias `@/`.

---

## 6. Cómo se leen y escriben los datos

Mismo patrón que Sprints 1–6 — sin rutas API, todo `supabase.from('fin_...')`
directo desde componentes cliente, RLS como única barrera.

- **Marcar como inversión** (`updateAccount({ is_investment: true })`): libre
  siempre.
- **Desmarcar**: el form no ofrece el toggle si la cuenta tiene ajustes;
  `updateAccount` igual rechaza un `is_investment: false` que llegue para una
  cuenta con al menos un `isInvestmentAdjustment` — mensaje claro, no el error
  crudo de un constraint (no hay constraint, es una regla del cliente + la
  mutación).
- **Actualizar valor** (`setAccountValue` o el sheet directo): calcula el delta
  contra `account.balance`; `delta === 0` → nada; si no, `insert` de un
  `gasto`/`ingreso` con `flow_type: 'movimiento'`, sin categoría, fecha de hoy,
  tasa congelada. Una sola escritura.
- **Un gasto/ingreso normal**: `createTransaction` ahora resuelve `flow_type`
  con `flowTypeFor(type, account)` — para toda cuenta que no sea de inversión,
  sigue siendo `'consumo'`.

---

## 7. Antes de escribir la primera línea de código

Sin decisiones de diseño pendientes — §0 las cerró todas. Lo único: **correr la
sección 17 de `supabase/schema.sql`** en el SQL Editor (la columna
`is_investment` + la enmienda a `fin_tx_flow_shape`). El `drop constraint` es
idempotente; si tenías `fin_tx_flow_shape` editado a mano, revisá el bloque
antes de pegar.

⚠️ **Confirmado en uso real (2026-09-11):** al probar la app contra la base
todavía aparecía `Could not find the table 'public.fin_budget_lines' in the
schema cache` — ni §15 (Presupuesto) ni §16 (Ahorro) se habían corrido
tampoco, no solo §17. Como el archivo entero es idempotente (`create table if
not exists`, `add column if not exists`, los `add constraint` envueltos en
`do $$ … exception when duplicate_object then null $$`), lo más simple es
**pegar `supabase/schema.sql` completo** en el SQL Editor en vez de tratar de
aislar qué sección falta — re-correr las que ya existen no rompe nada.

---

## 8. Qué desbloquea

| Feature | Cómo se apoya |
|---|---|
| **Reportes** (Feature 8, congelada en la referencia) | Un reporte de gasto/ingreso por categoría o por mes ya no arrastra el ruido del mercado — el filtro `flow_type === 'consumo'` que este sprint hace útil para las inversiones ya está en todas las funciones de totales |
| **Fondo de crecimiento / ROI** (Feature 9, congelada) | `is_investment` es la base: un tipo de cuenta que no ensucia los reportes. Falta agregarle rendimiento esperado y el histórico mensual de ganancia/pérdida (`fin_asset_valuations`) |
| **`flow_type` con más causas** | `flowTypeFor` centraliza la regla — cualquier motivo nuevo de `'movimiento'` (una feature futura) se agrega en un solo lugar, sin repetirlo en cada camino de escritura |

⚠️ **Sin migración de datos.** `is_investment` arranca en `false` para todas las
cuentas existentes; los ajustes de valor viejos (si alguien cargó una suba de
Broker como `ingreso·consumo` antes de esta feature) **no** se reclasifican
solos — hay que marcar la cuenta y, si molesta, editar esos movimientos a mano
para moverlos a una cuenta de inversión (lo que recalcula su `flow_type`).

---

## 9. Desarrollo (2026-09-10) — implementación completa

Sprint construido de una pasada sobre la spec de arriba. `npx tsc --noEmit`,
`npm run build` y `npx eslint app/finanzas lib/finanzas` en verde; humo de dev
sobre las 9 rutas de Finanzas, todas 200.

### Qué se creó

- **`supabase/schema.sql` §17** — `fin_accounts.is_investment` + el
  `drop constraint fin_tx_flow_shape` / re-`add` con la rama nueva
  `(type = 'gasto' and flow_type = 'movimiento')`. RLS sin cambios.
- **`lib/finanzas/transactions.ts`** — `flowTypeFor(type, account)`,
  `flowTypeOnEdit(tx, nextType, account)` (nunca degrada un `movimiento` que ya
  tenía significado — pero el `movimiento` estructural de una transferencia sí
  se recalcula al convertirla a gasto/ingreso), `isInvestmentAdjustment(tx, account)`.
- **`app/finanzas/components/account-value-sheet.tsx`** — "Actualizar valor":
  un campo precargado con el saldo, diferencia en vivo (↑/↓), Guardar
  deshabilitado si el delta es 0. Sin tipo/cuenta/categoría/fecha, sin modo
  edición.

### Qué se modificó

- **`data-context.tsx`** — `load()` mapea `is_investment` (`?? false` para
  bases sin la migración); `createTransaction` pasa
  `flow_type: flowTypeFor(...)`, `updateTransaction` pasa
  `flowTypeOnEdit(...)` solo cuando cambió cuenta o tipo; `feedTx = allTx.filter(
  !isInvestmentAdjustment)` con `recentTx = feedTx.slice(0,5)`;
  `investmentAdjustmentAccounts: Set<string>`; `updateAccount` rechaza
  `is_investment: false` para una cuenta con ajustes; `setAccountValue`
  (calcula el delta contra `account.balance`, inserta un `gasto`/`ingreso`
  `movimiento` sin categoría, fecha de hoy); `createAccount` acepta
  `is_investment?`. `SNAPSHOT_VERSION = 4`.
- **`cuentas/page.tsx`** — checkbox "Cuenta de inversión" en `AccountForm`
  (indicador congelado si tiene ajustes; el campo solo se manda si cambió, para
  no romper bases sin §17); badge `IconChartLine` "Inversión" en la fila; botón
  "Actualizar valor" para cuentas de inversión; `<AccountValueSheet>` cableado.
- **`movimientos/page.tsx`** — consume `feedTx` en vez de `allTx`.
- **`quick-add.tsx`** — el picker de cuenta de Gasto/Ingreso filtra
  `!a.is_investment` (`originAccounts`); el `accountId` inicial y el cambio de
  tipo se caen a la primera cuenta regular si la elegida era de inversión.
- **`register-sheet.tsx`** — `matchingAccounts` también filtra `!a.is_investment`
  (un fijo no se paga desde una inversión).
- **`lib/finanzas/types.ts`** — `Account.is_investment: boolean`.

### Decisiones tomadas durante la implementación

1. **El ajuste se filtra con `feedTx`, no se saca de `allTx`** — `allTx`
   alimenta el saldo, los totales y todo lo derivado; solo las listas visibles
   (`recentTx`, Movimientos) usan `feedTx`. La referencia lo excluye en
   `loadTransactions()` porque allá el saldo se calcula aparte.
2. **`flowTypeOnEdit` distingue la transferencia** — un `movimiento` en un
   `gasto`/`ingreso` ya existente tiene significado (cobro, reembolso, ajuste) y
   no se degrada; en una transferencia es solo el trigger, así que convertirla
   a gasto la recalcula de cero. La referencia no documenta este matiz.
3. **`is_investment` solo se manda si cambió** — así una base sin la §17
   corrida no rompe al crear/editar una cuenta normal (el resto de la app sigue
   andando; solo "Actualizar valor" y marcar una cuenta necesitan la columna).
4. **`register-sheet` filtra las cuentas de inversión** — la spec §4.10 lo dejó
   opcional; se sumó el filtro para no permitir el estado raro.
5. **`SNAPSHOT_VERSION` a 4** — el snapshot v3 no trae `is_investment`; forzar
   una recarga evita pintar un ajuste en el feed por un segundo tras abrir.

### Pendiente para el usuario

**Correr `supabase/schema.sql` §17 en el SQL Editor** antes de marcar una
cuenta como de inversión. Incluye el `drop constraint fin_tx_flow_shape` +
re-`add` — es idempotente; si lo tenías editado a mano, revisá el bloque. El
resto de la app funciona sin §17 (la columna se lee como `false`).

⚠️ **2026-09-11 — confirmado que tampoco corrieron §15 ni §16.** Al levantar
la app contra la base real apareció `Could not find the table
'public.fin_budget_lines' in the schema cache` (esa tabla es de §15, no de
§17) — ninguna de las tres secciones de Presupuesto/Ahorro/Cuentas de
inversión se había pegado todavía en el SQL Editor. Como el archivo entero es
idempotente, la salida más simple es **pegar `supabase/schema.sql` completo**
de una — no hace falta aislar qué sección falta, y re-correr las que ya
existen no rompe nada. Si el error persiste unos segundos después de correrlo,
es la caché de esquema de PostgREST tardando en refrescar (Supabase →
Settings → API → "Reload schema", o esperar ~10-15 s).

---

## 10. Revisión contra el clon (2026-09-10) — 1 bug + 7 divergencias

Comparado contra `Acero-Hub-ref/`: `contexto_finanzas.md` §7.1/§7.2,
`lib/finanzas/transactions.ts` (`flowTypeFor` / `flowTypeOnEdit` /
`isInvestmentAdjustment` / `valueUpdateDelta`), `lib/finanzas/load.ts`
(`assertBalance`, el filtro de `loadTransactions`, `has_value_updates`),
`app/finanzas/components/account-value-sheet.tsx`,
`app/finanzas/screens/cuentas.tsx`.

### Bug corregido

1. **La diferencia mostrada en "Actualizar valor" no coincidía con la
   registrada.** El sheet calculaba el delta con el valor tipeado **sin
   normalizar**, mientras `setAccountValue` lo normalizaba primero. Con saldo
   100 y "100.001" tipeado, el sheet mostraba "↑ 0,001" y el botón habilitado,
   pero al guardar `setAccountValue` normalizaba a 100.00 → delta 0 → no
   registraba nada y el sheet se cerraba como si hubiera guardado. Corregido:
   se extrajo **`valueUpdateDelta(currentBalance, typedValue, currency)`** a
   `transactions.ts` (como la referencia), usada por el sheet (la diferencia en
   vivo + el botón deshabilitado) **y** la mutación — un solo cálculo, no se
   pueden desincronizar.

### Divergencias deliberadas con la referencia

1. **`flowTypeOnEdit` recibe el `tx` completo y recalcula el `movimiento`
   estructural de una transferencia.** La referencia (`flowTypeOnEdit(type,
   account, current)`) solo ve el `flow_type` actual y nunca lo baja — así una
   transferencia convertida a `gasto` se queda como `movimiento` (invisible a
   los totales), y la referencia lo documenta como decisión ("cambiar el tipo
   de una transferencia a gasto tampoco la vuelve consumo sola"). Mi versión
   sabe que **era** una transferencia (`tx.type`), y ese `movimiento` es solo
   el trigger, no algo con significado: al convertirla a `gasto` se recalcula a
   `consumo` (cuenta como gasto real). Para un `gasto`/`ingreso` que ya era
   `movimiento` (cobro de deuda, reembolso, ajuste de inversión) sí se
   conserva, igual que la referencia.
2. **El ajuste se filtra con `feedTx` (derivado), no en el `load`.** La
   referencia lo excluye en `loadTransactions()`; acá `allTx` alimenta el saldo
   y las listas a la vez, así que `feedTx = allTx.filter(!isInvestmentAdjustment)`
   y las pantallas de lista consumen ese. `allTx` no cambia.
3. **`investmentAdjustmentAccounts: Set<string>` derivado**, no una columna
   `has_value_updates` en `AccountWithBalance` calculada en `loadAccounts` —
   un memo, sin tocar `withBalances` ni el tipo.
4. **Sin `assertBalance` central.** La referencia tiene una excepción explícita
   (un `gasto` en una cuenta `is_investment` no pasa por el piso de saldo). Acá
   el piso vive en la UI para todo gasto, y como las cuentas de inversión no
   aparecen en el picker de Gasto/Ingreso, el único camino es
   `<AccountValueSheet>`, que no aplica ningún piso. El bug que la referencia
   tuvo (`assertBalance` bloqueaba un ajuste a la baja que dejara la cuenta en
   negativo) no puede ocurrir acá.
5. **Sin `account-value-context` ni `DetailSheet` compartido.** La referencia
   abre "Actualizar valor" desde un sheet de detalle de cuenta compartido entre
   pantallas, vía un contexto. Acá es estado local de `cuentas/page.tsx` con un
   botón en la fila de cada cuenta de inversión — punto de entrada único (§0).
6. **`is_investment` solo se manda en el payload de crear/editar cuenta cuando
   cambió** — así una base sin la §17 corrida no rompe al editar una cuenta
   normal. La referencia manda siempre el campo (tiene la columna desde antes).
7. **Sin capa de API.** `flowTypeFor` / `flowTypeOnEdit` en `transactions.ts`,
   llamados desde `createTransaction` / `updateTransaction` en `data-context`.

### Confirmado sano

- `isInvestmentAdjustment` es equivalente a la de la referencia
  (`type !== 'transferencia' && flow_type === 'movimiento' && account.is_investment`).
- Un ajuste de valor **no llega nunca a `<TxRow>`** (no está en `feedTx`) —
  coincide con "en la práctica ya no vuelve a pasar por TxRow" (§7.2).
- El saldo y el patrimonio se mueven con el ajuste (`computeBalances` no filtra
  por `flow_type`); los totales del mes, el sobrante y el gasto real de
  presupuesto lo excluyen (ya filtran `flow_type === 'consumo'`).
- Reload del esquema: la enmienda solo **agrega** una rama a `fin_tx_flow_shape`
  — toda transacción existente sigue pasando.
- Trigger + CHECK: `setAccountValue` inserta un `gasto`/`ingreso` con
  `flow_type: 'movimiento'` y `category_id: null` — `fin_normalize_flow_type` no
  toca un no-transferencia, y el CHECK acepta `(gasto, movimiento)` y
  `(ingreso, movimiento, category null)`.
- Un fijo no puede apuntar a una cuenta de inversión (`register-sheet` las
  filtra); el quick-add las saca del picker de Gasto/Ingreso y las mantiene en
  Transferencia.

`npx tsc --noEmit`, `npm run build` y `eslint app/finanzas lib/finanzas` en
verde tras el arreglo; 9 rutas 200.
