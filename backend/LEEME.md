# Inscripciones STORYCRAFTERS: guía de instalación

El formulario de la landing (`site/js/inscripcion.js`) habla con un script de Google (`backend-inscripciones.gs`) que:

- cobra con **PayPal** (en dólares: US$ 64, 72 u 82 según la fecha; estudiantes US$ 64) o registra el pago por **transferencia bancaria** con foto del comprobante,
- guarda cada inscripción en una hoja de Google con `Estatus de Pago = Pendiente` y envía los correos,
- recibe las **fotos de carné** de los estudiantes; Claude aprueba o rechaza los casos claros y el equipo revisa los dudosos.

**Ningún pago se confirma solo:** una persona autorizada revisa el abono real en PayPal o en el banco y lo aprueba desde el menú **STORYCRAFTERS ▸ Confirmar pago verificado** dentro de la hoja.

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

## Cómo se confirma un pago a mano (transferencia, o PayPal que no se pudo vincular solo)

**Forma rápida (recomendada):** revisa en PayPal o en el banco que el dinero llegó; luego, en la pestaña **Inscritos**, en la fila de esa persona, elige **Confirmado** en la columna **Estatus de Pago**. Listo: pasa a `Completado`, sale la bienvenida y la landing resta un lugar. Solo funciona si tu correo está en `OPERADORES`; si no, la celda vuelve a `Pendiente` y `Estado de gestión` dice por qué. La referencia queda como `MANUAL-<Registration ID>` y en **Auditoría** queda quién confirmó. El monto que se registra es el de la tarifa (USD por PayPal, HNL por transferencia). Si Google no revela tu correo al disparador (pasa con cuentas Gmail que no son las que instalaron el script), usa el menú de abajo.

**Forma con datos (menú):**

1. La persona llena el formulario y sus datos se guardan en **Inscritos** con `Estatus de Pago` = `Pendiente` y un `Registration ID` propio.
2. Paga con el botón de PayPal de su tarifa, o elige **Transferencia**: la página le muestra los datos bancarios (solo si los configuraste, ver abajo) y le pide la foto del comprobante.
3. **Tú verificas el dinero de verdad**: entras a PayPal o a la app del banco y compruebas que el abono existe con el monto y la moneda correctos. La foto del comprobante **no prueba** que el dinero llegó.
4. En la hoja **Inscritos**, selecciona la fila de esa persona y usa el menú **STORYCRAFTERS ▸ Confirmar pago verificado**. Marca la casilla de que verificaste el abono, escribe la referencia (transacción PayPal o referencia bancaria), monto y moneda. El sistema audita quién confirmó y cuándo.
5. Al confirmar, `Estatus de Pago` pasa a `Completado`, el lugar queda ocupado y sale la **bienvenida** por correo. El WhatsApp de bienvenida queda como tarea `manual` en la pestaña **Notificaciones** (no hay envío automático).

⚠️ **Escribir la referencia a mano en la celda ya no confirma nada**: queda marcado como "Edición manual sin verificación" en `Estado de gestión` y se registra en **Auditoría**. La misma referencia no puede usarse para dos personas.

Las filas `Pendiente` no ocupan cupo ni salen en **Gafetes**. Si alguien se inscribe dos veces, verás dos filas pendientes con su correo: deja la que coincida con el pago y borra la otra.

## Pagos con PayPal: bienvenida automática

Los pagos con PayPal (saldo o tarjeta de crédito/débito) **se confirman solos**: PayPal avisa al script (IPN), el script le pregunta a PayPal si el aviso es auténtico, busca la fila `Pendiente` del mismo monto con el **mismo correo** (o, si no, el mismo nombre y apellido de una sola persona) y la pasa a `Completado` con `Verificado por` = `PayPal (automático)`. La bienvenida sale en ese momento.

Si no logra saber de quién es el pago (correo y nombre distintos, monto distinto), deja el pago en **Acreditaciones** como `Sin inscripción — revisar` y te escribe a storycrafters@themediabuilders.com. Ahí lo confirmas tú con el menú, usando la transacción del correo. Las transferencias siguen siendo 100 % manuales.

Configuración (una sola vez):

1. **Propiedad del script** `PAYPAL_RECEPTOR`: el correo principal de la cuenta PayPal Business de Media Builders (o su Merchant ID). Sin esto no se acredita nada solo.
2. **En PayPal**: Configuración de la cuenta → **Notificaciones** → **Notificaciones instantáneas de pago (IPN)** → Elegir configuración de IPN → URL de notificación = la URL `/exec` del script → **Recibir mensajes IPN (Habilitado)** → Guardar.
3. Vuelve a implementar el script (Implementar → Gestionar implementaciones → editar → Nueva versión) para que la URL `/exec` tenga este código.

Para probar con el simulador de IPN de PayPal (sandbox), pon temporalmente `PAYPAL_IPN_PRUEBAS` = `si`; quítala al terminar. Nota: Apps Script contesta a PayPal con una redirección (302), así que en el historial de IPN de PayPal puede aparecer "reintentando" aunque el pago ya se haya acreditado; los reintentos no duplican nada.

## Configurar operadores y transferencias

El script debe estar **vinculado a la hoja** para que el menú aparezca: abre la hoja de inscritos → **Extensiones → Apps Script** → pega ahí el código (o migra el proyecto existente). Conserva la propiedad `HOJA_ID`.

En **Propiedades del script** (⚙️ Configuración del proyecto → Propiedades del script):

- `OPERADORES`: correos Google de quienes pueden confirmar pagos, separados por coma (ej. `tu-correo@gmail.com,otro@themediabuilders.com`). Sin esto, nadie puede confirmar.
- `TRANSFERENCIAS_HABILITADAS`: escribe `si` para activar la opción en la página.
- `BANCO_NOMBRE`, `BANCO_TITULAR`, `BANCO_TIPO`, `BANCO_CUENTA`: los datos que el participante verá. **Nunca los pongas en el código ni en el repo.** Para pruebas usa la cuenta temporal solo en el despliegue de pruebas, jamás en producción.

Cuando el cupo se llena, la página cambia sola a la **lista de espera** (nombre, correo y WhatsApp en la pestaña "Lista de espera") para avisar del próximo evento.

## Instalación (una sola vez)

> **Redeploy desde la versión anterior:** sigue `backend/DESPLIEGUE.md` (paso a paso para el
> propietario: vincular el script a la hoja, props `OPERADORES`/`BANCO_*`, `instalar`, `migrar`,
> prueba de humo y rollback).

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
