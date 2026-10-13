# Guía: crear los Formularios de Google de inscripción

Complementa `docs/PLAN-INSCRIPCION.md` (§4 define los campos y el porqué). Aquí está el **cómo**: primero el camino rápido con script y después el camino manual completo.

Hay dos formularios: **Individual** (3 secciones) y **Grupal** (responsable + hasta 10 participantes + cierre).

---

## 1. Camino rápido: script de Google Apps Script (≈ 10 minutos)

Archivo: [`tools/google-forms/crear-formularios.gs`](../tools/google-forms/crear-formularios.gs). Crea los dos formularios completos, con ramificación y mensajes de confirmación, usando el servicio `FormApp` de Google. No hay nada que instalar y no necesita claves.

1. Entra a <https://script.google.com> **con la cuenta de Google que será dueña de los formularios** (decisión Q12 del plan).
2. **Nuevo proyecto**. Borra el contenido de `Código.gs`, pega el archivo completo y pulsa **Guardar** (nómbralo `Storycrafters formularios`).
3. Revisa el bloque `CONFIG` al inicio:

| Constante | Qué poner |
|---|---|
| `URL_PAGO` | `https://sc.themediabuilders.com/#pagar` (ya viene así) |
| `PLAZO_CONFIRMACION` | El plazo prometido. Por defecto `48 horas`; confírmalo con el dueño. |
| `URL_GUIA_TALLAS` | Enlace a la guía de tallas, o vacío. |
| `POLITICA_TEXTO` | **Debe redactarlo el dueño** (Q17). Mientras diga `[PENDIENTE]` el script lo avisa al final. |
| `MAX_GRUPO` | 10 por defecto. Si lo cambias, también cambia el máximo del enlace de PayPal. |
| `TALLAS`, `COMO_SE_ENTERO` | Listas de opciones. |

4. En la barra superior elige la función **`crearFormularios`** → **Ejecutar**.
5. La primera vez Google pide permisos ("Revisar permisos" → tu cuenta → *Avanzado* → *Ir a Storycrafters formularios (no seguro)* → *Permitir*). Es normal: es tu propio script y solo pide acceso a Formularios.
6. Abre **Ver → Registros** (o *Registro de ejecución*). Aparecen cuatro URLs: *editar* y *publicar* de cada formulario. Copia las de **publicar** (`https://docs.google.com/forms/d/e/…/viewform`); son las que van en la landing.

> Cada ejecución crea formularios **nuevos**; no modifica los anteriores. Si te equivocas, borra los sobrantes en Google Drive y vuelve a ejecutar.

### Qué hace el script (y qué no)

Hace: título y descripción; correo obligatorio; todas las preguntas y validaciones de §4 del plan; la ramificación del individual (estudiante → carné; resto lo salta); el bucle del grupal (Participante 1…10 con "¿Agregar otro participante?" → Sí/No); casillas de consentimiento obligatorias; mensaje de confirmación con el enlace de pago.

No hace: vincular la hoja de respuestas (§4 de esta guía), publicar el formulario ni acortar el enlace; son 2 clics cada uno.

Nota técnica: en cada sección, la pregunta que ramifica ("Soy…" y "¿Agregar otro participante?") se coloca **al final** porque Google aplica la ramificación al terminar la sección.

### Estado de verificación del script

Verificado con una simulación local del servicio `FormApp` que reproduce el cableado: 3 secciones y 1 ramificación en el individual (Estudiante → carné; el resto salta a facturación); 12 secciones y 8 ramificaciones en el grupal (del participante 2 al 9: Sí → siguiente, No → cierre); casillas de consentimiento obligatorias de una sola opción; URL de pago en ambos mensajes. **No lo pude ejecutar contra Google** desde este entorno, así que la primera ejecución real es la prueba definitiva: sigue la lista del §5 antes de publicar.

---

## 2. Camino manual: Formulario Individual

1. <https://forms.google.com> → **Formulario en blanco**. Título: `Inscripción individual · STORYCRAFTERS`. Descripción: evento, fecha y sede.
2. ⚙ **Configuración**:
   - *Respuestas* → activar **Recopilar direcciones de correo electrónico** (queda obligatorio). Elige la variante que pide el correo escrito por la persona; la que exige iniciar sesión en Google aleja a quien no tiene cuenta. Los nombres exactos de las opciones cambian con las versiones de Forms.
   - *Presentación* → **Mostrar barra de progreso**; desactivar *Mostrar enlace para enviar otra respuesta*.
   - *Respuestas* → desactivar *Permitir editar respuestas*; **no** activar *Limitar a 1 respuesta* (eso obliga a iniciar sesión).
   - *Presentación* → **Mensaje de confirmación**: pega el texto de §4.1 del plan, con la URL `https://sc.themediabuilders.com/#pagar`.
3. **Sección 1 "Tus datos"** (ya existe por defecto). Agrega, en este orden, todas **obligatorias** salvo indicación:
   1. *Nombre y apellidos completos* — Respuesta corta. Descripción: "Tal como quieres que aparezca en tu diploma".
   2. *WhatsApp o teléfono* — Respuesta corta → ⋮ **Validación de respuestas** → Expresión regular → `^[+0-9][0-9 ()-]{6,19}$`.
   3. *Ciudad y país* — Respuesta corta.
   4. *Universidad o empresa que representas* — Respuesta corta.
   5. *Talla de camiseta* — Varias opciones: XS, S, M, L, XL, XXL.
   6. *Restricciones alimentarias o de accesibilidad* — Párrafo, **opcional**.
   7. *¿Cómo te enteraste del evento?* — Desplegable, **opcional**.
   8. *Soy…* — Desplegable: Estudiante / Profesional o independiente / Empresa u organización. **Debe ser la última pregunta de la sección.**
4. Botón **Agregar sección** (ícono de dos rectángulos) → **Sección 2 "Datos de estudiante"**: pregunta *Número de carné estudiantil* (obligatoria) y descripción: "Deberás presentar tu carné vigente el día del evento".
5. **Agregar sección** → **Sección 3 "Facturación y autorizaciones"**:
   1. *¿Necesitas factura?* — Varias opciones: No / Sí (obligatoria).
   2. *Nombre o razón social* y *RTN* — Respuesta corta, opcionales.
   3. Tres **Casillas** obligatorias, cada una con **una sola opción**: política de reembolso, uso de imagen, tratamiento de datos.
6. **Ramificación:** vuelve a la pregunta *Soy…* → ⋮ (abajo a la derecha) → **Ir a la sección según la respuesta**:
   - Estudiante → *Sección 2*.
   - Profesional o independiente → *Sección 3*.
   - Empresa u organización → *Sección 3*.
7. Al pie de la **Sección 2**, verifica que diga *Después de la sección 2: Continuar a la siguiente sección*.

## 3. Camino manual: Formulario Grupal

1. Mismos ajustes del paso 2 anterior; título `Inscripción grupal (2 o más) · STORYCRAFTERS`; mensaje de confirmación de §4.2 del plan.
2. **Sección 1 "Responsable del grupo"**: nombre completo, teléfono (misma validación), universidad o empresa del grupo, *¿Necesitas factura?*, nombre/razón social y RTN (opcionales).
3. **Sección 2 "Participante 1"**. Preguntas (todas obligatorias salvo las indicadas):
   - Nombre y apellidos completos (como aparecerá en el diploma).
   - Correo del participante — Respuesta corta → Validación → **Texto → Dirección de correo electrónico**.
   - *Participante 1 es…* — Desplegable con los 3 tipos.
   - Universidad o empresa — opcional ("Solo si es distinta a la del grupo").
   - Número de carné — opcional ("Obligatorio si es estudiante").
   - Talla de camiseta — Varias opciones.
   - Restricciones alimentarias — Párrafo, opcional.
   - **No** pongas *¿Agregar otro participante?* en esta sección (el mínimo es 2).
4. **Duplicar la sección**: en el encabezado de la sección → ⋮ → **Duplicar sección**. Renombra a `Participante 2`, y así hasta `Participante 10`. En la **2 a la 9** agrega al final la pregunta **¿Agregar otro participante?** (Varias opciones, obligatoria: *Sí* / *No*). En la **10** no se agrega.
5. **Sección final "Cierre y autorizaciones"**: lista *Confirma cuántos participantes registraste* (2…10), y 3 casillas obligatorias (política, imagen de todos, datos).
6. **Cablear el bucle.** En cada pregunta *¿Agregar otro participante?* → ⋮ → **Ir a la sección según la respuesta**:

| Pregunta en… | Sí → | No → |
|---|---|---|
| Participante 2 | Participante 3 | Cierre y autorizaciones |
| Participante 3 | Participante 4 | Cierre y autorizaciones |
| … | … | Cierre y autorizaciones |
| Participante 9 | Participante 10 | Cierre y autorizaciones |

   Participante 1 continúa solo a Participante 2; Participante 10 continúa solo al cierre.

---

## 4. Después de crear (ambos caminos)

1. **Hoja de respuestas.** En cada formulario → pestaña **Respuestas** → ícono verde de Hojas → **Crear una hoja de cálculo nueva**. Después, en esa hoja, agrega una pestaña **Pagos** con: correo, cantidad pagada, monto USD, fecha, ID de transacción PayPal, estado. Compártela solo con las personas del Q12.
2. **Notificaciones.** Respuestas → ⋮ → **Recibir notificaciones por correo de las respuestas nuevas**.
3. **Publicar** (la pestaña *Publicar* o el botón **Publicar**). Si lo creaste con el script o la API, este paso es obligatorio: los formularios creados por programa después del 30-jun-2026 pueden nacer sin publicar.
4. **Enlace.** Botón **Enviar** → ícono de enlace → **Acortar URL** (`https://forms.gle/…`). Estos dos enlaces son los que se pegan en `site/index.html` (`#cta-individual` y `#cta-group`) cuando se implemente el plan.
5. **Respuestas prellenadas (opcional, fase 2).** ⋮ → **Obtener enlace prellenado**: sirve para pasar datos al formulario por la URL (`?entry.<id>=valor`).

## 5. Lista de pruebas antes de abrir ventas

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | Individual como **estudiante** | Pasa por la sección de carné; el carné es obligatorio |
| 2 | Individual como **profesional** | **Salta** la sección de carné |
| 3 | Individual con factura = Sí | Se aceptan nombre y RTN; sin factura se pueden dejar vacíos |
| 4 | Intentar enviar sin marcar una casilla de consentimiento | El formulario no deja |
| 5 | Grupal con **2** participantes | Participante 2 → "No" → llega al cierre |
| 6 | Grupal con **3** participantes | Participante 2 → "Sí" → Participante 3 → "No" → cierre |
| 7 | Grupal con **10** participantes | Del 9 ("Sí") al 10 y de ahí directo al cierre |
| 8 | Correo de participante inválido (`abc`) | Error de validación |
| 9 | Teléfono con letras | Error de validación |
| 10 | Mensaje de confirmación | Aparece la URL de pago y es un enlace clicable (si no lo es, ver §11-4 del plan) |
| 11 | Hoja de respuestas | Cada envío agrega una fila; los participantes quedan en columnas separadas |

Si algo falla en el grupal, revisa primero el cableado de §3-6: un solo "Sí" o "No" apuntando a la sección equivocada rompe el bucle.
