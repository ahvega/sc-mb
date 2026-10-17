# Redeploy del backend de inscripciones (issue #20) — guía para el propietario

Solo el dueño de la cuenta Google puede hacer esta parte. ~30 minutos. **Hazlo en tu cuenta de
Google con acceso a la hoja "Inscritos"**.

**Dos formas de hacerlo:** manual (pasos 1–8 de abajo — todo es copiar/pegar y marcar casillas,
sin saber programar) o asistida (pegar el **Prompt** del final en tu sesión local de Claude y
dejar que maneje el navegador por ti; tú solo haces el login y apruebas permisos).

## Lo que cambia (por qué hay que redistribuir)

- El script nuevo debe estar **vinculado a la hoja** para que aparezca el menú
  **STORYCRAFTERS ▸ Confirmar pago verificado** (la única forma válida de confirmar pagos).
- La hoja se migra sola con nuevas columnas y pestañas operativas (`Intentos de Pago`,
  `Acreditaciones`, `Notificaciones`, `Auditoría`, `Lista de espera`). **No borra nada.**
- La web app `/exec` conserva la misma función; si la URL cambia, se actualiza la landing.

## Paso 1 · Abrir el editor vinculado a la hoja

1. Abre la hoja de cálculo **Inscritos** (la misma de siempre).
2. Menú **Extensiones → Apps Script**.
3. Se abre un proyecto nuevo en blanco (o el que ya esté vinculado). Renómbralo
   `Inscripciones STORYCRAFTERS` (icono lápiz arriba a la izquierda).

## Paso 2 · Pegar el código

1. En el editor, abre el archivo `Code.gs` y **borra todo su contenido**.
2. Copia **completo** `backend/backend-inscripciones.gs` del repo (rama `main`) y pégalo.
3. Guarda (Ctrl+S).

## Paso 3 · Propiedades del script

En el editor: ⚙️ **Configuración del proyecto** → sección **Propiedades del script** → agrega/verifica:

| Propiedad | Valor | Obligatoria |
|---|---|---|
| `HOJA_ID` | El ID largo de la hoja (lo que va entre `/d/` y `/edit` en su URL) | Sí |
| `OPERADORES` | Correos Google de quienes pueden confirmar pagos, separados por coma | Sí — sin esto nadie confirma |
| `CLAUDE_API_KEY` | La misma de antes (revisión de carnés) | Solo si usan revisión automática |
| `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` | Los de la app PayPal | Solo para consulta admin |
| `TRANSFERENCIAS_HABILITADAS` | `si` — **solo en el despliegue de pruebas** | No — ver Paso 7 |
| `BANCO_NOMBRE` / `BANCO_TITULAR` / `BANCO_TIPO` / `BANCO_CUENTA` | Datos de la cuenta | Solo si el de arriba es `si` |

**Nunca** pongas la cuenta de producción en estas props hasta el Paso 7. La cuenta temporal de
pruebas va SOLO en el despliegue de sandbox.

## Paso 4 · Instalar y migrar

1. En el editor, selecciona la función `instalar` en el desplegable de arriba → **Ejecutar**.
2. Te pedirá autorizaciones (hojas, Drive, correo, conexiones externas) → Revisar permisos → tu
   cuenta → Avanzado → Ir al proyecto → Permitir.
3. Vuelve a ejecutar `instalar` si la primera corrida solo autorizó.
4. Verifica en la hoja: deben existir las pestañas `Intentos de Pago`, `Acreditaciones`,
   `Notificaciones`, `Auditoría`, `Lista de espera`, y `Inscritos` debe tener columnas nuevas al
   final (`Registration ID`, `Estatus de Pago`, …).
5. Ejecuta `migrar` (mismo desplegable → Ejecutar). Las filas viejas pagadas quedan `Completado`
   y las pendientes quedan `Pendiente` — revísalo de un vistazo.
6. Recarga la hoja → debe aparecer el menú **STORYCRAFTERS** en la barra (si no, es que el
   script no quedó vinculado: vuelve al Paso 1 y revisa que abriste el editor desde la hoja).

## Paso 5 · Publicar la web app

1. Arriba a la derecha: **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web** → "Ejecutar como: **Yo**" → "Quién tiene acceso: **Cualquier persona**"
   (la landing es pública).
3. Implementar → copia la URL que termina en `/exec`.

> Si el proyecto viejo era standalone y seguía en uso: puedes dejarlo intacto como respaldo —
> la página pasará a usar la URL nueva del proyecto vinculado.

## Paso 6 · Apuntar la landing a la URL nueva

Si la URL `/exec` es distinta de la anterior, hay que cambiarla en `site/index.html` en el
atributo `data-apps-script-url` del bloque `#insc` y hacer push a `main`. Pídeselo a tu sesión
de Claude con el prompt de abajo — es un cambio de una línea.

## Paso 7 · Activar transferencias (solo cuando la cuenta sea la real)

Cuando tengas la cuenta definitiva de Media Builders (NO la temporal de pruebas):

1. En props del script **del despliegue de producción**: `TRANSFERENCIAS_HABILITADAS = si` +
   `BANCO_*` reales.
2. Guardar. No hace falta republicar: las props se leen en caliente.
3. Prueba una transferencia de L 1 contigo mismo antes de anunciarlo.

## Paso 8 · Prueba de humo (5 minutos)

1. Abre la landing → llena el formulario con correo tuyo de prueba → debe abrirse la ventana
   con **dos opciones**: tarjeta y transferencia.
2. En la hoja: fila nueva con `Estatus de Pago = Pendiente` y `Registration ID` lleno.
3. En la hoja, selecciona esa fila → menú **STORYCRAFTERS ▸ Confirmar pago verificado** → marca
   la casilla, referencia `TEST-1`, monto y moneda de la tarifa → Confirmar.
4. La fila debe pasar a `Completado`, aparecer una fila en `Acreditaciones` y `Auditoría`, y
   llegar el correo de bienvenida a tu correo de prueba.
5. Si algo falla: verifica `OPERADORES` (tu correo Google exacto) y que ejecutaste `instalar`.

## Rollback

- **Web app**: Implementar → Administrar implementaciones → versión anterior → activar de nuevo.
- **Hoja**: las columnas nuevas no estorban si vuelves al script viejo (las ignora); las pestañas
  nuevas puedes ocultarlas.
- **Respaldo**: conserva el proyecto standalone anterior sin tocar hasta que la prueba de humo
  salga bien.

---

## Prompt para tu sesión local de Claude (redeploy asistido por navegador)

Pégale esto a Claude en el repo `sc-mb`. Claude abrirá tu Chrome, tú haces el login de Google y
apruebas los permisos; él hace el resto por el navegador:

> Abre una sesión CDP de Chrome con la skill `browser-testing` para que yo haga login en mi
> cuenta de Google (script.google.com) — espera a que yo confirme que ya entré. Luego usa ese
> Chrome para redistribuir el backend nuevo del issue #20, siguiendo `backend/DESPLIEGUE.md`:
>
> 1. Desde mi hoja "Inscritos" abre Extensiones → Apps Script (proyecto vinculado; así aparece
>    el menú STORYCRAFTERS). Si no sabes cuál hoja es, pídeme el link.
> 2. En Code.gs pega el contenido COMPLETO de
>    https://raw.githubusercontent.com/ahvega/sc-mb/main/backend/backend-inscripciones.gs
>    (descárgalo con curl; el editor usa CodeMirror — pega vía portapapeles, no tipees).
> 3. En Propiedades del script configura: HOJA_ID (de la URL de la hoja), OPERADORES (mi correo
>    Google — te lo doy yo), CLAUDE_API_KEY solo si ya existía en el proyecto viejo.
>    NO pongas TRANSFERENCIAS_HABILITADAS ni BANCO_* en producción: la cuenta real aún no está
>    (gate G5). Si hago un despliegue de pruebas aparte, ahí sí va la cuenta temporal.
> 4. Ejecuta `instalar` y `migrar` desde el editor; yo apruebo las autorizaciones OAuth cuando
>    salgan. Verifica en la hoja que aparecieron las pestañas operativas y el menú STORYCRAFTERS.
> 5. Si el proyecto viejo ya tiene la web app publicada: Implementar → Administrar → nueva
>    versión (la URL /exec NO cambia). Si es proyecto nuevo: Nueva implementación → web app
>    "Ejecutar como Yo" / "Cualquier persona" → captura la URL /exec.
> 6. Si la URL cambió: actualiza `data-apps-script-url` en `site/index.html` (es el único lugar,
>    verifícalo con grep), rama `chore/20-exec-url--user`, PR a main y merge.
> 7. Corre la prueba de humo del paso 8 de la guía contra la landing y repórtame el resultado.
>
> En cada paso que falle o pida algo manual (login, OAuth, captcha) PAUSA y pídemelo — no
> intentes saltártelo.
