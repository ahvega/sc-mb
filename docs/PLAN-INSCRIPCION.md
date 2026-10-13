# Plan: inscripción Individual y Grupal con pago PayPal

Estado: **plan completo, listo para implementar con valores por defecto**; las preguntas abiertas están en el §12 y se le hacen al dueño al comenzar la implementación. No implementado. Fecha: 2026-10-13.
Alcance: `site/` (landing), 2 Formularios de Google, enlaces de pago de PayPal. Sin backend en la fase 1.

---

## 1. Resumen ejecutivo

Se agregan dos rutas de inscripción en la landing: **Individual** y **En grupo (2 o más)**, esta última con descuento y visualmente protagonista. Cada ruta lleva a su propio Formulario de Google (casi iguales). Al terminar el formulario, la persona va a pagar con un enlace de PayPal que **multiplica el precio unitario por la cantidad de personas**.

### Lo que se pidió y lo que Google Forms realmente permite

La petición decía: *"al final del formulario un botón de pago que multiplique el valor unitario por el número de participantes, calculado on-the-fly, enviado a PayPal con el valor prepoblado"*. Verificado contra la documentación y las guías de Forms:

| Pedido | ¿Se puede en Google Forms? | Qué hacemos |
|---|---|---|
| Botón de pago dentro del formulario | **No.** Forms no admite botones personalizados ni JavaScript. El único texto "activo" es el mensaje de confirmación (texto fijo, igual para todas las respuestas). | El botón vive en la landing (`#pagar`); el mensaje de confirmación del formulario lleva a esa sección. |
| Sección repetitiva "Participante 1, 2, 3…" | **No existe** como función. Sí existe la ramificación "Ir a la sección según la respuesta" (solo en pregunta de opción múltiple o lista desplegable). | Se simula el bucle: cada sección de participante termina con "¿Agregar otro participante?" → Sí (siguiente sección) / No (ir al cierre). |
| Calcular total = precio × personas y pasarlo a PayPal | **No** en Forms. | **PayPal lo calcula**: un enlace de pago con *selector de cantidad* multiplica el precio unitario por la cantidad elegida y cobra con tarjeta de débito/crédito o PayPal. Cero código. |

Conclusión: se logra el objetivo (inscripción → pago con total calculado → tarjeta) **sin código a medida**, moviendo el botón de pago de "dentro del formulario" a "justo después del formulario". La fase 2 (opcional) es un cálculo exacto con backend PHP, descrita en el §9.

### Decisiones abiertas y valor por defecto con el que se implementa

| # | Decisión | Valor por defecto (se usa si el dueño no responde distinto) |
|---|---|---|
| D1 | % de descuento grupal | **10 %** sobre el precio individual vigente, redondeado a L 5. Es un parámetro (`data-group-discount`), se cambia en un solo lugar. |
| D2 | Moneda de cobro | **USD.** No encontré HNL entre las monedas en que PayPal permite *cobrar* (verifícalo en tu panel: Configuración → Moneda). La landing sigue en lempiras y muestra "≈ US$ X" con una tasa fija que tú defines. |
| D3 | Estudiantes en grupo | La tarifa de estudiante (L 1,700 todo el tiempo) aplica **solo en inscripción individual**. En grupo todos pagan la tarifa grupal; el carné se pide igual en el formulario para validarlo el día del evento. |
| D4 | Tamaño máximo de grupo | **10** (el selector de PayPal admite un máximo; más de 10 → contacto directo). |
| D5 | Comisión de PayPal | Decidir si se **absorbe** o se **suma** al precio en USD. Consulta la tabla de comisiones de tu cuenta; incluye comisión por transacción y conversión de moneda. |
| D6 | Política de reembolso / transferencia de cupo | Sigue pendiente (`[POLÍTICA PENDIENTE]` en FAQ). El formulario exige aceptarla; hay que redactarla antes de abrir ventas. |
| D7 | Transferencia bancaria como método alterno | **Conservarla** (solo individual) por si PayPal rechaza tarjetas locales; requiere banco/cuenta y plazo de verificación [48 H]. |

Las preguntas completas, con su impacto, están en el **§12**.

---

## 2. Arquitectura (fase 1)

```
Landing #inscripcion
  ├─ Tarjeta GRUPAL (destacada) ──► Formulario Grupal ─┐
  └─ Tarjeta INDIVIDUAL ──────────► Formulario Individual ─┤
                                                           ▼
                        Mensaje de confirmación del formulario:
                        "Paga aquí → https://sc.themediabuilders.com/#pagar"
                                                           ▼
Landing #pagar  (el script elige el enlace de la tarifa VIGENTE hoy)
  ├─ [Pagar individual]  ──► PayPal Payment Link, cantidad fija 1
  ├─ [Pagar estudiante]  ──► PayPal Payment Link, cantidad fija 1
  └─ [Pagar grupo]       ──► PayPal Payment Link con selector de cantidad (2–10)
                                                           ▼
                        PayPal cobra precio × cantidad (tarjeta o PayPal)
                        y te envía el aviso de pago al correo
                                                           ▼
               Conciliación: la hoja de respuestas del formulario ↔ pago (por correo)
```

Por qué `#pagar` en la landing y **no** el enlace de PayPal directo en el formulario: el mensaje de confirmación de Forms es texto fijo. Si pusieras el enlace de PayPal ahí, quedaría con el precio de la tarifa que estaba vigente al crearlo. La landing, en cambio, ya calcula cuál tarifa está vigente por fecha (`data-end`), así que **un solo enlace estable en los formularios** siempre lleva al pago correcto.

Piezas y responsables:

| Pieza | Dónde vive | Quién la mantiene |
|---|---|---|
| Formularios (2) | Cuenta Google del dueño | Dueño |
| Enlaces de pago PayPal (3 Individual + 3 Grupo + 1 Estudiante = 7 enlaces) | Panel PayPal Business | Dueño |
| Tarjetas + sección `#pagar` + script | `site/` (este repo) | Colaborador / Claude |
| URLs de formularios y de pago | atributos `data-*` en `site/index.html` | Colaborador |

---

## 3. Precios

La landing usa tarifas por fecha. Cada tarifa tiene su precio individual, el grupal derivado y los enlaces de pago.

| Tarifa | Vigencia | Individual (L) | Grupal por persona (L, −10 %) | Estudiante (L) |
|---|---|---|---|---|
| Preventa | hasta el 5 nov | 1,700 | 1,530 | 1,700 |
| Regular | 6 – 25 nov | 1,900 | 1,710 | 1,700 |
| Cupos finales | 26 nov – 11 dic | 2,200 | 1,980 | 1,700 |

Para PayPal se fija el precio en USD con una tasa de referencia que **tú decides y congelas** (p. ej. L 26.00 = US$ 1; una referencia de mercado reciente ronda L 26.8 por dólar, así que 26.00 deja el precio unos dólares por debajo del valor de mercado: ajusta la tasa si quieres no perder en la conversión). Ejemplo con 26.00:

| Tarifa | Individual | Grupal c/u | Estudiante |
|---|---|---|---|
| Preventa | US$ 65 | US$ 59 | US$ 65 |
| Regular | US$ 73 | US$ 66 | US$ 65 |
| Cupos finales | US$ 85 | US$ 76 | US$ 65 |

> Ajusta estas cifras (son un ejemplo calculado con D1 = 10 % y tasa 26). Regla: precio USD = precio L ÷ tasa, redondeado al dólar. Si decides sumar la comisión (D5), súmala **antes** de redondear.

El grupo de 5 en preventa paga 5 × US$ 59 = **US$ 295** (PayPal lo calcula al elegir la cantidad).

---

## 4. Campos de los formularios

Principio: pedir solo lo necesario para el diploma, la logística (camiseta, alimentación) y la facturación. Cada campo extra baja la tasa de conversión.

### 4.1 Formulario Individual — 2 secciones

**Configuración:** recopilar correos (obligatorio); enviar copia de las respuestas al participante; un solo envío por persona **desactivado** (quien compra para sí mismo en otra ocasión no debe toparse con límites; se evita el inicio de sesión forzado).

**Sección 1 — Tus datos**

| # | Campo | Tipo | Oblig. | Nota |
|---|---|---|---|---|
| 1 | Nombre y apellidos completos | Respuesta corta | Sí | Ayuda: "Tal como quieres que aparezca en tu diploma de participación". |
| 2 | WhatsApp / teléfono | Respuesta corta (validación: número) | Sí | Para avisos del evento. |
| 3 | Ciudad y país | Respuesta corta | Sí | |
| 4 | Soy… | Lista desplegable con ramificación | Sí | *Estudiante* → sección 2 (carné). *Profesional o independiente* / *Empresa u organización* → sección 3 (saltando carné). |
| 5 | Universidad o empresa que representas | Respuesta corta | Sí (excepto "independiente": escribir "Independiente") | |
| 6 | Talla de camiseta | Opción múltiple: XS, S, M, L, XL, XXL | Sí | Enlace o texto a la guía de tallas. |
| 7 | Restricciones alimentarias o de accesibilidad | Párrafo | No | Almuerzo y coffee break incluidos. |
| 8 | ¿Cómo te enteraste del evento? | Lista | No | Mide qué canal funciona. |

**Sección 2 — Carné (solo estudiantes)**

| # | Campo | Tipo | Oblig. |
|---|---|---|---|
| 9 | Número de carné estudiantil | Respuesta corta | Sí |
| 10 | Aviso fijo | Texto | — | "Deberás presentar tu carné vigente el día del evento; sin carné se cobra la diferencia con la tarifa vigente." |

**Sección 3 — Facturación y consentimientos**

| # | Campo | Tipo | Oblig. |
|---|---|---|---|
| 11 | ¿Necesitas factura? | Sí/No (ramifica a 12 si Sí) | Sí |
| 12 | Nombre o razón social y RTN | Respuesta corta ×2 | Sí si pidió factura |
| 13 | Acepto la política de reembolso y transferencia de cupo | Casilla | Sí |
| 14 | Autorizo el uso de mi imagen en fotos y video del evento | Casilla | Sí (o "No autorizo" como opción) |
| 15 | Autorizo el tratamiento de mis datos para fines del evento | Casilla | Sí |

**Mensaje de confirmación (Individual):**

> ¡Listo! Tu lugar **aún no está confirmado: falta el pago.**
> Paga aquí: https://sc.themediabuilders.com/#pagar (elige "Individual" o "Estudiante").
> Usa **el mismo correo** con el que llenaste este formulario. Recibirás la confirmación en un máximo de [48 H].

### 4.2 Formulario Grupal — responsable + bucle de participantes

**Configuración:** igual que el individual. La persona que llena es el **responsable del grupo** (quien paga).

**Sección 1 — Responsable del grupo**

| # | Campo | Tipo | Oblig. |
|---|---|---|---|
| 1 | Nombre completo del responsable | Respuesta corta | Sí |
| 2 | WhatsApp del responsable | Respuesta corta | Sí |
| 3 | Universidad o empresa del grupo | Respuesta corta | Sí |
| 4 | ¿Necesitas factura? + nombre/RTN | Sí/No → campos | Sí |
| 5 | Aviso: "Mínimo 2 participantes, máximo 10. Los datos de cada participante van en las siguientes secciones." | Texto | — |

**Secciones 2 a 11 — Participante 1 … Participante 10** (idénticas; copiar con "Duplicar sección")

| # | Campo | Tipo | Oblig. |
|---|---|---|---|
| a | Nombre y apellidos completos (como aparecerá en el diploma) | Respuesta corta | Sí |
| b | Correo del participante | Respuesta corta (validación: correo) | Sí |
| c | Soy… (Estudiante / Profesional o independiente / Empresa u organización) | Lista | Sí |
| d | Universidad o empresa (si es distinta a la del grupo) | Respuesta corta | No |
| e | Número de carné (solo si es estudiante) | Respuesta corta | No* |
| f | Talla de camiseta | Opción múltiple | Sí |
| g | Restricciones alimentarias o de accesibilidad | Párrafo | No |
| h | **¿Agregar otro participante?** (Sí / No) | Opción múltiple con ramificación | Sí |

\* Forms no permite obligatoriedad condicional; se valida al conciliar. La pregunta (c) puede usar ramificación para saltar a una mini-sección de carné, pero **multiplica las secciones**. Recomendado: dejar (e) opcional con ayuda "Obligatorio si eres estudiante".

**Cableado del bucle** (esto es lo único delicado):

| Sección | Pregunta (h) / Al terminar la sección |
|---|---|
| Participante 1 | No tiene (h): **al terminar → ir a Participante 2** (el mínimo es 2). |
| Participante 2 | (h) Sí → Participante 3 · No → **Cierre**. |
| Participante 3 … 9 | (h) Sí → siguiente participante · No → **Cierre**. |
| Participante 10 | Sin (h): al terminar → **Cierre**. |

**Sección final — Cierre y consentimientos**

| # | Campo | Tipo | Oblig. |
|---|---|---|---|
| 1 | **Confirma cuántos participantes registraste** | Lista 2–10 | Sí. Es el control cruzado contra la cantidad que se pague en PayPal. |
| 2 | Acepto política de reembolso/transferencia | Casilla | Sí |
| 3 | Todos los participantes autorizan el uso de su imagen | Casilla | Sí |
| 4 | Autorizo el tratamiento de datos de los participantes | Casilla | Sí |

**Mensaje de confirmación (Grupal):**

> ¡Listo! Los lugares **aún no están confirmados: falta el pago.**
> Paga aquí: https://sc.themediabuilders.com/#pagar → "Pagar en grupo" y elige **la misma cantidad de participantes** que registraste.
> Usa **el mismo correo del responsable**. Confirmación en un máximo de [48 H].

### 4.3 Hoja de respuestas

Cada formulario → *Respuestas → Vincular a Hojas de cálculo*. Agrega a mano una pestaña **"Pagos"** con columnas: correo, cantidad pagada, monto USD, fecha, ID de transacción PayPal, estado. Es la fuente de verdad para listas de asistencia, diplomas y camisetas.

---

## 5. PayPal: enlaces de pago (paso a paso)

Prerrequisito: **cuenta PayPal Business verificada** (correo, banco o tarjeta vinculada, datos del negocio). Confirma en tu cuenta dos cosas que no pude comprobar desde aquí: (1) que tu país te permite *cobrar a invitados con tarjeta* (guest checkout) y (2) cómo retirarás los fondos a un banco hondureño (hay una comisión fija por retiro con tarjeta de PayPal para Honduras en la tabla de comisiones).

1. Entra a **paypal.com → Business → Payment Links & Buttons** (Enlaces y botones de pago).
2. **Crear → Enlace de pago**. Tipo: *Producto o servicio*.
3. Para cada enlace, completa:

| Enlace | Nombre | Precio | Moneda | ¿Cantidad? |
|---|---|---|---|---|
| Preventa · Individual | STORYCRAFTERS · Individual (Preventa) | US$ 65 | USD | No (1) |
| Preventa · Estudiante | STORYCRAFTERS · Estudiante | US$ 65 | USD | No (1) |
| Preventa · Grupo | STORYCRAFTERS · Grupal (por persona, Preventa) | US$ 59 | USD | **Sí, permitir cantidad; máximo 10** |
| Regular · (los 3) | igual, con precios de la tabla §3 | | | |
| Cupos finales · (los 3) | igual | | | |

   El enlace de *Estudiante* es idéntico en las tres tarifas (precio fijo): se crea **una sola vez** → en total **7 enlaces** (3 Individual + 3 Grupo + 1 Estudiante).
4. **Envío:** desactivar "pedir dirección de envío" (es un servicio).
5. **Métodos de pago:** dejar activos PayPal y **Tarjeta de débito o crédito** (invitado). Es lo que cumple "aceptar débito o crédito".
6. **Descripción:** incluye fecha, sede y "Usa el mismo correo del formulario".
7. **Retorno automático:** URL de agradecimiento `https://sc.themediabuilders.com/#gracias` (sección corta que crearemos: "Pago recibido, te escribiremos en 48 h").
8. **Construir** → copiar la URL (`https://www.paypal.com/ncp/payment/XXXXXXXX`). Anótalas en una tabla aparte; se pegan en `index.html` (§6).
9. **Prueba:** crea primero un enlace de **US$ 1** con selector de cantidad, paga 3 unidades con tu propia tarjeta, verifica que cobra US$ 3 y que recibes el aviso; reembolsa desde el panel. Si la opción de cantidad no aparece en tu panel (las pantallas de PayPal cambian), usa el plan B: **un enlace por tamaño de grupo** (2…10) — más enlaces, mismo resultado.
10. **Avisos:** Configuración → Notificaciones → activar correo por cada pago recibido.

> Seguridad: el precio y el máximo los fija PayPal en su servidor. Nadie puede alterar el monto editando el HTML de la landing, porque el HTML solo contiene la URL del enlace.

---

## 6. Cambios en la landing (`site/`)

### 6.1 Estructura de la sección `#inscripcion`

Se mantiene la tabla de tarifas. El panel actual ("Enlace del formulario / TARJETA / BANCO…") se reemplaza por dos tarjetas:

```
┌────────────────────────────┐ ┌──────────────────────┐
│ ★ MEJOR PRECIO             │ │ Individual           │
│ En grupo (2 o más)         │ │ L 1,700              │
│ L 1,530 por persona        │ │ por persona          │
│ Ahorras 10 %               │ │ [Inscribirme solo/a] │
│ [Inscribir a mi grupo] ◄── botón primario grande     │ (botón ghost)
└────────────────────────────┘ └──────────────────────┘
        tarjeta ~60 % del ancho, borde ámbar, ligeramente elevada
```

- Grupal: `btn btn--primary btn--lg`, borde y brillo en `--accent`, insignia "MEJOR PRECIO · AHORRA 10 %". Es la primera en el DOM y la más ancha.
- Individual: `btn btn--ghost`, borde neutro.
- Móvil: apiladas, grupal arriba.
- Debajo: línea "Estudiante: L 1,700 · cupos limitados · inscripción individual".
- Los CTA de arriba ("Reserva tu lugar", "Inscribirme", sticky móvil) siguen apuntando a `#inscripcion`; no cambian.

### 6.2 Marcado (`index.html`)

```html
<div class="signup__options" id="opciones">
  <article class="option option--featured">
    <span class="option__badge">MEJOR PRECIO · AHORRA <span data-group-discount-pct>10</span> %</span>
    <h3>En grupo <small>(2 o más)</small></h3>
    <p class="option__price"><span data-group-price>L 1,530</span> <small>por persona</small></p>
    <a class="btn btn--primary btn--lg" id="cta-group"
       href="https://forms.gle/REEMPLAZAR-GRUPAL" rel="noopener">Inscribir a mi grupo</a>
  </article>
  <article class="option">
    <h3>Individual</h3>
    <p class="option__price"><span data-individual-price>L 1,700</span> <small>por persona</small></p>
    <a class="btn btn--ghost" id="cta-individual"
       href="https://forms.gle/REEMPLAZAR-INDIVIDUAL" rel="noopener">Inscribirme</a>
  </article>
</div>
```

Datos nuevos en cada `.tier` (los enlaces de §5; el descuento es un atributo del contenedor):

```html
<div class="tiers" data-group-discount="10" data-usd-rate="26">
  <div class="tier" data-end="2026-11-06T00:00:00-06:00"
       data-price="1700"
       data-pay-individual="https://www.paypal.com/ncp/payment/REEMPLAZAR-1"
       data-pay-group="https://www.paypal.com/ncp/payment/REEMPLAZAR-2"> … </div>
  …
</div>
```

Sección de pago (`id="pagar"`, antes del FAQ):

```html
<section id="pagar" class="section">
  <h2>Paga tu inscripción</h2>
  <p>Usa el mismo correo del formulario. Tarifa vigente: <strong data-current-tier-name>—</strong>.</p>
  <a class="btn btn--primary" data-pay="group"      href="#pagar">Pagar en grupo (elige la cantidad)</a>
  <a class="btn btn--ghost"   data-pay="individual" href="#pagar">Pagar individual</a>
  <a class="btn btn--ghost"   data-pay="student"    href="https://www.paypal.com/ncp/payment/REEMPLAZAR-EST">Pagar tarifa estudiante</a>
</section>
<section id="gracias" class="section" hidden>…</section>
```

### 6.3 Script (`script.js`, dentro de `updateTiers`, sin dependencias)

```js
// Tras calcular `cur` y el array `tiers`:
var tiersBox = document.querySelector('.tiers[data-group-discount]');
var curTier = tiers[cur];
var price = Number(curTier.dataset.price);
var disc  = Number(tiersBox.dataset.groupDiscount) / 100;
var group = Math.round(price * (1 - disc) / 5) * 5;          // redondeo a L 5
var fmt = function (n) { return 'L ' + n.toLocaleString('en-US'); };
document.querySelectorAll('[data-group-price]').forEach(function (e) { e.textContent = fmt(group); });
document.querySelectorAll('[data-individual-price]').forEach(function (e) { e.textContent = fmt(price); });
document.querySelectorAll('[data-pay]').forEach(function (a) {
  var url = curTier.dataset['pay' + a.dataset.pay.charAt(0).toUpperCase() + a.dataset.pay.slice(1)];
  if (url) a.href = url;                                      // student: href fijo en el HTML
});
document.querySelectorAll('[data-current-tier-name]').forEach(function (e) {
  e.textContent = curTier.querySelector('.tier__name').textContent;
});
```

Reglas de implementación: texto con `textContent` (nunca `innerHTML`); enlaces externos con `rel="noopener"`; si falta un `data-pay-*` el botón conserva `href="#pagar"` (falla de forma inocua); se sube `?v=` del CSS/JS al desplegar (ver `COLABORADOR.md`).

### 6.4 Estilos (`styles.css`)

Clases nuevas: `.signup__options` (grid 1.4fr 1fr, gap, en <860 px una columna), `.option`, `.option--featured` (borde `--accent`, `box-shadow` ámbar suave, `transform: translateY(-4px)` en escritorio), `.option__badge`, `.option__price`, `.btn--lg`. Usar solo tokens `:root`.

### 6.5 Retirar contenido provisional

Se eliminan del panel actual los `.pending` "URL DEL FORMULARIO", "URL DEL ENLACE DE PAGO" (reemplazados por este flujo). **BANCO / CUENTA (transferencia)**: decisión D7 — conservarlos como método alterno "transferencia" (solo individual) o quitarlos. Recomendado: conservar transferencia como alternativa, porque PayPal en Honduras puede fallar con algunas tarjetas locales.

---

## 7. Orden de implementación y pruebas

| Paso | Quién | Entregable | Verificación |
|---|---|---|---|
| 1 | Dueño | Decisiones D1–D7 | Este documento aprobado |
| 2 | Dueño | Cuenta PayPal Business verificada; confirmar USD y cobro con tarjeta | Enlace de prueba US$ 1 cobra y reembolsa |
| 3 | Dueño | Formulario Individual (§4.1) | Llenarlo con cada rama (estudiante / no estudiante / con factura) |
| 4 | Dueño | Formulario Grupal con bucle (§4.2) | Probar con 2, 3 y 10 participantes; confirmar que "No" salta al cierre en cada sección |
| 5 | Dueño | 7 enlaces de PayPal (§5) | Prueba de cantidad: 3 unidades = 3 × precio |
| 6 | Claude / colaborador | PR con tarjetas, `#pagar`, script y estilos (§6) | Playwright: hero sigue en 100 vh; en 1440, 1366×650, 390 px: grupal destacada, sin desbordes; cambiar la fecha del sistema simula cada tarifa y comprueba que `data-pay` apunta al enlace correcto |
| 7 | Dueño | Pegar URLs de formularios y enlaces de PayPal en `index.html` (o pasarlas a Claude) | Clic real en cada botón, en móvil y escritorio |
| 8 | Todos | Compra real de punta a punta con US$ 1 (preventa de prueba) | Pago visible en PayPal y correo coincide con la respuesta del formulario |
| 9 | Dueño | Merge → autodeploy | `curl` del HTML publicado y revisión visual |

Criterios de aceptación: (a) en cada tarifa, el precio grupal mostrado = `round(precio × (1 − descuento) / 5) × 5`; (b) ningún botón de pago apunta a `#` con las URLs cargadas; (c) un grupo de N paga exactamente N × precio unitario; (d) el formulario grupal no deja avanzar con menos de 2 participantes.

---

## 8. Riesgos y mitigaciones

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Quien paga elige una cantidad distinta a la registrada | Cupos sin pagar o pagos de más | Pregunta "confirma cuántos participantes" en el cierre; la hoja "Pagos" cruza ambos números; nunca se confirman diplomas ni camisetas sin cuadrar. |
| Pago sin formulario o con otro correo | Pago huérfano | Mensaje explícito "mismo correo"; conciliar por nombre del pagador y monto; responder en 48 h. |
| Cambio de tarifa a medianoche mientras alguien llena el formulario | Paga la tarifa nueva | Aceptado: se cobra la tarifa del día del **pago**. Dejarlo escrito en el formulario. |
| PayPal rechaza tarjetas hondureñas o limita la cuenta | Ventas perdidas | Mantener transferencia como alternativa (D7); probar con 2 tarjetas locales antes de abrir. |
| Fondos retenidos o retiro costoso | Flujo de caja | Verificar condiciones de retiro a banco local antes de lanzar (comisión fija de retiro en Honduras). |
| Datos personales (RTN, teléfono, carné) en la hoja | Privacidad | Hoja privada, solo 2 personas con acceso; texto de consentimiento; no publicar enlace de resultados. |
| Formulario creado por API queda "sin publicar" | Nadie puede responder | Si en el futuro se crea por API, publicarlo explícitamente (cambio de Google para formularios creados tras el 30-jun-2026). Al crearlo a mano no aplica. |
| El colaborador sobrescribe un enlace de PayPal | Cobro equivocado | `COLABORADOR.md` documenta que los `data-pay-*` solo los cambia el dueño; revisión por PR. |

---

## 9. Fase 2 (opcional): total exacto con backend PHP

Se justifica **solo si** la conciliación manual duele (muchos grupos, errores de cantidad). Diseño:

- Página `/pagar` (PHP en Hostinger): el responsable indica cantidad y correo; JS muestra el total en vivo (`cantidad × precio de la tarifa vigente`).
- `POST /api/crear-orden.php`: el servidor **recalcula** el monto (cantidad validada 2–10, tarifa por fecha del servidor, descuento fijo), llama a PayPal **Orders API v2** (`POST /v2/checkout/orders`) y devuelve el `id`. El navegador nunca decide el monto.
- `POST /api/capturar-orden.php`: captura (`/v2/checkout/orders/{id}/capture`), registra pago (archivo/SQLite fuera de `public_html`) y redirige a `#gracias`.
- Credenciales (`client id`/`secret`) en un archivo de configuración **fuera de `public_html`**, nunca en el repo.
- El `.htaccess` actual bloquea `.md`, `.git`, etc.; habría que permitir `/api/*.php` y bloquear la carpeta de datos.
- Pago + formulario se unen por un parámetro: el formulario puede recibir un **enlace prellenado** con el ID de la orden (Forms admite `?entry.<id>=valor`), y la página de gracias lo entrega.
- Fase mayor (≈ 1–2 días) y con responsabilidad de seguridad; por eso no es el plan base.

---

## 10. Herramientas: ¿MCP de PayPal y de Google Forms?

| Herramienta | ¿Existe? | ¿La necesitamos? |
|---|---|---|
| **PayPal MCP / AI Toolkit** (oficial: `paypal/AI-Toolkit`, ofrecido también en el catálogo MCP de Docker como `paypal`) | Sí. Expone órdenes, pagos, reembolsos, facturas, suscripciones, catálogo, disputas y reportes. | **No en la fase 1** (los enlaces de pago se crean en el panel). Útil después para *listar transacciones* y conciliar, o en la fase 2 para probar órdenes en **sandbox**. Si se instala: usar **solo token sandbox**, nunca credenciales *live* en la configuración de un agente; revocarlo al terminar. No se agrega al proyecto ahora. |
| **Google Forms API** | Sí (`forms.create`, `forms.batchUpdate`, lectura de respuestas). | Opcional: podría generar los 11 bloques del formulario grupal por script. Construirlo a mano toma ~30–40 min y es más seguro. |
| **MCP de Google Forms** | Solo comunitarios (p. ej. `google-forms-mcp`: `create_form`, `add_text_question`, `add_multiple_choice_question`, `get_form`, `get_form_responses`). Sin secciones ni ramificación, y requieren OAuth propio. **No hay servidor oficial de Google.** | **No.** No cubre secciones ni el bucle. |
| **Apps Script** (script dentro del formulario) | Sí. | Opcional, mejora: al enviar, validar que la cantidad confirmada coincida y mandar un correo "Falta tu pago" con el enlace `#pagar`. |

---

## 11. Qué falta verificar (no lo confirmé desde aquí)

1. **Selector de cantidad en tu panel de PayPal** (la opción "permitir comprar varios artículos" aparece en los tutoriales oficiales y en video, pero las pantallas cambian): probar con el enlace de US$ 1 del paso 5-9.
2. **HNL como moneda de cobro:** asumido no soportado; confirmar en tu cuenta.
3. **Cobro a invitados con tarjeta y retiro a banco local en Honduras:** depende de la cuenta; probar con una tarjeta hondureña.
4. **URL con ancla en el mensaje de confirmación de Forms:** debería volverse enlace automáticamente; verificarlo en la vista previa. Si no, usar la URL sin ancla `https://sc.themediabuilders.com/pagar` y agregar una página redirigente.
5. **Tasa y comisión (D2, D5)** son decisiones de negocio.

Fuentes consultadas: documentación de PayPal Developer (Payment Links, Orders v2, JavaScript SDK), guías de ramificación de Google Forms (límites del "ir a sección según respuesta"), repositorio `paypal/AI-Toolkit`, catálogo MCP de Docker, listado de servidores MCP de Google Forms.

---

## 12. Preguntas pendientes para el dueño (hacerlas al iniciar la implementación)

Regla de trabajo: **no se bloquea el desarrollo** esperando respuestas. Todo lo que tiene "Valor por defecto" se implementa con ese valor y se corrige al responder. Las preguntas marcadas **[BLOQUEA]** impiden publicar o cobrar, no programar.

### A. Negocio y precios

| # | Pregunta | Valor por defecto | Dónde impacta |
|---|---|---|---|
| Q1 | ¿Qué porcentaje de descuento tendrá la inscripción grupal? | 10 % | `data-group-discount` en `.tiers`; precios en los enlaces de PayPal |
| Q2 | ¿Mínimo y máximo de personas por grupo? | 2 y 10 | Bucle del formulario grupal; máximo de cantidad en PayPal |
| Q3 | ¿El descuento grupal aplica en las tres tarifas (Preventa, Regular, Cupos finales)? | Sí, en las tres | Tabla de precios §3; 3 enlaces grupales |
| Q4 | ¿Los estudiantes pueden unirse a un grupo? Si sí, ¿pagan la tarifa grupal o la de estudiante? | Pueden unirse y pagan la tarifa grupal; la de estudiante (L 1,700) solo individual | Texto de las tarjetas; reglas del formulario |
| Q5 | ¿Cuándo termina el plazo de grupos? ¿Hay un tope total de cupos (hoy: 40)? | Mismo plazo que las tarifas; tope 40 | Contador de cupos (manual hoy) |

### B. PayPal y cobro **[BLOQUEA el cobro]**

| # | Pregunta | Valor por defecto | Dónde impacta |
|---|---|---|---|
| Q6 | ¿Ya existe una cuenta **PayPal Business** verificada? ¿A nombre de quién y en qué país? | No se asume; se crea/verifica antes de los enlaces | Todo el §5 |
| Q7 | ¿Se cobra en USD? ¿Qué tasa de cambio se congela (L por US$ 1)? | USD, tasa 26.00 | Precios USD de §3 |
| Q8 | ¿La comisión de PayPal se absorbe o se suma al precio? | Se absorbe | Precios USD |
| Q9 | ¿El dueño puede cobrar con tarjeta como invitado y retirar a un banco hondureño? (probar con una tarjeta local) | Se prueba en el paso 2 de §7 | Viabilidad del método; decide si Q10 pasa a ser el método principal |
| Q10 | ¿Se conserva la **transferencia bancaria** como alternativa? Si sí: banco, tipo y número de cuenta, titular, y plazo de verificación (el `[48 H]` pendiente). | Sí, solo individual | Sección de pago; reemplaza los `.pending` BANCO/CUENTA/`[48 H]` |
| Q11 | ¿A qué correo deben llegar los avisos de pago? ¿Quién concilia pagos contra respuestas y en qué plazo? | Correo del dueño; confirmación en 48 h | Mensajes de confirmación; hoja "Pagos" |

### C. Formularios de Google

| # | Pregunta | Valor por defecto | Dónde impacta |
|---|---|---|---|
| Q12 | ¿Qué cuenta de Google será propietaria de los formularios y de las hojas de respuestas? ¿Quiénes más tendrán acceso? | Cuenta del dueño; acceso a 2 personas | Privacidad de datos personales |
| Q13 | ¿Se pide factura? ¿Se necesita RTN y nombre o razón social? ¿Quién emite el comprobante? | Sí, opcional, con RTN | Sección 3 del individual y sección 1 del grupal |
| Q14 | ¿Las tallas de camiseta son XS–XXL? ¿Hay guía de tallas para enlazar? | XS, S, M, L, XL, XXL | Pregunta de talla; fecha límite para pedir camisetas |
| Q15 | ¿Se pide algún dato más (nivel de experiencia, equipo propio, restricciones alimentarias)? | Alimentarias/accesibilidad opcional; resto no | Largo del formulario |
| Q16 | ¿Qué texto exacto llevan los **consentimientos** (imagen, datos personales)? ¿Hay aviso de privacidad? | Textos genéricos del §4; redactar con asesoría | Casillas obligatorias |
| Q17 | **Política de reembolso y transferencia de cupo** (hoy `[POLÍTICA PENDIENTE]` ×2 en el FAQ). **[BLOQUEA la apertura de ventas]** | Sin valor por defecto; no se inventa | FAQ, casilla de aceptación, mensaje de confirmación |
| Q18 | ¿Quién diseña/valida el diploma? ¿Se necesita el nombre exactamente como en el documento de identidad? | Nombre libre, el participante lo escribe como lo quiere ver | Texto de ayuda del campo nombre |

### D. Landing y operación

| # | Pregunta | Valor por defecto | Dónde impacta |
|---|---|---|---|
| Q19 | ¿Se muestra el equivalente en dólares ("≈ US$ X") junto al precio en lempiras? | Sí, en la sección de pago | Texto de `#pagar` |
| Q20 | Textos de la página de agradecimiento (`#gracias`) y contacto de soporte (WhatsApp, correo). Los enlaces de WhatsApp/redes siguen pendientes. | Texto genérico; correo `info@themediabuilders.com` | `#gracias`, FAQ, mensajes de formulario |
| Q21 | ¿Quién tendrá permiso para cambiar las URLs de pago en `index.html`? | Solo el dueño; el colaborador no | `COLABORADOR.md` |
| Q22 | ¿Se desea medir conversión (clics en cada CTA, origen del tráfico)? | No en esta fase | Analítica (no incluida) |

### E. Entregables que debe aportar el dueño al implementar

1. URLs finales de los dos Formularios de Google (formato `https://forms.gle/…`).
2. Las 7 URLs de pago de PayPal (§5), una por tarifa y tipo, más la de estudiante.
3. Respuestas a Q1–Q22 (o confirmación de los valores por defecto).
4. Una compra real de US$ 1 de punta a punta, para dar por cerrado el paso 8 de §7.
