# Hub

Mini-hub de mini-apps, independiente de Acero Hub. Sin login, sin base de
datos, sin variables de entorno — cada mini-app vive en su propia carpeta
bajo `app/`.

Incluye por ahora:
- **Daily** (`app/daily/`) — generador de reporte de actividad diaria.
  Guarda todo en `localStorage` del navegador, no usa servidor para nada.

## Cómo agregar otra mini-app después

1. Crear una carpeta nueva en `app/<slug>/` con su `page.tsx` (y `layout.tsx`
   si necesita algo propio, como estilos o animaciones específicas).
2. Agregarla al arreglo `MINI_APPS` en `app/page.tsx` para que aparezca en
   la página de inicio.
3. Si esa mini-app sí necesita base de datos/login, ese es un tema aparte —
   este proyecto hoy no trae nada de eso armado.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

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
