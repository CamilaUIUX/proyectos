# Finanzas — Sprint 8: "Perfiles"

> Mapa completo de features y roadmap: `features.md` en esta misma carpeta.
> Este documento especifica **únicamente el Sprint 8**, con alcance completo —
> mismo criterio que los sprints 2–7.
>
> Última actualización: 2026-09-11 · Estado: **especificado, no construido**.
> Se apoya en **todos** los sprints anteriores: casi todas las tablas de
> Finanzas ganan una columna. Es el sprint que más iteró en el repo de
> referencia (`sprint_8_perfiles.md`, 1162 líneas — tres rondas de bugs
> encontrados **después** de darlo por construido). Este documento arranca ya
> con esas lecciones incorporadas, no las repite.

---

## 0. Decisiones tomadas para este sprint

Criterio del repo de referencia (`Acero-Hub-ref/Documentos/finanzas/sprint_8_perfiles.md`)
adaptado a lo que ya construimos. **La causa de casi todas las rondas de bugs
de la referencia es su arquitectura**: ~50 puntos de llamada (`fetch('/api/finanzas/…')`)
que tenían que acordarse de mandar el perfil, y a los que se les escapó tres
veces distintas — necesitaron una cookie de transporte y una guarda que
prohíbe `fetch(` crudo en toda la mini-app. **Vos no tenés esa arquitectura**:
verificado, ningún componente de Finanzas toca `supabase` directo —
**todo pasa por `data-context.tsx`, un solo archivo**. Eso cambia el tamaño
real de varias piezas de este sprint, y está marcado en cada una.

| Tema | Decisión | Por qué |
|---|---|---|
| **Sin tipos de perfil** | Lo único que distingue a un perfil es su **nombre** y su **acento**. Cantidad sin límite | Personal, un proyecto, una empresa — se comportan idéntico |
| **Un default indeleble por usuario** | Nunca se borra ni se archiva. Recibe todo lo que ya existía. Se renombra como el usuario logueado (nombre de pila), sigue siendo editable | El usuario nuevo nunca ve "no tenés perfil"; el que ya usa la app no pierde nada |
| **Sin total consolidado** | El patrimonio, los totales del mes y todo lo demás son del perfil activo, nada más | Rechazado a propósito en la referencia — "quiero ver cada perfil aislado" |
| **`profile_id` en 14 tablas** (no 17: sin Pasanaku, que descartaste, y sin `fin_savings_closures`, que no construiste) | `fin_accounts`, `fin_categories`, `fin_transactions`, `fin_people`, `fin_debts`, `fin_debt_plans`, `fin_recurring`, `fin_recurring_splits`, `fin_budget_lines`, `fin_budget_line_categories`, `fin_budget_periods`, `fin_budget_extensions`, `fin_budget_closures`, `fin_savings_goals`. `on delete restrict` en todas | Mismo criterio que la referencia (§3.2 / §0.1): denormalizado y plano, no por join — es como tu `data-context.tsx` ya lee todo |
| **`fin_rates` queda global** | Sigue por `user_id`, sin `profile_id` | La tasa del día es un hecho del mundo, no de un cajón — mismo criterio que la referencia con `fin_rates`/`fin_quotes` |
| **RLS sigue en `user_id`** | `profile_id` es aislamiento de **aplicación**, no de seguridad. Se agrega un `check` en insert/update que valida que el perfil sea tuyo | Un bug de filtrado mezcla tus propios perfiles; nunca filtra a otro usuario — la garantía real sigue siendo RLS |
| **Sin capa de API, sin cookie, sin `fzFetch`** | Un solo `activeProfileId` en `data-context.tsx`, un solo punto que agrega `.eq('profile_id', …)` a cada lectura de `load()`, un solo lugar que estampa `profile_id: activeProfileId` en cada escritura | No hay 50 puntos de llamada que puedan olvidarlo — hay un archivo. El riesgo real es "me olvidé en una de las ~14 mutaciones", auditable de una sentada, no un patrón que se escapa en producción |
| **`profile_id` es `not null` sin default** | Si una mutación se olvida de mandarlo, el `insert` **falla con un error claro**, no escribe en silencio en otro lado | Divergencia a favor: la referencia (sin este resguardo) tuvo el bug exactamente al revés — una llamada sin perfil caía en el default **sin error** |
| **Borrado atómico sin función de Postgres** | Un `delete` directo sobre `fin_profiles` — si el perfil tiene cualquier dato en cualquiera de las 14 tablas, el `on delete restrict` rechaza **todo el statement**, nada se toca. Se cae a archivar | La referencia necesitó una función de Postgres porque su API borraba las categorías **primero** y el perfil **después**, en dos pasos — eso fue la causa de su bug más destructivo (§0.3). Acá no hay dos pasos: un solo `DELETE` es atómico por sí mismo |
| **Perfil activo por dispositivo** | `localStorage` (`fz:profile` = `{id, accent}`), mismo patrón que `fz:hidden` / `fz:budgetmode` que ya existen | Cambiarlo en el celular no debe cambiarlo en la computadora |
| **Snapshot cacheado por perfil** | La clave pasa a `fz:snapshot:{userId}:{profileId}`; `SNAPSHOT_VERSION` sube a **5** | Sin esto, cambiar de perfil pintaría un instante el patrimonio del anterior |
| **Los movimientos no se mueven entre perfiles** | Se registró en el equivocado → se borra y se vuelve a cargar | Mismo criterio que la referencia — es el único error irreversible que mete este sprint |
| **Un perfil nuevo nace con las categorías semilla y nada más** | Sin copiar cuentas, personas, fijos, presupuestos ni ahorros de otro perfil | No se pidió clonar, y clonar saldos iniciales es ambiguo |
| **Acento: 3 tokens por paleta, azul reservado** | `--fz-accent` / `--fz-accent-press` / `--fz-accent-tint` (los 3 que ya tenés) reescritos sobre `#fz-root` por `data-accent`. El azul queda afuera — ya es el color de Ahorro | Cero componentes tocados: todo ya lee el token. El acento se asigna al crear (siguiente clave libre) y se guarda, nunca se deriva del orden |
| **Sin `--fz-glass-pill`** | No existe ese token en tu `theme.css` (la referencia sí lo tiene) — no hace falta agregarlo, los 3 tokens actuales ya cubren todos los usos de `--fz-accent` | Menos superficie que la referencia |

### 0.1 Divergencias deliberadas con la referencia — resumen

Todas nacen de que no tenés capa de API. Cada una se explica en la tabla de
arriba o en su sección correspondiente de §3/§4/§6; acá el resumen:

1. **Sin cookie de transporte (`fz_profile`)** — no hace falta: no hay
   peticiones HTTP entre el cliente y el dato, hay llamadas directas a
   `supabase-js` desde un solo archivo.
2. **Sin guarda "prohibido `fetch(`"** — no aplica; el equivalente es que
   `data-context.tsx` siga siendo el único lugar que llama a `supabase.from`
   (ya lo es, verificado).
3. **El renombre de FKs es inofensivo acá** — no usás sintaxis de embed de
   PostgREST (`!fkey(...)`) en ningún lado; el bug más caro de la referencia
   (§0.2 c) no tiene forma de pasarte.
4. **Sin función `fin_delete_profile` de Postgres** — el `DELETE` directo ya es
   atómico (ver tabla de arriba).
5. **Menos tablas y menos reescopeos de unicidad** — 14 tablas, no 17; 2
   índices que cambian de alcance, no 6 (`fin_categories_unique_name` nunca
   existió en tu esquema; `fin_budget_line_categories_category_idx` queda
   correcto sin tocarlo — ver §3.3).
6. **Sin reconciliar con Notificaciones** — no la construiste todavía, así que
   no hay nada que actualizarle acá. Si algún día la hacés, ya vas a saber que
   necesita `profile_id`.

---

## 1. Objetivo del sprint

> **Que la misma cuenta pueda tener varios juegos de finanzas que no se ven
> entre sí — personal, un proyecto, una empresa — cada uno con su propio
> patrimonio, sus propias cuentas y categorías, y su propio color, sin abrir
> otra cuenta del hub.**

### Definición de "terminado"

- [ ] Existe un perfil default para todo usuario que entra a Finanzas, y todo
      lo cargado hasta hoy vive en él
- [ ] Se puede crear, renombrar y archivar perfiles desde Ajustes; borrarlos
      solo si están vacíos (si tienen datos, el intento de borrar los archiva)
- [ ] El selector aparece en el header del Home cuando hay 2+ perfiles y
      cambia el perfil activo sin recargar la página
- [ ] Cada perfil pinta la app con su acento, desde el primer frame (sin
      parpadeo de color)
- [ ] Todas las pantallas muestran **solo** datos del perfil activo, y el
      quick-add escribe **solo** en el perfil activo
- [ ] El perfil activo sobrevive a cerrar y volver a abrir la app en ese
      dispositivo, y no se contagia a otro dispositivo
- [ ] `npm run build`, `npx tsc --noEmit` y `eslint` pasan sin errores

---

## 2. Alcance

### Entra

- Tabla `fin_profiles` y columna `profile_id` en las 14 tablas del dominio.
- Migración con backfill: perfil default por usuario + todo lo existente
  apuntándole.
- `data-context.tsx` resuelve el perfil activo, filtra `load()` por perfil y
  estampa `profile_id` en cada mutación.
- Pantalla **Ajustes → Perfiles**: lista, crear, renombrar, cambiar color,
  archivar, borrar.
- Selector en el header del Home.
- Acento por perfil aplicado sobre `#fz-root`.
- Nombre del perfil visible en el quick-add cuando hay 2+.
- Snapshot del cliente cacheado por perfil.

### No entra en este sprint

| Fuera | Por qué |
|---|---|
| **Total consolidado entre perfiles** | Rechazado a propósito — territorio de Reportes (Feature 8, congelada) si algún día vuelve |
| **Mover un movimiento entre perfiles** | Rechazado a propósito (§0) |
| **Borrado duro de un perfil con historia** | Se archiva. Un "vaciar y borrar" en dos pasos es fácil de agregar después |
| **Compartir un perfil con otra persona** | Sigue habiendo un solo usuario — los perfiles son cajones del mismo dueño, no colaboración |
| **Copiar datos de un perfil a otro** | Un perfil nuevo nace con las categorías semilla y nada más |
| **Perfil en la URL** | No hay un router que lo necesite, y no hay links que compartir |
| **Que Notificaciones sepa de qué perfil es cada aviso** | Notificaciones no está construida todavía en este hub |

---

## 3. Modelo de datos

Una tabla nueva, `profile_id` en 14 tablas, 2 índices que cambian de alcance,
3 pares de FK compuestas, y la enmienda a las policies de insert/update. Todo
en una sección nueva **§18** de `supabase/schema.sql` (idempotente, re-pegable
entera), mismo criterio que §11–17.

### 3.1 `fin_profiles`

```sql
create table if not exists public.fin_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  -- Clave de paleta, no un hex — los colores viven en theme.css y acá se
  -- guarda cuál le toca. Un hex suelto dejaría al perfil fuera del sistema de
  -- color y permitiría guardar el azul, que está reservado para Ahorro.
  accent      text not null default 'verde'
                check (accent in ('verde','naranja','violeta','magenta','teal')),
  is_default  boolean not null default false,
  archived    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Un perfil no puede llamarse igual que otro del mismo usuario.
  unique (user_id, name),
  -- El default nunca se archiva — lo garantiza la base, no solo el cliente.
  constraint fin_profiles_default_no_archivado check (not (is_default and archived)),
  -- Lo que hace posible la FK compuesta de §3.4: un (id, user_id) único.
  unique (id, user_id)
);

alter table public.fin_profiles enable row level security;

-- Exactamente un default por usuario.
create unique index if not exists fin_profiles_one_default_idx
  on public.fin_profiles (user_id) where is_default;

create index if not exists fin_profiles_user_idx
  on public.fin_profiles (user_id, archived, sort_order);

drop trigger if exists fin_profiles_touch_updated_at on public.fin_profiles;
create trigger fin_profiles_touch_updated_at
  before update on public.fin_profiles
  for each row execute function public.touch_updated_at();
```

⚠️ **No confundir con `profiles` del hub** (sin prefijo `fin_`) — esa es la
identidad del usuario en todo el hub y no se toca.

### 3.2 `profile_id` en las 14 tablas del dominio

```sql
alter table public.<tabla>
  add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
```

Las 14: `fin_accounts`, `fin_categories`, `fin_transactions`, `fin_people`,
`fin_debts`, `fin_debt_plans`, `fin_recurring`, `fin_recurring_splits`,
`fin_budget_lines`, `fin_budget_line_categories`, `fin_budget_periods`,
`fin_budget_extensions`, `fin_budget_closures`, `fin_savings_goals`.

`on delete restrict`, no `cascade` — mismo criterio que cualquier otra FK de
esta app (cuentas, categorías): borrar un perfil con datos falla **en la
base**, aunque fallara la validación del cliente.

`fin_budget_line_categories` no tenía `user_id` propio (validaba por subquery
a `fin_budget_lines`, sprint-5 §3.6.2) — igual **suma `profile_id`**: es lo que
hace posible que `data-context.tsx` la filtre de forma plana como a las demás,
sin un join en cada lectura.

**Índices.** Los `fin_*_user_idx` existentes anteponen `user_id`. Se recrean
con `profile_id` en su lugar — no además: toda consulta del dominio ya va a
filtrar por perfil, y el perfil ya implica el usuario.

```sql
-- Ejemplo — se repite para cada tabla listada arriba que tenía un índice así.
drop index if exists public.fin_accounts_user_idx;
create index if not exists fin_accounts_profile_idx
  on public.fin_accounts (profile_id, archived, sort_order);
```

### 3.3 Los dos únicos que cambian de alcance

La referencia lista seis; a este esquema solo le tocan dos — los otros cuatro
o nunca existieron acá, o ya quedan correctos sin tocarlos (ver el porqué de
cada uno).

| Índice | Hoy | Pasa a | Por qué |
|---|---|---|---|
| `fin_people_user_name_idx` | `(user_id, lower(name)) where not archived` | `(profile_id, lower(name)) where not archived` | Sin esto, no podrías tener a la misma persona ("Ana") en dos perfiles distintos |
| `fin_savings_goals_one_catchall_idx` | `(user_id) where is_catchall and not archived` | `(profile_id) where is_catchall and not archived` | Sin esto, un segundo perfil nunca podría tener su propio cajón de sastre — el índice le rebotaría un `duplicate key` sin ninguna forma de llegar ahí desde la UI, y parecería un bug de la app |

```sql
drop index if exists public.fin_people_user_name_idx;
create unique index if not exists fin_people_user_name_idx
  on public.fin_people (profile_id, lower(name)) where not archived;

drop index if exists public.fin_savings_goals_one_catchall_idx;
create unique index if not exists fin_savings_goals_one_catchall_idx
  on public.fin_savings_goals (profile_id) where is_catchall and not archived;
```

**Los que NO hace falta tocar:**

- **No existe `fin_categories_unique_name`** en este esquema — nunca se
  construyó una restricción de nombre único para categorías. Nada que migrar.
- **`fin_budget_line_categories_category_idx`** (`unique(category_id)`,
  global) **queda correcto sin cambios**: una vez que `fin_categories` tiene
  `profile_id`, cada `category_id` ya resuelve a un solo perfil por
  transitividad — el único global sigue siendo, en la práctica, "único por
  perfil". No confundir esto con que la tabla en sí sume `profile_id` (§3.2,
  para el filtrado plano) — son dos preguntas distintas.

### 3.4 Integridad cruzada: FKs compuestas en 3 pares

Con `profile_id` denormalizado, nada impide por sí solo que una fila apunte a
un padre de otro perfil. Se cierra en los tres pares donde un cruce
corrompería un **número** (saldo o patrimonio), no solo una lista:

```sql
-- 1. Un movimiento no puede salir de, ni entrar a, una cuenta de otro perfil.
alter table public.fin_accounts add constraint fin_accounts_id_profile unique (id, profile_id);
alter table public.fin_transactions add constraint fin_tx_account_same_profile
  foreign key (account_id, profile_id) references public.fin_accounts (id, profile_id);
alter table public.fin_transactions add constraint fin_tx_to_account_same_profile
  foreign key (to_account_id, profile_id) references public.fin_accounts (id, profile_id);

-- 2. Ni caer en una categoría de otro perfil.
alter table public.fin_categories add constraint fin_categories_id_profile unique (id, profile_id);
alter table public.fin_transactions add constraint fin_tx_category_same_profile
  foreign key (category_id, profile_id) references public.fin_categories (id, profile_id);

-- 3. Una deuda no puede ser de una persona de otro perfil.
alter table public.fin_people add constraint fin_people_id_profile unique (id, profile_id);
alter table public.fin_debts add constraint fin_debts_person_same_profile
  foreign key (person_id, profile_id) references public.fin_people (id, profile_id);
```

`to_account_id`/`category_id` en `fin_transactions` son nullable (gasto e
ingreso no llevan `to_account_id`; una transferencia no lleva `category_id`) —
una FK compuesta sobre una columna nullable no exige nada cuando esa columna
es `null`, así que las dos conviven sin problema con `fin_tx_shape`.

En el resto de los pares (líneas de presupuesto ↔ categorías, splits ↔
personas, fijos ↔ ahorros) alcanza con que el código escriba el mismo
`profile_id` en las dos puntas — un cruce ahí ensucia una lista, no un saldo.

### 3.5 RLS

Las policies siguen siendo `user_id = auth.uid()`, las 4 de siempre por tabla,
más las 4 nuevas de `fin_profiles`.

⚠️ **RLS protege entre usuarios, no entre perfiles.** El perfil activo es un
concepto de la sesión del cliente, no de la identidad — `auth.uid()` no sabe
en qué perfil estás. El aislamiento entre perfiles se aplica **en
`data-context.tsx`**; la base solo garantiza que la fila sea de un perfil que
es tuyo. Un bug de filtrado mezcla tus propios perfiles — molesto, corrige
números — pero no filtra datos a otro usuario. Eso lo sigue cubriendo RLS,
sin cambios.

Se agrega un `check` en insert/update de las 14 tablas que valida que el
`profile_id` sea de un perfil tuyo (no solo que la fila lleve tu `user_id`):

```sql
drop policy if exists fin_accounts_insert on public.fin_accounts;
create policy fin_accounts_insert on public.fin_accounts
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
-- mismo patrón en el `update`, y repetido en las otras 13 tablas.
```

`fin_budget_line_categories` (sin `user_id` propio) valida distinto — sigue
con su subquery a `fin_budget_lines`, que ya alcanza para las dos cosas
(dueño y perfil), porque la línea ya quedó validada contra su propio
`profile_id` al crearse.

### 3.6 Lo que queda global

`fin_rates` no lleva `profile_id` y sigue con su `user_id`. Un cambio de tasa
en un perfil se ve en todos — es lo correcto: la tasa del día es un hecho del
mundo, no de un cajón. Consecuencia en Ajustes: la sección de Tipo de cambio
sigue siendo global; conviene decirlo.

### 3.7 Los triggers no necesitan cambios — verificado

Solo hay dos triggers de lógica en todo `schema.sql` (el resto son
`touch_updated_at`, genérico):

| Trigger | Por qué es seguro |
|---|---|
| `fin_normalize_flow_type()` | Solo lee y escribe `new.type` / `new.flow_type` de la fila que está entrando — no consulta ninguna tabla |
| `touch_updated_at()` | Solo toca `new.updated_at` |

Ninguno filtra por `user_id` ni por nada — no hay forma de que crucen perfiles.

### 3.8 La migración: cinco pasos, en este orden

El orden es lo que evita romper todo — el DDL de §3.2–§3.4 se ejecuta desde
acá, no en el orden en que está escrito arriba.

```sql
-- 1. La tabla.
create table if not exists public.fin_profiles (…);                        -- §3.1

-- 2. Un default por cada usuario que ya tenga algo cargado. El nombre real
--    se corrige después (§4.7) — acá alcanza con un placeholder.
insert into public.fin_profiles (user_id, name, accent, is_default, sort_order)
select distinct user_id, 'Personal', 'verde', true, 0 from public.fin_accounts
union
select distinct user_id, 'Personal', 'verde', true, 0 from public.fin_transactions
on conflict (user_id, name) do nothing;

-- 3. profile_id NULLABLE en las 14 + backfill al default de cada usuario.   §3.2
alter table public.<tabla> add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.<tabla> t set profile_id = p.id
  from public.fin_profiles p where p.user_id = t.user_id and p.is_default
  where t.profile_id is null;

-- 4. Recién ahora, NOT NULL — es el paso que verifica que el backfill cerró.
alter table public.<tabla> alter column profile_id set not null;

-- 5. Todo lo que depende de que profile_id ya esté poblado:
--    · los índices de §3.2      (fin_*_user_idx → fin_*_profile_idx)
--    · los dos únicos de §3.3
--    · las FKs compuestas de §3.4 (con su unique (id, profile_id) en el padre)
--    · las policies de §3.5
```

**Por qué el orden importa:** los únicos de §3.3 o las FKs de §3.4 antes del
paso 4 colisionan o fallan contra filas con `profile_id` todavía nulo — igual
que si el `not null` del paso 4 se adelantara al backfill del paso 3, la
migración fallaría por el motivo equivocado, tapando si el backfill estaba
completo.

**El default no se crea acá para un usuario sin datos todavía** — no hay
filas de las que derivarlo. Se crea solo, en el primer `load()` de esa
persona (§4.1) — mismo mecanismo que ya usás para sembrar `fin_rates`
("ninguna migración puede conocer el `auth.uid()` de quien la corre").

---

## 4. Reglas de negocio

### 4.1 Siempre hay un perfil, y se crea solo

`data-context.tsx` resuelve el perfil activo al arrancar `load()`:

1. Si hay un `fz:profile` en `localStorage` y ese perfil es del usuario, no
   está archivado, y sigue existiendo → ese.
2. Si no → el `is_default` del usuario.
3. Si el usuario no tiene **ningún** perfil → se crea el default ahí mismo
   (`name` = el nombre de pila del usuario si existe, si no `'Personal'`;
   `accent: 'verde'`) y se siembran sus categorías — mismo patrón que ya usás
   para sembrar `fin_rates` cuando faltan filas.

El paso 3 es lo que cubre a un usuario nuevo: nunca se muestra un estado
"no tenés perfil".

Un `fz:profile` inválido (de otro usuario, archivado, o borrado desde otro
dispositivo) no es un error — cae al default en silencio, y se corrige el
`localStorage` con el perfil real que resultó activo.

### 4.2 El aislamiento se aplica en el filtro, no en la vista

Cada una de las ~20 consultas del `Promise.all` de `load()` gana un
`.eq('profile_id', activeProfileId)` al lado del que ya tiene (o del que RLS
ya aplica solo). El `user_id` que pone cada `insert` **se queda igual** — es
lo que sostiene RLS (§3.5) — y se le suma `profile_id: activeProfileId`.

No hay 50 puntos de llamada que revisar: hay una función. La revisión de este
sprint, antes de darlo por terminado, es barrer **cada** `insert`/`update` de
`data-context.tsx` (son del orden de 40) y confirmar que el que corresponde a
una de las 14 tablas lleva `profile_id`. Como la columna es `not null` sin
default, el que se quede afuera **no falla en silencio** — el insert rebota
con un error claro.

### 4.3 Cambiar de perfil

`switchProfile(id)`: valida que `id` esté en la lista de perfiles del usuario
y no esté archivado (si no, no hace nada — mismo criterio que un `fz:profile`
inválido, §4.1); escribe `{id, accent}` en `localStorage`; actualiza el estado
`activeProfileId`; y dispara un `load()` completo para ese perfil — no hay
vista combinada que filtrar en memoria, el estado entero (`allTx`, `accounts`,
etc.) pertenece siempre a un solo perfil a la vez.

### 4.4 Patrimonio: aislado por construcción

El patrimonio es `Σ saldo(cuenta)`, y el saldo de una cuenta se deriva de sus
movimientos — como la **cuenta** pertenece a un perfil (no solo el
movimiento), todo lo derivado queda aislado sin un caso especial: patrimonio,
gasto del mes, sobrante, presupuesto, piso de ahorro, deudas.

Es la razón por la que `profile_id` vive en `fin_accounts`, no solo en
`fin_transactions`: etiquetar movimientos sobre cuentas compartidas dejaría
"el saldo de este perfil" siendo una ficción (la plata es fungible dentro de
una misma cuenta), y rompería el piso de ahorro, que valida cada gasto contra
el saldo de **la cuenta**.

**Costo aceptado** (igual que la referencia): si la plata de dos perfiles vive
en la misma cuenta bancaria física, hay que crear la cuenta dos veces y
repartir el saldo a mano. Mover plata entre perfiles son dos registros — un
gasto en uno, un ingreso en el otro — que es lo que pasa de verdad entre dos
entidades distintas.

### 4.5 Borrado y archivado

| Caso | Qué pasa |
|---|---|
| Perfil sin datos en ninguna de las 14 tablas | Se borra |
| Perfil con datos | El `DELETE` sobre `fin_profiles` es rechazado por `on delete restrict` (atómico, §0) → se archiva en su lugar |
| Perfil default | Ni una cosa ni la otra, siempre — el checkbox/botón ni se ofrece |
| Se archiva el perfil activo | La app cae al default (mismo mecanismo que un `fz:profile` inválido, §4.1) |
| Perfil archivado | Sale del selector; sus datos quedan intactos; se puede reactivar |

Para el perfil **activo**, la pantalla ya sabe si tiene datos (todo está
cargado) y puede decidir el label del botón ("Borrar" vs "Archivar") antes de
que el usuario toque nada — mismo criterio que ya usás con cuentas. Para un
perfil **no activo** en la lista de Ajustes, no hace falta precalcular nada:
se intenta el `delete` directo, y si la base lo rechaza se archiva
automáticamente, avisando por qué.

### 4.6 Los movimientos no se mueven entre perfiles

No existe "cambiar este movimiento de perfil". Si se cargó en el equivocado,
se borra y se vuelve a cargar. Es el único error irreversible que introduce
este sprint — por eso el acento y el nombre del perfil visible en el
quick-add (§7) no son cosmética, son la mitigación.

### 4.7 El perfil default se llama como su dueño

El nombre de pila del usuario logueado (no el completo, para que el saludo de
la Home diga lo mismo con uno o con varios perfiles), tomado de donde ya lo
tenga el hub. Si no hay nombre real, el prefijo del email; si no hay nada,
`'Personal'`. Sigue siendo editable como cualquier otro.

### 4.8 El perfil activo vive en el dispositivo

`localStorage`, mismo patrón que `fz:hidden` / `fz:budgetmode`:

```ts
const KEY = 'fz:profile'   // { id: string, accent: AccentKey }
```

**Se guarda el acento junto al id, no solo el id.** Pintar el primer frame en
verde para corregirlo a naranja un instante después es el mismo tipo de
"número falso" que ya evita el snapshot — acá es un color falso.

**El snapshot se cachea por perfil.** La clave pasa de `fz:snapshot:{userId}`
a `fz:snapshot:{userId}:{profileId}`, y `SNAPSHOT_VERSION` sube a **5**
(descarta los snapshots viejos sin migrarlos). Sin esto, cambiar de perfil
mostraría el patrimonio del anterior en el primer frame.

### 4.9 Un perfil nuevo nace con categorías y nada más

Al crearlo se siembran las `SEED_CATEGORIES` (las mismas de siempre) en ese
perfil. Sin cuentas, sin personas, sin fijos, sin presupuestos, sin ahorros.
No se copia nada del perfil de origen.

### 4.10 El acento por perfil

**Cómo funciona.** Todo uso de `--fz-accent`/`--fz-accent-press`/
`--fz-accent-tint` ya lee el token, ninguno tiene un hex escrito a mano — así
que cambiar de perfil es sobrescribir esas 3 variables CSS en `#fz-root`, con
`data-accent` como selector. **Cero componentes tocados.**

⚠️ **Escribir el atributo de forma síncrona, antes del primer paint** — no en
un `useEffect` normal (que corre después). La referencia se pintó un frame en
verde antes de tomar su color por exactamente ese motivo. Usar
`useLayoutEffect`, o resolverlo en el mismo lazy-initializer que ya lee
`fz:profile` del `localStorage`, aplicando el atributo antes del primer
render con datos.

**El azul está reservado** — es el color de Ahorro (sprint-6 §0, la "cuarta
excepción" a que el color sea solo marca y dinero). Un perfil con acento azul
recrearía esa confusión dentro de ese perfil.

| Clave | Acento | Nota |
|---|---|---|
| `verde` | El verde bosque de marca — `#16613C` | Default del perfil default |
| `naranja` | — | Hex a elegir al implementar |
| `violeta` | — | Hex a elegir al implementar |
| `magenta` | — | Hex a elegir al implementar |
| `teal` | — | Medir contraste: puede rozar el verde de marca |
| — | ~~Azul~~ | Reservado, no es una opción |

Los hexes nuevos, con dos requisitos: 4.5:1 sobre `--fz-surface` para texto, y
distinguibles entre sí de un vistazo.

**El acento se guarda, no se deriva del orden.** Se asigna al crear (la
siguiente clave libre) y se puede cambiar después. Si dependiera de la
posición, borrar el perfil 2 recolorearía al 3, y el perfil que ya
identificabas de un vistazo cambiaría de color — exactamente lo que provoca
registrar en el lugar equivocado. Del sexto perfil en adelante las paletas se
reciclan; no se bloquea la creación.

---

## 5. Estructura de archivos

### Nuevos

```
app/finanzas/components/
├── profile-switcher.tsx   — el botón del header del Home + su sheet de cambiar
└── profile-sheet.tsx      — crear / editar (nombre + acento) + borrar/archivar

app/finanzas/ajustes/ (sección nueva dentro de la página existente)
└── — el panel "Perfiles": lista, "+ Nuevo perfil", cada fila con su acento,
     archivar/reactivar — mismo patrón que el panel "Personas" del sprint-1
```

### Modificados

| Archivo | Cambio |
|---|---|
| `supabase/schema.sql` | Sección **§18** nueva |
| `lib/finanzas/types.ts` | `Profile` (`id`, `name`, `accent`, `is_default`, `archived`, `sort_order`); `AccentKey`; `ACCENT_PALETTES` (o el mapa de tokens por clave, si conviene tenerlo en `theme.css` en vez de acá); `profile_id` en cada tipo de fila de las 14 tablas |
| `app/finanzas/components/data-context.tsx` | Resuelve/crea el perfil activo al arrancar `load()`; `activeProfileId` + `switchProfile`; cada query de `load()` filtra por perfil; cada `insert` de las 14 tablas estampa `profile_id`; `createProfile`/`updateProfile`/`archiveProfile`/`deleteOrArchiveProfile`; snapshot con clave por perfil, `SNAPSHOT_VERSION = 5` |
| `app/finanzas/page.tsx` (Home) | El selector en el header (solo si hay 2+ perfiles); saluda con el nombre del perfil activo en vez del usuario cuando hay más de uno |
| `app/finanzas/components/quick-add.tsx` | Muestra el nombre del perfil activo en el título cuando hay 2+ (mitigación de §4.6) |
| `app/finanzas/ajustes/page.tsx` | Gana el panel de Perfiles |
| `app/finanzas/theme.css` | Las paletas de acento (`[data-accent='naranja']`, etc.) sobre `#fz-root`, cada una redefiniendo los 3 tokens |
| `app/finanzas/layout.tsx` | Aplica `data-accent` antes del primer paint (§4.10) |

### 5.1 Regla de independencia

Sin cambios respecto de sprint-1 §5.1.

---

## 6. Cómo se leen y escriben los datos

Mismo patrón que Sprints 1–7 — sin rutas API, todo `supabase.from('fin_...')`
directo desde `data-context.tsx`, RLS como la barrera real y `profile_id`
como el filtro de aplicación.

- **Arrancar** (`load()`): resuelve `activeProfileId` (§4.1, con creación
  perezosa del default si hace falta) **antes** del `Promise.all` grande; cada
  una de esas ~20 consultas suma `.eq('profile_id', activeProfileId)`
  (`fin_rates` queda afuera de esta regla, §3.6). `fin_profiles` en sí se
  carga aparte, sin filtrar por perfil — es la lista completa de perfiles del
  usuario, filtrada solo por RLS.
- **Cualquier `insert`/`update` de las 14 tablas**: suma `profile_id:
  activeProfileId` al objeto que ya arma. Nada nuevo salvo ese campo — el
  resto de cada mutación sigue igual.
- **Cambiar de perfil** (`switchProfile`): valida, escribe `localStorage`,
  actualiza el estado, y vuelve a correr `load()` entero para el perfil nuevo.
- **Crear un perfil** (`createProfile`): `insert` en `fin_profiles` con la
  siguiente clave de acento libre, después siembra las categorías (mismo
  `insert` masivo que ya usa `seedCategoriesIfEmpty`, apuntando al perfil
  recién creado) y cambia a él.
- **Borrar/archivar un perfil** (`deleteOrArchiveProfile`): intenta el
  `delete` directo; si la base lo rechaza (`on delete restrict`, capturado por
  `isPgError`), hace `update({ archived: true })` en su lugar. Si el perfil
  archivado/borrado era el activo, cae al default (§4.1).

---

## 7. Antes de escribir la primera línea de código

Sin decisiones de diseño pendientes — §0 las cerró todas. Lo único: **correr
la sección 18 de `supabase/schema.sql`** en el SQL Editor — es la migración
más grande hasta ahora (14 tablas ganan una columna), pero sigue siendo
idempotente y en el mismo orden de 5 pasos que describe §3.8.

Conviene tener resuelto, antes de tocar código, **con qué nombre y color
tiene sentido que arranque tu perfil default** si vas a renombrarlo — aunque
la migración ya le pone un nombre razonable solo.

---

## 8. Qué desbloquea

| Feature | Cómo se apoya |
|---|---|
| **Notificaciones** (Feature 10) | Si se construye después de este sprint, cada aviso puede decir de qué perfil sale y abrir la pantalla en el perfil correcto — la referencia dejó esto pendiente para su propio Sprint 9 |
| **Reportes** (Feature 8, congelada) | Un reporte por perfil es gratis una vez que todo lo derivado ya está aislado por perfil (§4.4) |
| **Cualquier feature nueva de `fin_*`** | El patrón "agregar `profile_id` not null + `.eq()` en `load()` + estampar en el insert" queda establecido — una tabla nueva lo suma desde el día uno, no como una migración aparte |

⚠️ **Sin migración de datos hacia atrás.** Todo lo que ya cargaste antes de
este sprint queda en el perfil default — no hay forma de, más adelante,
"repartir" movimientos viejos entre perfiles nuevos salvo a mano, uno por uno
(§4.6).

---

## 9. Changelog de desarrollo

Construido de punta a punta en una sola sesión, siguiendo §0-§8 tal cual
quedaron escritos. Dos ajustes de implementación, ninguno un cambio de
diseño — se anotan acá porque el documento seguía diciendo lo contrario:

- **§5 decía "`profile_id` en cada tipo de fila de las 14 tablas" — no se
  hizo.** Ningún tipo de fila (`Account`, `Transaction`, `Category`, etc.)
  expone hoy `user_id` tampoco — es una convención ya establecida del
  codebase (el filtro pasa por la query, no por el tipo). Agregar
  `profile_id` a esos 14 tipos habría roto esa convención sin ganar nada:
  ningún componente necesita leer `profile_id` de una fila, solo
  `data-context.tsx` lo escribe. `FinProfile` (el tipo nuevo) tampoco lleva
  `user_id`, por la misma razón.
- **§5 decía que `data-accent` se aplica en `app/finanzas/layout.tsx` — se
  aplicó en `shell.tsx` en su lugar.** `layout.tsx` es donde vive
  `<FinanzasShell>`, no donde puede leerse `activeAccent` (eso necesita estar
  DEBAJO de `<FinanzasDataProvider>`). Se resolvió con un componente interno
  nuevo (`FzRoot`, dentro de `shell.tsx`) que sí queda debajo del provider —
  cumple el requisito real de §4.10 (síncrono, en el primer render, sin
  `useEffect`) igual que si estuviera en `layout.tsx`.

Verificado antes de dar el sprint por terminado: `npx tsc --noEmit`, `npm run
build` y `npx eslint app/finanzas lib/finanzas` sin errores; el servidor de
desarrollo sirve `/finanzas`, `/finanzas/ajustes` y el resto de las rutas ya
existentes sin 500. **No se pudo probar el flujo completo en el navegador**
(crear perfil, cambiar de perfil, ver el acento cambiar) — este entorno no
tiene un navegador disponible para manejar el login de Supabase. Falta ese
smoke test manual, y falta correr la §18 de `schema.sql` (con las §15-17
pendientes, señaladas en sprint-7 — ver "Pendiente para el usuario" ahí) antes
de que cualquiera de esto funcione de verdad.

---

## 10. Revisión contra el clon (2026-09-11) — 4 bugs + 9 divergencias

Comparado contra `Acero-Hub-ref/documentos/finanzas/sprint_8_perfiles.md`
(§0.3 "los seis bugs que encontró la revisión posterior", §0.4 "los tres que
encontró el uso real", §0.5 "el perfil pasa a viajar en una cookie", §0.6 "el
200 que mentía", §0.7). Ese sprint es el más iterado de todo el clon — 3
rondas de bugs encontrados DESPUÉS de darlo por construido — así que esta
revisión usó su lista como checklist, más una lectura línea por línea de todo
lo escrito acá (`data-context.tsx`, `profile-sheet.tsx`,
`profile-switcher.tsx`, `ajustes/page.tsx`, `schema.sql` §18).

### Bugs corregidos

1. **⚠️ Una respuesta lenta de `load()` podía pisar el perfil recién
   elegido.** Dos `load()` en vuelo a la vez —un `switchProfile` rápido
   seguido de otro, o el doble-montaje de StrictMode en desarrollo— podían
   resolver en cualquier orden: si el más viejo terminaba último, sus
   `setState` pisaban los del más nuevo y la pantalla quedaba mostrando la
   plata de un perfil bajo el nombre de otro (`activeProfileId` en B, pero
   `rawAccounts`/`allTx`/etc. todavía en A). Exactamente el bug #2 de §0.3 de
   la referencia, encontrado en su propio `reload()` por el mismo motivo.
   Arreglado con un contador (`loadGenerationRef`): cada `load()` guarda su
   número al empezar y chequea, antes de cada tanda de `setState` (perfil
   resuelto, error de red, datos del dominio), que siga siendo el más
   reciente — si no, se descarta en silencio. Cubre de paso el doble-montaje
   de StrictMode, que es el mismo patrón de carrera.
2. **Dos pestañas/dispositivos abriendo Finanzas por primera vez a la vez
   podían chocar creando el default.** `unique(user_id, name)` deja pasar a
   una sola; la otra recibía el error de esa constraint y lo mostraba como
   si fuera un fallo real ("Ya tenés un perfil con ese nombre"), en la
   primera pantalla que ve alguien que recién entra. Análogo al bug #5 de
   §0.3 de la referencia (ahí por una carrera de requests, acá por pestañas,
   mismo mecanismo de fondo). Arreglado releyendo la lista de perfiles
   cuando el insert choca por esa constraint específica, en vez de fallar —
   quien perdió la carrera va a buscar el perfil que ya existe.
3. **La Home no tenía cómo volver a otro perfil desde sus dos estados
   vacíos.** `error` y "sin cuentas todavía" hacían un `return` temprano sin
   el header — y un perfil recién creado **siempre** entra por "sin cuentas
   todavía" (nace sin nada, §4.9). Prácticamente el bug #2 de §0.4 de la
   referencia ("un perfil vacío no tenía forma de volver"), mismo síntoma
   por la misma razón estructural. Arreglado extrayendo el saludo + selector
   + ojo a un `<HomeHeader>` compartido, presente en los tres `return` de la
   pantalla, no solo el normal.
4. **El sheet de perfil no distinguía "Borrar" de "Archivar" para el perfil
   activo**, pese a que §4.5 de este mismo documento decía que debía — "la
   pantalla ya sabe si tiene datos... y puede decidir el label del botón
   antes de que el usuario toque nada, mismo criterio que ya usás con
   cuentas". El botón salía siempre con el texto genérico "Archivar o
   borrar". Corregido: para el perfil activo (el único cuyas 14 tablas ya
   están en memoria) se precalcula si tiene datos, igual que `hasTx` en
   `<CuentaRow>`, y el ícono/label/nota al pie cambian entre "Borrar" (sin
   datos) y "Archivar" (con datos); para un perfil no activo en la misma
   lista de Ajustes se mantiene el texto genérico, porque ahí sí es cierto
   que no hay nada que precalcular (sus datos no están cargados).

Un quinto hallazgo, menor y sin efecto funcional: el comentario de §18.6 en
`schema.sql` decía que `person_id` en `fin_debts` era nullable (para explicar
por qué la FK compuesta no rompe nada) — es `not null` desde que la tabla
existe. La FK compuesta funciona igual de cualquier modo (con `not null`
simplemente exige match siempre, que es lo correcto); se corrigió el
comentario para no confundir a quien lo lea después.

### Divergencias deliberadas con la referencia (por qué sus otros bugs no aplican)

1. **Sin capa de API → toda la clase de bugs de "un call site se olvidó del
   perfil" no puede existir.** Los 7 `fetch()` sin convertir de §0.4.1, los 3
   call sites más que encontró la auditoría mecánica de §0.5, y la cookie
   `fz_profile` que la referencia terminó necesitando porque "corregir
   dependía de que ~50 puntos de llamada se acordaran" — acá hay **un solo**
   punto de escritura (`data-context.tsx`, verificado de nuevo con grep: cero
   componentes tocan `supabase` fuera de ese archivo), así que no hay nada
   que "olvidarse de envolver".
2. **El borrado fallido no puede llevarse las categorías por delante** (bug
   #1 de §0.3). La referencia necesitó una función de Postgres
   (`fin_delete_profile`) porque su API borraba las categorías sembradas
   PRIMERO y el perfil DESPUÉS, en dos pasos. Acá es un solo `DELETE FROM
   fin_profiles WHERE id=X`, atómico por naturaleza — si `on delete restrict`
   lo rechaza, no se tocó nada, ni las categorías ni el resto.
3. **Los puntos de color no pueden salir todos del mismo color** (bug #3 de
   §0.3). La referencia pintaba `<ProfileDot>` con su propio `data-accent` en
   un `<span>` esperando que heredara de `#fz-root[data-accent='X']` — un
   selector que solo matchea el nodo raíz, no un descendiente. Acá los
   swatches (selector de acento, filas de Ajustes, header del switcher) usan
   `ACCENT_HEX` — un mapa de hex en TypeScript, no CSS heredado — así que el
   selector de color sí muestra colores.
4. **El acento no se pinta un frame tarde** (bug #4 de §0.3). `activeAccent`
   sale de un lazy initializer de `useState` (lee `localStorage` en el primer
   render) y `FzRoot` lo aplica directo en el JSX — nunca hubo un
   `useEffect` de por medio que pudiera correr un frame después.
5. **La etiqueta no prometía de menos** (bug #6 de §0.3). El texto de este
   mismo documento (§4.5) y el del sheet ya decían "tiene datos" desde el
   principio, no "con movimientos" — no hubo que reducir el alcance del
   texto después de ampliar el del código.
6. **Crear un perfil no se puede quedar en el perfil anterior** (bug #3 de
   §0.4). La referencia hacía `crear() → switchProfile(nuevo.id)`, y
   `switchProfile` validaba contra el `profiles` de su propia renderización
   — que todavía no incluía al recién creado, así que el cambio se
   descartaba en silencio. Acá `createProfile` llama a `load(created.id)`
   directo, sin pasar por ningún `find()` contra una lista vieja — `load()`
   siempre relee `fin_profiles` desde cero, así que el perfil recién creado
   siempre está en la lista que se usa para resolverlo.
7. **El "200 que miente" (§0.6) y el borrado de un recurso de otro perfil
   sin verificar filas afectadas (el "conocido, no tocado" de §0.3) —
   aceptado, no cerrado, igual que lo dejó la referencia en su primera
   pasada.** Ningún `update`/`delete` de este archivo verifica cuántas filas
   tocó. Es alcanzable solo por el mismo tipo de carrera que el bug #1
   arriba ya mitiga (una pestaña vieja, o un sheet de edición abierto sobre
   una fila de un perfil justo antes de cambiarlo) — y las 3 relaciones que
   **sí** podrían corromper un número (cuenta, categoría, persona) ya están
   cerradas por las FKs compuestas de §3.4/§18.6: una mutación con un
   `account_id`/`category_id`/`person_id` de otro perfil no entra en
   silencio, la rechaza la base. Lo que queda sin cerrar son relaciones tipo
   lista (ahorro, línea de presupuesto) — exactamente lo que §3.4 ya
   documentaba como aceptado ("un cruce ahí ensucia una lista, no un
   saldo"). Cerrarlo del todo son ~40 sitios revisando `.length` de la
   respuesta, desproporcionado para un escenario que ya es más difícil de
   alcanzar después del bug #1.
8. **Borrar el perfil default con cero datos no está bloqueado a nivel de
   base, solo de UI.** El CHECK `fin_profiles_default_no_archivado` impide
   ARCHIVARLO, pero un `DELETE` directo sobre un default sin ningún dato en
   las 14 tablas no viola ningún `on delete restrict` (no hay filas que lo
   referencien) y pasaría. El botón de archivar/borrar nunca se ofrece para
   `is_default` en ningún punto de la UI (`<ProfileSheet>`), así que no es
   alcanzable en la práctica — ventana real: el instante entre que se crea
   una cuenta nueva y antes de cargar cualquier dato, y ni ahí hay un botón
   que lo dispare.
9. **`fin_savings_goals` queda fuera de las FKs compuestas a propósito** —ya
   documentado en §3.4 de este mismo documento antes de escribir código, no
   un hallazgo de esta revisión, se repite acá para que quede junto al resto
   de lo "aceptado, no cerrado".

### Confirmado sano

- `resolveActiveProfileId` cae al default en silencio tanto para un
  `preferredId` archivado como para uno que ya no existe (perfil borrado
  desde otro dispositivo) — verificado leyendo la función contra los dos
  casos, ninguno rompe.
- El default no se puede archivar ni por la UI (el botón no se ofrece) ni
  por la base (`fin_profiles_default_no_archivado`) — las dos capas
  coinciden, ninguna depende solo de la otra.
- Las FKs compuestas de §18.6 no rompen sobre los datos ya existentes: el
  backfill de §18.3 asigna a cada fila el default de **su propio**
  `user_id`, así que una cuenta y sus movimientos (mismo usuario) siempre
  resuelven al mismo perfil — la FK `fin_tx_account_same_profile` encuentra
  match para toda fila pre-Sprint-8, no solo las nuevas.
- El orden de la migración (nullable → backfill → not null → índices → FKs
  compuestas → RLS) es el único que puede funcionar sobre una base con datos
  reales — confirmado releyendo las 8 subsecciones en orden.
- `switchProfile` a un `id` inválido o ya no disponible no revienta: no
  valida antes de llamar `load(id)`, pero `load()` internamente cae al
  default por el mismo mecanismo que un `fz:profile` corrupto — coincide con
  "cambiar de perfil a uno archivado o borrado cae al principal sin romper"
  que la referencia confirmó sana en su propia revisión (§0.3, "lo que se
  revisó y estaba bien").
- Cero componentes fuera de `data-context.tsx` tocan `supabase` directo
  (re-verificado con grep después de todos los cambios de este sprint, no
  solo al planificarlo).

`npx tsc --noEmit`, `npm run build` y `npx eslint app/finanzas lib/finanzas`
en verde después de los 4 arreglos. Sigue sin poder probarse en un navegador
real (mismo motivo que §9) — los 4 bugs se encontraron y corrigieron por
lectura de código, no observados en vivo.
