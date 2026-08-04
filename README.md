# Hub

Mini-hub de mini-apps, independiente de Acero Hub. Cada mini-app vive en su
propia carpeta bajo `app/`.

Incluye por ahora:
- **Daily** (`app/daily/`) — generador de reporte de actividad diaria.

Todo el sitio es de acceso libre: **el login es opcional**.

| | Sin cuenta | Con cuenta |
|---|---|---|
| Generar el reporte del día | Sí | Sí |
| Dónde se guarda | Solo en ese navegador | Navegador **y** Supabase |
| Historial de días anteriores | — | Sí |
| Reporte semanal | — | Sí |
| Verlo desde otra computadora | — | Sí |

Sin sesión no se toca la base de datos en ningún momento. Quien quiera historial se
registra desde el bloque que aparece en `/daily`, y al iniciar sesión **lo que tenga en
pantalla no se pierde**: pasa a guardarse en su cuenta.

## Cómo se guarda el trabajo

- **Autoguardado** a segundo y medio de dejar de escribir. Un reporte por
  persona por día: guardar de nuevo el mismo día actualiza esa misma fila.
- **Limpiar** guarda primero y después vacía solo la pantalla. Lo guardado se
  conserva en el historial: el botón no borra nada de la base.
- **Cierre a medianoche**: a las 00:00 de la zona horaria del navegador se
  guarda el día y la pantalla arranca en blanco. Si el navegador estaba
  cerrado, la marca de fecha en `localStorage` hace lo mismo al volver.
- La copia local va en `daily_files:<id de usuario>`, **una por persona**, para
  que en un computador compartido nadie herede los archivos de quien usó la
  app antes.

## Historial y reporte semanal

- **Historial** (`app/daily/HistoryModal.tsx`) — lista de días guardados. Cada
  daily se **edita ahí mismo** y se guarda con su botón. Los reportes de otras
  personas (solo visibles para admins) salen en modo lectura.
- **Semanal** (`app/daily/WeeklyModal.tsx`) — junta todos los archivos de la
  semana (siempre de lunes a domingo) y los agrupa **por cliente**, con el tipo
  de trabajo al final de cada línea:

  ```
  SOUWI
      • SOUWI_1026_Blessings_128_M.pdf — Edits
      • SOUWI_1026_ThanksgivingForAll_286_D.pdf — MockUp Created
  ```

  El **cliente** es el prefijo del nombre del archivo: lo que va antes del
  primer `_`, `-` o espacio (`SOUWI_1026_...` → `SOUWI`). La lógica está en
  `lib/reportUtils.ts`.

  Se puede editar y guardar. Una vez guardado, al reabrirlo manda el texto
  editado; **Regenerar** lo reconstruye desde los dailys de esa semana.

## Cuentas y permisos

- Registro **solo para correos `@connaxis.com`**, más las excepciones
  puntuales listadas en `supabase/schema.sql` (se valida en la base de datos,
  no en el navegador). Para autorizar otro correo suelto, agregarlo al array
  `extra_allowed` de ese archivo y volver a ejecutarlo.
- Cada persona ve **solo sus propios reportes** (dailys y semanales). Quien
  tenga `role = 'admin'` en la tabla `profiles` ve los de todo el equipo, en
  solo lectura: nadie puede editar ni borrar reportes ajenos, ni siquiera un
  admin.
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
