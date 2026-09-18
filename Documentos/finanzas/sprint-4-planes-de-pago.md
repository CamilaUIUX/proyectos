# Finanzas — Sprint 4: "Planes de pago"

> Mapa completo de features y roadmap: `features.md` en esta misma carpeta.
> Este documento especifica **únicamente el Sprint 4**, con alcance
> completo (no solo el núcleo mínimo) — mismo criterio que Deudas (Sprint 2)
> y Fijos (Sprint 3).
>
> Última actualización: 2026-09-07 · Estado: **construido y revisado**.

---

## 0. Decisiones tomadas para este sprint

| Tema | Decisión | Por qué |
|---|---|---|
| **Un plan siempre parte de una deuda ya registrada** | Nunca se crea "de la nada" — se elige una deuda suelta existente y se la reestructura en cuotas. Al crear el plan, esa deuda se borra: su capital se transforma en las cuotas, no coexiste con ellas | Es exactamente el error que el repo de referencia cometió y corrigió — dejar crear un plan sin deuda detrás duplicaba la plata en "Te deben $X" (una vez como deuda suelta, otra como cuotas) |
| **Solo se planifican deudas sueltas** (`origin_transaction_id` nulo) | Una deuda que nació de un gasto compartido no se puede convertir en plan de cuotas | Evita mezclar dos mecanismos (reparto de gasto + cuotas) sin un caso real que lo pida — se agrega después si hace falta, es aditivo |
| **Interés simple, opcional, una sola vez** | Se calcula sobre el capital (o sobre el saldo restante, si se regenera) al momento de crear/regenerar — nunca compuesto, nunca por período | Es la forma más simple que cubre el caso real (un préstamo entre conocidos, no un crédito bancario) |
| **Un solo flujo para "cuotas iguales" y "cuotas manuales"** | No hay un interruptor de modo — siempre se sugiere un reparto parejo con fechas mensuales (mismo criterio de "sugerido, editable" que ya usan las transferencias y los repartos), y cada cuota se puede editar (monto y fecha) antes de confirmar. Editar todas a mano logra lo mismo que un "modo manual" separado, sin la complejidad de dos caminos de UI distintos | Simplifica sin perder alcance: el resultado final (cuotas parejas, o cualquier combinación de montos/fechas) es el mismo que ofrecían los dos modos del repo de referencia |
| **Nada de "cantidad total de cuotas" guardado en el plan** | `fin_debt_plans` guarda solo lo que nunca cambia (persona, concepto, capital, moneda). Cuántas cuotas tiene, cuántas están cobradas, cuál es la próxima — todo se deriva de las filas de `fin_debts` que apuntan a ese plan, nunca de un contador aparte | Mismo principio que ya rige saldo de cuenta y apartado de ahorro: lo derivado no se guarda. Evita que un contador quede desincronizado después de regenerar |
| **Cada cuota es una deuda normal** | Se cobra, condona, edita o borra con las pantallas de Deudas que **ya existen** — `settleDebts`/`waiveDebt`/`deleteDebt` del Sprint 2 no cambian en nada | Cero código nuevo para esa parte — es la razón por la que este sprint es más chico de lo que parece |
| **Regenerar solo toca las cuotas pendientes** | Las ya cobradas o condonadas quedan intactas, para siempre. Se recalcula el saldo restante (suma de lo pendiente actual) y se reparte de nuevo bajo las condiciones nuevas | Renegociar condiciones a mitad de camino no puede alterar lo que ya pasó |
| **Borrar un plan sin cuotas tocadas borra todo; con alguna resuelta, se bloquea** | Mismo criterio que ya usa borrar una cuenta o una persona con historial | Consistencia con el resto de la app |
| **Vive dentro de la pantalla Deudas, no una pantalla aparte** | Una sección "Planes" al lado de la lista de pendientes por persona | Un plan es, en esencia, una vista distinta de las mismas deudas — no justifica una ruta nueva |

---

## 1. Objetivo del sprint

> **Elegir en cuántas cuotas cobro una deuda, con o sin interés, y no
> perder el hilo de cuál falta.**

Al terminar, la app responde:

1. ¿Cuánto me falta cobrar de este trato, en total?
2. ¿Cuál es la próxima cuota y cuándo vence?
3. ¿Qué pasa si renegociamos las condiciones a mitad de camino?

### Definición de "terminado"

- [ ] Puedo elegir una deuda suelta existente y convertirla en un plan de
      N cuotas
- [ ] Puedo agregar un interés simple opcional, o dejarlo vacío y cobrar
      solo el capital
- [ ] Las cuotas se sugieren parejas con fechas mensuales, y puedo editar
      cualquiera (monto o fecha) antes de confirmar
- [ ] Al crear el plan, la deuda suelta original desaparece — solo existen
      las cuotas
- [ ] Cada cuota la cobro, condono o edito exactamente igual que cualquier
      otra deuda, sin ir a ninguna pantalla nueva
- [ ] Veo el progreso del plan (cuántas cuotas cobradas de cuántas) y cuál
      es la próxima
- [ ] Puedo regenerar el plan si cambian las condiciones, sin perder lo ya
      cobrado o condonado
- [ ] Borrar un plan sin cuotas tocadas borra todo; con alguna cobrada, se
      bloquea con un mensaje claro
- [ ] `npm run build` y `npm run lint` pasan sin errores

---

## 2. Alcance

Entra todo — decisión explícita del usuario:

| Pieza | Alcance exacto |
|---|---|
| **Crear un plan** | A partir de una deuda suelta existente (`origin_transaction_id` nulo). Hereda persona, concepto, capital y moneda de esa deuda |
| **Interés simple opcional** | Un porcentaje sobre el capital (o el restante, si se regenera), aplicado una sola vez |
| **Generación de cuotas** | Sugeridas parejas con fechas mensuales (día topeado como en Fijos), cada una editable antes de confirmar |
| **Ver el plan** | Progreso derivado (cobradas/condonadas/pendientes de un total), próxima cuota |
| **Cobrar / condonar una cuota** | Reutiliza `settleDebts`/`waiveDebt` de Sprint 2 sin cambios |
| **Regenerar** | Recalcula solo las cuotas pendientes bajo condiciones nuevas |
| **Borrar el plan** | Solo si ninguna cuota fue tocada |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| Interés compuesto o por período | Sin un caso real que lo pida — un préstamo entre conocidos rara vez lo tiene |
| Planificar una deuda de gasto compartido | Ver §0 — solo deudas sueltas por ahora |
| Notificación de cuota por vencer | Depende de la Feature "Notificaciones" del roadmap, que todavía no existe |
| Planes sobre plata que vos debés (en vez de que te deban) | Deudas (Sprint 2) ya está scoped en una sola dirección — un plan hereda esa misma dirección |

---

## 3. Modelo de datos

Se agrega a `supabase/schema.sql` como **sección 14**.

### 3.1 `fin_debt_plans`

```sql
create table public.fin_debt_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  person_id   uuid not null references public.fin_people(id) on delete restrict,
  concept     text not null,
  principal   numeric(24,8) not null check (principal > 0),
  currency    text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on public.fin_debt_plans (user_id, person_id);

drop trigger if exists fin_debt_plans_touch_updated_at on public.fin_debt_plans;
create trigger fin_debt_plans_touch_updated_at
  before update on public.fin_debt_plans
  for each row execute function public.touch_updated_at();
```

Deliberadamente **no** guarda interés, cantidad de cuotas ni fecha de
arranque — eso es un parámetro de cada generación (§4.1), no un dato del
plan en sí (§0). `person_id` en `restrict`, igual que en `fin_debts` y
`fin_recurring_splits`.

### 3.2 Cambios sobre `fin_debts`

```sql
alter table public.fin_debts
  add column if not exists plan_id uuid references public.fin_debt_plans(id) on delete cascade,
  add column if not exists installment_number integer check (installment_number is null or installment_number > 0);

-- Con plan, siempre hay número de cuota; sin plan, nunca lo hay.
alter table public.fin_debts
  add constraint fin_debt_installment_shape check (
    (plan_id is null and installment_number is null)
    or (plan_id is not null and installment_number is not null)
  );
```

`plan_id` en `cascade` — a propósito, a diferencia de todo lo demás en esta
mini-app: borrar un plan (solo permitido sin cuotas tocadas, §4.4) tiene
que llevarse sus cuotas con él, porque son la razón de ser del plan y no
tienen sentido sueltas.

`installment_number` es un correlativo **por plan que nunca se reutiliza**,
ni siquiera después de regenerar (§4.5) — así una cuota vieja cobrada
("Cuota 2") y una nueva pendiente (ej. "Cuota 5") conviven sin ambigüedad
en la misma lista.

### 3.3 RLS

```sql
alter table public.fin_debt_plans enable row level security;
-- Las 4 policies, `user_id = auth.uid()`, igual que fin_debts.
```

---

## 4. Reglas de negocio

### 4.1 Generar cuotas (crear o regenerar)

Función pura, sin efectos: dado un total a repartir, una cantidad de
cuotas y una fecha de arranque, devuelve una lista de `{ amount, date }`
sugerida — parejo, con fechas mensuales, día topeado igual que un fijo
mensual (`dueDayOf`/`daysInMonth` de `lib/finanzas/recurring.ts`, ya
construidos en el Sprint 3 y directamente reutilizables acá).

```
generar(total, cantidad, fechaInicio, moneda):
  montos = splitEven(total, cantidad, moneda)          // ya existe, Sprint 2
  día = day-of-month de fechaInicio
  para i en 0..cantidad-1:
    mes = mes de fechaInicio + i
    fecha_i = dueDayOf({ day_of_month: día }, año de ese mes, mes)
    devolver { amount: montos[i], date: fecha_i }
```

Cada `{amount, date}` sugerido se muestra editable antes de confirmar
(§0) — no hay validación de que la suma coincida con el total después de
editar, mismo criterio que ya se usa en los repartos de gasto compartido.

### 4.2 Interés simple

```
total_a_repartir = capital_o_restante × (1 + interés% / 100)     si hay interés
total_a_repartir = capital_o_restante                              si no hay interés
```

Se aplica **una vez**, antes de repartir en cuotas — nunca por período, y
nunca sobre el interés ya aplicado antes (no compuesto).

### 4.3 Crear el plan

1. Validar que la deuda elegida sea suelta (`origin_transaction_id` nulo)
   y esté `pendiente`.
2. Calcular `total_a_repartir` (§4.2) sobre `deuda.amount`.
3. Generar las cuotas (§4.1), congelando `exchange_rate`/`amount_usd` de
   cada una igual que cualquier deuda (`freeze()`).
4. Insertar el plan (`fin_debt_plans`, heredando persona/concepto/capital/
   moneda de la deuda) y las cuotas (`fin_debts` con `plan_id` y
   `installment_number` 1..N), en ese orden.
5. **Recién si el paso 4 salió bien**, borrar la deuda suelta original.
   Si insertar las cuotas falla, la deuda original **no se toca** — se
   avisa el error y no se pierde nada; si lo que falla es borrar la deuda
   original después de que las cuotas ya se crearon, se avisa
   explícitamente para que se borre a mano (mismo criterio de fallo
   parcial ya aceptado en `createSharedExpense`, Sprint 2 §6).

### 4.4 Borrado del plan

```
sin ninguna cuota con status <> 'pendiente' → se borra el plan (cascade se lleva las cuotas)
con alguna cuota cobrada o condonada        → bloqueado, mensaje explícito
```

Chequeo del lado de la app antes de intentar el `delete` (mismo patrón que
ya usan cuentas y personas) — no depende de que la base lo rechace.

### 4.5 Regenerar

1. `restante` = suma de `amount` (en la moneda del plan) de las cuotas
   **actualmente pendientes** de ese plan. Las cobradas/condonadas no se
   tocan y no entran en esta suma.
2. Borrar (delete, no archivar — son cuotas que nunca se cobraron) esas
   cuotas pendientes.
3. Calcular el nuevo `total_a_repartir` (§4.2) sobre `restante`, con el
   interés y la fecha de arranque que se elijan en ese momento — pueden
   ser distintos a los de la generación anterior.
4. Generar las cuotas nuevas (§4.1) con `installment_number` continuando
   desde `max(installment_number)` ya usado en ese plan + 1 (nunca se
   reutiliza un número).

### 4.6 Progreso — todo derivado, nada guardado

```
total_cuotas(plan)     = count(fin_debts con ese plan_id)
cobradas(plan)         = count(... y status = 'cobrada')
condonadas(plan)       = count(... y status = 'condonada')
pendiente_usd(plan)    = sum(amount_usd donde status = 'pendiente')
próxima_cuota(plan)    = la pendiente con incurred_on más próxima
```

---

## 5. Estructura de archivos

```
lib/finanzas/plans.ts
├── generateInstallments(total, count, startDate, currency)  — §4.1
├── applyInterest(base, interestRate)                          — §4.2
├── planProgress(planId, debts)                                — §4.6
├── pendingPrincipal(planId, debts)                             — §4.5
└── nextInstallmentNumber(planId, debts)                        — §4.5

app/finanzas/components/
├── plan-sheet.tsx       — crear un plan a partir de una deuda elegida
│                          (reutiliza generateInstallments + filas editables,
│                          mismo patrón visual que <SplitEditor>)
└── plan-detail-sheet.tsx — ver progreso, próxima cuota, lista de cuotas
                            (cada una abre el mismo <SettleSheet>/condonar
                            que ya existen), botones Regenerar y Borrar

app/finanzas/deudas/page.tsx  — gana una sección "Planes" (§0), sin ruta nueva
```

`data-context.tsx` crece con: `plans: DebtPlan[]` en el estado (una
consulta más al `Promise.all` de `load()`); `createDebtPlan`,
`deleteDebtPlan`, `regenerateDebtPlan` como mutaciones. No hace falta un
estado aparte para las cuotas — ya viven en `debts` (Sprint 2), filtradas
por `plan_id` donde haga falta.

---

## 6. Cómo se leen y escriben los datos

Mismo patrón que los sprints anteriores — sin rutas API:

- **Crear plan**: `insert` en `fin_debt_plans` (`.select('id').single()`
  para el id) → `insert` de las cuotas en `fin_debts` con ese `plan_id` →
  recién entonces `delete` de la deuda suelta original.
- **Cobrar/condonar una cuota**: sin cambios — es `settleDebts`/`waiveDebt`
  tal cual, la cuota es una fila de `fin_debts` como cualquier otra.
- **Regenerar**: `delete` de las cuotas pendientes actuales de ese
  `plan_id` → `insert` de las nuevas con los `installment_number`
  siguientes.
- **Borrar plan**: chequeo local de `debts.some(d => d.plan_id === id &&
  d.status !== 'pendiente')` antes de intentar el `delete` — si pasa el
  chequeo, `delete` en `fin_debt_plans` (el `cascade` se lleva las cuotas
  sin un segundo viaje a la base).

---

## 7. Antes de escribir la primera línea de código

Sin decisiones de diseño pendientes. Si ya tenés una deuda real para
planificar en cuotas, tené a mano: en cuántas cuotas, si hay interés
acordado, y desde qué fecha arranca la primera.

---

## 8. Qué desbloquea

- **Notificaciones** (roadmap, sin especificar): "cuota por vencer" es
  filtrar `debts` por `plan_id` y `status === 'pendiente'` y quedarse con
  la de `incurred_on` más próxima — la misma lista que ya arma
  `<PlanDetailSheet>`, sin duplicarla. No se escribió como función aparte
  en `lib/finanzas/plans.ts` (ver §9) porque hoy no tiene un segundo
  llamador — se agrega el día que Notificaciones exista de verdad.
- Cualquier deuda suelta que hoy se cargue en Sprint 2 (incluida la
  primera deuda real que se cargue) ya queda lista para plan de pago el
  día que haga falta — no requiere ningún cambio de modelo retroactivo.

---

## 9. Cómo quedó construido, y qué se simplificó (2026-09-07)

Todo el código vive en `app/finanzas/deudas/page.tsx` (sección "Planes" +
acción "Planificar en cuotas"), en `plan-sheet.tsx`/`plan-detail-sheet.tsx`
de `app/finanzas/components/`, en `lib/finanzas/plans.ts`, y en la sección
14 de `supabase/schema.sql`.

**Fiel a la especificación:** las siete decisiones de §0 —un plan siempre
parte de una deuda existente y la reemplaza, solo deudas sueltas, interés
simple una sola vez, un solo flujo (sugerido, siempre editable) en vez de
"parejo" vs "manual", `fin_debt_plans` sin guardar nada derivado, cada
cuota es una `Debt` normal que se cobra/condona con lo que ya existía
desde Sprint 2, y borrar bloqueado si alguna cuota fue tocada— quedaron
exactamente como se definieron.

**Un ajuste sobre el orden de §4.5, encontrado al escribir el código (no
cambia nada de lo decidido en §0):** `regenerateDebtPlan` inserta las
cuotas nuevas **antes** de borrar las pendientes viejas, al revés del
orden que sugería el borrador ("Borrar... Generar las cuotas nuevas"). Si
el insert fallara a mitad de camino con el orden viejo, el plan se hubiera
quedado momentáneamente sin ninguna cuota pendiente; con el orden nuevo,
en el peor caso (el insert sale bien pero el delete de las viejas falla)
quedan cuotas duplicadas hasta borrarlas a mano — mismo criterio de "no
perder datos, avisar para corregir" que ya usan `createSharedExpense` y
`settleDebts` desde Sprint 2.

**Simplificado a propósito, por alcance:**

| Se simplificó | En vez de | Por qué |
|---|---|---|
| Sin un guard proactivo en el quick-add que deshabilite el monto/tipo/cuenta al editar un movimiento que ya saldó o generó una deuda | Grisar esos campos en el formulario apenas se detecta el caso | El guard real vive en `data-context.tsx` (§10, bug #3) y ya bloquea el guardado con un mensaje claro — deshabilitar además la UI es una mejora de pulido, no hace falta para que el dato quede correcto |
| `nextInstallment()` no se escribió (ver §8) | Una función dedicada en `lib/finanzas/plans.ts`, como sugería el borrador de §5 | Sin un segundo llamador hoy (Notificaciones no existe todavía), era código sin uso — se encontró muerto en la propia revisión de este sprint (§10) y se sacó en vez de dejarlo |

**Verificado:** `npm run build` (las 10 rutas de Finanzas quedan estáticas,
incluida `/finanzas/deudas` con las nuevas cuotas) y `npm run lint` sin
errores nuevos; smoke test del dev server contra las 6 páginas de
Finanzas, sin errores en consola. No se pudo probar contra datos reales en
este entorno — falta correr la sección 14 completa de `supabase/schema.sql`
en el proyecto de Supabase real antes de usar "Planificar en cuotas".

---

## 10. Revisión de código — 6 bugs reales corregidos en dos pasadas

Mismo proceso que los sprints 1, 2 y 3: `/code-review high`. Sin
repositorio git en este proyecto, ninguna de las dos pasadas pudo
acotarse a "el diff de este sprint" — cada una barrió el código de
Finanzas entero, así que aparecieron bugs pre-existentes de sprints
anteriores además de los de Planes de pago. Se corrigieron todos los
reales y de impacto real en el manejo de plata, sin importar en qué
sprint nacieron.

### Primera pasada (2026-09-07) — 7 buscadores en paralelo, 3 bugs

1. **`availableFrom()` (Sprint 1, `lib/finanzas/transactions.ts`) no
   revertía el efecto de un ingreso al editarlo a otro tipo** — el tope de
   saldo del quick-add solo sabía revertir un gasto/transferencia
   (`balance + monto`), pero para un ingreso devolvía `balance` sin tocar.
   Mientras el tipo se mantuviera en "ingreso" no pasaba nada raro, pero
   al editar ESE mismo movimiento a "gasto" o "transferencia" el tope no
   restaba lo que el ingreso ya había sumado — dejaba pasar un guardado
   que de verdad dejaba la cuenta en negativo, sin ningún aviso. Corregido
   revirtiendo siempre según el tipo **original** del movimiento, con
   `consumesBalance()` (ya existía) en vez de un `if` hardcodeado a
   `'ingreso'`.
2. **`settleDebts` comparaba el monto cobrado contra un piso de tolerancia
   de "0.01" en la moneda de la CUENTA, no en valor real** — para una
   cuenta en USD o BOB, 0.01 es de verdad un centavo; para una cuenta en
   BTC, 0.01 BTC son cientos de dólares, así que un cobro groseramente
   distinto del esperado (ej. once veces de más) pasaba la validación sin
   ningún error. El mismo bloque además armaba el mensaje de error con
   `.toFixed(2)` fijo, que para BTC redondea el monto esperado a "0.00" —
   mismo bug de raíz (asumir 2 decimales en vez de los que le tocan a la
   moneda, `decimalsFor()`) en dos lugares del mismo código. Corregido
   comparando y poniendo el piso en equivalente USD (`toUsd()`, ya
   existía) en vez de en unidades nativas de la cuenta, y formateando el
   mensaje con `decimalsFor(account.currency)`.
3. **`updateTransaction` no protegía un movimiento que ya saldó una deuda,
   o que generó las deudas de un gasto compartido** — a diferencia de
   `deleteTransaction`, que desde el Sprint 2 sabe devolver a pendiente la
   deuda que un movimiento saldó antes de borrarlo, editar ese mismo
   movimiento (cambiarle el monto, el tipo o la cuenta desde el
   quick-add) no tenía ningún guard: el saldo de la cuenta terminaba
   reflejando un número mientras la deuda "cobrada" (o el gasto compartido
   de origen) quedaba creyendo otro, sin ningún aviso ni forma de
   notarlo desde la UI. Corregido bloqueando esos tres campos con un
   mensaje explícito cuando el movimiento tiene una deuda que lo referencia
   como cobro o como origen — no se intentó resincronizar la deuda
   automáticamente, mismo criterio de "bloquear en vez de adivinar" que ya
   usa borrar una cuenta o una persona con historial.

**Investigado y descartado (para que no se vuelva a marcar sin este
contexto):** uno de los buscadores señaló que `parseDecimalInput()`
(`lib/finanzas/money.ts`) trata una coma sola como separador de miles
cuando tiene más de 2 dígitos detrás, pero un punto solo NUNCA — asimetría
real, y a primera vista "1.500" tipeado a mano debería dar 1500, no 1.5.
Se probó el cambio simétrico a mano con Node antes de aplicarlo: rompe
cualquier monto en BTC con más de 2 decimales legítimos, porque la función
no recibe la moneda que está parseando (`"0.00042195"`, una fracción de
BTC perfectamente real, pasaría a leerse como `42195`). La coma sí puede
usar ese atajo porque su único motivo de ser es un problema físico real
(el teclado boliviano fuerza una coma al querer tipear un decimal); no hay
un motivo equivalente para el punto en esta app, donde el punto ya es el
separador decimal por defecto (mismo formato que `formatMoney`). Se
revirtió el cambio y se dejó el razonamiento completo como comentario en
el código.

**Documentado, no corregido — fuera de alcance de Finanzas:** uno de los
buscadores encontró que `app/components/AuthProvider.tsx` (el gate de
sesión de todo el hub, no solo Finanzas) deja `ready` en `false` para
siempre si `getSession()` rechaza (sin `.catch`), lo que pondría el hub
entero en blanco sin ningún error visible ante una falla transitoria de
Supabase o un token corrupto en `localStorage`. Real y de impacto alto,
pero es del hub general, no de este sprint — anotado para una revisión
aparte.

**Señalado, no aplicado — simplificaciones de estilo, no bugs:** la misma
pasada marcó varios puntos de duplicación y de eficiencia ya aceptados a
propósito en sprints anteriores (recargar las 9 tablas enteras después de
cada mutación en vez de parchear el estado local, el valor de contexto sin
`useMemo`, la fórmula de conversión cruzada repetida en `quick-add.tsx` y
`settle-sheet.tsx`, el bloque de armar filas de deuda repetido entre
`createSharedExpense` y `registerRecurring`). Ninguno es un bug — son
concesiones de simplicidad ya documentadas en el propio código — así que
no se tocaron ahora; quedan como candidatos para una pasada de
`/simplify` si alguna vez se justifica el tiempo. Lo único que sí se sacó
fue código muerto de este mismo sprint: `nextInstallment()` en
`lib/finanzas/plans.ts` nunca llegó a tener un llamador real (ver §9).

### Segunda pasada (2026-09-08) — 8 buscadores en paralelo, 3 bugs más

Pedida explícitamente para volver a chequear el sprint. Confirmados y
corregidos:

1. **`plan-detail-sheet.tsx`: `canDelete` no era el espejo exacto del
   guard real de `deleteDebtPlan()`** — decía `installments.length > 0 &&
   every pendiente`, mientras que la base solo bloquea si ALGUNA cuota no
   está pendiente (con cero cuotas, esa condición es falsa, o sea que sí
   se puede borrar). Si alguien borraba una por una todas las cuotas
   pendientes de un plan desde el tacho de esta misma pantalla, el plan
   quedaba con 0 cuotas y el botón "Borrar plan" desaparecía —aunque
   `deleteDebtPlan()` lo hubiera aceptado sin problema— dejando un plan
   fantasma sin ninguna forma de sacarlo desde la UI, salvo el rodeo de
   tipear a mano un monto de regenerar mayor a 0. Corregido para que
   `canDelete` sea literalmente `!installments.some(d => d.status !==
   'pendiente')`, igual que el servidor; de paso, "Regenerar cuotas
   pendientes" se deshabilita cuando no queda nada pendiente (`remaining
   <= 0`), en vez de ofrecer generar una cuota de $0 que la validación
   iba a rechazar de todos modos. Este es el único de los tres que vive
   en código nuevo de este sprint — los otros dos son pre-existentes.
2. **`ajustes/page.tsx`: `<RateRow>` sembraba su campo editable con
   `rates[currency]` una sola vez, al montarse** — si la pantalla se abría
   (o se refrescaba) antes de que `load()` terminara, `rates` todavía era
   el fallback (`FALLBACK_RATES`, ej. BOB=6.96) y ese valor quedaba
   pegado en el campo para siempre, aunque la tasa real ya guardada fuera
   otra (ej. 6.90). Pasar el foco por el campo sin tocarlo disparaba
   `onBlur → save()` con el fallback y pisaba en silencio la tasa real —
   corrompiendo cada conversión a USD de ahí en adelante (saldos,
   totales, deudas). Corregido montando `<RateRow>` recién cuando
   `loading` ya es `false` (mismo criterio que ya usa "Sembrar categorías
   iniciales" más abajo en el mismo archivo), en vez de agregarle un
   efecto de resincronización.
3. **`updateRecurring` (Sprint 3) guardaba `patch.amount` tal cual, sin
   `normalizeAmount()`** — a diferencia de `createRecurring`, que sí
   redondea antes de insertar. Editar el monto (o la moneda) de un fijo ya
   existente podía persistir un valor con más precisión de la que le
   corresponde a esa moneda, la única mutación de todo el archivo que se
   saltaba esa normalización. Corregido normalizando contra la moneda que
   quede vigente después del patch (la nueva si `patch.currency` viene, si
   no la que ya tenía el fijo).

**Completado a pedido explícito (2026-09-08): "Ocultar montos" ahora tapa
todo, no solo los totales.** El toggle (ícono de ojo, Home) enmascaraba
los totales y las tarjetas de cuenta, pero `<TxRow>` (Home y Movimientos),
cada fila de Deudas, cada fila de Fijos y los saldos de Cuentas seguían
mostrando el monto exacto — real desde que se agregó el toggle en Sprint
1, nunca documentado en `sprint-1-movimientos.md`. Se agregó
`maskAmount(text, hidden)` a `lib/finanzas/money.ts` como único lugar que
decide "mostrar u ocultar" (antes cada pantalla repetía el mismo `show =
(text) => hidden ? HIDDEN_AMOUNT : text` por su cuenta) y se aplicó a todo
texto de **solo lectura**: `<TxRow>`, `<AccountRow>` y la lista de
archivadas en Cuentas, cada fila pendiente/histórica de Deudas,
`<RecurringRow>` en Fijos, y el total + cada cuota de `<PlanDetailSheet>`.

**A propósito, se dejó SIN enmascarar todo lo que es un campo o un dato de
una decisión activa** (nunca un vistazo pasivo, que es lo que el toggle
busca tapar): los montos dentro de formularios de alta/edición
(quick-add, debt-sheet, settle-sheet, plan-sheet, register-sheet,
recurring-sheet) y, dentro de `<PlanDetailSheet>`, el modo "Regenerar"
(el remanente sugerido y el editor de cuotas) — ahí el usuario necesita
ver el número real para poder decidir sobre él, igual que ya pasaba con
el monto sugerido de `<SettleSheet>` desde el Sprint 2.

`npm run build`/`lint` limpios; las 6 rutas de Finanzas re-verificadas en
200 en el dev server ya corriendo.

**Señalado otra vez, no aplicado (mismos candidatos de la primera
pasada, reconfirmados independientemente):** duplicación entre las 5
hojas (`debt/plan/recurring/register/settle-sheet.tsx`) del mismo
boilerplate de `submitting`/`error`/`handleSubmit`; `isPgError()` sigue
resolviendo por substring en vez de `error.code`; `AmountField` repetido
en 6 lugares en vez de un componente compartido en `ui.tsx`;
`localDateKey()` duplicada byte a byte entre `lib/supabaseClient.ts` y
`lib/finanzas/dates.ts` (la propia `dates.ts` dice haber sido escrita para
evitar justo este problema, y no vio esta copia). Ninguno es un bug —
quedan igual que los de la primera pasada, candidatos para `/simplify`
si alguna vez se justifica el tiempo.
