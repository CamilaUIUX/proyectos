# Finanzas — Mapa de features

> Este documento es el **índice y backlog** de la mini-app de Finanzas: qué
> features existen, en qué orden conviene construirlas y qué resuelve cada
> una. No es la especificación técnica de ninguna — cada feature, cuando le
> toca el turno, recibe su propio documento (`sprint-N-<nombre>.md`) con
> modelo de datos, reglas de negocio y contratos de API, igual que
> `sprint-1-movimientos.md` para la primera.
>
> Última actualización: 2026-09-07.

> **Sincronizado con el repo de referencia** (`edanielacero/Acero-Hub`,
> commit `151ed4c` del 2026-09-02). Desde la última revisión (2026-08-27) el
> repo original agregó dos features nuevas — **Perfiles** (§3, ítem 12) y
> **Notificaciones**, antes "Alertas" (§3, ítem 10) — y **congeló** Reportes,
> Fondo de crecimiento/ROI y Reglas y automatismos (los deja fuera de su
> propio plan por ahora, sin borrar la especificación). Ver la nota en cada
> ítem correspondiente más abajo.

---

## 1. Cómo se integra en el Hub

Aplica a **todas** las features de esta lista, no solo a la primera:

- Vive en `app/finanzas/`, con sus tablas propias (prefijo `fin_`) y su
  entrada en `lib/miniApps.ts`.
- Acceso opt-in por usuario vía `app_access` (como cualquier mini-app nueva
  del hub) — nadie la tiene por defecto, un admin la otorga desde `/admin`.
- **Personal por usuario**: cada persona con acceso ve y gestiona solo sus
  propias cuentas y movimientos. RLS por `user_id = auth.uid()` en las 4
  tablas, sin excepciones — a confirmar en el Sprint 1 si un admin debería
  tener una vista de solo lectura (ver `sprint-1-movimientos.md`).
- No reutiliza componentes, utilidades ni lógica de `app/daily/`. Lo único
  compartido son las primitivas del hub (`AuthProvider`, `MiniAppGate`,
  `supabaseClient`, `profiles` / `app_access`).

---

## 2. Invariantes que valen para toda feature futura

Decisiones ya cerradas, para no volver a discutirlas cada vez que se arranca
una feature nueva:

| Tema | Decisión |
|---|---|
| Entrada de datos | 100% manual. Nunca se importa CSV de banco ni se conecta a un exchange |
| Saldo de una cuenta | **Siempre derivado** de sus movimientos, nunca una columna que se pueda desincronizar |
| Tasa de cambio | Se **congela** en cada movimiento al momento de registrarlo. El patrimonio total usa la tasa de hoy; una transacción vieja nunca cambia de valor |
| Categorías | Lista plana (sin jerarquía) — agregar `parent_id` después es aditivo, no una migración de datos |
| Auto-categorización | Fuera de alcance mientras no haya datos reales de qué describe cada quien |
| Compartido vs. recurrente | Son **atributos independientes** (lo confirma el Sprint de Fijos): un gasto puede ser compartido y suelto, fijo y no compartido, o cualquier combinación — no hacen falta dos módulos separados |
| Deuda vs. compartido | Conceptos distintos: compartido es una responsabilidad recurrente sobre un servicio (atributo de un fijo); deuda es que alguien te debe plata por cualquier motivo, entidad propia, sin gasto padre obligatorio |

---

## 3. Roadmap de features

Orden sugerido — los primeros son cosas que ya pasan cada mes en la vida
real; presupuesto, ahorro y reportes van después porque necesitan historial
acumulado para aportar algo.

### 1. Movimientos y Cuentas — ✅ construido, ver `sprint-1-movimientos.md`

La base de la que dependen todas las demás. Cuentas con saldo y moneda
nativa, tres tipos de movimiento (gasto / ingreso / transferencia),
multi-moneda con tasa congelada, categorías planas, y una Home que responde
"cuánto tengo", "cuánto gasté este mes" y "en qué se me fue".

### 2. Deudas — ✅ construido, ver `sprint-2-deudas.md`

Responde: *¿quién me debe plata y desde hace cuánto?*

- Dinero que te deben por cualquier motivo — no solo por un gasto
  compartido. Se puede cargar suelta (persona, monto, concepto, fecha) sin
  que exista ningún gasto detrás.
- Gasto compartido: pagás el 100% de algo (ej. una suscripción entre
  varios) y lo repartís por persona. Se registra el **bruto**; el
  reembolso es un movimiento aparte; el **neto** (bruto − lo que te
  devuelven) es tu costo real.
- Cobrar una deuda es un movimiento que **no cuenta como ingreso real** del
  mes — es plata que vuelve, no plata nueva.
- Condonar una deuda (ahí sí pasa a ser un gasto tuyo).
- Seguimiento por persona: sabés cuánto te debe cada quien, no solo el
  total.

### 3. Fijos (recurrentes) — ✅ construido, ver `sprint-3-fijos.md`

Responde: *¿qué me falta pagar este mes?*

- Plantillas de gasto que se repiten (alquiler, una suscripción),
  mensuales o anuales. El monto es un default editable en cada registro —
  si sube el precio, no hay que tocar la plantilla.
- Registrar el mes es un toque, con todo precargado, y el gasto queda
  fechado el día que corresponde, no el día que lo registraste.
- El reparto (si el fijo es compartido) es **opcional**, no un módulo
  aparte — ver la invariante de "compartido vs. recurrente" (§2).
- Pausar un fijo sin perder su historial; borrar la plantilla no borra los
  gastos que ya generó.

### 4. Planes de pago — ✅ construido, ver `sprint-4-planes-de-pago.md`

Responde: *¿en cuántas cuotas cobro una deuda, y cuál es la próxima?*

- Un plan **siempre parte de una deuda ya registrada** (Feature 2) — no es
  una forma alternativa de cargar una deuda, es reestructurar una que ya
  existe. Al crear el plan, la deuda suelta original se reemplaza por sus
  cuotas.
- Interés simple opcional; cuotas iguales o tipeadas a mano.
- Cada cuota es una deuda normal: se cobra, condona o edita con las mismas
  pantallas de Deudas, sin una sección nueva.
- Regenerar el plan si cambian las condiciones, sin perder lo ya cobrado o
  condonado.

### 5. Presupuesto mensual — ✅ construido, ver `sprint-5-presupuesto.md`

Responde: *¿voy bien este mes, o me estoy pasando — por categoría y en
general?*

- Tope por categoría (o por un grupo de categorías bajo una sola línea) +
  un total general **derivado** de la suma de esas líneas — nunca una
  línea aparte que se pueda desincronizar.
- El monto de cada línea es editable mes a mes, con el mes anterior como
  punto de partida. Moneda propia por línea, monto nativo con tasa
  congelada.
- Un gasto que se pasa del tope de su categoría **bloquea el registro**,
  con opción de ampliar el límite ese mes puntual. El tope general nunca
  bloquea.
- Al cerrar el mes, pregunta línea por línea qué hacer con el sobrante o el
  sobregasto: ¿se arrastra al siguiente mes o se queda así? El arrastre es
  un solo salto hacia atrás, no una cadena.
- Usa el gasto **neto** (bruto − `principal_usd` de las deudas no
  condonadas) en categorías con gasto compartido — reusa `repartidoUsd`
  del Sprint 2.
- Barra con tick de "acá deberías estar hoy" + toggle gastado/disponible.

> La pantalla **"Más"** (`/finanzas/mas`) agrupa Deudas · Fijos · Presupuesto ·
> Ahorro · Cuentas — la construyó el Sprint 6. La tab bar de móvil quedó
> Inicio · Movimientos · + · Más · Ajustes.

### 6. Ahorro — ✅ construido, ver `sprint-6-ahorro.md`

Responde: *cuánto tengo realmente disponible, después de lo que ya aparté?*

- Ningún cambio de columnas en `fin_accounts`: **no hay "cuentas de
  ahorro"**. Cualquier cuenta tiene una porción de saldo libre y otra
  apartada, y ambas se **derivan** de los movimientos etiquetados con un
  plan de ahorro — igual que el saldo se deriva de todos los movimientos.
- Un movimiento es de ahorro porque el usuario lo etiquetó a mano, nunca se
  infiere. Tres direcciones: aporte, retiro (pide justificativo) o
  traslado entre cuentas (no es ni gasto ni ingreso).
- **El piso de ahorro**: un gasto común nunca puede tocar lo apartado, en
  ningún camino de la app que saque plata de una cuenta.
- Cada plan de ahorro puede tener su propia regla de reparto (monto fijo o
  porcentaje), pero la regla **propone, nunca aplica sola** — se confirma
  mes a mes.

### 7. Cuentas de inversión — ✅ construido, ver `sprint-7-cuentas-inversion.md`

Responde: *¿cómo ajusto el valor de una inversión sin que ensucie mi gasto o
ingreso real del mes?*

- Una cuenta marcada como "de inversión" excluye sus ajustes de valor del
  gasto/ingreso real del mes (es el mercado moviéndose, no consumo).
- Superficie propia — "Actualizar valor" — separada del flujo normal de
  Gasto/Ingreso: un solo campo con el valor actual y la diferencia respecto
  al saldo previo, sin fecha editable (siempre es una foto de hoy).
- No aparece en la lista de Movimientos: es un ajuste de cuenta, no un
  movimiento de plata que valga la pena listar.

### 8. Reportes

Responde: *¿en qué se me va la plata mes a mes, y cómo cambia con el
tiempo?*

Evolución de gasto/ingreso por categoría, tendencias, comparar períodos.
Solo empieza a aportar valor una vez que hay 2–3 meses de historial real
generado por las features anteriores — por eso va después, no antes.

> ⏸️ **En el repo de referencia, esta feature quedó congelada** el
> 2026-08-27 (fuera del plan del dueño original por ahora, sin descartarla).
> No es una decisión que tengamos que heredar — la dejamos en el backlog
> normal salvo que prefieras congelarla también.

### 9. Fondo de crecimiento y ROI

Responde: *de lo que aparté, cuánto está "trabajando" y cuánto solo espera?*

Se apoya en Ahorro (Feature 6): sería un tipo de plan con retorno esperado,
para distinguir el ahorro que genera rendimiento del que es solo colchón.

> ⏸️ Congelada también en el repo de referencia, mismo 2026-08-27, por la
> misma razón que Reportes (arriba).

### 10. Notificaciones *(antes "Alertas")* — *siguiente*, especificado en `sprint-9-notificaciones.md`

Responde: *puede la app avisarme sin que tenga que entrar a mirar?*

Que la app avise sin tener que entrar a mirar: un fijo por vencer, un
presupuesto cerca del límite, un mes sin cerrar, una deuda vieja por cobrar,
y un recordatorio de anotar los gastos del día. Requiere que Presupuesto
(5) y Fijos (3) ya existan.

**Actualización del repo de referencia (Sprint 9, construido 2026-08-27):**
esta feature se especificó a fondo y cambió de forma respecto a la idea
original de "Alertas":

- **Canal: push del navegador**, no email ni panel dentro de la app —
  llega al celular y a la computadora aunque la app esté cerrada. Requiere
  convertir la mini-app en una PWA instalable (`manifest`, ícono, service
  worker) con su propio scope (`/finanzas/`), sin afectar al resto del hub.
- **Un switch por tipo de aviso**, configurable desde Ajustes.
- **Al momento, no en un resumen diario** — apenas ocurre el evento que lo
  dispara.
- **La misma lógica que usa la app**, nunca una copia: si `lib/finanzas/`
  decide cuándo un fijo está vencido para la pantalla, la función que evalúa
  las notificaciones importa esa misma lógica en vez de reimplementarla —
  para que la app y el aviso nunca digan cosas distintas.

**El hallazgo que vale la pena copiar, independiente de si construimos esta
feature ahora:** en un plan de hosting con límite de cron jobs (ej. Vercel
Hobby, un solo cron por día), la salida **no** es pelear por ese único slot.
Es usar **`pg_cron` + `pg_net` dentro de la propia base de Supabase** para
invocar una Edge Function con la frecuencia que haga falta (hasta cada
minuto) — el cron vive en Postgres, no en Vercel, así que no compite por el
slot de `vercel.json`. Vale para esta feature y para cualquier otro trabajo
programado que necesite el hub más adelante.

### 11. Reglas y automatismos

Responde: *puedo dejar que la app haga algo sola cuando pasa cierto evento?*

Ej.: "cada vez que entre el sueldo, aparta X automáticamente". Es el paso
natural después de tener fijos de ahorro (Feature 6) funcionando a mano —
sin especificar todavía.

> ⏸️ Congelada también en el repo de referencia (mismo 2026-08-27).

### 12. Perfiles — ✅ construido, ver `sprint-8-perfiles.md`

Responde: *puedo separar mis finanzas personales de las de un proyecto o
una empresa, sin abrir otra cuenta del hub?*

**No confundir con "multi-usuario" ni con la línea de "fuera de alcance"**
del §4 (finanzas compartidas *entre dos personas*): esto es que **un mismo
usuario** tenga varios cajones financieros completamente aislados entre sí
— personal, de un proyecto, de una empresa — cada uno con su propio
patrimonio, sus propias cuentas y categorías, sin mezclarse ni sumarse.
Sigue siendo una sola persona dueña de todos sus perfiles.

Del repo de referencia (Sprint 8, construido 2026-08-27):

- **Sin tipos.** No hay "personal" vs. "empresa" como enum — lo único que
  distingue a un perfil es su **nombre** y su **color de acento**. Cantidad
  sin límite.
- **Un perfil `default` indeleble** (no se borra ni se archiva nunca), que
  recibe todo lo que ya existía antes de que la feature llegara. Uno nuevo
  nace vacío, solo con las categorías semilla.
- **Aislamiento total, sin total consolidado.** El patrimonio de un perfil
  no se suma con el de otro en ninguna pantalla — se evaluó y se descartó a
  propósito, porque un total consolidado invita a tratar cuentas separadas
  como si fueran una sola bolsa.
- **Casi todas las tablas `fin_*` pasan a llevar `profile_id`** (cuentas,
  movimientos, categorías, deudas, fijos, presupuesto, ahorro...). Solo
  `fin_rates` y `fin_quotes` (la tasa del día, las cotizaciones de mercado)
  quedan fuera: son un hecho del mundo, no del cajón — y en nuestro caso
  siguen siendo por `user_id`, no globales de la app entera.
- **Los movimientos no se mueven entre perfiles.** Si algo se cargó en el
  perfil equivocado, se borra y se vuelve a cargar — no hay una operación de
  "mover".
- El perfil activo se recuerda **por dispositivo** (no viaja en la URL ni
  en el servidor), y cada uno tiene su propio color de acento para que sea
  imposible confundir en cuál estás parado antes de registrar algo.

**Encaja después de que el Sprint 1 esté sólido y en uso real** — es una
reestructuración de todas las tablas existentes (agregar `profile_id` y
migrar los datos ya cargados al perfil default), no algo que convenga
construir antes de tener datos reales que aislar.

> **Divergencia posterior (Sprint 10):** "sin tipos" duró hasta que el primer
> perfil de negocio real ("Cuerpos Sin Órganos") necesitó comportarse
> distinto de uno personal — ver Feature 13.

### 13. Perfiles de negocio — *siguiente*, especificado en `sprint-10-perfiles-de-negocio.md`

Responde: *si uno de mis perfiles es un negocio, puedo verlo como tal —
presupuestos por proyecto en vez de por mes, y en la moneda que uso de
verdad?*

**No viene del repo de referencia** — nace de un pedido directo sobre un
perfil de negocio real, ya con Perfiles (Feature 12) construido:

- `fin_profiles` gana `tipo` (`personal`/`negocio`) y `display_currency` — lo
  que el Sprint 8 dejó deliberadamente afuera, reabierto porque ahora sí hay
  comportamiento real que depende de ello, no solo estética.
- **Presupuesto por proyecto**, tabla nueva y separada del mensual (Feature
  5) — un proyecto no tiene mes, se etiqueta a un movimiento directo (no por
  categoría), tiene un monto objetivo, y se archiva a mano.
- **Ganancia neta por proyecto** y una tabla para **comparar proyectos**
  entre sí — las dos preguntas que se pidieron explícitamente al pensar qué
  sirve para leer las finanzas de un negocio chico.
- **Ahorro se relabela** a "Fondos de ahorro" en un perfil de negocio — mismo
  mecanismo del Sprint 6, sin tabla nueva.
- **Moneda de visualización por perfil** — independiente de `tipo`: convierte
  todo total agregado (no lo guardado) a la moneda que ese perfil elija, con
  la tasa del día.

---

## 4. Fuera de alcance (para todas las features, no solo la 1)

| Fuera | Razón |
|---|---|
| Pasanaku / ahorro rotativo grupal | Descartado para este hub — no aplica al caso de uso actual |
| Import de movimientos bancarios | Contradice la invariante de entrada 100% manual (§2) |
| Auto-categorización con IA | Sin datos reales de uso, es adivinar |
| Finanzas de "hogar" o compartidas **entre dos usuarios distintos** del hub | Cada usuario es dueño exclusivo de sus propios datos (§1); una feature de finanzas compartidas entre personas sería un diseño aparte, no una extensión de este modelo. **No confundir con Perfiles (ítem 12 de §3)**, que es un solo usuario con varios cajones propios, no una cuenta compartida entre dos personas |
