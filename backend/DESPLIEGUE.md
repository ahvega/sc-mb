# Redeploy del backend de inscripciones (issue #20) — guía para el propietario

Solo el dueño de la cuenta Google puede hacer esta parte. ~30 minutos. No hace falta saber programar:
todo es copiar/pegar y marcar casillas. **Hazlo en tu cuenta de Google con acceso a la hoja "Inscritos"**.

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

## Prompt para tu sesión local de Claude (parte del repo)

Cuando tengas la URL `/exec` nueva, pégale esto a Claude en el repo `sc-mb`:

> En `site/index.html` actualiza el atributo `data-apps-script-url` del bloque `#insc` con la
> URL `/exec` nueva que te doy: `<PEGA AQUÍ LA URL>`. Verifica que sea el único lugar donde
> aparece la URL vieja (grep por `script.google`), haz commit en una rama
> `chore/20-exec-url--user` con mensaje explicando el redeploy del backend (#20), abre el PR
> y fusiónalo. Después confirma en la hoja que una preinscripción de prueba llega bien.
