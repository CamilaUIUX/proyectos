-- =====================================================================
--  Daily Hub — esquema de base de datos
-- =====================================================================
--  CÓMO USARLO:
--    1. Entra a tu proyecto en supabase.com
--    2. Menú lateral -> SQL Editor -> New query
--    3. Pega TODO este archivo y presiona "Run"
--
--  Se puede volver a ejecutar sin problema: no borra datos ni duplica nada.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. PERFILES  (una fila por persona registrada, guarda su rol)
-- ---------------------------------------------------------------------
--  El rol NO se puede cambiar desde la app: no hay permisos de escritura.
--  Para hacer admin a alguien: Table Editor -> profiles -> cambiar 'member'
--  por 'admin' a mano. Así nadie puede auto-ascenderse.

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;


-- ---------------------------------------------------------------------
--  2. QUIÉN PUEDE REGISTRARSE
-- ---------------------------------------------------------------------
--  Regla: cualquier correo @connaxis.com, más las excepciones de la lista.
--  Se valida en la base de datos, no en el navegador: aunque alguien
--  manipule la página, el registro se rechaza igual.
--
--  PARA AGREGAR OTRA EXCEPCIÓN: añade el correo al array 'extra_allowed'
--  (entre comillas simples y separado por comas) y vuelve a ejecutar.

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_domain constant text   := '@connaxis.com';
  extra_allowed  constant text[] := array['camilamoratosoria@gmail.com'];
  addr           text := lower(coalesce(new.email, ''));
begin
  if addr like ('%' || allowed_domain) or addr = any(extra_allowed) then
    return new;
  end if;
  raise exception 'Este correo no está autorizado. Se permiten cuentas % o correos aprobados aparte.', allowed_domain;
end;
$$;

drop trigger if exists enforce_email_domain_trigger on auth.users;
create trigger enforce_email_domain_trigger
  before insert on auth.users
  for each row execute function public.enforce_email_domain();


-- ---------------------------------------------------------------------
--  3. AL REGISTRARSE, SE CREA SU PERFIL AUTOMÁTICAMENTE
-- ---------------------------------------------------------------------
--  Los correos de 'admin_emails' quedan como admin desde el primer día,
--  sin tener que editar la tabla a mano.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_emails constant text[] := array['camilamoratosoria@gmail.com'];
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when lower(coalesce(new.email, '')) = any(admin_emails) then 'admin' else 'member' end
  )
  on conflict (id) do nothing;

  -- Acceso por defecto: solo Daily. Cualquier otra mini-app que exista o se
  -- agregue después queda cerrada hasta que un admin la habilite desde /admin
  -- (ver sección 10, app_access).
  insert into public.app_access (user_id, app_slug)
  values (new.id, 'daily')
  on conflict (user_id, app_slug) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
--  4. ¿QUIÉN ES ADMIN?  (función auxiliar usada por los permisos)
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;


-- ---------------------------------------------------------------------
--  5. REPORTES DIARIOS
-- ---------------------------------------------------------------------
--  Un reporte por persona por día: si guardas varias veces el mismo día,
--  se va actualizando el mismo (no se llena de duplicados).
--
--    content -> el texto final del reporte, listo para copiar
--    data    -> los archivos por categoría y los bullets, para poder
--               reabrir ese día tal como estaba

create table if not exists public.daily_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  report_date date not null,
  content     text not null default '',
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, report_date)
);

alter table public.daily_reports enable row level security;

create index if not exists daily_reports_user_date_idx
  on public.daily_reports (user_id, report_date desc);

-- Mantiene updated_at al día automáticamente
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
-- search_path fijo por higiene: evita que un search_path manipulado cambie a qué
-- resuelven los nombres dentro de la función.
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_reports_touch_updated_at on public.daily_reports;
create trigger daily_reports_touch_updated_at
  before update on public.daily_reports
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------
--  6. PERMISOS (RLS) — lo que realmente protege los datos
-- ---------------------------------------------------------------------
--  IMPORTANTE: la clave "anon" que va en la app es visible para cualquiera
--  que abra el sitio (así está diseñado). La seguridad real son estas
--  reglas, que el servidor aplica siempre.

-- Perfiles: ves el tuyo; si eres admin, ves todos. Nadie escribe desde la app.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- Reportes: lees los tuyos (o todos si eres admin)...
drop policy if exists daily_reports_select on public.daily_reports;
create policy daily_reports_select
  on public.daily_reports for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ...pero solo puedes crear, editar y borrar los TUYOS (ni el admin toca los ajenos).
drop policy if exists daily_reports_insert on public.daily_reports;
create policy daily_reports_insert
  on public.daily_reports for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists daily_reports_update on public.daily_reports;
create policy daily_reports_update
  on public.daily_reports for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists daily_reports_delete on public.daily_reports;
create policy daily_reports_delete
  on public.daily_reports for delete
  to authenticated
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------
--  7. REPORTES SEMANALES
-- ---------------------------------------------------------------------
--  Uno por persona por semana. week_start es siempre el LUNES de esa
--  semana, así que dos guardados de la misma semana actualizan la misma
--  fila en vez de duplicarse.
--
--  Se guarda solo el texto: el semanal se genera a partir de los dailys,
--  pero una vez editado a mano manda lo editado.

create table if not exists public.weekly_reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  content    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_reports enable row level security;

create index if not exists weekly_reports_user_week_idx
  on public.weekly_reports (user_id, week_start desc);

drop trigger if exists weekly_reports_touch_updated_at on public.weekly_reports;
create trigger weekly_reports_touch_updated_at
  before update on public.weekly_reports
  for each row execute function public.touch_updated_at();

-- Mismas reglas que los dailys: lees los tuyos (o todos si eres admin),
-- pero solo escribes los tuyos.
drop policy if exists weekly_reports_select on public.weekly_reports;
create policy weekly_reports_select
  on public.weekly_reports for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists weekly_reports_insert on public.weekly_reports;
create policy weekly_reports_insert
  on public.weekly_reports for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists weekly_reports_update on public.weekly_reports;
create policy weekly_reports_update
  on public.weekly_reports for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists weekly_reports_delete on public.weekly_reports;
create policy weekly_reports_delete
  on public.weekly_reports for delete
  to authenticated
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------
--  8. NOTAS DE ADMIN
-- ---------------------------------------------------------------------
--  Bloc de notas libre, solo para administradores (recordatorios sobre
--  clientes). Una sola fila por persona, sin fecha: cada guardado
--  sobrescribe la misma fila, así que nunca "vence" ni se borra sola con
--  el tiempo — solo cambia cuando el admin la edita.

create table if not exists public.admin_notes (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.admin_notes enable row level security;

drop trigger if exists admin_notes_touch_updated_at on public.admin_notes;
create trigger admin_notes_touch_updated_at
  before update on public.admin_notes
  for each row execute function public.touch_updated_at();

-- Solo administradores, y cada quien únicamente su propia nota.
drop policy if exists admin_notes_select on public.admin_notes;
create policy admin_notes_select
  on public.admin_notes for select
  to authenticated
  using (user_id = auth.uid() and public.is_admin());

drop policy if exists admin_notes_insert on public.admin_notes;
create policy admin_notes_insert
  on public.admin_notes for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_admin());

drop policy if exists admin_notes_update on public.admin_notes;
create policy admin_notes_update
  on public.admin_notes for update
  to authenticated
  using (user_id = auth.uid() and public.is_admin())
  with check (user_id = auth.uid() and public.is_admin());


-- ---------------------------------------------------------------------
--  9. RED DE SEGURIDAD
-- ---------------------------------------------------------------------
--  El paso 3 hace admin al registrarse. Esto cubre el caso contrario:
--  que la cuenta ya existiera antes de ejecutar este archivo.

update public.profiles
   set role = 'admin'
 where lower(email) = any (array['camilamoratosoria@gmail.com'])
   and role <> 'admin';


-- ---------------------------------------------------------------------
--  10. ACCESO POR MINI-APP (app_access)
-- ---------------------------------------------------------------------
--  Qué mini-apps puede usar cada cuenta. Al registrarse solo se otorga
--  'daily' (ver el trigger de la sección 3) — cualquier otra mini-app que
--  se agregue después queda cerrada hasta que un admin la habilite para
--  esa persona desde /admin.
--
--  Los admins no necesitan fila aquí: is_admin() les da acceso a todo sin
--  pasar por esta tabla (ver app/components/AuthProvider.tsx, hasAppAccess).

create table if not exists public.app_access (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  app_slug   text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, app_slug)
);

alter table public.app_access enable row level security;

-- Cada quien ve sus propios accesos; el admin ve (y otorga/revoca) los de todos.
drop policy if exists app_access_select on public.app_access;
create policy app_access_select
  on public.app_access for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists app_access_insert on public.app_access;
create policy app_access_insert
  on public.app_access for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists app_access_delete on public.app_access;
create policy app_access_delete
  on public.app_access for delete
  to authenticated
  using (public.is_admin());

-- Red de seguridad: quienes ya tenían cuenta antes de que existiera esta
-- tabla no deben perder el acceso a Daily que ya tenían.
insert into public.app_access (user_id, app_slug)
select id, 'daily' from public.profiles
on conflict (user_id, app_slug) do nothing;


-- ---------------------------------------------------------------------
--  11. FINANZAS (mini-app personal — cada quien ve solo lo suyo)
-- ---------------------------------------------------------------------
--  Especificación completa: Documentos/finanzas/sprint-1-movimientos.md
--  (en la carpeta del proyecto, no en esta base).
--
--  A diferencia de daily_reports y weekly_reports, NINGUNA de estas 4
--  tablas usa is_admin() en sus policies: es dinero, así que ni un admin
--  ve las cuentas o los movimientos de otra persona. Acceso a la mini-app
--  en sí sigue yendo por app_access (sección 10), como cualquier otra —
--  nadie la tiene por defecto, ni siquiera quien ya usa Daily.

-- 11.1 Cuentas — nombre, moneda nativa, saldo inicial. El saldo real
-- (con movimientos aplicados) se calcula en la app, nunca se guarda acá.
create table if not exists public.fin_accounts (
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

alter table public.fin_accounts enable row level security;

create index if not exists fin_accounts_user_idx
  on public.fin_accounts (user_id, archived, sort_order);

drop trigger if exists fin_accounts_touch_updated_at on public.fin_accounts;
create trigger fin_accounts_touch_updated_at
  before update on public.fin_accounts
  for each row execute function public.touch_updated_at();

-- 11.2 Categorías — lista plana. 'icon' guarda un slug de ícono
-- (ej. 'comida', 'transporte'), no un emoji — lo resuelve <CategoryIcon>
-- en la UI contra un mapa fijo de íconos de línea.
create table if not exists public.fin_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('gasto','ingreso')),
  icon        text,
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.fin_categories enable row level security;

create index if not exists fin_categories_user_idx
  on public.fin_categories (user_id, kind, archived, sort_order);

-- 11.3 Tasas de cambio — una fila por moneda no-USD. USD es la referencia
-- (tasa siempre 1, no tiene fila).
--
-- `auto = true` (default): la app trae el valor de una fuente pública al abrir
-- si `updated_at` superó el TTL (fetch en el cliente, sin servidor propio —
-- ver lib/finanzas/quotes.ts) y lo guarda acá mismo. `updated_at` hace las
-- veces de "última vez que se trajo". `auto = false`: manda el número que el
-- usuario fijó y el refrescador no lo pisa.
-- `quote_pair`: qué cotización sigue cuando es automática. Solo el Bs tiene
-- más de una (oficial vs. P2P); `null` = la default de esa moneda.
create table if not exists public.fin_rates (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  currency    text not null check (currency in ('BOB','USDT','USDC','BTC')),
  rate        numeric(24,8) not null check (rate > 0),
  auto        boolean not null default true,
  quote_pair  text check (quote_pair in ('BOB_USD','BOB_BINANCE','USDT_USD','USDC_USD','BTC_USD')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, currency)
);

alter table public.fin_rates enable row level security;

-- 11.3b Tasas automáticas. Agregado después del Sprint 1 — alter idempotente
-- para las bases que ya tienen la tabla.
alter table public.fin_rates
  add column if not exists auto boolean not null default true;
alter table public.fin_rates
  add column if not exists quote_pair text;
do $$ begin
  alter table public.fin_rates
    add constraint fin_rates_quote_pair_check
    check (quote_pair in ('BOB_USD','BOB_BINANCE','USDT_USD','USDC_USD','BTC_USD'));
exception when duplicate_object then null;
end $$;

-- 11.4 Movimientos — gasto, ingreso o transferencia. amount siempre
-- positivo; el signo lo decide 'type'. exchange_rate y amount_usd se
-- congelan al escribir y nunca se recalculan.
create table if not exists public.fin_transactions (
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
  -- Congelan el lado que LLEGA de una transferencia con `to_amount`, a la
  -- tasa de su día — igual que exchange_rate/amount_usd congelan el que sale.
  -- Nullable: sin to_amount no hay nada que congelar.
  to_exchange_rate numeric(24,8),
  to_amount_usd    numeric(14,2),
  description    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Transferencia: pide cuenta destino distinta de la de origen y sin
  -- categoría. Gasto/ingreso: sin cuenta destino ni monto recibido.
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

alter table public.fin_transactions enable row level security;

-- 11.4b Congelado del lado recibido de una transferencia entre monedas (o de
-- la comisión de una misma-moneda). Agregado después del Sprint 1 — `alter`
-- idempotente para las bases que ya tienen la tabla; el `create` de arriba lo
-- trae para las nuevas.
alter table public.fin_transactions
  add column if not exists to_exchange_rate numeric(24,8);
alter table public.fin_transactions
  add column if not exists to_amount_usd numeric(14,2);

create index if not exists fin_transactions_user_date_idx
  on public.fin_transactions (user_id, date desc);
create index if not exists fin_transactions_account_idx
  on public.fin_transactions (account_id);
create index if not exists fin_transactions_to_account_idx
  on public.fin_transactions (to_account_id);

drop trigger if exists fin_transactions_touch_updated_at on public.fin_transactions;
create trigger fin_transactions_touch_updated_at
  before update on public.fin_transactions
  for each row execute function public.touch_updated_at();

-- 11.5 RLS — user_id = auth.uid() y nada más. Sin cláusula is_admin() en
-- ninguna de las 4 tablas (ver la nota al principio de esta sección).

drop policy if exists fin_accounts_select on public.fin_accounts;
create policy fin_accounts_select on public.fin_accounts
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_accounts_insert on public.fin_accounts;
create policy fin_accounts_insert on public.fin_accounts
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_accounts_update on public.fin_accounts;
create policy fin_accounts_update on public.fin_accounts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_accounts_delete on public.fin_accounts;
create policy fin_accounts_delete on public.fin_accounts
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists fin_categories_select on public.fin_categories;
create policy fin_categories_select on public.fin_categories
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_categories_insert on public.fin_categories;
create policy fin_categories_insert on public.fin_categories
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_categories_update on public.fin_categories;
create policy fin_categories_update on public.fin_categories
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_categories_delete on public.fin_categories;
create policy fin_categories_delete on public.fin_categories
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists fin_rates_select on public.fin_rates;
create policy fin_rates_select on public.fin_rates
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_rates_insert on public.fin_rates;
create policy fin_rates_insert on public.fin_rates
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_rates_update on public.fin_rates;
create policy fin_rates_update on public.fin_rates
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_rates_delete on public.fin_rates;
create policy fin_rates_delete on public.fin_rates
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists fin_transactions_select on public.fin_transactions;
create policy fin_transactions_select on public.fin_transactions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_transactions_insert on public.fin_transactions;
create policy fin_transactions_insert on public.fin_transactions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_transactions_update on public.fin_transactions;
create policy fin_transactions_update on public.fin_transactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_transactions_delete on public.fin_transactions;
create policy fin_transactions_delete on public.fin_transactions
  for delete to authenticated using (user_id = auth.uid());


-- ---------------------------------------------------------------------
--  12. FINANZAS — DEUDAS (Sprint 2)
-- ---------------------------------------------------------------------
--  Especificación completa: Documentos/finanzas/sprint-2-deudas.md.
--  Mismo criterio que la sección 11: sin is_admin() en ninguna policy.

-- 12.1 'consumo' = gasto/ingreso real; 'movimiento' = plata que cambia de
-- forma sin serlo (cobro de una deuda). Todo lo del Sprint 1 ya existente
-- queda en 'consumo' por el default.
alter table public.fin_transactions
  add column if not exists flow_type text not null default 'consumo'
  check (flow_type in ('consumo', 'movimiento'));

-- 12.1b Forma de flow_type (revisión Sprint 2). Que una transferencia sea un
-- "movimiento financiero" es una propiedad del dato, no una decisión de quien
-- escribe: lo deriva un trigger. El check se queda con lo que SÍ es decisión:
-- si un ingreso es reembolso (movimiento) o plata ganada (consumo), y que un
-- reembolso nunca lleve categoría (contaminaría un reporte de ingresos por
-- categoría). Idempotente para bases que ya tienen la tabla.
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

do $$ begin
  alter table public.fin_transactions add constraint fin_tx_flow_shape check (
    (type = 'transferencia' and flow_type = 'movimiento')
    or (type = 'ingreso' and flow_type = 'movimiento' and category_id is null)
    or (type in ('gasto','ingreso') and flow_type = 'consumo')
  );
exception when duplicate_object then null; end $$;

-- 12.2 Personas — nombre, con creación inline desde cualquier selector.
create table if not exists public.fin_people (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.fin_people enable row level security;

create index if not exists fin_people_user_idx
  on public.fin_people (user_id, archived, sort_order);

-- Sin dos "Ana" y "ana" (el error más fácil de la creación inline por nombre).
-- Parcial sobre no-archivadas: un nombre se puede reusar tras archivar.
create unique index if not exists fin_people_user_name_idx
  on public.fin_people (user_id, lower(name)) where not archived;

-- 12.3 Deudas — entidad propia desde el día uno, nunca depende de un gasto
-- (origin_transaction_id es nullable). Ver §3.3 del sprint 2 para el porqué
-- de cada columna y de las dos constraints de forma.
create table if not exists public.fin_debts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  person_id              uuid not null references public.fin_people(id) on delete restrict,
  concept                text,
  amount                 numeric(24,8) not null check (amount > 0),
  currency               text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  exchange_rate          numeric(24,8) not null,
  amount_usd             numeric(14,2) not null,
  -- Cuánto de esta deuda es RECUPERAR costo real (USD). La ganancia nunca se
  -- guarda aparte: es siempre `amount_usd - principal_usd`. Casi siempre son
  -- iguales — solo difieren cuando repartiste un gasto por encima de lo que
  -- pagaste. Se reconoce como ingreso real recién AL COBRAR (§ settleDebts).
  principal_usd          numeric(14,2) not null default 0,
  incurred_on            date not null default current_date,
  status                 text not null default 'pendiente' check (status in ('pendiente','cobrada','condonada')),
  -- Cuándo se condonó (solo si status = 'condonada'). Para el historial.
  waived_on              date,
  -- restrict, no set null: si se pusiera null acá, la fila violaría
  -- fin_debt_origin_shape en cuanto el gasto de origen no tenga concepto
  -- propio (siempre es el caso de un reparto) — mejor bloquear el borrado
  -- del gasto de forma explícita, con el mismo criterio que ya usan
  -- account_id/to_account_id en fin_transactions.
  origin_transaction_id  uuid references public.fin_transactions(id) on delete restrict,
  -- set null acá sí es correcto: la app ya "des-salda" la deuda (vuelve a
  -- pendiente) ANTES de borrar el movimiento que la cobró (§4.6 del
  -- sprint 2) — esto es solo la red de seguridad para cuando eso falle.
  settled_transaction_id uuid references public.fin_transactions(id) on delete set null,
  -- El OTRO movimiento de un cobro con margen: `settled_transaction_id` es el
  -- reembolso (flow_type movimiento), este es la ganancia (flow_type consumo,
  -- cuenta como ingreso real). Solo para que des-saldar borre los dos.
  settled_margin_transaction_id uuid references public.fin_transactions(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Sin gasto de origen, el concepto es obligatorio (si no, no hay forma de
  -- saber de qué es la deuda). Con gasto de origen, lo describe el gasto.
  constraint fin_debt_origin_shape check (
    origin_transaction_id is not null or (concept is not null and length(trim(concept)) > 0)
  ),
  -- `status` nunca es null (tiene default) así que compararlo con `=` acá es
  -- seguro — no es la trampa de comparar una columna NULLABLE con `=` que
  -- deja pasar cualquier fila (decisiones_tecnicas.md §3 del repo de
  -- referencia).
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

alter table public.fin_debts enable row level security;

-- 12.3b Columnas agregadas después del Sprint 2 — alter idempotente para las
-- bases que ya tienen la tabla (el `create` de arriba las trae para las nuevas).
alter table public.fin_debts add column if not exists principal_usd numeric(14,2) not null default 0;
alter table public.fin_debts add column if not exists waived_on date;
alter table public.fin_debts add column if not exists settled_margin_transaction_id uuid references public.fin_transactions(id) on delete set null;
-- Backfill conservador: lo ya existente queda como "100% recuperación de costo"
-- (sin inventar ganancia retroactiva) y las condonadas heredan su fecha de update.
update public.fin_debts set principal_usd = amount_usd where principal_usd = 0 and amount_usd > 0;
update public.fin_debts set waived_on = updated_at::date where status = 'condonada' and waived_on is null;
do $$ begin
  alter table public.fin_debts add constraint fin_debt_principal_shape
    check (principal_usd >= 0 and principal_usd <= amount_usd);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.fin_debts add constraint fin_debt_margin_needs_settle
    check (settled_margin_transaction_id is null or settled_transaction_id is not null);
exception when duplicate_object then null; end $$;

create index if not exists fin_debts_user_status_idx
  on public.fin_debts (user_id, status, person_id);
create index if not exists fin_debts_origin_idx
  on public.fin_debts (origin_transaction_id);
create index if not exists fin_debts_settled_idx
  on public.fin_debts (settled_transaction_id);
create index if not exists fin_debts_settled_margin_idx
  on public.fin_debts (settled_margin_transaction_id);
-- Una persona no puede aparecer dos veces en el reparto del mismo gasto.
create unique index if not exists fin_debts_origin_person_idx
  on public.fin_debts (origin_transaction_id, person_id) where origin_transaction_id is not null;

drop trigger if exists fin_debts_touch_updated_at on public.fin_debts;
create trigger fin_debts_touch_updated_at
  before update on public.fin_debts
  for each row execute function public.touch_updated_at();

-- 12.4 RLS — user_id = auth.uid() y nada más, en las dos tablas.

drop policy if exists fin_people_select on public.fin_people;
create policy fin_people_select on public.fin_people
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_people_insert on public.fin_people;
create policy fin_people_insert on public.fin_people
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_people_update on public.fin_people;
create policy fin_people_update on public.fin_people
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_people_delete on public.fin_people;
create policy fin_people_delete on public.fin_people
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists fin_debts_select on public.fin_debts;
create policy fin_debts_select on public.fin_debts
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_debts_insert on public.fin_debts;
create policy fin_debts_insert on public.fin_debts
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_debts_update on public.fin_debts;
create policy fin_debts_update on public.fin_debts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_debts_delete on public.fin_debts;
create policy fin_debts_delete on public.fin_debts
  for delete to authenticated using (user_id = auth.uid());


-- ---------------------------------------------------------------------
--  13. FINANZAS — FIJOS (Sprint 3)
-- ---------------------------------------------------------------------
--  Especificación completa: Documentos/finanzas/sprint-3-fijos.md.
--  Mismo criterio que las secciones 11 y 12: sin is_admin() en ninguna
--  policy.

-- 13.1 Plantillas de fijos. `account_id` es la ÚLTIMA cuenta usada (se
-- actualiza sola al registrar cada período) — no una cuenta obligatoria
-- desde que se crea la plantilla. `currency` es propia porque la cuenta es
-- opcional: sin ella no habría ni decimales que mostrar.
create table if not exists public.fin_recurring (
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
  -- Desde qué período aplica. Un período que termina antes de esta fecha no
  -- es pendiente (el servicio no arrancó); una fecha en el pasado recupera
  -- los meses ya pasados (§4.1).
  starts_on      date not null default current_date,
  active         boolean not null default true,
  note           text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Anual exige mes; mensual lo prohíbe. `frequency` no es nullable (tiene
  -- CHECK propio arriba), así que compararla con `=` acá es seguro.
  constraint fin_recurring_anual_shape check (
    (frequency = 'anual' and month_of_year is not null)
    or (frequency = 'mensual' and month_of_year is null)
  )
);

-- 13.1b Agregado después del Sprint 3 — alter idempotente para bases que ya
-- tienen la tabla.
alter table public.fin_recurring add column if not exists starts_on date not null default current_date;

create index if not exists fin_recurring_user_idx
  on public.fin_recurring (user_id, active, sort_order);

drop trigger if exists fin_recurring_touch_updated_at on public.fin_recurring;
create trigger fin_recurring_touch_updated_at
  before update on public.fin_recurring
  for each row execute function public.touch_updated_at();

-- 13.2 Link opcional de un movimiento hacia la plantilla que lo generó.
-- set null (no restrict): a diferencia de fin_debts.origin_transaction_id
-- (sección 12), acá ningún CHECK depende de esta columna — borrar la
-- plantilla nunca debe borrar lo que ya generó, así que nulear el link es
-- exactamente el comportamiento buscado. Va DESPUÉS de crear fin_recurring
-- (no antes): la columna referencia esa tabla.
alter table public.fin_transactions
  add column if not exists recurring_id uuid references public.fin_recurring(id) on delete set null;

-- 13.3 Reparto por defecto de un fijo compartido. `amount` nullable =
-- "parte pareja", resuelta sobre el monto de CADA registro (nunca un
-- número congelado en la plantilla). `person_id` en restrict, igual que en
-- fin_debts (sección 12): borrar una persona que integra el reparto de
-- algún fijo se bloquea; hay que sacarla del reparto o archivarla.
create table if not exists public.fin_recurring_splits (
  id            uuid primary key default gen_random_uuid(),
  recurring_id  uuid not null references public.fin_recurring(id) on delete cascade,
  person_id     uuid not null references public.fin_people(id) on delete restrict,
  amount        numeric(24,8) check (amount is null or amount > 0)
);

create index if not exists fin_recurring_splits_recurring_idx
  on public.fin_recurring_splits (recurring_id);
-- Una persona no aparece dos veces en el reparto de la misma plantilla.
create unique index if not exists fin_recurring_splits_recurring_person_idx
  on public.fin_recurring_splits (recurring_id, person_id);

-- 13.4 RLS.

alter table public.fin_recurring enable row level security;
alter table public.fin_recurring_splits enable row level security;

drop policy if exists fin_recurring_select on public.fin_recurring;
create policy fin_recurring_select on public.fin_recurring
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_recurring_insert on public.fin_recurring;
create policy fin_recurring_insert on public.fin_recurring
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_recurring_update on public.fin_recurring;
create policy fin_recurring_update on public.fin_recurring
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_recurring_delete on public.fin_recurring;
create policy fin_recurring_delete on public.fin_recurring
  for delete to authenticated using (user_id = auth.uid());

-- fin_recurring_splits no tiene user_id propio (cuelga de fin_recurring):
-- sus policies validan a través de la plantilla dueña.
drop policy if exists fin_recurring_splits_select on public.fin_recurring_splits;
create policy fin_recurring_splits_select on public.fin_recurring_splits
  for select to authenticated
  using (exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid()));
drop policy if exists fin_recurring_splits_insert on public.fin_recurring_splits;
create policy fin_recurring_splits_insert on public.fin_recurring_splits
  for insert to authenticated
  with check (exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid()));
drop policy if exists fin_recurring_splits_update on public.fin_recurring_splits;
create policy fin_recurring_splits_update on public.fin_recurring_splits
  for update to authenticated
  using (exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid()));
drop policy if exists fin_recurring_splits_delete on public.fin_recurring_splits;
create policy fin_recurring_splits_delete on public.fin_recurring_splits
  for delete to authenticated
  using (exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid()));


-- ---------------------------------------------------------------------
--  14. FINANZAS — PLANES DE PAGO (Sprint 4)
-- ---------------------------------------------------------------------
--  Especificación completa: Documentos/finanzas/sprint-4-planes-de-pago.md.
--  Mismo criterio que las secciones 11-13: sin is_admin() en ninguna
--  policy.

-- 14.1 Guarda deliberadamente casi nada: solo lo que nunca cambia
-- (persona, concepto, capital, moneda). Cuántas cuotas tiene, cuántas
-- están cobradas, la próxima — todo se deriva de fin_debts, nunca de un
-- contador acá (§0 del sprint 4: "nada de cantidad total de cuotas
-- guardado en el plan").
create table if not exists public.fin_debt_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  person_id   uuid not null references public.fin_people(id) on delete restrict,
  concept     text not null,
  principal   numeric(24,8) not null check (principal > 0),
  currency    text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists fin_debt_plans_user_idx
  on public.fin_debt_plans (user_id, person_id);

drop trigger if exists fin_debt_plans_touch_updated_at on public.fin_debt_plans;
create trigger fin_debt_plans_touch_updated_at
  before update on public.fin_debt_plans
  for each row execute function public.touch_updated_at();

-- 14.2 Una cuota es una fila de fin_debts como cualquier otra — se cobra,
-- condona o edita con las mismas rutas del Sprint 2, sin código nuevo.
-- plan_id en CASCADE (el único cascade de toda la mini-app): borrar un
-- plan solo se permite sin cuotas tocadas (§4.4), así que llevarse sus
-- cuotas es seguro y es justo el comportamiento buscado.
alter table public.fin_debts
  add column if not exists plan_id uuid references public.fin_debt_plans(id) on delete cascade,
  add column if not exists installment_number integer check (installment_number is null or installment_number > 0);

alter table public.fin_debts drop constraint if exists fin_debt_installment_shape;
alter table public.fin_debts add constraint fin_debt_installment_shape check (
  (plan_id is null and installment_number is null)
  or (plan_id is not null and installment_number is not null)
);

create index if not exists fin_debts_plan_idx
  on public.fin_debts (plan_id);

-- 14.3 RLS.

alter table public.fin_debt_plans enable row level security;

drop policy if exists fin_debt_plans_select on public.fin_debt_plans;
create policy fin_debt_plans_select on public.fin_debt_plans
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_debt_plans_insert on public.fin_debt_plans;
create policy fin_debt_plans_insert on public.fin_debt_plans
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_debt_plans_update on public.fin_debt_plans;
create policy fin_debt_plans_update on public.fin_debt_plans
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_debt_plans_delete on public.fin_debt_plans;
create policy fin_debt_plans_delete on public.fin_debt_plans
  for delete to authenticated using (user_id = auth.uid());


-- ---------------------------------------------------------------------
--  15. FINANZAS — PRESUPUESTO MENSUAL (Sprint 5)
-- ---------------------------------------------------------------------
--  Especificación completa: Documentos/finanzas/sprint-5-presupuesto.md.
--  Mismo criterio que las secciones 11–14: sin is_admin() en ninguna policy.
--
--  El tope general NO es una fila — es la suma derivada de las líneas por
--  categoría (§0). El rollover NO es config — es una decisión por mes en
--  fin_budget_closures (§3.5).

-- 15.1 La plantilla. Sin `archived`: borrar la línea la elimina de verdad y
-- la cascada se lleva categorías, períodos, ampliaciones y cierres. El monto
-- se guarda nativo (en `input_currency`) con la tasa congelada, igual que
-- fin_transactions — `amount_usd` es el derivado, para comparar líneas de
-- distinta moneda.
create table if not exists public.fin_budget_lines (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  name           text,
  input_currency text not null check (input_currency in ('USD','BOB','USDT','USDC','BTC')),
  retroactive    boolean not null default true,
  created_on     date not null default current_date,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.fin_budget_lines enable row level security;

create index if not exists fin_budget_lines_user_idx
  on public.fin_budget_lines (user_id, sort_order);

drop trigger if exists fin_budget_lines_touch_updated_at on public.fin_budget_lines;
create trigger fin_budget_lines_touch_updated_at
  before update on public.fin_budget_lines
  for each row execute function public.touch_updated_at();

-- 15.2 Puente línea↔categoría. La restricción que le da sentido al tope
-- general: una categoría no puede estar en dos líneas a la vez, o el general
-- contaría su gasto doble. Un `category_id` (UUID) pertenece a un solo
-- usuario, así que un índice único global ya es "único por usuario".
create table if not exists public.fin_budget_line_categories (
  id          uuid primary key default gen_random_uuid(),
  line_id     uuid not null references public.fin_budget_lines(id) on delete cascade,
  category_id uuid not null references public.fin_categories(id)  on delete cascade,
  created_at  timestamptz not null default now(),
  unique (line_id, category_id)
);

alter table public.fin_budget_line_categories enable row level security;

create index if not exists fin_budget_line_categories_line_idx
  on public.fin_budget_line_categories (line_id);
create unique index if not exists fin_budget_line_categories_category_idx
  on public.fin_budget_line_categories (category_id);

-- 15.3 Los montos por mes. Solo se guardan los que alguien tocó; los demás se
-- heredan del anterior más reciente (en la app, sin cron). Editar re-congela
-- la tasa de ese período; los otros meses no se tocan.
create table if not exists public.fin_budget_periods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  line_id       uuid not null references public.fin_budget_lines(id) on delete cascade,
  period        date not null,
  amount        numeric(24,8) not null check (amount > 0),
  exchange_rate numeric(24,8) not null,
  amount_usd    numeric(14,2) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (line_id, period)
);

alter table public.fin_budget_periods enable row level security;

create index if not exists fin_budget_periods_user_period_idx
  on public.fin_budget_periods (user_id, period);

drop trigger if exists fin_budget_periods_touch_updated_at on public.fin_budget_periods;
create trigger fin_budget_periods_touch_updated_at
  before update on public.fin_budget_periods
  for each row execute function public.touch_updated_at();

-- 15.4 El rastro de cada ampliación de un mes puntual. Nativo + tasa
-- congelada, igual que los períodos.
create table if not exists public.fin_budget_extensions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  period_id     uuid not null references public.fin_budget_periods(id) on delete cascade,
  amount        numeric(24,8) not null check (amount > 0),
  exchange_rate numeric(24,8) not null,
  amount_usd    numeric(14,2) not null,
  created_at    timestamptz not null default now()
);

alter table public.fin_budget_extensions enable row level security;

create index if not exists fin_budget_extensions_period_idx
  on public.fin_budget_extensions (period_id);

-- 15.5 La decisión de cierre de cada mes. `amount_usd` (el disponible
-- congelado al responder) puede ser negativo. La ausencia de fila es la
-- pregunta pendiente — nunca un flag.
create table if not exists public.fin_budget_closures (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  line_id    uuid not null references public.fin_budget_lines(id) on delete cascade,
  period     date not null,
  carried    boolean not null,
  amount_usd numeric(14,2) not null,
  decided_at timestamptz not null default now(),
  unique (line_id, period)
);

alter table public.fin_budget_closures enable row level security;

create index if not exists fin_budget_closures_user_period_idx
  on public.fin_budget_closures (user_id, period);

-- 15.6 RLS — las 4 tablas con user_id propio: las 4 policies estándar.
-- fin_budget_line_categories valida a través de la línea (como
-- fin_recurring_splits, §13.4).

drop policy if exists fin_budget_lines_select on public.fin_budget_lines;
create policy fin_budget_lines_select on public.fin_budget_lines
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_budget_lines_insert on public.fin_budget_lines;
create policy fin_budget_lines_insert on public.fin_budget_lines
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_budget_lines_update on public.fin_budget_lines;
create policy fin_budget_lines_update on public.fin_budget_lines
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_budget_lines_delete on public.fin_budget_lines;
create policy fin_budget_lines_delete on public.fin_budget_lines
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists fin_budget_periods_select on public.fin_budget_periods;
create policy fin_budget_periods_select on public.fin_budget_periods
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_budget_periods_insert on public.fin_budget_periods;
create policy fin_budget_periods_insert on public.fin_budget_periods
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_budget_periods_update on public.fin_budget_periods;
create policy fin_budget_periods_update on public.fin_budget_periods
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_budget_periods_delete on public.fin_budget_periods;
create policy fin_budget_periods_delete on public.fin_budget_periods
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists fin_budget_extensions_select on public.fin_budget_extensions;
create policy fin_budget_extensions_select on public.fin_budget_extensions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_budget_extensions_insert on public.fin_budget_extensions;
create policy fin_budget_extensions_insert on public.fin_budget_extensions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_budget_extensions_update on public.fin_budget_extensions;
create policy fin_budget_extensions_update on public.fin_budget_extensions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_budget_extensions_delete on public.fin_budget_extensions;
create policy fin_budget_extensions_delete on public.fin_budget_extensions
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists fin_budget_closures_select on public.fin_budget_closures;
create policy fin_budget_closures_select on public.fin_budget_closures
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_budget_closures_insert on public.fin_budget_closures;
create policy fin_budget_closures_insert on public.fin_budget_closures
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_budget_closures_update on public.fin_budget_closures;
create policy fin_budget_closures_update on public.fin_budget_closures
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_budget_closures_delete on public.fin_budget_closures;
create policy fin_budget_closures_delete on public.fin_budget_closures
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists fin_budget_line_categories_select on public.fin_budget_line_categories;
create policy fin_budget_line_categories_select on public.fin_budget_line_categories
  for select to authenticated
  using (exists (select 1 from public.fin_budget_lines l where l.id = line_id and l.user_id = auth.uid()));
drop policy if exists fin_budget_line_categories_insert on public.fin_budget_line_categories;
create policy fin_budget_line_categories_insert on public.fin_budget_line_categories
  for insert to authenticated
  with check (exists (select 1 from public.fin_budget_lines l where l.id = line_id and l.user_id = auth.uid()));
drop policy if exists fin_budget_line_categories_update on public.fin_budget_line_categories;
create policy fin_budget_line_categories_update on public.fin_budget_line_categories
  for update to authenticated
  using (exists (select 1 from public.fin_budget_lines l where l.id = line_id and l.user_id = auth.uid()));
drop policy if exists fin_budget_line_categories_delete on public.fin_budget_line_categories;
create policy fin_budget_line_categories_delete on public.fin_budget_line_categories
  for delete to authenticated
  using (exists (select 1 from public.fin_budget_lines l where l.id = line_id and l.user_id = auth.uid()));


-- ---------------------------------------------------------------------
--  16. FINANZAS — AHORRO (Sprint 6)
-- ---------------------------------------------------------------------
--  Especificación completa: Documentos/finanzas/sprint-6-ahorro.md.
--  Mismo criterio que las secciones 11–15: sin is_admin() en ninguna policy.
--
--  No hay "cuentas de ahorro" — ninguna columna nueva en fin_accounts. Un
--  movimiento es de ahorro porque trae `savings_goal_id` a mano; la dirección
--  (`savings_flow`) se declara, no se deduce. El saldo de un ahorro y lo
--  apartado de cada cuenta se DERIVAN de esos movimientos (§4.1 / §4.2).
--  El "mes por organizar" es el mes pasado y no depende de ninguna tabla de
--  estado (§0).

-- 16.1 Los ahorros. `allocation_value` es un monto en `input_currency` cuando
-- `allocation_type = 'fixed'`, o un porcentaje 0–100 cuando es 'percent'. Sin
-- `retroactive` (no hay nada que contar hacia atrás). `created_on` fija desde
-- qué mes el plan puede organizar sobrantes (§4.5), mismo rol que
-- fin_recurring.starts_on.
create table if not exists public.fin_savings_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  name             text not null,
  input_currency   text not null check (input_currency in ('USD','BOB','USDT','USDC','BTC')),
  allocation_type  text not null check (allocation_type in ('fixed','percent')),
  allocation_value numeric(24,8) not null check (allocation_value > 0),
  target_amount    numeric(24,8) check (target_amount is null or target_amount > 0),
  target_date      date,
  is_catchall      boolean not null default false,
  sort_order       integer not null default 0,
  archived         boolean not null default false,
  created_on       date not null default current_date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

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

-- 16.2 Etiqueta de ahorro en los movimientos. Mismo patrón que recurring_id:
-- una FK nullable sobre la tabla que ya existe. `on delete set null` — borrar
-- un ahorro no toca sus movimientos, solo les suelta la etiqueta (la mutación
-- de borrado nulea los cuatro campos juntos antes del delete, §6).
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

-- La forma: los cuatro campos viajan juntos. Con etiqueta hay dirección SÍ o
-- SÍ (el `is not null` explícito — un CHECK que evalúa a NULL no se viola, y
-- `true and null` = null dejaba pasar filas sin dirección). El motivo va sí o
-- sí en un retiro y solo ahí; el período, sí o sí en un aporte y solo ahí.
do $$ begin
  alter table public.fin_transactions
    add constraint fin_tx_savings_shape check (
      (savings_goal_id is null
        and savings_flow is null and savings_reason is null and savings_period is null)
      or
      (savings_goal_id is not null
        and savings_flow is not null
        and (savings_reason is not null) = (savings_flow = 'retiro')
        and (savings_period is not null) = (savings_flow = 'aporte'))
    );
exception when duplicate_object then null;
end $$;

create index if not exists fin_transactions_savings_goal_idx
  on public.fin_transactions (savings_goal_id) where savings_goal_id is not null;

-- 16.3 Una transferencia puede ir de una cuenta a ELLA MISMA solo si es un
-- aporte de ahorro (§4.5 "guardar sin mover de banco": el saldo no se mueve,
-- lo apartado sube). Reemplaza fin_tx_shape (§11.4). El `drop if exists` lo
-- hace re-pegable; cualquier otra transferencia sigue necesitando un destino
-- distinto.
alter table public.fin_transactions drop constraint if exists fin_tx_shape;
do $$ begin
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
exception when duplicate_object then null;
end $$;

-- 16.4 El fijo de ahorro (§4.10). `savings_goal_id` + `to_account_id`: juntos
-- o ninguno; con ellos, sin categoría (no es un gasto que presupuestar). Las
-- dos FK `on delete restrict` — borrar un ahorro o una cuenta que un fijo usa
-- lo dejaría en un estado que la propia validación rechaza (la mutación de
-- borrado avisa nombrando los fijos, §6). `to_account_id` es opcional en la
-- plantilla y se pide al registrar cada instancia, igual que `account_id`.
alter table public.fin_recurring
  add column if not exists savings_goal_id uuid references public.fin_savings_goals(id) on delete restrict;
alter table public.fin_recurring
  add column if not exists to_account_id uuid references public.fin_accounts(id) on delete restrict;

do $$ begin
  alter table public.fin_recurring
    add constraint fin_recurring_savings_shape check (
      (savings_goal_id is null and to_account_id is null)
      or
      (savings_goal_id is not null and category_id is null)
    );
exception when duplicate_object then null;
end $$;

-- 16.5 RLS — fin_savings_goals con user_id propio, las 4 policies estándar.
-- Las columnas nuevas de fin_transactions y fin_recurring heredan las policies
-- que esas tablas ya tienen (§11.5 / §13).

drop policy if exists fin_savings_goals_select on public.fin_savings_goals;
create policy fin_savings_goals_select on public.fin_savings_goals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_savings_goals_insert on public.fin_savings_goals;
create policy fin_savings_goals_insert on public.fin_savings_goals
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_savings_goals_update on public.fin_savings_goals;
create policy fin_savings_goals_update on public.fin_savings_goals
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_savings_goals_delete on public.fin_savings_goals;
create policy fin_savings_goals_delete on public.fin_savings_goals
  for delete to authenticated using (user_id = auth.uid());


-- ---------------------------------------------------------------------
--  17. FINANZAS — CUENTAS DE INVERSIÓN (Sprint 7)
-- ---------------------------------------------------------------------
--  Especificación completa: Documentos/finanzas/sprint-7-cuentas-inversion.md.
--
--  Una cuenta marcada como de inversión graba sus subas/bajas de valor con
--  `flow_type: 'movimiento'` en vez de 'consumo' — el mismo mecanismo que un
--  cobro de deuda (§12) o un aporte de ahorro (§16). Así el mercado moviéndose
--  no ensucia el gasto/ingreso real del mes. Cero columnas nuevas en
--  fin_transactions; el ajuste es un gasto/ingreso común.

-- 17.1 El flag. Escala solo a N cuentas (patrón `archived`). Sin índice: se
-- filtra en memoria sobre las cuentas ya cargadas, que son pocas.
alter table public.fin_accounts
  add column if not exists is_investment boolean not null default false;

-- 17.2 Enmienda a fin_tx_flow_shape (§12.1b): un ajuste de valor a la baja de
-- una cuenta de inversión es un `gasto` con flow_type 'movimiento', que hoy no
-- encaja en ninguna rama del CHECK. Se agrega esa rama — no se quita ninguna,
-- así que toda transacción existente sigue pasando. El `category_id is null`
-- de la rama de `ingreso·movimiento` se deja: el sheet "Actualizar valor" no
-- lleva categoría, y esa regla sigue protegiendo un reporte de ingresos por
-- categoría de que un reembolso lo contamine.
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

-- 17.3 RLS — sin cambios. fin_accounts ya tiene sus 4 policies (§11.5); la
-- columna nueva las hereda.


-- ---------------------------------------------------------------------
--  18. FINANZAS — PERFILES (Sprint 8)
-- ---------------------------------------------------------------------
--  Especificación completa: Documentos/finanzas/sprint-8-perfiles.md.
--
--  Varios juegos de finanzas aislados para un mismo usuario (personal, un
--  proyecto, una empresa). RLS sigue siendo user_id = auth.uid() — el
--  aislamiento ENTRE PERFILES es de aplicación (data-context.tsx filtra por
--  profile_id), no de seguridad; un bug de filtrado mezcla tus propios
--  perfiles, nunca te deja ver datos de otro usuario.

-- 18.1 La tabla. `accent` es una CLAVE de paleta, no un hex — los tokens
-- viven en theme.css. El azul queda afuera de las opciones a propósito: ya es
-- el color de Ahorro (sprint-6 §0).
create table if not exists public.fin_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
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
  -- Lo que hace posible la FK compuesta de §18.5.
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

drop policy if exists fin_profiles_select on public.fin_profiles;
create policy fin_profiles_select on public.fin_profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_profiles_insert on public.fin_profiles;
create policy fin_profiles_insert on public.fin_profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_profiles_update on public.fin_profiles;
create policy fin_profiles_update on public.fin_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_profiles_delete on public.fin_profiles;
create policy fin_profiles_delete on public.fin_profiles
  for delete to authenticated using (user_id = auth.uid());

-- 18.2 Un default por cada usuario que ya tenga algo cargado — en CUALQUIERA
-- de las 14 tablas, no solo cuentas y movimientos (alguien pudo haber
-- sembrado categorías sin cargar ninguna cuenta todavía). El nombre real (de
-- pila, o el prefijo del email) se lo pone data-context.tsx en el primer
-- load() de un usuario NUEVO sin datos (sprint-8 §4.1) — acá alcanza con un
-- placeholder editable. `on conflict do nothing`: re-pegar este archivo no
-- crea un segundo default.
insert into public.fin_profiles (user_id, name, accent, is_default, sort_order)
select distinct user_id, 'Personal', 'verde', true, 0 from (
  select user_id from public.fin_accounts
  union select user_id from public.fin_categories
  union select user_id from public.fin_transactions
  union select user_id from public.fin_people
  union select user_id from public.fin_debts
  union select user_id from public.fin_debt_plans
  union select user_id from public.fin_recurring
  union select user_id from public.fin_budget_lines
  union select user_id from public.fin_budget_periods
  union select user_id from public.fin_budget_extensions
  union select user_id from public.fin_budget_closures
  union select user_id from public.fin_savings_goals
  -- fin_recurring_splits y fin_budget_line_categories no tienen user_id
  -- propio — si alguien tuviera SOLO filas ahí (imposible en la práctica: las
  -- dos cuelgan de un padre que sí tiene user_id), quedarían cubiertas igual
  -- porque su padre ya está en esta unión.
) existing
on conflict (user_id, name) do nothing;

-- 18.3 profile_id NULLABLE en las 14 tablas del dominio + backfill al default
-- de cada usuario. `fin_rates` NO lleva profile_id — la tasa del día es un
-- hecho del mundo, no de un cajón (mismo criterio que la referencia con
-- fin_rates/fin_quotes). Repetido tabla por tabla, sin un loop de PL/pgSQL —
-- mismo criterio que §15.6: más largo, pero cualquier statement que falle se
-- ve solo, sin depender de leer un `foreach` para saber cuál fue.
alter table public.fin_accounts add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_accounts x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

alter table public.fin_categories add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_categories x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

alter table public.fin_transactions add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_transactions x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

alter table public.fin_people add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_people x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

alter table public.fin_debts add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_debts x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

alter table public.fin_debt_plans add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_debt_plans x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

alter table public.fin_recurring add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_recurring x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

-- Sin user_id propio (§3.4 del sprint 3) — el perfil se resuelve vía el
-- fijo dueño del reparto, igual que fin_budget_line_categories más abajo.
alter table public.fin_recurring_splits add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_recurring_splits x set profile_id = r.profile_id
  from public.fin_recurring r
  where r.id = x.recurring_id and x.profile_id is null;

alter table public.fin_budget_lines add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_budget_lines x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

-- Sin user_id propio (§3.6.2 del sprint 5) — el perfil se resuelve vía la
-- línea dueña del vínculo.
alter table public.fin_budget_line_categories add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_budget_line_categories x set profile_id = l.profile_id
  from public.fin_budget_lines l
  where l.id = x.line_id and x.profile_id is null;

alter table public.fin_budget_periods add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_budget_periods x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

alter table public.fin_budget_extensions add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_budget_extensions x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

alter table public.fin_budget_closures add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_budget_closures x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

alter table public.fin_savings_goals add column if not exists profile_id uuid references public.fin_profiles(id) on delete restrict;
update public.fin_savings_goals x set profile_id = p.id from public.fin_profiles p where p.user_id = x.user_id and p.is_default and x.profile_id is null;

-- 18.4 Recién ahora, NOT NULL — es el paso que verifica que el backfill de
-- §18.3 cerró. Si algo quedara sin perfil, esto falla ruidoso en vez de dejar
-- filas invisibles para siempre.
alter table public.fin_accounts alter column profile_id set not null;
alter table public.fin_categories alter column profile_id set not null;
alter table public.fin_transactions alter column profile_id set not null;
alter table public.fin_people alter column profile_id set not null;
alter table public.fin_debts alter column profile_id set not null;
alter table public.fin_debt_plans alter column profile_id set not null;
alter table public.fin_recurring alter column profile_id set not null;
alter table public.fin_recurring_splits alter column profile_id set not null;
alter table public.fin_budget_lines alter column profile_id set not null;
alter table public.fin_budget_line_categories alter column profile_id set not null;
alter table public.fin_budget_periods alter column profile_id set not null;
alter table public.fin_budget_extensions alter column profile_id set not null;
alter table public.fin_budget_closures alter column profile_id set not null;
alter table public.fin_savings_goals alter column profile_id set not null;

-- 18.5 Índices: los que anteponían user_id pasan a anteponer profile_id — no
-- además. Toda consulta del dominio ya filtra por perfil, y el perfil ya
-- implica el usuario. Los que cuelgan de un id ajeno (line_id, recurring_id,
-- period_id, account_id, origin_transaction_id) NO se tocan: ya resuelven a
-- un solo perfil por transitividad una vez que su tabla padre tiene
-- profile_id.
drop index if exists public.fin_accounts_user_idx;
create index if not exists fin_accounts_profile_idx
  on public.fin_accounts (profile_id, archived, sort_order);

drop index if exists public.fin_categories_user_idx;
create index if not exists fin_categories_profile_idx
  on public.fin_categories (profile_id, kind, archived, sort_order);

drop index if exists public.fin_transactions_user_date_idx;
create index if not exists fin_transactions_profile_date_idx
  on public.fin_transactions (profile_id, date desc);

drop index if exists public.fin_people_user_idx;
create index if not exists fin_people_profile_idx
  on public.fin_people (profile_id, archived, sort_order);

drop index if exists public.fin_debts_user_status_idx;
create index if not exists fin_debts_profile_status_idx
  on public.fin_debts (profile_id, status, person_id);

drop index if exists public.fin_recurring_user_idx;
create index if not exists fin_recurring_profile_idx
  on public.fin_recurring (profile_id, active, sort_order);

drop index if exists public.fin_debt_plans_user_idx;
create index if not exists fin_debt_plans_profile_idx
  on public.fin_debt_plans (profile_id, person_id);

drop index if exists public.fin_budget_lines_user_idx;
create index if not exists fin_budget_lines_profile_idx
  on public.fin_budget_lines (profile_id, sort_order);

drop index if exists public.fin_budget_periods_user_period_idx;
create index if not exists fin_budget_periods_profile_period_idx
  on public.fin_budget_periods (profile_id, period);

drop index if exists public.fin_budget_closures_user_period_idx;
create index if not exists fin_budget_closures_profile_period_idx
  on public.fin_budget_closures (profile_id, period);

drop index if exists public.fin_savings_goals_user_idx;
create index if not exists fin_savings_goals_profile_idx
  on public.fin_savings_goals (profile_id, archived, sort_order);

-- 18.5b Los dos únicos que cambian de alcance de user_id a profile_id. Los
-- otros cuatro que tiene la referencia no aplican acá: `fin_categories_unique_name`
-- nunca existió en este esquema, y `fin_budget_line_categories_category_idx` /
-- `fin_budget_closures` (line_id, period) / `fin_recurring_splits`
-- (recurring_id, person_id) ya quedan correctos sin tocarlos — cuelgan de un
-- id que ya resuelve a un solo perfil.
drop index if exists public.fin_people_user_name_idx;
create unique index if not exists fin_people_user_name_idx
  on public.fin_people (profile_id, lower(name)) where not archived;

drop index if exists public.fin_savings_goals_one_catchall_idx;
create unique index if not exists fin_savings_goals_one_catchall_idx
  on public.fin_savings_goals (profile_id) where is_catchall and not archived;

-- 18.6 Integridad cruzada: FKs compuestas en los 3 pares donde un cruce entre
-- perfiles corrompería un NÚMERO (saldo o patrimonio), no solo una lista.
do $$ begin
  alter table public.fin_accounts add constraint fin_accounts_id_profile unique (id, profile_id);
-- Una constraint UNIQUE crea su propio índice de respaldo: si ya existe
-- (de una corrida anterior de este archivo), Postgres lo rechaza como
-- 42P07 duplicate_table, no como 42710 duplicate_object — hay que atrapar
-- los dos para que el re-run sea realmente idempotente.
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table public.fin_transactions add constraint fin_tx_account_same_profile
    foreign key (account_id, profile_id) references public.fin_accounts (id, profile_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.fin_transactions add constraint fin_tx_to_account_same_profile
    foreign key (to_account_id, profile_id) references public.fin_accounts (id, profile_id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.fin_categories add constraint fin_categories_id_profile unique (id, profile_id);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table public.fin_transactions add constraint fin_tx_category_same_profile
    foreign key (category_id, profile_id) references public.fin_categories (id, profile_id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.fin_people add constraint fin_people_id_profile unique (id, profile_id);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table public.fin_debts add constraint fin_debts_person_same_profile
    foreign key (person_id, profile_id) references public.fin_people (id, profile_id);
exception when duplicate_object then null; end $$;

-- `to_account_id`/`category_id` son nullable en fin_transactions — una FK
-- compuesta sobre una columna nullable no exige nada cuando esa columna es
-- null, así que conviven sin problema con fin_tx_shape. `person_id` en
-- fin_debts SÍ es `not null` (siempre lo fue) — ahí la FK compuesta exige
-- match siempre, que es lo que se quiere: una deuda nunca puede quedar sin
-- persona, y ahora tampoco con una persona de otro perfil.

-- 18.7 RLS de las 12 tablas con user_id propio: se reemplazan insert/update
-- para agregar que el profile_id sea de un perfil tuyo (no solo que la fila
-- lleve tu user_id). select/delete no cambian — ya alcanzaba con
-- user_id = auth.uid(). Repetido tabla por tabla, mismo criterio que §18.3.
drop policy if exists fin_accounts_insert on public.fin_accounts;
create policy fin_accounts_insert on public.fin_accounts
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_accounts_update on public.fin_accounts;
create policy fin_accounts_update on public.fin_accounts
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_categories_insert on public.fin_categories;
create policy fin_categories_insert on public.fin_categories
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_categories_update on public.fin_categories;
create policy fin_categories_update on public.fin_categories
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_transactions_insert on public.fin_transactions;
create policy fin_transactions_insert on public.fin_transactions
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_transactions_update on public.fin_transactions;
create policy fin_transactions_update on public.fin_transactions
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_people_insert on public.fin_people;
create policy fin_people_insert on public.fin_people
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_people_update on public.fin_people;
create policy fin_people_update on public.fin_people
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_debts_insert on public.fin_debts;
create policy fin_debts_insert on public.fin_debts
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_debts_update on public.fin_debts;
create policy fin_debts_update on public.fin_debts
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_debt_plans_insert on public.fin_debt_plans;
create policy fin_debt_plans_insert on public.fin_debt_plans
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_debt_plans_update on public.fin_debt_plans;
create policy fin_debt_plans_update on public.fin_debt_plans
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_recurring_insert on public.fin_recurring;
create policy fin_recurring_insert on public.fin_recurring
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_recurring_update on public.fin_recurring;
create policy fin_recurring_update on public.fin_recurring
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_budget_lines_insert on public.fin_budget_lines;
create policy fin_budget_lines_insert on public.fin_budget_lines
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_budget_lines_update on public.fin_budget_lines;
create policy fin_budget_lines_update on public.fin_budget_lines
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_budget_periods_insert on public.fin_budget_periods;
create policy fin_budget_periods_insert on public.fin_budget_periods
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_budget_periods_update on public.fin_budget_periods;
create policy fin_budget_periods_update on public.fin_budget_periods
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_budget_extensions_insert on public.fin_budget_extensions;
create policy fin_budget_extensions_insert on public.fin_budget_extensions
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_budget_extensions_update on public.fin_budget_extensions;
create policy fin_budget_extensions_update on public.fin_budget_extensions
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_budget_closures_insert on public.fin_budget_closures;
create policy fin_budget_closures_insert on public.fin_budget_closures
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_budget_closures_update on public.fin_budget_closures;
create policy fin_budget_closures_update on public.fin_budget_closures
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_savings_goals_insert on public.fin_savings_goals;
create policy fin_savings_goals_insert on public.fin_savings_goals
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_savings_goals_update on public.fin_savings_goals;
create policy fin_savings_goals_update on public.fin_savings_goals
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

-- Las dos tablas SIN user_id propio (validan por subquery a su padre,
-- sprint-3 §3.4 / sprint-5 §3.6.2) — se agrega que profile_id también sea de
-- un perfil tuyo, al lado de la validación que ya tenían.
drop policy if exists fin_recurring_splits_insert on public.fin_recurring_splits;
create policy fin_recurring_splits_insert on public.fin_recurring_splits
  for insert to authenticated
  with check (
    exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid())
    and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_recurring_splits_update on public.fin_recurring_splits;
create policy fin_recurring_splits_update on public.fin_recurring_splits
  for update to authenticated
  using (exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid()))
  with check (
    exists (select 1 from public.fin_recurring r where r.id = recurring_id and r.user_id = auth.uid())
    and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

drop policy if exists fin_budget_line_categories_insert on public.fin_budget_line_categories;
create policy fin_budget_line_categories_insert on public.fin_budget_line_categories
  for insert to authenticated
  with check (
    exists (select 1 from public.fin_budget_lines l where l.id = line_id and l.user_id = auth.uid())
    and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );
drop policy if exists fin_budget_line_categories_update on public.fin_budget_line_categories;
create policy fin_budget_line_categories_update on public.fin_budget_line_categories
  for update to authenticated
  using (exists (select 1 from public.fin_budget_lines l where l.id = line_id and l.user_id = auth.uid()))
  with check (
    exists (select 1 from public.fin_budget_lines l where l.id = line_id and l.user_id = auth.uid())
    and exists (select 1 from public.fin_profiles p where p.id = profile_id and p.user_id = auth.uid())
  );

-- 18.8 Los triggers de lógica (fin_normalize_flow_type, touch_updated_at) no
-- necesitan cambios — verificado: ninguno consulta otra tabla ni filtra por
-- user_id, así que ninguno puede cruzar perfiles.

-- =====================================================================
--  19. FINANZAS — NOTIFICACIONES (Sprint 9)
-- =====================================================================
--  Primer sprint de Finanzas que necesita algo más que pegar esto en el SQL
--  Editor: además de estas tablas, hace falta pg_cron/pg_net habilitados,
--  el secreto del cron en Vault, y la Edge Function ya deployada antes de
--  programar el job (sprint-9-notificaciones.md §3.6/§7 tiene el orden
--  completo). RLS sigue en user_id = auth.uid() — igual que fin_profiles,
--  el aislamiento entre perfiles de "notify" es de aplicación.

-- 19.1 Un dispositivo que aceptó recibir. Es del USUARIO, no del perfil: un
-- dispositivo recibe avisos de todos los perfiles con notify=true (§3.1).
create table if not exists public.fin_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,

  -- El endpoint ES la identidad del dispositivo para el navegador —
  -- reactivar en el mismo navegador debe pisar la fila, no sumar otra.
  unique (endpoint)
);
create index if not exists fin_push_subs_user_idx
  on public.fin_push_subscriptions (user_id);

alter table public.fin_push_subscriptions enable row level security;

drop policy if exists fin_push_subscriptions_select on public.fin_push_subscriptions;
create policy fin_push_subscriptions_select on public.fin_push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_push_subscriptions_insert on public.fin_push_subscriptions;
create policy fin_push_subscriptions_insert on public.fin_push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_push_subscriptions_update on public.fin_push_subscriptions;
create policy fin_push_subscriptions_update on public.fin_push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_push_subscriptions_delete on public.fin_push_subscriptions;
create policy fin_push_subscriptions_delete on public.fin_push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- 19.2 Preferencias por usuario (qué tipos quiere, y los dos horarios del
-- recordatorio — §3.2, §4.6). Una sola fila por usuario.
create table if not exists public.fin_notif_prefs (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  fijos              boolean not null default true,
  presupuesto        boolean not null default true,
  ahorro             boolean not null default true,
  deudas             boolean not null default true,
  recordar_anotar    boolean not null default true,
  recordar_mediodia  time not null default '14:00',
  recordar_noche     time not null default '21:00',
  -- Hora LOCAL del usuario — el job corre en UTC (§4.6).
  timezone           text not null default 'America/La_Paz',
  updated_at         timestamptz not null default now()
);

alter table public.fin_notif_prefs enable row level security;

drop trigger if exists fin_notif_prefs_touch_updated_at on public.fin_notif_prefs;
create trigger fin_notif_prefs_touch_updated_at
  before update on public.fin_notif_prefs
  for each row execute function public.touch_updated_at();

drop policy if exists fin_notif_prefs_select on public.fin_notif_prefs;
create policy fin_notif_prefs_select on public.fin_notif_prefs
  for select to authenticated using (user_id = auth.uid());
drop policy if exists fin_notif_prefs_insert on public.fin_notif_prefs;
create policy fin_notif_prefs_insert on public.fin_notif_prefs
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists fin_notif_prefs_update on public.fin_notif_prefs;
create policy fin_notif_prefs_update on public.fin_notif_prefs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fin_notif_prefs_delete on public.fin_notif_prefs;
create policy fin_notif_prefs_delete on public.fin_notif_prefs
  for delete to authenticated using (user_id = auth.uid());

-- 19.3 Por perfil, si notifica o no (§3.2) — un booleano no necesita tabla
-- aparte, viaja en la misma fila que ya lee/escribe data-context.tsx.
alter table public.fin_profiles add column if not exists notify boolean not null default true;

-- 19.4 Lo que ya se mandó — lo que hace posible "al momento" sin repetir
-- (§3.3, §4.1). Se escribe SOLO desde la Edge Function, con la service role
-- key (salta RLS a propósito: es un registro del sistema).
create table if not exists public.fin_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- Nullable a propósito: el recordatorio de anotar no sale de ningún perfil.
  profile_id  uuid references public.fin_profiles(id) on delete cascade,
  kind        text not null check (kind in ('fijos', 'presupuesto', 'ahorro', 'deudas', 'recordar_anotar')),
  -- La identidad del HECHO, no del aviso — sprint-9 §4.2 tiene el formato de
  -- cada tipo. Evita que un job cada 15 minutos avise 96 veces por día.
  dedupe_key  text not null,
  title       text not null,
  body        text not null,
  url         text,
  sent_at     timestamptz not null default now(),

  unique (user_id, dedupe_key)
);
create index if not exists fin_notifications_user_idx
  on public.fin_notifications (user_id, sent_at desc);

alter table public.fin_notifications enable row level security;

-- Solo select para el usuario — insert/update/delete quedan sin policy (la
-- Edge Function usa la service role key, que salta RLS entera).
drop policy if exists fin_notifications_select on public.fin_notifications;
create policy fin_notifications_select on public.fin_notifications
  for select to authenticated using (user_id = auth.uid());

-- 19.5 Extensiones. ⚠️ pg_net NO deja sus funciones en extensions.* — crea su
-- propio esquema `net` (net.http_post(...)) sin importar el `schema` que se
-- le pida acá. Verificar ANTES de correr esto que las dos estén habilitadas
-- en el proyecto (Database → Extensions) — se habilitan por proyecto, no
-- vienen dadas.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- 19.6 El secreto del cron, en Vault — nunca en el texto de esta migración
-- (quedaría en git). Correr UNA vez a mano, antes de programar el job de
-- más abajo:
--
--   select vault.create_secret('<un secreto random largo>', 'fin_cron_secret');
--
-- 19.7 El job — A PROPÓSITO comentado, no como el resto de este archivo.
-- Todas las demás secciones de schema.sql son seguras de re-pegar enteras
-- en cualquier momento (es como este usuario trabaja, sprint tras sprint);
-- esta no puede serlo: tiene un placeholder (<TU_REF>) en la URL, y
-- programarlo ANTES de deployar la Edge Function deja un cron disparando
-- contra una URL que no existe cada 15 minutos. Recién después de:
--   (a) deployar `finanzas-notificaciones`, y
--   (b) tener el secreto en Vault (§19.6),
-- copiar el bloque de abajo a una consulta aparte, reemplazar <TU_REF>, y
-- correrlo solo. `cron.schedule` ya es idempotente por nombre de job —
-- volver a correrlo con el mismo 'finanzas-notificaciones' actualiza el job
-- existente, no crea un segundo, así que es seguro repetir esto cuando
-- cambie algo (el `timeout_milliseconds`, la frecuencia).
--
-- select cron.schedule(
--   'finanzas-notificaciones',
--   '*/15 * * * *',
--   $cron$
--   select net.http_post(
--     url      := 'https://<TU_REF>.supabase.co/functions/v1/finanzas-notificaciones',
--     headers  := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fin_cron_secret')
--     ),
--     timeout_milliseconds := 60000
--   );
--   $cron$
-- );

-- =====================================================================
--  20. FINANZAS — PERFILES DE NEGOCIO (Sprint 10)
-- =====================================================================
--  sprint-10-perfiles-de-negocio.md. Sin contraparte en el repo de
--  referencia — nace de un pedido directo, no de portar nada. `tipo` cambia
--  qué pantallas se muestran; `display_currency` es independiente de `tipo`
--  y solo afecta CÓMO se muestran los totales agregados, nunca lo guardado.

-- 20.1 Dos alters idempotentes — todo perfil existente cae en
-- 'personal'/'USD', su comportamiento de hoy. Sin backfill: nadie nota el
-- cambio hasta que lo pida.
alter table public.fin_profiles
  add column if not exists tipo text not null default 'personal'
    check (tipo in ('personal', 'negocio'));

alter table public.fin_profiles
  add column if not exists display_currency text not null default 'USD'
    check (display_currency in ('USD', 'BOB', 'USDT', 'USDC', 'BTC'));

-- 20.2 fin_budget_projects — el presupuesto de una sola vez (§3.2). Tabla
-- nueva y separada de fin_budget_lines a propósito: un proyecto no tiene
-- mes, no rueda, no se cierra por calendario — nada del modelo mensual
-- (fin_budget_periods/extensions/closures) le sirve.
create table if not exists public.fin_budget_projects (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  profile_id         uuid not null references public.fin_profiles(id) on delete restrict,
  name               text not null,
  target_amount      numeric(24,8) not null check (target_amount > 0),
  target_currency    text not null check (target_currency in ('USD','BOB','USDT','USDC','BTC')),
  -- Congelado al crear, igual que cualquier otro monto de esta app
  -- (freeze() de transactions.ts) — el objetivo no se recalcula si la tasa
  -- cambia después.
  exchange_rate      numeric(24,8) not null,
  target_amount_usd  numeric(14,2) not null,
  archived           boolean not null default false,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Lo que hace posible la FK compuesta de §20.3.
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

-- 20.3 fin_transactions.project_id + integridad cruzada (§3.3). Nullable —
-- la inmensa mayoría de los movimientos no pertenece a ningún proyecto; una
-- FK compuesta sobre una columna nullable no exige nada cuando es null, así
-- que convive sin tocar fin_tx_shape. `on delete restrict`, no `set null`:
-- mismo criterio que cuentas — si el proyecto tiene movimientos, el borrado
-- se rechaza y la app cae a archivar (§4.7), en vez de dejarlos sueltos en
-- silencio.
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

-- 20.4 RLS de fin_transactions: sin cambios. `project_id` es una columna
-- más del mismo insert/update que ya valida user_id = auth.uid() y el
-- profile_id propio (§18.7 del Sprint 8) — la FK compuesta de arriba ya
-- cierra el cruce entre perfiles a nivel de dato.
