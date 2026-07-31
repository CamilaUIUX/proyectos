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
--  8. RED DE SEGURIDAD
-- ---------------------------------------------------------------------
--  El paso 3 hace admin al registrarse. Esto cubre el caso contrario:
--  que la cuenta ya existiera antes de ejecutar este archivo.

update public.profiles
   set role = 'admin'
 where lower(email) = any (array['camilamoratosoria@gmail.com'])
   and role <> 'admin';
