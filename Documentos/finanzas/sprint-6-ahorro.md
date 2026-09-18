# Finanzas — Sprint 6: "Ahorro"

> Mapa completo de features y roadmap: `features.md` en esta misma carpeta.
> Este documento especifica **únicamente el Sprint 6**, con alcance completo
> (no solo el núcleo mínimo) — mismo criterio que los sprints 2, 3, 4 y 5.
>
> Última actualización: 2026-09-10 · Estado: **especificado, no construido**.
> Se apoya en `sprint-1-movimientos.md` (movimientos, tasa congelada, tope de
> saldo, congelado del lado recibido de una transferencia), `sprint-3-fijos.md`
> (`recurringStatus`, `pendingPeriods`, `starts_on`) y `sprint-5-presupuesto.md`
> (`periodStart`/`periodRange`, el sobrante = `Σ disponibleSinCarry`, la pantalla
> "Más" que este sprint tiene que construir — su §0.1).

---

## 0. Decisiones tomadas para este sprint

Igual que en Sprints 2–5: decisiones ya resueltas con el criterio del repo de
referencia (`Acero-Hub-ref/Documentos/finanzas/sprint_7_ahorro.md` — allí es el
Sprint 7 porque su Sprint 5 fue Pasanaku, que descartamos) adaptado a lo que ya
construimos acá.

**Se arranca del modelo final de la referencia.** Ahorro fue su sprint más
iterado: nueve rondas, dos rediseños de raíz. La primera versión ataba el
ahorro a una **cuenta marcada** (`fin_accounts.is_savings`) y deducía todo de
ahí; al usarla, eso se rompió por todos lados y terminó eliminado. Nos saltamos
ese ida y vuelta entero — lo que sigue ya es el modelo que quedó. Si algo no
encaja con tu uso real, se ajusta acá antes de programar.

| Tema | Decisión | Por qué |
|---|---|---|
| **No hay "cuentas de ahorro"** | Cero cambios de columnas en `fin_accounts`. Cualquier cuenta tiene una porción de saldo **libre** y otra **apartada**, y las dos se **derivan** de los movimientos etiquetados con un plan de ahorro | La marca en la cuenta solo restringía: forzaba a justificar todo gasto que saliera de ahí, perdía ingresos del reporte del mes, generaba aportes fantasma al desmarcarla. El modelo derivado no tiene ninguno de esos problemas |
| **Un movimiento es de ahorro porque vos lo dijiste** | `savings_goal_id` puesto a mano, nunca inferido de dónde cae la plata | `reason is null` significaba a la vez "es un aporte" y "no puse motivo" — dos cosas distintas colapsadas en un valor |
| **La dirección se declara, no se deduce** | `savings_flow`: `aporte` / `retiro` / `traslado`. Para un `gasto` el tipo ya la determina y el servidor la impone; el aporte y el traslado nacen de su propia pantalla | Preguntar "¿aporta o retira?" en medio de una transferencia era una pantalla haciendo dos trabajos |
| **Aportar es una decisión de plan; retirar, una circunstancia** | Se **aporta** por el botón "Ahorrar" de cada plan (al cerrar el mes) o por un fijo de ahorro. Se **retira** desde el quick-add, como un `gasto` etiquetado con su motivo. Se **traslada** desde "Mover de cuenta" en Ahorros | Movimientos registra *lo que pasó*; aportar es *lo que decidís que pase*. Cada cosa en su pantalla |
| **El saldo de un ahorro es derivado** | `Σ aportes − Σ retiros` en USD, por `savings_goal_id`. Nunca una columna | Mismo principio que el saldo de una cuenta (sprint-1 §4.1) y el disponible de Presupuesto |
| **El piso de ahorro** | Un gasto común nunca puede tocar lo apartado, en **todos** los caminos que sacan plata de una cuenta (crear/editar movimiento, registrar un fijo, repartir el cierre) — no solo en el quick-add | Un límite que se esquiva por cualquier otra pantalla no es un límite, es una decoración |
| **El reparto propone, nunca aplica solo** | Cada plan tiene regla propia (`fixed` o `percent`), pero la propuesta del cierre siempre pasa por la confirmación mensual antes de convertirse en movimientos | Pregunta abierta #4 del roadmap: mixto, y se confirma cada mes |
| **Reparto plan por plan, no un cierre global** | Cada card de ahorro tiene su botón "Ahorrar" cuando el mes pasado quedó sin fondear. No hay un sheet único que reparta todo de una | La referencia hizo el cierre global primero y lo rehízo: apretar todos los planes en una pantalla obligaba a una sola cuenta de origen para todos |
| **Si los fijos no alcanzan, la app pregunta** | No prorratea ni prioriza sola. Muestra cada fijo con su pedido vs. lo disponible y deja ajustar a mano | Ronda 2 |
| **Un mes en rojo no arma un flujo de retiro** | El sobrante negativo se muestra, pero no hay "Ahorrar" que tocar — el mes rueda solo al siguiente. Cubrirlo con un retiro se hace como cualquier retiro, desde Ahorros o el quick-add | El cierre no tiene por qué orquestar un retiro que ya tiene su propio camino |
| **Sin tabla de estado del cierre** | El "mes pendiente" es, simplemente, **el mes pasado**. Qué plan ya ahorró ese mes se lee de `savings_period` en sus aportes | La referencia creó `fin_savings_closures` y la abandonó: al dejar de escribirse, el mes pendiente quedaba clavado para siempre. Sin tabla, siempre avanza |
| **"Ahorrar en la misma cuenta" = transferencia a sí misma** | La plata ya suele estar donde tiene que estar; lo que cambia es que pasa a estar **apartada**. Se registra como transferencia de la cuenta a ella misma: el saldo no se mueve, lo apartado sube | Hay que abrir `fin_tx_shape` para permitir `to_account_id = account_id` en ese caso (§3.3) |
| **Moneda propia por ahorro** | `input_currency` en el plan, mismo patrón que Presupuesto. El monto de cada aporte se congela nativo + tasa, igual que `fin_transactions` | Un ahorro en Bs no se compara con uno en USD sin una base común, pero el usuario piensa "2.400 Bs", no "347 USD" |
| **Moneda congelada con el primer movimiento** | Editable mientras el ahorro no tenga aportes ni retiros; después, fija | Cambiarla reinterpretaría lo ya aportado (mismo criterio que la moneda de una cuenta con movimientos, sprint-1) |
| **Meta opcional** | `target_amount` (en la moneda del ahorro) + `target_date` opcional. Al llegar, badge "Meta cumplida" y sale de la propuesta automática | Un ahorro sin meta solo acumula — es válido ("colchón") |
| **Cajón de sastre** | Un ahorro marcado (`is_catchall`) se lleva todo lo que el reparto no asignó, ignorando su propia meta. Como mucho uno activo por usuario | Sin él, un sobrante que cubre todos los planes y aún sobra deja plata "sin asignar" flotando |
| **Reparto editable siempre** | Cambiar `allocation_type`/`allocation_value` aplica desde el **próximo** cierre. No hay tabla de "montos por período" como en Presupuesto | No hay nada que recalcular hacia atrás: los aportes ya hechos son inmutables |
| **Fijo de ahorro** | Un fijo puede ser un aporte: `savings_goal_id` + `to_account_id` en `fin_recurring`. Registrarlo genera una transferencia tageada en vez del gasto de siempre. Reusa todo Fijos | "Pagarme a mí primero": apartar el día que toca, sin depender de que haya sobrado nada |
| **Navegación: nace `/finanzas/mas`** | Este sprint construye la pantalla "Más" (deuda del sprint-5 §0.1). Deudas · Fijos · Presupuesto · Ahorro pasan a vivir ahí; **Cuentas** sale de la tab bar y entra a "Más". Nueva tab bar: Inicio · Movimientos · + · Más · Ajustes | Con Ahorro son 4 pantallas sin slot; seguir sumando excepciones de "tile de Home" no escala |
| **Banner pasivo en la Home** | Debajo de Presupuesto: "es hora de organizar tus ahorros" cuando hay mes pendiente + algún plan sin fondear. Se apaga solo al fondear el último. Sin cron, sin X | Mismo criterio que el tile de Presupuesto y la alerta de Fijos |
| **El aporte no suma al patrimonio** | Es una transferencia entre cuentas propias, y esas no mueven el patrimonio total (sprint-1 §4.3). Lo único que cambia es en qué cuenta vive la plata y si queda etiquetada | Aclaración que la referencia tuvo que hacer explícita — es contraintuitivo |

### 0.1 La pantalla "Más" — este sprint la construye

El sprint-5 §0.1 lo dejó marcado: con Presupuesto ya eran 3 pantallas sin slot
en la tab bar (Deudas, Fijos, Presupuesto), resueltas con tiles de Home +
sidebar. Ahorro es la cuarta. Este sprint hace el rediseño:

- **`/finanzas/mas`** — grilla de cards, una por cada destino que no entra en la
  tab bar. Se arma sola desde `NAV_ITEMS` (los ítems sin `mobileTab`), así que
  sumar una pantalla nueva más adelante no toca este archivo. Cada card muestra
  el estado de su sección leyendo el contexto (`3 fijos pendientes`,
  `$120 por cobrar`, `1 mes por cerrar`, `mes por organizar`).
- **La tab bar cede el slot de Cuentas.** Queda: Inicio · Movimientos · + ·
  **Más** · Ajustes. La sidebar de escritorio sigue listando todos los destinos
  reales (Más no aparece ahí — no es una sección, es una puerta).
- Los tiles de Home de Deudas y Fijos **se quedan** — son alertas
  condicionales ("te deben $X", "fijos por registrar"), no navegación. El banner
  de Ahorro se suma a esa misma zona.

### 0.2 Divergencias deliberadas con la referencia

Mismo espíritu que el sprint-1 §0.2 — cosas de la referencia que acá **no** se
hacen, y por qué:

| Fuera | Razón |
|---|---|
| **Capa de API** (`app/api/finanzas/savings-goals/*`, `.../save`, `.../move`) | Patrón del hub: todo `supabase.from('fin_...')` directo desde componentes cliente + mutación en `data-context`, RLS como única barrera. Igual que Sprints 1–5 (ver sprint-1 §0.2) |
| **Pasanaku** | Descartado para el hub (`features.md`). No hay card en "Más", ni aviso en la Home, ni descuento de aportes de pasanaku en el sobrante |
| **`fin_accounts.is_savings` / exclusión con `is_investment`** | El modelo final no tiene flags de cuenta. Cuentas de inversión (Feature 7) todavía no existe — cuando exista, su `is_investment` no necesita hablar con nada de acá |
| **`fin_savings_closures`** | La referencia la abandonó en su Ronda 9. No la construimos |
| **Reparto global / `<SavingsClosureSheet>`** | Reemplazado desde el arranque por el botón "Ahorrar" de cada card. No repetimos la evolución |
| **`fin_savings_goals.sort_order` con UI de reordenar** | La columna se crea (default 0, desempate por `created_at`, igual que `fin_budget_lines`), pero sin pantalla para arrastrar — mismo recorte que Presupuesto |
| Reportes históricos de ahorro a través de meses · notificación al llegar a la meta · sugerencia de reparto por historial | Features 8 y 10; la sugerencia necesita meses de datos que hoy no existen |

---

## 1. Objetivo del sprint

> **Apartar el sobrante de cada mes (lo que gané − lo que gasté) en ahorros con
> su propio ritmo y meta, repartido plan por plan, y ver el saldo libre de cada
> cuenta separado de lo que ya está guardado — sin que se mezclen nunca con el
> gasto corriente.**

### Definición de "terminado"

- [ ] Puedo crear varios ahorros, cada uno con su moneda, su regla de reparto
      (monto fijo o %) y una meta opcional
- [ ] Veo el saldo de cada ahorro, su meta si tiene, y un badge cuando la cumplió
- [ ] Cada cuenta muestra su saldo total y, aparte, cuánto de eso está apartado
- [ ] Un gasto común nunca puede dejar el saldo libre de una cuenta en negativo
      por tocar lo apartado — en el quick-add, al registrar un fijo, en todos lados
- [ ] Al terminar un mes, cada ahorro sin fondear muestra un botón "Ahorrar" con
      lo que le toca según su regla; confirmarlo arma la transferencia real,
      tageada, y marca el mes
- [ ] Si el sobrante no alcanza para los montos fijos, la app me lo dice y me
      deja ajustar, no decide sola
- [ ] Un mes en rojo no me traba: se muestra y el mes rueda al siguiente
- [ ] Puedo retirar de un ahorro desde el quick-add, con un motivo obligatorio
- [ ] Puedo mover lo guardado de un ahorro de una cuenta a otra sin que eso
      cambie el saldo del ahorro
- [ ] Un fijo puede ser un aporte a un ahorro, y se registra como el resto de los
      fijos (día del mes, pendiente/vencido, meses atrasados)
- [ ] Existe `/finanzas/mas` y agrupa Deudas · Fijos · Presupuesto · Ahorro ·
      Cuentas; la tab bar de móvil llega a "Más" en vez de a Cuentas
- [ ] `npm run build`, `npx tsc --noEmit` y `eslint` pasan sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **Ahorros** | Entidad propia (`fin_savings_goals`): nombre, moneda, reparto (`fixed`/`percent`), meta opcional (monto + fecha), cajón de sastre, archivar |
| **Etiqueta en los movimientos** | `savings_goal_id` + `savings_flow` + `savings_reason` + `savings_period` en `fin_transactions` |
| **Saldo por ahorro y apartado por cuenta** | Derivados en `lib/finanzas/savings.ts`, viajan en el snapshot |
| **El sobrante del mes** | `ingresoUsd − gastoUsd` (mismo filtro `isConsumo` que Presupuesto) − aportes de fijos de ese mes |
| **Propuesta de reparto** | `proposeAllocation`: fijos primero (topeados por su meta), % sobre el resto, cajón de sastre al final; caso "no alcanza" y caso "mes en rojo" |
| **"Ahorrar" plan por plan** | Un botón por card; guarda un mes ya terminado en un plan; transferencia (a la misma cuenta o a otra) tageada `aporte` con `savings_period` |
| **Retiro** | Un `gasto` etiquetado en el quick-add, con motivo obligatorio |
| **Traslado** | "Mover de cuenta" en Ahorros: transferencia entre dos cuentas distintas, `savings_flow='traslado'`, mueve lo apartado en las dos, deja el saldo del ahorro igual |
| **El piso de ahorro** | En el helper compartido de validación de saldo — todos los caminos que sacan plata |
| **Fijo de ahorro** | `savings_goal_id` + `to_account_id` en `fin_recurring`; registrar genera la transferencia tageada |
| **Pantalla `/finanzas/ahorro`** | Lista de cards + detalle + sheets |
| **Pantalla `/finanzas/mas`** | La grilla de secciones fuera de la tab bar + el rediseño de nav |
| **Banner en la Home** | Pasivo, "es hora de organizar tus ahorros" |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| Bloqueo duro (confirmación al retirar, tope propio, ocultar la cuenta del picker) | Decisión cerrada: blando, como el resto de la app. Lo único obligatorio al retirar es el motivo |
| "Un-etiquetar" plata guardada sin gastarla, en la misma cuenta | La referencia no lo modela: sacar plata de un ahorro es siempre un `gasto` (romperlo) o un traslado (que sigue guardada). La fricción es a propósito |
| Reportes de ahorro a través de meses | Feature 8 (Reportes), que reusa el cálculo del sobrante de este sprint |
| Notificación al llegar a una meta | Feature 10 (Notificaciones) |
| Sugerencia de reparto por historial | Necesita 2–3 meses de datos reales |
| Cron para detectar "mes por repartir" | Vercel Hobby: 1 cron/día, ninguno usado todavía. El aviso es pasivo, al cargar la pantalla |

---

## 3. Modelo de datos

Una tabla nueva, cuatro columnas en `fin_transactions`, dos en `fin_recurring`,
y un `check` que se relaja. Todo en una sección nueva **§16** de
`supabase/schema.sql` (idempotente, re-pegable entera), mismo criterio que
§11–15. Nada de lo que existe cambia de forma más allá de esto.

### 3.1 `fin_savings_goals` — los ahorros

```sql
create table if not exists public.fin_savings_goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  name              text not null,
  input_currency    text not null check (input_currency in ('USD','BOB','USDT','USDC','BTC')),
  allocation_type   text not null check (allocation_type in ('fixed','percent')),
  allocation_value  numeric(24,8) not null check (allocation_value > 0),
  target_amount     numeric(24,8) check (target_amount is null or target_amount > 0),
  target_date       date,
  is_catchall       boolean not null default false,
  sort_order        integer not null default 0,
  archived          boolean not null default false,
  created_on        date not null default current_date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint fin_savings_goal_percent_range
    check (allocation_type = 'fixed' or allocation_value <= 100)
);

alter table public.fin_savings_goals enable row level security;

create index if not exists fin_savings_goals_user_idx
  on public.fin_savings_goals (user_id, archived, sort_order);

-- Como mucho un cajón de sastre activo por usuario. Marcar uno nuevo desmarca
-- al anterior desde la mutación (§6), no rebota con el error crudo del índice.
create unique index if not exists fin_savings_goals_one_catchall_idx
  on public.fin_savings_goals (user_id) where is_catchall and not archived;

drop trigger if exists fin_savings_goals_touch_updated_at on public.fin_savings_goals;
create trigger fin_savings_goals_touch_updated_at
  before update on public.fin_savings_goals
  for each row execute function public.touch_updated_at();
```

- `allocation_value` es un **monto** en `input_currency` cuando `allocation_type
  = 'fixed'`, o un **porcentaje 0–100** cuando es `'percent'` (§4.4 tiene el
  algoritmo). El `check` de rango solo aplica al `percent`.
- `created_on` — desde qué mes el plan puede organizar sobrantes. Uno creado en
  agosto no ofrece "guardar julio" (§4.5). Mismo rol que `fin_recurring.starts_on`.
- **Sin `retroactive`** — no hay nada que contar hacia atrás como en Presupuesto.
- El cajón de sastre **no exige** que los % sumen 100: si suman menos, el resto
  lo absorbe él; si no hay ninguno marcado, queda "sin asignar" y la propuesta
  lo muestra.

### 3.2 `fin_transactions` — cuatro columnas

```sql
alter table public.fin_transactions
  add column if not exists savings_goal_id uuid references public.fin_savings_goals(id) on delete set null;
alter table public.fin_transactions
  add column if not exists savings_flow text;
alter table public.fin_transactions
  add column if not exists savings_reason text;
alter table public.fin_transactions
  add column if not exists savings_period date;

do $$ begin
  alter table public.fin_transactions
    add constraint fin_tx_savings_flow_check
    check (savings_flow is null or savings_flow in ('aporte','retiro','traslado'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.fin_transactions
    add constraint fin_tx_savings_reason_check
    check (savings_reason is null or savings_reason in ('emergencia','meta_cumplida','cambio_planes','otro'));
exception when duplicate_object then null;
end $$;

-- La forma: los cuatro campos viajan juntos. Con etiqueta hay dirección SÍ o SÍ
-- (el `is not null` explícito — un check que evalúa a NULL no se viola, y
-- `true and null` = null dejaba pasar filas sin dirección). El motivo solo en
-- un retiro; el período solo en un aporte.
do $$ begin
  alter table public.fin_transactions
    add constraint fin_tx_savings_shape check (
      (savings_goal_id is null
        and savings_flow is null and savings_reason is null and savings_period is null)
      or
      (savings_goal_id is not null
        and savings_flow is not null
        and (savings_reason is null or savings_flow = 'retiro')
        and (savings_period is null or savings_flow = 'aporte'))
    );
exception when duplicate_object then null;
end $$;

create index if not exists fin_transactions_savings_goal_idx
  on public.fin_transactions (savings_goal_id) where savings_goal_id is not null;
```

Mismo patrón que `recurring_id`: una FK nullable sobre la tabla que ya existe,
`on delete set null` — borrar un ahorro no toca sus movimientos, solo les
suelta la etiqueta.

⚠️ **`on delete set null` deja los otros tres campos colgados** y la fila
intermedia (goal en null, flow en `'retiro'`) viola el `check`. La mutación de
borrar un ahorro (§6) tiene que soltar **los cuatro campos en un solo
`update`** antes del `delete` — un `check` no es diferible. Mismo aprendizaje
que la compensación de `settleDebts` (sprint-2 §11 B1).

### 3.3 `fin_tx_shape` — permitir la transferencia a la misma cuenta

Hoy el `check` de forma exige `to_account_id <> account_id` para toda
transferencia. "Guardar sin mover de banco" (§4.5) es exactamente ese caso:

```sql
-- Reemplaza fin_tx_shape (§11.4): una transferencia puede ir de una cuenta a
-- ELLA MISMA solo si es un aporte de ahorro — el saldo no se mueve, lo apartado
-- sube. Cualquier otra transferencia sigue necesitando destino distinto.
do $$ begin
  alter table public.fin_transactions drop constraint if exists fin_tx_shape;
  alter table public.fin_transactions add constraint fin_tx_shape check (
    (type = 'transferencia'
      and to_account_id is not null
      and (to_account_id <> account_id or savings_flow = 'aporte')
      and category_id is null)
    or
    (type in ('gasto','ingreso')
      and to_account_id is null
      and to_amount is null)
  );
exception when others then null;
end $$;
```

### 3.4 `fin_recurring` — dos columnas para el fijo de ahorro

```sql
alter table public.fin_recurring
  add column if not exists savings_goal_id uuid references public.fin_savings_goals(id) on delete restrict;
alter table public.fin_recurring
  add column if not exists to_account_id uuid references public.fin_accounts(id) on delete restrict;

-- savings_goal_id y to_account_id: juntos o ninguno. Un fijo de ahorro no lleva
-- categoría (no es un gasto que presupuestar) ni reparto (no le cobrás a nadie
-- una parte de tu propio ahorro).
do $$ begin
  alter table public.fin_recurring
    add constraint fin_recurring_savings_shape check (
      (savings_goal_id is null and to_account_id is null)
      or
      (savings_goal_id is not null and to_account_id is not null and category_id is null)
    );
exception when duplicate_object then null;
end $$;
```

Las dos FK van `on delete restrict` (no `set null`): borrar un ahorro o una
cuenta que un fijo usa lo dejaría en un estado que la propia validación
rechaza, y el fijo quedaría sin poder editarse ni pausarse. La mutación de
borrar avisa con un mensaje que nombra los fijos (§6), mismo criterio que
`fin_recurring.account_id`.

> `to_account_id` es **opcional en la plantilla** y se pide al **registrar**
> cada instancia (mismo criterio que `fin_recurring.account_id`, que ya es
> nullable "porque la cuenta se elige recién al registrar"). La plantilla
> guarda la última usada como default. Al registrar se valida que exista y no
> esté archivada.

### 3.5 Nada de `fin_accounts`, nada de tabla de cierres

No hay `is_savings` (el modelo final lo eliminó, §0). No hay
`fin_savings_closures` (la referencia la abandonó). El "mes pendiente" es el
mes pasado y se deriva; qué plan ya fondeó ese mes sale de `savings_period`.

### 3.6 RLS — mismo criterio, sin excepciones

`fin_savings_goals`: `enable row level security` y las **4 policies explícitas**
(`select`/`insert`/`update`/`delete`) con `user_id = auth.uid()`, `with check`
en el `update`. Sin cláusula `is_admin()` — Finanzas es privado hasta de los
admins (igual que §11–15). Las columnas nuevas de `fin_transactions` y
`fin_recurring` heredan las policies que esas tablas ya tienen.

---

## 4. Reglas de negocio

Todo el cálculo vive en `lib/finanzas/savings.ts` (puro, sin imports de
`next/*` ni `@/` — §5.1). La UI solo pinta.

### 4.1 Saldo de un ahorro — derivado, nunca guardado

```
saldo_usd(ahorro) = Σ amount_usd   de las tx con savings_goal_id = ahorro, savings_flow = 'aporte'
                  − Σ amount_usd   de las tx con savings_goal_id = ahorro, savings_flow = 'retiro'
```

Un **traslado no entra** en esta suma: mueve la plata de billetera, no cambia
cuánto tenés en ese ahorro. El aporte usa el monto que **llegó**
(`to_amount_usd ?? amount_usd`) — en un aporte cross-currency, lo que quedó
guardado es el lado que entró (sprint-1 §11.4b). Se muestra también en
`input_currency` del ahorro, convertido con la tasa de **hoy** (igual que
Presupuesto); cada movimiento sigue guardando su propia tasa congelada.

### 4.2 Lo apartado por cuenta — también derivado

`computeSavingsByAccount` (nativa, en la moneda de cada cuenta) y
`computeSavingsByAccountUsd` (para comparar cuentas):

```
aporte      → + lo que ENTRÓ, en to_account_id
retiro      → − lo que SALIÓ, en account_id
traslado    → − en account_id  Y  + en to_account_id   (los DOS lados)
```

Un aporte y un retiro mueven **un solo lado**; el traslado mueve los dos. El
resultado se clampea en 0 — una cuenta no puede tener ahorro negativo.

**La nativa no usa ninguna tasa:** `amount` ya está en la moneda de `account_id`
y `to_amount` en la de `to_account_id`. Pasar por USD y volver arrastraba
centavos — aportar Bs 700 y ver "Bs 699,99 apartados" es un número que se sabe
mal.

**Invariante:** el saldo de un ahorro = Σ lo que ese ahorro tiene apartado en
cada cuenta (`computeGoalBalancesByAccountUsd`). Es lo que sostiene la pantalla
de Cuentas y los topes del traslado.

### 4.3 El sobrante del mes

```
sobrante_usd(mes) = ingresoUsd(tx del mes) − gastoUsd(tx del mes) − Σ aportes de FIJOS de ese mes
```

`ingresoUsd`/`gastoUsd` (`lib/finanzas/transactions.ts`) ya filtran por
`flow_type = 'consumo'` — reembolsos y cobros de deuda quedan afuera. Un
**retiro** es un `gasto·consumo`: sí baja el sobrante (romper un ahorro deja
menos para guardar el mes que viene — asimetría deliberada). Un **aporte** es
una `transferencia·movimiento`: no está en `gastoUsd`, así que hay que
restarlo aparte, y **solo los de un fijo** (`recurring_id not null`):

- Las transferencias del propio reparto nacen con fecha de hoy, que cae en el
  mes *siguiente* al que organizan — restarlas arruinaría un mes que no terminó.
- Los traslados no ahorran nada nuevo.
- Los aportes de otros meses ya los deja fuera el filtro de período.

### 4.4 Propuesta de reparto — `proposeAllocation(goals, sobrante, rates)`

Con `sobrante_usd > 0`:

```
activos  = ahorros sin archivar Y no (meta cumplida)          -- el cajón NO se excluye por meta
fijos    = activos con allocation_type = 'fixed', sin contar el cajón
pct      = activos con allocation_type = 'percent', sin contar el cajón

pedido_usd(fijo)  = min( allocation_value → USD ,  falta_para_meta_usd(fijo) )   -- nunca se pasa de la meta
suma_fijos_usd    = Σ pedido_usd(fijo)

si suma_fijos_usd <= sobrante_usd:
    cada fijo recibe su pedido_usd
    resto_usd = sobrante_usd − suma_fijos_usd
    cada pct recibe  min( resto_usd × (allocation_value/100) ,  falta_para_meta_usd(pct) )
    remanente = lo que quedó del resto
    → si hay cajón de sastre: se lo lleva entero (ignora su propia meta)
    → si no: queda en `unassignedUsd`, la pantalla lo muestra y sugiere marcar uno

si suma_fijos_usd > sobrante_usd:
    insufficientForFixed = true
    cada fijo viaja con su pedido (capped) para que la UI muestre el ajuste manual
    los pct proponen $0 hasta que el usuario libere margen
```

El monto nativo de cada línea se resuelve al final; para un fijo **no topeado
por su meta** se usa su `allocation_value` tal cual ("50" sigue diciendo 50, no
vuelve de un round-trip por USD como 49,99).

Con `sobrante_usd <= 0`: propuesta vacía. La pantalla muestra el número
(negativo o cero) y ninguna card ofrece "Ahorrar". El mes rueda solo al
siguiente — no hay nada que responder ni tabla que escribir.

### 4.5 "Ahorrar" — el reparto plan por plan

Cada card, mientras ese plan no haya fondeado el mes pasado y lo haya
**vivido** (`created_on <= primer día del mes pendiente`), muestra:

```
🛡️ Emergencia
$ 200,00 de $ 600,00
──────────────────────────
Acordaste $ 60,00              [ Ahorrar ]   ← azul (--fz-save)
```

Un plan por **%** dice las dos cosas: `25% = $ 61,34` — el monto solo escondía
de dónde salía.

`<SavingsSaveSheet>` al tocarlo:

```
Emergencia · organizando agosto de 2026
──────────────────────────────
Acordaste guardar        $ 60,00

¿De dónde sale?
  Banco Unión          Bs 11.620 libres
  Efectivo             Bs 2.195 libres

¿En qué cuenta ahorrar?   [Banco Unión ▾]   (default: la misma)
  Se queda en la misma cuenta, apartada de lo que podés gastar.

¿Cuánto?  [ 60,00 ]                          MÁX
```

Valida, en orden:

1. El plan existe y no está archivado.
2. El período es un mes **ya terminado** — nunca el mes en curso: todavía no se
   sabe cuánto va a sobrar.
3. Ese plan **no fondeó ya** ese período (hay una tx suya con ese
   `savings_period`).
4. La cuenta de origen está en **la moneda del plan**. Un ahorro en Bs no se
   alimenta con dólares sin decidir a qué tasa.
5. El monto entra en lo que esa cuenta tiene **libre hoy** (`saldo − apartado`,
   clampeado en 0), no en el saldo entero. **El sobrante es un monto, no un
   lugar:** dice cuánto te quedó, no en qué billetera está parado.

Crea una `transferencia` con `flow_type: 'movimiento'` (el trigger
`fin_normalize_flow_type` ya lo fuerza), `savings_flow: 'aporte'` y
`savings_period` = el mes organizado. Si origen = destino, el `check` relajado
de §3.3 la deja pasar y el saldo no se mueve.

Si no hay plata libre en la moneda del plan, el sheet no dice "no se puede":
dice cuánto hay en otras monedas y sugiere convertir con una transferencia y
volver.

### 4.6 El piso de ahorro — lo apartado no es plata disponible

La regla vive en el helper compartido de validación de saldo (el equivalente
de `assertBalance` de la referencia), por el que pasan **todos los caminos que
sacan plata de una cuenta**: crear un movimiento, editarlo, registrar un fijo,
repartir un aporte del cierre.

```
movimiento común    → tope = saldo − apartado
retiro declarado    → tope = apartado   (acotado por el saldo real)
```

Consecuencias que vale decir en voz alta:

- **Un fijo que no entra sin romper un ahorro, no entra.** Para pagarlo hay que
  retirar del ahorro primero, a mano y con su motivo. Es incómodo a propósito.
- **No se retira de una cuenta donde ese ahorro no tiene nada apartado.** No se
  saca lo que no se puso — el quick-add ni ofrece el toggle en ese caso.
- **Una cuota de deuda cobrada no se ve afectada:** es un `ingreso`, plata que
  entra, y `consumesBalance` ya la deja afuera.
- `<RegisterSheet>` (Fijos) muestra el mismo disponible que aplica la
  validación, con "· $X en ahorros" al lado para que el número no aparezca sin
  explicación.

El apartado se calcula **en la moneda de la cuenta**, no en USD (mismo motivo
que §4.2).

### 4.7 Aporte / retiro / traslado — la dirección se declara

| Dirección | Por dónde entra | Qué genera |
|---|---|---|
| **aporte** | botón "Ahorrar" de un plan, o un fijo de ahorro al registrarse | `transferencia` (a la misma cuenta o a otra) · `movimiento` · `savings_period` |
| **retiro** | un `gasto` etiquetado en el quick-add | `gasto` · `consumo` (gasto real) · `savings_reason` obligatorio |
| **traslado** | "Mover de cuenta" en Ahorros (§4.11) | `transferencia` entre cuentas **distintas** · `movimiento` · sin motivo |

Reglas duras (la mutación las valida en el cliente; el `check` de §3.2 es la red):

- El quick-add solo acepta `savings_goal_id` en un **`gasto`**. Un `ingreso` o
  una `transferencia` tageados desde ahí se rechazan con el mensaje que dice a
  dónde ir ("los aportes se hacen desde Ahorros").
- Editar no es la puerta de atrás: cargar un retiro y cambiarle el tipo a
  `ingreso` para volverlo aporte se rechaza. Editar una transferencia tageada
  **que ya era así** (la del fijo, la del cierre, el traslado) sigue funcionando
  — archivar o cambiar una regla no congela la historia.
- Un retiro sin `savings_reason` válido se rechaza.
- Elegir un ahorro **archivado** para un movimiento nuevo (incluido registrar un
  fijo de ahorro) se rechaza.

Regla blanda, deliberada: un movimiento **sin etiquetar no pregunta nada**.
Gastar de una cuenta que además guarda ahorros es un gasto común.

### 4.8 Meta cumplida

`saldo_usd(ahorro) >= target_amount → USD` (cuando tiene meta): sale de la
propuesta automática (§4.4) y la card muestra un badge "Meta cumplida". No se
bloquea nada — se puede seguir aportando a mano. El **cajón de sastre es la
excepción**: recibe el remanente aunque ya haya llegado a su meta, porque su
trabajo es que no quede plata sin destino.

### 4.9 Edición del reparto — sin retroactividad; moneda congelada

Cambiar `allocation_type`/`allocation_value` se aplica desde el **próximo**
cierre. No hay tabla de "montos por período" como en Presupuesto: los aportes
ya hechos son inmutables (misma lógica que `exchange_rate` congelado), no hay
nada que recalcular.

La **moneda** se congela con el primer movimiento (aporte o retiro):
`has_movements` es lo que la pantalla usa para deshabilitar el selector, y con
movimientos muestra la moneda fija explicando por qué. Mismo criterio que la
moneda de una cuenta con movimientos (sprint-1).

### 4.10 Fijo de ahorro

Un `fin_recurring` con `savings_goal_id` + `to_account_id` (§3.4). Al
registrarlo (mismo `<RegisterSheet>` de Fijos), en vez del `gasto` de siempre
genera una **`transferencia`** con `savings_flow: 'aporte'`, `savings_period`
= el mes en que cae su fecha, y `flow_type: 'movimiento'`.

Se reusa **todo** Fijos tal cual: `day_of_month`, `starts_on`, pendiente /
vencido / programado (`recurringStatus`), los meses atrasados que se recuperan
de a uno (`pendingPeriods`), la idempotencia por período (sprint-3 §4.3).

- **Sin categoría, sin reparto, sin deudas.** La UI oculta el editor de reparto
  cuando el fijo es de ahorro; el servidor lo ignora aunque la plantilla traiga
  partes viejas de cuando era un fijo compartido.
- **La cuenta destino se pide al registrar**, no en la plantilla, y se valida
  que exista y no esté archivada. La plantilla guarda la última como default.
- Es "pagarme a mí primero": **aporta aunque el mes cierre en rojo**, a
  diferencia del reparto del cierre (que sale del sobrante). Los dos pueden
  convivir — son dos disparadores del mismo tipo de movimiento.
- El aporte de un fijo **descuenta del sobrante** de su mes (§4.3): al cerrar,
  el reparto no vuelve a proponer plata que el fijo ya guardó.

Consecuencia: un plan que **ya recibió el aporte de su fijo** ese mes tiene el
botón "Ahorrar" apagado (`savings_period` no distingue de dónde vino el
aporte). Es coherente — un plan con fijo se financia por el fijo.

### 4.11 El traslado — mover un ahorro de cuenta

Desde "Mover de cuenta" en el menú de cada ahorro. **No** vive en el quick-add:
no ganaste ni gastaste nada, solo cambiaste de billetera plata ya guardada.

Se ve como una transferencia (lo es): mismo formulario que "Transferir" —monto
con su MÁX, *Desde*, *Hacia*, "cuánto llegó" y comisión cuando cambian de
moneda. Lo distinto es de qué bolsillo sale: **el tope es por ahorro y por
cuenta**. Si en Efectivo hay Bs 500 del auto y Bs 300 de emergencias, del auto
se mueven 500, no 800 (`computeGoalBalancesByAccountUsd`).

```
saldo real       A −X, B +X    (transferencia normal)
lo apartado      A −X, B +X    (los DOS lados)
saldo del ahorro    sin cambios
```

`transferencia` con `flow_type: 'movimiento'`, `savings_flow: 'traslado'`, sin
motivo. Origen y destino tienen que ser **distintos**. Pasa por el piso de
ahorro como una salida de la alcancía: si la plata se gastó por otro lado, no
está, y el traslado se rechaza.

### 4.12 Historia previa a la regla

Un `gasto` cargado antes de que existiera este sprint no se vuelve ineditable:
el ahorro y el motivo se exigen solo cuando el movimiento **ya era de ahorro**
o cuando el cliente manda uno explícitamente (es cuando de verdad lo está
convirtiendo). El picker se sigue mostrando por si se lo quiere tagear.

Tercera aparición de la misma clase de bug (la categoría de un fijo en
sprint-3, el ahorro archivado, esta): una regla nueva no puede congelar la
historia que la precede. El otro extremo sí: **archivar frena lo nuevo** — un
fijo cuyo ahorro se archivó se sigue pausando y editando, pero ya no se
registra.

### 4.13 Atomicidad

Crear un ahorro es 1 insert. Guardar un aporte del cierre es 1 insert (la
transferencia). Un retiro desde el quick-add es 1 insert. Un traslado, 1.
Borrar un ahorro con movimientos son 2 escrituras (soltar los 4 campos de sus
tx + el delete) — si la 2ª falla se avisa, sin transacción SQL (mismo caso de
sprint-2 §6). Marcar un cajón de sastre cuando ya había otro son 2 updates
(desmarcar el viejo, marcar el nuevo).

---

## 5. Estructura de archivos

```
app/finanzas/ahorro/page.tsx           — lista de ahorros + card de cada uno +
                                         invitación de "mes por organizar"
app/finanzas/mas/page.tsx              — grilla de secciones fuera de la tab bar

app/finanzas/components/
├── savings-goal-sheet.tsx             — crear / editar un ahorro (nombre, moneda,
│                                         reparto, meta, cajón de sastre, borrar)
├── savings-save-sheet.tsx             — "Ahorrar": fondear UN plan para el mes pasado
├── savings-move-sheet.tsx             — el traslado entre cuentas (§4.11)
├── savings-detail-sheet.tsx           — saldo, historial, dónde está guardado, meses
└── savings-withdraw-fields.tsx        — el picker de motivo, inline en el quick-add
                                         (mismo criterio que el bloque de presupuesto
                                          vive dentro de quick-add.tsx — referencia §0.3)

lib/finanzas/savings.ts
├── periodStart / periodRange / previousPeriod   — re-export desde budgets.ts (no duplica)
├── savingsBalancesUsd(txs)                       — saldo por ahorro (§4.1)
├── savingsByAccount(txs) / ...Usd                — apartado por cuenta (§4.2)
├── goalBalancesByAccountUsd(txs)                 — por ahorro y por cuenta (traslado)
├── surplusUsd(txs, period, rates)               — el sobrante del mes (§4.3)
├── goalReached(goal, balanceUsd, rates)         — meta cumplida (§4.8)
├── pendingSavingsPeriod(todayISO)               — el mes pasado, y solo ese
├── canSaveForPeriod(goal, period)               — un plan solo organiza lo que vivió
├── savedPeriodsOf(txs, goalId)                  — de qué meses ya hay aporte
├── proposeAllocation(goals, surplusUsd, rates)  — el reparto (§4.4)
├── freeToSaveByAccount(accounts, txs)           — saldo − apartado, clampeado (§4.5)
├── savableUsd(freeUsd, reservedUsd)             — el piso de ahorro (§4.6)
└── validateGoal(...)                            — nombre, reparto, meta, %≤100
```

`lib/finanzas/types.ts` gana `SavingsGoal`, `SavingsGoalWithBalance`,
`SavingsAllocationLine`, `AllocationResult`, `SavingsFlow`, `SavingsReason`;
`Transaction` gana `savings_goal_id`, `savings_flow`, `savings_reason`,
`savings_period`; `Recurring` gana `savings_goal_id`, `to_account_id`.

`data-context.tsx` gana: `savingsGoals` en el estado y el snapshot (sube
`SNAPSHOT_VERSION`); una consulta a `fin_savings_goals` en el `Promise.all` de
`load()`; los derivados `savingsView` (saldo + apartado + meta + estado por
ahorro, y el sobrante + propuesta del mes pendiente), `savingsByAccount` (para
Cuentas y el piso), `savingsGoalFor(accountId)`; y las mutaciones
`createSavingsGoal`, `updateSavingsGoal`, `deleteSavingsGoal`,
`saveSavingsForPeriod`, `moveSavings`, `withdrawFromSavings` (o el retiro va
por `createTransaction` con los campos nuevos — se decide al construir).

`quick-add.tsx`: elegir una cuenta con algo apartado en un `gasto` habilita el
toggle "Gastar de mis ahorros"; encenderlo muestra `<savings-withdraw-fields>`
(qué ahorro + motivo) y aplica el tope `= apartado` en vez de `saldo − apartado`.

`nav-items.tsx`: entradas nuevas "Ahorro" y — fuera de `NAV_ITEMS` — el
`MORE_ITEM`. `mobileTab: false` en Deudas, Fijos, Presupuesto, Ahorro y
**Cuentas**. `MORE_ITEMS = NAV_ITEMS.filter(i => !i.mobileTab)`.

`tab-bar.tsx`: el slot de Cuentas pasa a ser "Más". `sidebar.tsx` no cambia
(lista `NAV_ITEMS`, que no incluye Más).

`recurring-sheet.tsx` / `register-sheet.tsx`: el fijo puede marcarse "aporte a
un ahorro" (elige el ahorro; oculta categoría y reparto); al registrar, pide la
cuenta destino y valida solo que exista y no esté archivada (no hay flag
`is_savings` — cualquier cuenta sirve).

`app/finanzas/page.tsx` (Home): el banner pasivo de "organizar tus ahorros".

`supabase/schema.sql`: sección **§16** nueva.

### 5.1 Regla de independencia

Sin cambios respecto de sprint-1 §5.1. `lib/finanzas/savings.ts` no importa de
`next/*` ni del alias `@/` — solo de `./money`, `./types` y `./budgets`
(re-export de los helpers de período).

---

## 6. Cómo se leen y escriben los datos

Mismo patrón que Sprints 1–5 — sin rutas API, todo `supabase.from('fin_...')`
directo desde componentes cliente, RLS como única barrera.

- **Crear ahorro** (`createSavingsGoal`): valida nombre / reparto / meta en el
  cliente; si viene `is_catchall` y ya hay otro activo, primero `update` al
  viejo (`is_catchall = false`), después el `insert`. Un `insert` con dos
  cajones se lo comería el índice único parcial con un error crudo — por eso se
  desmarca antes.
- **Editar ahorro** (`updateSavingsGoal`): `update` de nombre / reparto / meta /
  archivar / cajón. La **moneda** solo si `!has_movements` (chequeado contra
  `allTx`). Marcar cajón desmarca al anterior (2 updates).
- **Borrar ahorro** (`deleteSavingsGoal`): si un fijo lo usa (`fin_recurring`
  con ese `savings_goal_id`), rechaza con un mensaje que los nombra (`on delete
  restrict`). Si no: primero un `update` que suelta **los 4 campos** de sus tx
  (`savings_goal_id`, `savings_flow`, `savings_reason`, `savings_period` → null)
  en una sola query, después el `delete` — el `check` de forma no es diferible
  (§3.2).
- **Fondear un mes** (`saveSavingsForPeriod`): valida los 5 puntos de §4.5 en el
  cliente (período terminado, no fondeado ya, moneda, monto ≤ libre); `insert`
  de una `transferencia` con `savings_flow: 'aporte'` + `savings_period`. El
  `flow_type` lo pone el trigger.
- **Retirar** (desde el quick-add): `insert`/`update` de un `gasto` con
  `savings_goal_id` + `savings_flow: 'retiro'` + `savings_reason`. Pasa por el
  piso de ahorro con tope `= apartado`.
- **Trasladar** (`moveSavings`): valida origen ≠ destino y monto ≤ lo que ese
  ahorro tiene en la cuenta de origen; `insert` de una `transferencia` con
  `savings_flow: 'traslado'`. Cross-currency exige `to_amount` (sprint-1).
- **Registrar un fijo de ahorro**: en vez del `gasto` de siempre, `insert` de la
  `transferencia` tageada. La idempotencia por período es la de sprint-3 §4.3
  (un `select` fresco antes de insertar).

Ninguna operación necesita más de dos escrituras. Donde hay dos y la segunda
puede fallar, se compensa la primera y se avisa con un mensaje específico
(mismo límite aceptado desde sprint-2 §6).

---

## 7. Antes de escribir la primera línea de código

Sin decisiones de diseño pendientes — §0 las cerró todas. Lo que conviene tener
a mano si querés arrancar con ahorros reales:

- Para cada ahorro: nombre, moneda, y su regla — un monto fijo por mes, o un %
  del sobrante. Meta si tiene.
- Cuál es tu **cajón de sastre** (dónde va lo que el reparto no asigna), si
  querés uno.
- Si vas a usar un **fijo de ahorro**: el día del mes y la cuenta de la que sale.

Y, antes de nada: **correr la sección 16 de `supabase/schema.sql`** en el SQL
Editor. Incluye el reemplazo de `fin_tx_shape` (§3.3) — es idempotente, pero
revisá que no rompa nada si tenías una versión editada a mano.

---

## 8. Qué desbloquea

| Feature | Cómo se apoya |
|---|---|
| **Reportes** (Feature 8, congelada en la referencia) | `surplusUsd(mes)` es directamente "cuánto ahorraste ese mes", uno de los números centrales de cualquier reporte de tendencia |
| **Fondo de crecimiento / ROI** (Feature 9, congelada) | Sería un `allocation_type` o un flag más en `fin_savings_goals` — la entidad, el saldo derivado y el reparto ya están |
| **Notificaciones** (Feature 10) | "Mes por organizar" y "meta cumplida" ya están calculados; falta solo el envío pasivo |
| **La pantalla "Más"** | Este sprint la construye — cualquier pantalla futura sin slot entra agregando una línea a `NAV_ITEMS` |

⚠️ **Sin cron.** La detección de "mes por organizar" es bajo demanda, al cargar
Ahorros o la Home — no un job. Vercel Hobby permite 1 cron/día y no hay ninguno.

⚠️ **El quick-add depende de los ahorros en cualquier pantalla** (para el toggle
de retiro y el piso), así que `savingsGoals` / `savingsByAccount` se derivan en
`data-context.tsx` y viajan en el snapshot desde el día uno.

---

## 9. Desarrollo (2026-09-10) — implementación completa

Sprint construido de una pasada sobre la spec de arriba. `npx tsc --noEmit`,
`npm run build` y `npx eslint app/finanzas lib/finanzas` en verde; humo de dev
sobre las 9 rutas de Finanzas (las 7 previas + `/finanzas/ahorro` +
`/finanzas/mas`), todas 200.

### Qué se creó

- **`supabase/schema.sql` §16** — `fin_savings_goals` (con el índice único
  parcial del cajón de sastre y el trigger `touch_updated_at`); las 4 columnas
  de `fin_transactions` (`savings_goal_id` FK `on delete set null`,
  `savings_flow`, `savings_reason`, `savings_period`) con `fin_tx_savings_shape`
  usando el `is not null` **explícito** y biconditionales
  `(savings_reason is not null) = (savings_flow = 'retiro')` /
  `(savings_period is not null) = (savings_flow = 'aporte')`; el reemplazo de
  `fin_tx_shape` para permitir `to_account_id = account_id` en un aporte; las 2
  columnas de `fin_recurring` (`savings_goal_id` / `to_account_id`, `on delete
  restrict`) con `fin_recurring_savings_shape`; y las 4 policies RLS de
  `fin_savings_goals`.
- **`lib/finanzas/savings.ts`** — módulo puro (solo `./budgets`, `./money`,
  `./rates`, `./types`). `savingsBalancesUsd` / `savingsBalanceUsd`;
  `savingsByAccount` (nativa) + `savingsByAccountUsd`; `goalBalancesByAccount`
  (por ahorro y por cuenta); `freeByAccount` (saldo − apartado, el piso);
  `targetAmountUsd` / `goalReached`; `pendingSavingsPeriod` (el mes pasado) /
  `canSaveForPeriod` / `savedPeriodsOf`; `surplusUsd` (ingreso − gasto − aportes
  de fijos del mes); `proposeAllocation` (fijos topeados por su meta primero, %
  sobre el resto, cajón de sastre al final ignorando su meta, `insufficientForFixed`);
  `validateGoal`. Tipos `SavingsGoalView` / `SavingsOverview` /
  `SavingsGoalWithBalance` / `SavingsAllocationLine` / `AllocationResult`.
- **`app/finanzas/ahorro/page.tsx`** — invitación azul de "mes por organizar",
  aviso de "no alcanza para los fijos", una card por ahorro (barra de meta,
  regla de reparto, botón "Ahorrar" cuando hay pendiente), aviso de "sin
  asignar", y el atajo a "Nuevo ahorro".
- **`app/finanzas/mas/page.tsx`** — grilla de cards desde `MORE_ITEMS`, cada una
  con el estado de su sección leído del contexto.
- **`components/savings-goal-sheet.tsx`** (crear/editar/borrar, moneda fija con
  movimientos, cajón de sastre), **`savings-save-sheet.tsx`** ("Ahorrar" plan
  por plan, origen = plata libre en la moneda del plan, destino = la misma
  cuenta por defecto), **`savings-move-sheet.tsx`** (traslado, tope por ahorro y
  por cuenta, cross-currency con "cuánto llegó"), **`savings-detail-sheet.tsx`**
  (saldo, progreso, dónde está guardado, historial, accesos a editar/mover/retirar).

### Qué se modificó

- **`data-context.tsx`** — `savingsGoals` en estado y snapshot
  (`SNAPSHOT_VERSION = 3`); consulta a `fin_savings_goals` en `load()`
  (ordenada `sort_order` → `created_at`); normalización a `null` de las columnas
  nuevas de `fin_transactions` / `fin_recurring` para bases sin la migración;
  `savingsView` (memo → `SavingsOverview`), `savingsByAccount`,
  `savingsInAccount(goalId, accountId)`; 5 mutaciones nuevas (`createSavingsGoal`
  / `updateSavingsGoal` / `deleteSavingsGoal` / `saveSavingsForPeriod` /
  `moveSavings`), con desmarcado del cajón previo y el nulado de los 4 campos
  antes de borrar un ahorro con movimientos. `createTransaction` /
  `updateTransaction` ganan `savings_goal_id` / `savings_reason` (solo un
  `gasto`, `savings_flow` = `'retiro'`, motivo obligatorio; §4.12 preservado).
  `createRecurring` / `updateRecurring` / `registerRecurring` manejan el fijo de
  ahorro (registrar genera la transferencia tageada en vez del gasto).
- **`nav-items.tsx`** — semántica invertida: `mobileTab: true` = entra a la tab
  bar (solo Inicio, Movimientos, Ajustes). `MORE_ITEM` (IconDots, fuera de
  `NAV_ITEMS`) + `MORE_ITEMS`. "Ahorro" (`IconPigMoney`) agregado; Deudas,
  Fijos, Presupuesto, Cuentas y Ahorro caen en "Más".
- **`tab-bar.tsx`** — arma `[Inicio, Movimientos, +, Más, Ajustes]`; `isTabActive`
  marca "Más" también en las sub-pantallas.
- **`quick-add.tsx`** — toggle "Gastar de mis ahorros" (solo un `gasto` desde
  una cuenta con algo apartado), chips de ahorro (los que tienen plata en ESA
  cuenta) + chips de motivo; el tope pasa a `saldo − apartado` para un gasto
  común y `min(apartado del plan, saldo)` para un retiro, con el texto
  "· X en ahorros".
- **`recurring-sheet.tsx`** — checkbox "Es un aporte a un ahorro" (oculta
  categoría y reparto, elige el plan). **`register-sheet.tsx`** — para un fijo
  de ahorro pide la cuenta destino; el piso de ahorro se aplica al disponible.
- **`app/finanzas/page.tsx`** (Home) — banner pasivo azul de "organizar tus
  ahorros" cuando hay mes pendiente.
- **`theme.css`** — tokens `--fz-save` / `--fz-save-text` / `--fz-save-tint`
  (azul), acotados a Ahorro.
- **`lib/finanzas/types.ts`** — `SavingsFlow` / `SavingsReason` /
  `SavingsAllocationType` / `SavingsGoal`; `Transaction` +4 campos; `Recurring`
  +2 campos.

### Decisiones tomadas durante la implementación

1. **El piso de ahorro vive en la UI, no en un helper central** — el codebase
   ya hace el tope de saldo en el cliente (`quick-add`, `register-sheet`), no
   hay un `assertBalance` server-side que extender. Se replicó ese patrón: el
   quick-add y el register-sheet restan `savingsByAccount` del disponible;
   `saveSavingsForPeriod` y `moveSavings` validan contra `freeByAccount` /
   `goalBalancesByAccount` en la mutación.
2. **`fin_tx_savings_shape` es más estricto que la referencia** — exige el
   motivo en todo retiro y el período en todo aporte (biconditionales), no solo
   restringe los enums. El cliente igual valida antes para dar un mensaje claro.
3. **El fijo de ahorro permite `to_account_id = account_id`** (apartar en la
   misma cuenta cada mes), igual que "Ahorrar" — el `CHECK` relajado lo cubre
   porque es un aporte. No se copió el bloqueo que la referencia tuvo en una
   ronda intermedia y después revirtió.
4. **`SavingsGoalView` y compañía viven en `savings.ts`**, no en `types.ts`
   (que la spec §5 mencionaba) — mismo precedente que `BudgetLineView` en
   `budgets.ts`.
5. **`sort_order` sin UI de reordenar** — arranca en 0, desempate por
   `created_at` en `load()`, mismo recorte que Presupuesto.
6. **La pantalla "Más" usa `mobileTab: true` como opt-IN** (antes era
   `!== false`, un opt-out) — ahora la mayoría de las secciones caen en "Más"
   sin marcar nada, que es lo que §0.1 pide para que escale.

### Pendiente para el usuario

**Correr `supabase/schema.sql` §16 en el SQL Editor** antes de abrir
`/finanzas/ahorro`. Incluye el `drop constraint fin_tx_shape` + re-`add`
(§16.3) — es idempotente, pero si tenías esa constraint editada a mano,
revisá el bloque antes de pegar.

---

## 10. Revisión contra el clon (2026-09-10) — 5 bugs + 8 divergencias

Comparado contra `Acero-Hub-ref/` (`Documentos/finanzas/sprint_7_ahorro.md`
completo, `lib/finanzas/savings.ts`).

### Bugs corregidos

1. **`deleteSavingsGoal` rompía `fin_tx_shape` al borrar un ahorro con un aporte
   "a la misma cuenta".** Borrar el ahorro nulea los 4 campos de ahorro en sus
   movimientos, pero una transferencia de una cuenta a sí misma solo es válida
   con `savings_flow = 'aporte'` (§16.3) — al sacarle la etiqueta la fila
   violaba el CHECK y el `update` (y el borrado) fallaba con un error crudo.
   Corregido: los **aportes y traslados** del ahorro se **borran** (son
   transferencias con mecánica de ahorro, sin la etiqueta no significan nada);
   los **retiros**, gastos reales, solo pierden la etiqueta.
2. **El quick-add quedaba inutilizable al cambiar a una cuenta sin ahorros con
   el toggle "Gastar de mis ahorros" encendido.** `savingsMode` persistía entre
   cambios de cuenta; en la cuenta nueva el tope caía a `min(0, saldo) = 0` y
   ningún monto se podía guardar, sin que los chips (ya ocultos) explicaran por
   qué. Corregido: `withdrawing = savingsMode && canWithdraw`, y el toggle +
   plan + motivo se resetean al cambiar de cuenta (igual que ya se limpia el
   monto).
3. **Editar el monto/cuenta de un aporte o traslado desde el quick-add lo
   desincronizaba** — un aporte tiene los dos lados atados (lo que sale = lo que
   se aparta); cambiar el monto a 80 dejando `to_amount` en 50 dejaba la cuenta
   en −30 y +50 apartado. Corregido en dos capas: `updateTransaction` bloquea el
   cambio de monto/tipo/cuenta de un aporte/traslado (mismo trato que un cobro
   de deuda ya registrado), y el quick-add muestra "se edita desde Ahorros" en
   vez del formulario cuando abrís uno.
4. **Texto roto en el sheet de editar ahorro** — "Llevás ≈ USD guardado": el
   saldo se calculaba y nunca se mostraba. Ahora muestra el número
   (`Llevás Bs 1.240 guardado`).
5. **(menor)** El card de Deudas en "Más" mostraba solo lo vencido
   (`dueDebtUsd`) como monto; ahora muestra el total pendiente y marca la
   alerta roja solo cuando hay algo vencido — igual que la Home.

### Divergencias deliberadas con la referencia

1. **`pendingSavingsPeriod(todayISO)` siempre devuelve el mes pasado** (nunca
   `null`). La referencia devuelve `null` si ningún ahorro existía ese mes; acá
   esa comprobación vive por-plan en `canSaveForPeriod` dentro de `savingsView`,
   así que `has_pending` ya es `false` cuando no hay nada que organizar.
2. **`surplusUsd` es autónomo y descuenta los aportes de fijos.** La `savings.ts`
   de la referencia hace solo `ingreso − gasto` sobre `txs` ya filtrados — pero
   su propio documento (§"El sobrante ya descuenta lo que los fijos guardaron")
   dice que debe restar `Σ aportes de fijos`. Se siguió el **documento**, no la
   librería (que quedó atrás, como `money.ts` en el Sprint 1). `surplusUsd(txs,
   period)` filtra el período por dentro y resta los aportes con `recurring_id`
   de ese `savings_period`.
3. **`goalBalancesByAccount` es NATIVO**, no USD — `Map<goalId, Map<accountId,
   nativo>>` en vez del `Map<"goalId:accountId", usd>` de la referencia. El
   traslado y "dónde está guardado" muestran nativo ("Bs 500 en Efectivo");
   sumar entre monedas no aplica.
4. **El piso de ahorro vive en la UI**, no en un `assertBalance` central (la
   referencia lo tiene ahí porque tiene capa de API). El quick-add y el
   register-sheet restan `savingsByAccount` del disponible para todo gasto;
   `saveSavingsForPeriod` / `moveSavings` validan en la mutación porque ahí la
   regla no es un simple "supera el saldo".
5. **No se portó `budgetReservedUsd` / `savableUsd`** (el presupuesto reserva
   plata antes que el ahorro) — es un sprint aparte en la referencia
   (`sprint_10_presupuesto_antes_que_ahorro.md`). Hoy `freeByAccount` =
   `saldo − apartado`, sin descontar lo comprometido en presupuesto.
6. **`allocation_type` / `allocation_value` son `NOT NULL`** con placeholder
   `fixed`/`1` para el cajón de sastre (la referencia los deja nullables).
   `proposeAllocation` excluye al cajón por id, así que el placeholder nunca se
   lee — divergencia de esquema sin efecto funcional.
7. **`fin_savings_goals.created_on date`** (además de `created_at`) — explícito
   para "¿desde qué mes puede organizar?", mismo rol que `fin_recurring.starts_on`.
8. **`fin_tx_savings_shape` más estricto** — biconditionales que exigen el motivo
   en todo retiro y el período en todo aporte, no solo restringir los enums.

### Confirmado sano
- El CHECK con `savings_flow is not null` explícito no cae en la trampa de la
  lógica de 3 valores (`true and null` = `null`, que no viola un CHECK).
- Los fijos de ahorro se integran con `recurringStatus` / `pendingCount` (no
  filtran por tipo de tx — un aporte con `recurring_id` cuenta como registrado).
- El `on delete restrict` de `fin_recurring.savings_goal_id` corta el borrado
  del ahorro **antes** de tocar los movimientos.
- Los aportes (`movimiento`) no ensucian el sobrante; los retiros (`consumo`) sí
  lo bajan (asimetría deliberada de la referencia, §4.3).
- Reload del esquema: todas las filas existentes pasan los CHECK nuevos
  (`fin_tx_shape` reescrito, `fin_recurring_savings_shape`).

`npx tsc --noEmit`, `npm run build` y `eslint app/finanzas lib/finanzas` en
verde tras los arreglos; 9 rutas 200.

### Límite conocido (compartido con la referencia)
Un **traslado cross-currency** no atribuye la comisión al ahorro: `savingsBalancesUsd`
saltea los traslados, así que mover Bs 700 (≈ $100) que llegan como $98 deja el
saldo del ahorro $2 arriba de la realidad. La referencia (`computeGoalBalancesUsd`)
hace lo mismo. Se acepta: un traslado es reorganizar, no gastar.
