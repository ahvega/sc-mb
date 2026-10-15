# Inscripciones STORYCRAFTERS: guía de instalación

El formulario de la landing (`site/js/inscripcion.js`) habla con un script de Google (`backend-inscripciones.gs`) que:

- cobra con **PayPal** (en dólares: US$ 64, 72 u 82 según la fecha; estudiantes US$ 64),
- guarda cada inscripción en una hoja de Google y envía el correo de confirmación,
- recibe las **fotos de carné** de los estudiantes; Claude aprueba o rechaza los casos claros y el equipo revisa los dudosos.

No hay transferencias bancarias: cada persona hace **un solo pago** en línea.

## Cómo funciona la tarifa de estudiante

1. En la landing, el estudiante elige **Soy estudiante**, llena sus datos y sube la foto de su carné. **No paga todavía.**
2. La solicitud aparece en la pestaña **Estudiantes** de la hoja (con enlace a la foto, guardada en una carpeta privada de tu Drive).
3. **Claude revisa el carné al instante** (si `REVISAR_CON_CLAUDE = true` y guardaste la clave, paso 2.6):
   - Carné estudiantil legible, nombre que coincide y **vigente hoy** → lo aprueba solo.
   - Legible pero **vencido** → lo rechaza solo; la página le ofrece inscribirse con la tarifa vigente.
   - Cualquier duda (no se ve la fecha, foto borrosa, nombre distinto, no parece carné) → queda **Pendiente** y te llega un aviso a `CORREO_EVENTO`.
   Lo que Claude vio queda escrito en la columna **Revisión de Claude**.
4. Para los pendientes, revisas la foto y cambias **Estado** a **Aprobado** o **Rechazado**. Si rechazas, puedes escribir el motivo en **Notas** antes: se incluye en el correo. También puedes corregir una decisión de Claude cambiando el Estado.
5. Al aprobar, el script le envía al estudiante un enlace personal (`?estudiante=CÓDIGO`) que abre directo el pago de US$ 64. El enlace sirve **una sola vez** y solo para esa persona.

Sin un carné aprobado no se puede pagar la tarifa de estudiante: el script lo rechaza aunque alguien intente saltarse la página.

## Instalación (una sola vez)

### 1. PayPal: crear la app y obtener las claves
1. Entra a <https://developer.paypal.com> con tu cuenta **PayPal Business**.
2. Ve a **Apps & Credentials**. Arriba elige **Sandbox** (pruebas) primero.
3. Toca **Create App**, ponle de nombre "STORYCRAFTERS" y créala.
4. Verás un **Client ID** y un **Secret**. Los vas a pegar en el paso 2.5. **No los mandes por chat.**
5. Cuando termines de probar, repite en **Live** para tener las claves reales.

### 2. Google: instalar el script
1. Entra a <https://script.google.com> con la cuenta de Gmail que enviará los correos y tocará la hoja.
2. Abre el proyecto donde ya pegaste el script (o crea uno con **Nuevo proyecto**) y reemplaza todo el código por el de `backend-inscripciones.gs`. Guarda.
3. Revisa arriba del código: `WHATSAPP_EQUIPO`, `CORREO_EVENTO`, `TARIFAS` (precios en dólares) y cupos.
4. En la barra de arriba elige la función **instalar** y toca **Ejecutar**. Google te pedirá permisos (hoja, Drive y correo): acéptalos. En el registro aparecerá el enlace de la hoja.
5. Elige la función **guardarCredencialesPayPal**, pega tu Client ID y tu Secret donde dice `PEGA_AQUI`, deja `'sandbox'` y toca **Ejecutar**. Luego **borra** el Client ID y el Secret del código y guarda.
6. Revisión con Claude: crea una clave en <https://platform.claude.com> (**API keys → Create key**; necesitas una cuenta con saldo, cada revisión cuesta centavos). Elige la función **guardarClaveClaude**, pega la clave donde dice `PEGA_AQUI_TU_CLAVE`, toca **Ejecutar** y luego **bórrala** del código y guarda. Si no quieres revisión automática, pon `REVISAR_CON_CLAUDE = false`.
7. Toca **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**. Toca **Implementar** y copia la URL que termina en `/exec`.

### 3. Conectar la landing
En `site/index.html`, en el bloque `<div class="panel insc" id="insc" ...>`:

- `data-apps-script-url="..."`: la URL `/exec` del paso 2.7.
- `data-paypal-client-id="..."`: el **Client ID** de PayPal (este sí es público; el Secret nunca va en la página).

Mientras estén vacíos, la página publicada muestra "La inscripción en línea abre muy pronto", y en tu computadora (localhost) funciona en modo demo sin cobrar.

### 4. Probar y abrir inscripciones
1. Con las claves **Sandbox**, haz una inscripción de prueba en la landing con una cuenta de prueba de PayPal (Sandbox → **Accounts**).
2. Prueba también el camino de estudiante: sube un carné, apruébalo en la hoja y paga con el enlace del correo.
3. Para cobrar de verdad: corre otra vez **guardarCredencialesPayPal** con las claves **Live** y `'live'`, cambia `MODO_PRUEBA` a `false`, y en **Implementar → Gestionar implementaciones** edita la implementación y elige **Nueva versión** (así la URL no cambia). En la landing cambia el Client ID por el de Live.

Cada vez que cambies el código del script, publica una **Nueva versión** de la misma implementación; si no, la landing sigue usando la anterior.
