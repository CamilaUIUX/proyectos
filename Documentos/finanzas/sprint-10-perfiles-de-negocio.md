# Finanzas — Sprint 10: "Perfiles de negocio"

> Mapa completo de features y roadmap: `features.md` en esta misma carpeta.
> **Este sprint no viene del repo de referencia** — no hay un `sprint_10_*.md`
> que copiar. Nace de un pedido directo sobre "Cuerpos Sin Órganos", el primer
> perfil de negocio real que se creó con el Sprint 8. Las decisiones se
> cerraron en dos rondas de preguntas con opciones (2026-09-11), y este
> documento las escribe todas antes de tocar código — mismo criterio que los
> sprints 8 y 9.
>
> Última actualización: 2026-09-11 · Estado: **especificado, no construido**.
> Se apoya en Perfiles (Sprint 8, `profile_id` en todo el dominio) y en
> Presupuesto (Sprint 5, el modelo mensual que este sprint NO toca, solo le
> suma un vecino).

---

## 0. Decisiones tomadas para este sprint

| Tema | Decisión | Por qué |
|---|---|---|
| **`fin_profiles` gana un `tipo`** | `personal` \| `negocio`, default `personal`. Cambia qué pantallas se muestran (§0.1) | Pedido explícito — "ya no es perfil de finanzas personales". El Sprint 8 lo dejó sin tipos a propósito; este sprint lo reabre porque ahora sí hay un comportamiento real, no solo estético, que depende de él |
| **Presupuesto por proyecto, nuevo y separado** | Tabla nueva `fin_budget_projects` — NO una variante de `fin_budget_lines`. Convive con el mensual, no lo reemplaza | Un proyecto no tiene mes, no rueda, no se cierra por calendario — nada del modelo mensual (`fin_budget_periods`/`extensions`/`closures`) le sirve. Mezclarlo ahí sería forzar una tabla pensada para otra cosa |
| **Un movimiento se etiqueta al proyecto directo** | `fin_transactions.project_id`, nuevo selector en el quick-add — NO por categoría | Más preciso: un proyecto es un grupo de movimientos concretos, no "todo lo que caiga en esta categoría". Elegido sobre reusar categorías en la ronda de preguntas |
| **Un proyecto tiene monto objetivo** | `target_amount` + `target_currency`, congelados (`exchange_rate`/`target_amount_usd` al crear) — mismo patrón que cualquier otro monto de esta app | Confirmado: sí hace falta saber "¿cuánto pensaba gastar/facturar?", no solo un balance libre sin referencia |
| **Se archiva a mano, sin cierre automático** | Ningún job ni fecha cierra un proyecto solo. `on delete restrict` + catch-and-archive, mismo criterio que cuentas/ahorro/perfiles | "Pasan una sola vez" no significa que tengan una fecha de fin fija — puede durar una semana o seis meses |
| **Ahorro se relabela a "Fondos de ahorro" en negocio** | Mismo `fin_savings_goals`, mismo mecanismo — solo cambia el label del nav y la copy ("para reinvertir" en vez de "para imprevistos"). Sin tabla nueva | Es el mismo concepto (apartar el sobrante) con otro propósito — reinvertir en vez de un fondo de emergencia personal |
| **Moneda de visualización, por perfil** | `fin_profiles.display_currency` (una de las 5 monedas soportadas), default `USD`. Convierte TODO total agregado de ese perfil a esa moneda, con la tasa de **hoy** | Pedido explícito, acotado a "Cuerpos Sin Órganos" — no es una regla de "todo perfil de negocio usa BOB", cada perfil elige la suya |
| **Ganancia neta = ingreso − gasto, bruto** | Sin restar `principal_usd`/reparto (a diferencia del "gasto real" de Deudas) | Simplificación deliberada para la v1 — un proyecto compartido con un socio es un caso que no se pidió; se documenta como pendiente, no se resuelve ahora |
| **Comparar proyectos = una tabla, no un gráfico** | Lista de proyectos (activos + archivados) con ganancia neta, gastado, y % del objetivo, ordenada por ganancia | Responde exactamente lo que se pidió ("qué proyecto dio más ganancia") sin construir una librería de gráficos para esto |
| **FK compuesta en `fin_transactions.project_id` ↔ `fin_budget_projects.profile_id`** | Igual criterio que cuentas/categorías/personas del Sprint 8 (§3.4 de ese sprint) | Una ganancia neta es un NÚMERO — el mismo criterio que ya cerró esa clase de cruce para cuentas/categorías/personas aplica igual acá |

### 0.1 Qué cambia por tipo de perfil

| Pantalla / feature | `personal` | `negocio` |
|---|---|---|
| Movimientos, Cuentas, Categorías, Deudas, Fijos | Igual | Igual — un negocio también tiene cuentas, paga fijos, y le deben plata |
| Presupuesto (mensual) | Igual | Igual — sigue sirviendo para costos recurrentes (alquiler, sueldos) |
| **Proyectos** (nuevo) | No aparece en el nav | Aparece — presupuesto por proyecto + ganancia neta + comparar |
| Ahorro | Label "Ahorro", copy personal | Label **"Fondos de ahorro"**, copy de reinversión — mismo dato, mismo mecanismo |
| Moneda de visualización | Siempre disponible para cualquier perfil (no es exclusivo de negocio) | Igual — el campo vive en `fin_profiles`, no en el tipo |

El campo `display_currency` es independiente de `tipo` a propósito: cualquier perfil, personal o de negocio, puede pedir ver sus totales en otra moneda. Lo único que el `tipo` decide es qué **pantallas** aparecen.

---

## 1. Objetivo del sprint

> **Que un perfil de negocio pueda armar un presupuesto por proyecto (no por
> mes), ver cuánto ganó en cada uno, compararlos entre sí, y leer todos sus
> totales en la moneda que use de verdad — sin que nada de esto le pese a un
> perfil personal.**

### Definición de "terminado"

- [ ] Un perfil nuevo o existente se puede marcar como `negocio` desde su
      sheet, y eso cambia el nav (aparece Proyectos, Ahorro pasa a llamarse
      Fondos de ahorro)
- [ ] Se puede crear un proyecto con nombre + monto objetivo + moneda
- [ ] El quick-add, en un perfil con proyectos activos, ofrece etiquetar el
      movimiento a uno — opcional, nunca obligatorio
- [ ] La pantalla de un proyecto muestra ganancia neta, gastado vs. objetivo,
      y la lista de sus propios movimientos (nada de otro proyecto ni de
      fuera de él)
- [ ] Hay una vista que compara todos los proyectos de un perfil, ordenada
      por ganancia neta
- [ ] Un perfil puede elegir su moneda de visualización, y todos sus totales
      agregados (patrimonio, mes, presupuesto, ahorro/fondos, deudas,
      proyectos) se muestran convertidos a esa moneda
- [ ] Borrar un proyecto sin movimientos lo borra; uno con movimientos se
      archiva
- [ ] `npm run build`, `npx tsc --noEmit` y `eslint` pasan sin errores

---

## 2. Alcance

### Entra

- `fin_profiles.tipo` + `fin_profiles.display_currency`.
- Tabla nueva `fin_budget_projects` + `fin_transactions.project_id`.
- Pantalla `/finanzas/proyectos`: lista, crear/editar/archivar, detalle de
  un proyecto (ganancia neta + progreso + sus movimientos), comparar.
- Selector de proyecto en el quick-add (opcional, solo si hay proyectos
  activos en el perfil).
- Nav condicional por `tipo` (`nav-items.tsx` deja de ser una lista fija).
- Relabeling de Ahorro → "Fondos de ahorro" cuando `tipo = negocio`.
- El sweep de moneda de visualización: toda pantalla que hoy formatea un
  total en USD pasa a formatearlo en `display_currency`.

### No entra en este sprint

| Fuera | Por qué |
|---|---|
| **Gasto compartido/reparto dentro de un proyecto** | Ganancia neta es bruta (§0). Si hace falta repartir el costo de un proyecto con un socio, es una extensión futura sobre Deudas, no de este sprint |
| **Cierre o fecha límite de un proyecto** | Rechazado en la ronda de preguntas — se archiva a mano |
| **Gráficos para comparar proyectos** | Una tabla responde la pregunta que se hizo. Un gráfico es Reportes (Feature 8, congelada) |
| **Convertir montos guardados a la nueva moneda** | `display_currency` es una capa de visualización, no reescribe ningún `amount`/`amount_usd` ya congelado |
| **Un tercer tipo de perfil** | Solo `personal`/`negocio` — no se pidió un tercero, y el `check` de la columna no lo permite sin otra migración |
| **Notificaciones de proyectos** | El Sprint 9 (Notificaciones) no sabe de `fin_budget_projects` todavía — se integra el día que se retome esa feature, no ahora |

---

## 3. Modelo de datos

Sección nueva **§20** de `supabase/schema.sql` (idempotente, re-pegable
entera, mismo criterio que §11–19).

### 3.1 `fin_profiles`: `tipo` + `display_currency`

```sql
alter table public.fin_profiles
  add column if not exists tipo text not null default 'personal'
    check (tipo in ('personal', 'negocio'));

alter table public.fin_profiles
  add column if not exists display_currency text not null default 'USD'
    check (display_currency in ('USD', 'BOB', 'USDT', 'USDC', 'BTC'));
```

Dos `alter` idempotentes, no una migración con backfill: todo perfil
existente cae en `personal`/`USD` por default, que es exactamente su
comportamiento de hoy — nadie nota el cambio hasta que lo pida.

### 3.2 `fin_budget_projects` — el presupuesto de una sola vez

```sql
create table if not exists public.fin_budget_projects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  profile_id       uuid not null references public.fin_profiles(id) on delete restrict,
  name             text not null,
  target_amount    numeric(24,8) not null check (target_amount > 0),
  target_currency  text not null check (target_currency in ('USD','BOB','USDT','USDC','BTC')),
  -- Congelado al crear, igual que cualquier otro monto de esta app (freeze()
  -- de transactions.ts) — el objetivo no se recalcula si la tasa cambia después.
  exchange_rate    numeric(24,8) not null,
  target_amount_usd numeric(14,2) not null,
  archived         boolean not null default false,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Lo que hace posible la FK compuesta de §3.3.
  unique (id, profile_id)
);

alter table public.fin_budget_projects enable row level security;

create index if not exists fin_budget_projects_profile_idx
  on public.fin_budget_projects (profile_id, archived, sort_order);

drop trigger if exists fin_budget_projects_touch_updated_at on public.fin_budget_projects;
create trigger fin_budget_projects_touch_updated_at
  before update on public.fin_budget_projects
  for each row execute function public.touch_updated_at();

drop policy if exists fin_budget_projects_select on public.fin_budget_projects;
create policy fin_budget_projects_select on public.fin_budget_projects
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_budget_projects_insert on public.fin_budget_projects;
create policy fin_budget_projects_insert on public.fin_budget_projects
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_budget_projects_update on public.fin_budget_projects;
create policy fin_budget_projects_update on public.fin_budget_projects
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_budget_projects_delete on public.fin_budget_projects;
create policy fin_budget_projects_delete on public.fin_budget_projects
  for delete to authenticated using (user_id = auth.uid());
```

Mismas 4 policies + el `check` de perfil propio en insert/update que ya usan
las 14 tablas del Sprint 8 (§3.5/§18.7 de ese sprint) — este es el patrón
establecido para cualquier tabla nueva de Finanzas, no algo que este sprint
inventa.

**Por qué no reusa `fin_budget_lines`:** esa tabla no tiene sentido sin
`fin_budget_periods` (el monto es POR MES), y un proyecto no tiene mes.
Agregarle un `kind` y dejar las columnas de período en null para un proyecto
sería una tabla con dos formas incompatibles de significar "vacío". Separada,
cada una es simple en su propio término.

### 3.3 `fin_transactions.project_id` + integridad cruzada

```sql
alter table public.fin_transactions
  add column if not exists project_id uuid references public.fin_budget_projects(id) on delete restrict;

create index if not exists fin_transactions_project_idx
  on public.fin_transactions (project_id) where project_id is not null;

-- Un movimiento no puede etiquetarse a un proyecto de otro perfil — mismo
-- criterio que accounts/categories/people del Sprint 8 (§3.4/§18.6 de ese
-- sprint): una ganancia neta es un NÚMERO, no solo una lista.
do $$ begin
  alter table public.fin_transactions add constraint fin_tx_project_same_profile
    foreign key (project_id, profile_id) references public.fin_budget_projects (id, profile_id);
exception when duplicate_object then null; end $$;
```

`project_id` es nullable (la inmensa mayoría de los movimientos no pertenece
a ningún proyecto) — una FK compuesta sobre una columna nullable no exige
nada cuando es `null`, así que convive sin tocar `fin_tx_shape`.

`on delete restrict`, no `set null`: mismo criterio que cuentas — si el
proyecto tiene movimientos, el borrado se rechaza y la app cae a archivar
(§4.7). Un `set null` los dejaría "sueltos" en silencio, perdiendo la
atribución sin que nadie lo decidiera.

### 3.4 RLS

Ninguna policy existente de `fin_transactions` cambia — `project_id` es una
columna más del mismo `insert`/`update` que ya valida `user_id = auth.uid()`
y el `profile_id` propio (§18.7 del Sprint 8). No hace falta una policy
nueva, la FK compuesta de §3.3 ya cierra el cruce entre perfiles a nivel de
dato, y RLS sigue siendo la barrera de USUARIO, no de perfil (mismo
principio del Sprint 8: un bug de filtrado mezcla tus propios perfiles,
nunca te deja ver los de otro usuario).

### 3.5 La migración, en orden

1. Los dos `alter table fin_profiles` (§3.1) — no dependen de nada más.
2. `fin_budget_projects` completa, con sus policies (§3.2).
3. `fin_transactions.project_id` + su índice (§3.3, primera mitad).
4. La FK compuesta (§3.3, segunda mitad) — recién acá, porque necesita que
   `fin_budget_projects` ya exista.

Sin backfill: no hay proyectos viejos que migrar, la tabla nace vacía.

---

## 4. Reglas de negocio

### 4.1 `tipo` es un campo, no una feature aparte

Un perfil `negocio` no es un tipo de dato distinto de `fin_profiles` — es la
misma fila, con un campo que la UI lee para decidir qué mostrar (§0.1). Se
cambia desde el mismo `<ProfileSheet>` que ya edita nombre y acento
(sprint-8-perfiles.md), con un selector más. Cambiarlo de `negocio` a
`personal` y volver no pierde nada — los proyectos y las metas de ahorro que
ya existan siguen ahí, solo se dejan de ver en el nav si el tipo vuelve a
`personal`.

### 4.2 Presupuesto por proyecto vs. mensual

Los dos conviven en el mismo perfil de negocio (confirmado en la ronda de
preguntas). Un costo recurrente (alquiler, sueldos) sigue siendo un
presupuesto mensual de `fin_budget_lines` — nada de esto lo toca. Un trabajo
puntual (un cliente, un evento) es un `fin_budget_project`.

No hay conversión entre los dos: un presupuesto mensual no se puede "pasar" a
proyecto ni viceversa. Son modelos distintos porque responden preguntas
distintas — "¿cuánto gasto en esto TODOS los meses?" contra "¿cuánto me dejó
ESTE trabajo puntual?".

### 4.3 Ganancia neta de un proyecto

```
ganancia_usd = Σ(amount_usd de type='ingreso' con este project_id)
             − Σ(amount_usd de type='gasto' con este project_id)
```

Bruta: no resta `principal_usd` como hace el "gasto real" de Deudas (§0). Un
ingreso o gasto de una transferencia (`type='transferencia'`) NUNCA cuenta —
mover plata entre dos cuentas del mismo proyecto no es ganar ni perder, es la
misma plata cambiando de lugar (mismo criterio que ya usa `monthTotals` para
el mes).

El **progreso contra el objetivo** es aparte de la ganancia:
`gastado_usd / target_amount_usd` — solo cuenta los `gasto`, no los
`ingreso`, porque el objetivo de un proyecto suele ser "cuánto pensaba
gastar", no "cuánto pensaba ganar" (un proyecto con ingresos altos y gasto
bajo no debería verse "sobrepasado" solo por facturar bien).

### 4.4 Comparar proyectos

Una tabla con todos los proyectos del perfil (activos primero, archivados al
final o detrás de un toggle — mismo patrón que `<PersonasPanel>` /
`<ProfilesPanel>`), columnas: nombre, ganancia neta, gastado / objetivo,
estado. Ordenada por ganancia neta descendente por default.

Es una vista, no una tabla nueva en la base — se deriva de
`fin_budget_projects` + `fin_transactions` filtradas por `project_id`, igual
que el resto de las vistas de este dominio (`budgetView`, `savingsView`).

### 4.5 Fondos de ahorro

Cuando `activeProfile.tipo === 'negocio'`:

- El nav dice "Fondos de ahorro" en vez de "Ahorro".
- El título de la pantalla y el copy de "por qué retirás" cambian de tono
  (reinversión, no imprevistos) — el enum `SavingsReason` (`emergencia` /
  `meta_cumplida` / `cambio_planes` / `otro`) **no cambia**: son las mismas
  cuatro razones, solo el label que las acompaña se adapta si hace falta.
- `fin_savings_goals`, `proposeAllocation`, todo el mecanismo del Sprint 6
  sigue exactamente igual — cero cambios de esquema o de lógica, es
  relabeling de UI condicionado por `tipo`.

### 4.6 Moneda de visualización

**Qué convierte:** todo total ya expresado en USD que hoy se manda directo a
`formatMoney(x, 'USD')` en una pantalla — patrimonio, gasto/ingreso del mes,
disponible de presupuesto, saldo de fondos de ahorro, deuda pendiente,
ganancia neta de un proyecto. **Qué NO convierte:** el monto nativo de una
cuenta o movimiento (`formatMoney(a.balance, a.currency)`) — eso sigue en su
propia moneda, es un hecho de esa fila, no un total agregado.

**Con qué tasa:** la de **hoy** (`rates`, ya en el contexto), no una
congelada. Es una conversión de visualización, no un movimiento — el mismo
total en USD puede mostrarse distinto de un día a otro si la tasa se mueve,
y es el comportamiento esperado, no un bug.

**El mecanismo — una función nueva en `rates.ts`, espejo de `toUsd`:**

```ts
export function fromUsd(usdAmount: number, currency: Currency, rates: RatesMap): number {
  return usdAmount / usdPerUnit(currency, rates)
}
```

Cada pantalla ya define su propio `show = text => maskAmount(text, hidden)`
local (patrón establecido desde el Sprint 1) — se le suma un `fmtUsd`
igual de local:

```ts
const fmtUsd = (usd: number, opts?: { signed?: boolean }) =>
  show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency, opts))
```

Y cada `show(formatMoney(xUsd, 'USD'))` pasa a ser `fmtUsd(xUsd)` — mismo
patrón de composición que ya existe, una función más en la cadena, no una
reescritura. `displayCurrency` sale de `activeProfile.display_currency` vía
`useFinanzas()` (ya expone `activeProfile`, no hace falta un campo nuevo en
el contexto aparte de leer esa columna).

**El "≈" secundario** (donde una cuenta no-USD muestra su equivalente) pasa
de `≈ USD` fijo a `≈ {displayCurrency}` — mismo cálculo, otra moneda de
destino.

**Alcance del sweep** (dónde se toca, sin tabla exhaustiva línea por línea —
eso se resuelve al escribir el código, no acá): Home (`page.tsx`),
Presupuesto, Ahorro/Fondos, Deudas, Proyectos (nuevo), y los mensajes de
`quick-add.tsx` que hoy muestran un monto en USD (el bloqueo de presupuesto,
el "disponible" cuando la cuenta ya está en esa moneda no aplica — ese es
nativo).

### 4.7 Borrado y archivado de un proyecto

| Caso | Qué pasa |
|---|---|
| Proyecto sin movimientos etiquetados | Se borra |
| Proyecto con movimientos etiquetados | El `on delete restrict` lo rechaza → se archiva (mismo patrón que `deleteOrArchiveProfile`/`deleteOrArchiveAccount`: intentar el `delete` directo, capturar el error de FK, archivar en su lugar) |
| Proyecto archivado | Sale de la lista activa y del selector del quick-add; sigue en "Comparar" (detrás de un toggle, igual que perfiles archivados); se puede reactivar |

No hay un caso "proyecto indeleble" — a diferencia del perfil default, todo
proyecto se puede borrar o archivar por igual.

---

## 5. Estructura de archivos

### Nuevos

```
app/finanzas/proyectos/
├── page.tsx                — lista de proyectos + comparar (toggle de vista)
└── (detalle inline en la misma lista, no una ruta [id] — mismo criterio
     que Ahorro: un panel que se expande, sin navegación aparte)

app/finanzas/components/
└── project-sheet.tsx       — crear/editar (nombre + objetivo + moneda) + borrar/archivar

lib/finanzas/
└── projects.ts             — puro: ganancia neta, progreso, orden para comparar
```

### Modificados

| Archivo | Cambio |
|---|---|
| `supabase/schema.sql` | Sección **§20** nueva |
| `lib/finanzas/types.ts` | `tipo`/`display_currency` en `FinProfile`; `BudgetProject` (nuevo tipo, mismo criterio que `SavingsGoal`); `project_id` en `Transaction` |
| `lib/finanzas/rates.ts` | `fromUsd(usdAmount, currency, rates)` |
| `app/finanzas/components/data-context.tsx` | `budgetProjects: BudgetProject[]` en el estado + `load()`; `createProject`/`updateProject`/`deleteOrArchiveProject`; `project_id` en el payload de `createTransaction`/`updateTransaction` |
| `app/finanzas/components/nav-items.tsx` | `NAV_ITEMS` deja de ser una constante — pasa a una función `navItemsFor(tipo)` que agrega "Proyectos" y renombra "Ahorro" cuando `tipo === 'negocio'` |
| `app/finanzas/components/profile-sheet.tsx` | Selector de `tipo` + selector de `display_currency` |
| `app/finanzas/components/quick-add.tsx` | Selector de proyecto (opcional, solo si hay proyectos activos en el perfil) |
| `app/finanzas/page.tsx`, `presupuesto/page.tsx`, `ahorro/page.tsx`, `deudas/page.tsx` | El sweep de `fmtUsd` (§4.6); Ahorro lee el label "Fondos de ahorro" cuando aplica |

### 5.1 Regla de independencia

Sin cambios respecto de sprint-1 §5.1. `lib/finanzas/projects.ts` y
`rates.ts` siguen sin imports de `next/*` ni del alias `@/`.

---

## 6. Cómo se leen y escriben los datos

Mismo patrón que todos los sprints anteriores — sin rutas API, todo
`supabase.from('fin_...')` directo desde `data-context.tsx`.

- **Arrancar** (`load()`): suma una consulta más al `Promise.all` —
  `fin_budget_projects` filtrada por `.eq('profile_id', activeProfileId)`,
  igual que las otras 14 tablas del dominio. `tipo`/`display_currency` ya
  vienen en la fila de `fin_profiles` que `load()` ya trae completa — nada
  nuevo que consultar ahí.
- **Etiquetar un movimiento a un proyecto**: `createTransaction`/
  `updateTransaction` suman `project_id: input.project_id ?? null` al
  objeto que ya arman — mismo criterio que cualquier otro campo opcional.
- **Crear un proyecto** (`createProject`): `insert` en `fin_budget_projects`
  con el monto congelado (`freeze()` de `transactions.ts`, reusado tal cual).
- **Borrar/archivar** (`deleteOrArchiveProject`): intenta el `delete`
  directo; si la base lo rechaza (`on delete restrict`, capturado por
  `isPgError`), hace `update({ archived: true })` — mismo patrón textual que
  `deleteOrArchiveAccount`/`deleteOrArchiveProfile`.
- **Cambiar `tipo`/`display_currency`**: pasan por `updateProfile`, que ya
  existe desde el Sprint 8 — solo se amplía qué campos acepta.

---

## 7. Antes de escribir la primera línea de código

Sin decisiones de diseño pendientes — §0 las cerró todas en dos rondas de
preguntas. Lo único: **correr la sección 20 de `supabase/schema.sql`** en el
SQL Editor (junto con las §15–19 pendientes, si todavía no corrieron — ver
"Pendiente para el usuario" en los sprints 7/8/9).

---

## 8. Qué desbloquea

| Feature | Cómo se apoya |
|---|---|
| **Reportes** (Feature 8, congelada) | Un proyecto ya es, de hecho, un mini-reporte — si Reportes vuelve, "por proyecto" es una dimensión gratis además de "por categoría" |
| **Notificaciones** (Sprint 9) | El día que se integre, "proyecto cerca de su objetivo" es un sexto tipo de aviso, con el mismo mecanismo de dedupe que ya existe |
| **Cualquier perfil de negocio futuro** | `tipo`/`display_currency` quedan como columnas reusables — el próximo negocio que se cree no necesita ningún cambio de esquema |

⚠️ **La moneda de visualización no es retroactiva sobre nada guardado.**
Cambiarla no reescribe ni un `amount_usd` — si se vuelve a `USD` después de
haber estado en `BOB`, todo se ve exactamente como antes, porque nada se tocó
nunca. Es, a propósito, la parte más simple de todo este sprint.

---

## 9. Changelog de desarrollo

Construido de punta a punta en una sola sesión, siguiendo §0-§8 tal cual
quedaron escritos — sin divergencias de diseño, solo el alcance real del
sweep de §4.6 resultó más grande de lo que el propio documento estimaba.

- **El sweep de moneda de visualización tocó 13 archivos, no los 5 que
  enumeraba §4.6/§5.** Ese párrafo listaba "Home, Presupuesto, Ahorro/Fondos,
  Deudas, Proyectos, y quick-add" a propósito sin ser exhaustivo ("eso se
  resuelve al escribir el código, no acá") — al escribirlo, un grep de
  `formatMoney(…, 'USD')` en toda la mini-app encontró 30+ sitios reales en
  13 archivos: los 5 previstos, más `mas/page.tsx`, `fijos/page.tsx`,
  `cuentas/page.tsx`, `movimientos/page.tsx`,
  `components/budget-closure-sheet.tsx`,
  `components/savings-detail-sheet.tsx`, `components/settle-sheet.tsx`,
  `components/plan-detail-sheet.tsx` y, el más importante de todos,
  **`components/tx-row.tsx`** — la fila de movimiento que se usa en Home Y en
  Movimientos, así que sin este archivo la mitad de la app hubiera seguido
  mostrando dólares sin importar la moneda elegida. Se barrieron los 13.
- **Cada `!== 'USD'` que decidía si mostrar un "≈" secundario pasó a
  `!== displayCurrency`** (Home, Presupuesto, Cuentas, `<TxRow>`,
  `<SavingsDetailSheet>`) — no solo los montos, también la CONDICIÓN de
  cuándo aclarar el equivalente. Un perfil en BOB con una cuenta en BOB no
  necesita ver "≈ Bs X" al lado de un monto que ya está en Bs.
- `<TxRow>` en particular mostraba el monto GRANDE siempre en USD (no en la
  moneda nativa del movimiento) y el nativo como referencia chica — invertir
  solo la conversión ahí (sin tocar la estructura "grande + chico") fue la
  pieza más delicada de todo el sweep, porque es el único lugar donde el
  monto que más se lee ya nace de un cálculo en USD, no de un passthrough.
- El resto del sprint —`tipo`/`display_currency` en `fin_profiles`,
  `fin_budget_projects`, `project_id` en `fin_transactions`, la FK
  compuesta, `lib/finanzas/projects.ts`, `<ProjectSheet>`,
  `/finanzas/proyectos`, el selector de proyecto en el quick-add,
  `navItemsFor(tipo)`, y el relabeling de Ahorro— se construyó tal cual lo
  describen §3-§6, sin sorpresas.

Verificado antes de dar el sprint por terminado: `npx tsc --noEmit`, `npm run
build` y `npx eslint app/finanzas lib/finanzas` sin errores; el servidor de
desarrollo sirve las 10 rutas de Finanzas (incluida `/finanzas/proyectos`,
nueva) sin 500. **No se pudo probar el flujo completo en el navegador**
(crear un perfil de negocio, etiquetar un movimiento a un proyecto, cambiar
la moneda de visualización y ver los totales convertirse) — este entorno no
tiene un navegador disponible para el login de Supabase. Falta ese smoke
test manual, y falta correr la **§20 de `schema.sql`** en el SQL Editor
(junto con las §15-19 pendientes, si todavía no corrieron) antes de que
cualquiera de esto funcione de verdad.
