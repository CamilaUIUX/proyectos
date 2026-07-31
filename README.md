# Hub

Mini-hub de mini-apps, independiente de Acero Hub. Cada mini-app vive en su
propia carpeta bajo `app/`.

Incluye por ahora:
- **Daily** (`app/daily/`) — generador de reporte de actividad diaria.
  Guarda en `localStorage` (copia local instantánea) y, además, en Supabase:
  cada persona tiene su cuenta y su historial de reportes.

La portada (`/`) es pública. `/daily` pide iniciar sesión.

## Cuentas y permisos

- Registro **solo para correos `@connaxis.com`**, más las excepciones
  puntuales listadas en `supabase/schema.sql` (se valida en la base de datos,
  no en el navegador). Para autorizar otro correo suelto, agregarlo al array
  `extra_allowed` de ese archivo y volver a ejecutarlo.
- Cada persona ve **solo sus propios reportes**. Quien tenga `role = 'admin'`
  en la tabla `profiles` ve los de todo el equipo (solo lectura: nadie puede
  editar ni borrar reportes ajenos).
- Para hacer admin a alguien: Supabase → Table Editor → `profiles` → cambiar
  `member` por `admin`. No se puede hacer desde la app, a propósito.

## Cómo agregar otra mini-app después

1. Crear una carpeta nueva en `app/<slug>/` con su `page.tsx` (y `layout.tsx`
   si necesita algo propio, como estilos o animaciones específicas).
2. Agregarla al arreglo `MINI_APPS` en `app/page.tsx` para que aparezca en
   la página de inicio.
3. Si esa mini-app necesita login, envolver sus `children` en `<AuthGate>`
   dentro de su `layout.tsx`, igual que hace `app/daily/layout.tsx`.

## Puesta en marcha (primera vez)

```bash
npm install
```

1. **Supabase → Settings → API**: copiar *Project URL* y *anon key* en el
   archivo `.env.local` (ver `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Ese archivo no se sube a git.
2. **Supabase → SQL Editor**: pegar y ejecutar `supabase/schema.sql`. Crea
   las tablas, los permisos (RLS) y la regla del dominio de correo.
3. **Supabase → Authentication → Providers**: dejar *Email* activado.
4. `npm run dev` y abrir `http://localhost:3000`.

Para producción hay que cargar esas mismas dos variables en **Vercel →
Settings → Environment Variables** y volver a desplegar.

> **HTTPS es obligatorio en producción.** Con login, las contraseñas y las
> sesiones viajan en cada petición: sin certificado SSL van sin cifrar y
> pueden interceptarse. La ventana flotante (Picture-in-Picture) tampoco
> funciona sin HTTPS, porque el navegador solo la habilita en contextos
> seguros. En `localhost` no aplica: el navegador ya lo considera seguro.

## Deploy en Vercel (paso a paso)

### 1. Crear el repositorio en GitHub

En la cuenta de GitHub donde va a vivir este proyecto:

1. Crear un repositorio nuevo, vacío (sin README, sin .gitignore, sin
   licencia — ya los trae esta carpeta).
2. Copiar la URL del repo (ej. `https://github.com/usuario/nombre-repo.git`).

### 2. Subir este código

Desde esta carpeta (`daily-hub`):

```bash
git remote add origin <URL_DEL_REPO_NUEVO>
git branch -M main
git push -u origin main
```

(El repo local ya tiene un commit inicial con todo el código.)

### 3. Conectar con Vercel

1. Entrar a [vercel.com](https://vercel.com) con la cuenta donde se quiere
   deployar.
2. "Add New..." → "Project".
3. Importar el repositorio de GitHub recién creado (si es la primera vez,
   Vercel pedirá autorizar acceso a esa cuenta/organización de GitHub).
4. Framework Preset: Vercel detecta **Next.js** automáticamente — no hay
   que tocar nada más.
5. **No hace falta configurar ninguna variable de entorno** — el proyecto
   no las usa.
6. Deploy.

Cada push a la rama `main` vuelve a deployar automáticamente.

### 4. Dominio propio (opcional)

En el proyecto dentro de Vercel: Settings → Domains → agregar el dominio y
seguir las instrucciones de DNS que Vercel muestra ahí (agregar un registro
A o CNAME en el proveedor de DNS del dominio).

## Notas

- El nombre "Hub" en el título/`layout.tsx`/página de inicio es un
  placeholder — cambiarlo por el nombre que se quiera para este proyecto.
- No hay ningún sistema de autenticación ni control de acceso — todo el
  proyecto es público por diseño, igual que ya era la mini-app Daily dentro
  de Acero Hub.
