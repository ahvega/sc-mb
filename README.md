<div align="center">

# STORYCRAFTERS

**Landing de inscripción · Masterclass de storytelling documental**

![Estado](https://img.shields.io/badge/estado-sitio%20est%C3%A1tico-F2B33D?style=flat-square)
![Fidelidad](https://img.shields.io/badge/fidelidad-hi--fi-0a0a0a?style=flat-square)
![Stack](https://img.shields.io/badge/stack-HTML%20est%C3%A1tico-EFE7DA?style=flat-square)
![Idioma](https://img.shields.io/badge/idioma-espa%C3%B1ol-C9A56A?style=flat-square)

Organizada por **Media Builders** · San Pedro Sula, Honduras · **12 dic 2026**

</div>

> [!NOTE]
> El sitio publicado es el **sitio estático de `site/`**. Las secciones de diseño más abajo (tokens, pantallas, precios, responsive) siguen siendo la especificación; los archivos del handoff original viven en `design/` solo como referencia (el formulario de 3 pasos se sustituyó por un enlace a Formulario de Google).
> Guía de edición para colaboradores: [`COLABORADOR.md`](COLABORADOR.md).

## Inicio rápido

El sitio no tiene build ni dependencias. Para verlo en local:

```bash
python -m http.server 8000 --directory site
# abrir http://localhost:8000
```

O en VS Code: extensión **Live Server** → *Go Live* (la raíz ya apunta a `site/`).

### Herramientas opcionales (solo para comprimir imágenes)

Al clonar el repo, quien vaya a agregar o cambiar imágenes debe instalar **Python 3** y **Pillow**:

```bash
pip install Pillow
python tools/optimize_images.py        # convierte a WebP todo site/assets/ (JPG q80, PNG sin pérdida)
```

No es necesario para ver ni desplegar el sitio. La skill `.claude/skills/optimize-image/` (para Claude Code) usa en cambio la API de ShortPixel y requiere `SHORTPIXEL_API_KEY`; no necesita Pillow.

## Contenido del repositorio

| Ruta | Descripción |
|---|---|
| `site/` | **El sitio publicado** (`index.html`, `css/`, `js/`, `assets/`, `.htaccess`). Es lo único que se despliega. |
| `design/` | Referencias del handoff original: `reference-bundle.html` (bundle autocontenido), `Storycrafters Landing.dc.html` (fuente del prototipo; requiere `support.js` e `image-slot.js`, que no se incluyen) y `assets-unused/`. |
| `backend/` | Script de Google (Apps Script) para inscripciones, pagos con PayPal y carnés de estudiante. Instalación: [`backend/LEEME.md`](backend/LEEME.md). |
| `tools/optimize_images.py` | Compresión local de imágenes (requiere Pillow). |
| `.github/workflows/` | Publica el contenido de `site/` en la rama `deploy`, que es la que Hostinger clona. |
| `COLABORADOR.md` | Flujo de edición para no-desarrolladores. |
| `CLAUDE.md` | Guía para Claude Code. |

## Tabla de contenidos

- [Overview](#overview)
- [Design Tokens](#design-tokens)
- [Screens / Secciones](#screens--secciones-en-orden)
- [Precios](#precios-lógica-por-fecha-zona-utc−6)
- [Formulario de inscripción](#formulario-de-inscripción-3-pasos)
- [State](#state-prototipo) · [Responsive](#responsive) · [Assets](#assets-assets)
- [Pendientes de contenido](#pendientes-de-contenido)

---

## Overview
Landing page de inscripción para **STORYCRAFTERS**, masterclass intensiva de storytelling documental de un día organizada por **Media Builders** (San Pedro Sula, Honduras). Primera edición: **sábado 12 de diciembre de 2026, 8:00 a.m. – 6:30 p.m.**, Estudios Alfa y Omega Visión. Cupo: 40 personas. Objetivo único de la página: **conseguir inscripciones pagadas**. STORYCRAFTERS es un programa recurrente: la página debe funcionar como marca reutilizable para futuras ediciones (fechas, precios y expositores deberían ser datos editables, idealmente desde un CMS o un archivo de configuración).

Público: filmmakers, videógrafos, fotógrafos, creadores de contenido, comunicadores y estudiantes. **Mobile first**: la mayoría llega desde Instagram/WhatsApp.

## About the Design Files
Los archivos de este paquete son **referencias de diseño hechas en HTML**: prototipos que muestran el aspecto y comportamiento deseados, **no código de producción para copiar tal cual**. La tarea es **recrear este diseño en el entorno del proyecto** (si no existe uno, recomendamos Next.js/Astro + Tailwind, o un sitio estático con un backend ligero para el formulario y pagos).

`design/reference-bundle.html` es una versión autocontenida que se abre con doble clic en cualquier navegador. `design/Storycrafters Landing.dc.html` es el archivo fuente (markup con estilos inline + una clase JS con la lógica en el `<script>` final). Ambos sirven como referencia visual y de comportamiento.

## Fidelity
**Alta fidelidad (hi-fi).** Colores, tipografía, espaciados, copy e interacciones son finales. Recrear pixel-perfect.

---

## Design Tokens

### Colores
| Token | Hex | Uso |
|---|---|---|
| bg | `#0a0a0a` | Fondo principal |
| bg-alt | `#121212` | Secciones alternas (Para quién, Agenda) |
| bg-deep | `#050505` | Footer |
| card | `#1c1c1c` | Bloques de agenda |
| line | `#262626` / `#2a2a2a` / `#333333` | Bordes, divisores |
| line-strong | `#555555` | Bordes de inputs |
| accent (ámbar tungsteno) | `#F2B33D` | Acento principal, CTAs, sección Inscripción |
| accent-hover | `#FFD27A` | Hover de botones |
| accent-muted | `#C9A56A` | Labels, roles, etiquetas secundarias |
| text | `#EFE7DA` | Texto principal (blanco hueso) |
| text-2 | `#cfcfcf` | Párrafos |
| text-3 | `#b3b3b3` | Bios |
| text-4 | `#9a9a9a` / `#7a7a7a` | Notas, metadatos |
| rec | `#E5533D` | Punto "● REC" |
| online | `#2fb26a` | Punto del botón de chat |

### Tipografía (Google Fonts)
- **Titulares**: `Barlow Condensed` 300 (titulares de sección, uppercase), 500 (logo del hero, precios), 200 disponible.
- **Cuerpo**: `Archivo` 400/500/600/700.
- **Mono / timecode / labels**: `JetBrains Mono` 400/500, labels en 11–12px con `letter-spacing: .15–.3em`, uppercase.

Escala (fluida con `clamp`):
- H1 hero "STORYCRAFTERS": `clamp(64px, 17vw, 300px)`, 500, amarillo, `transform: perspective(700px) rotateX(16deg) skewX(-7deg)`, origin 50% 100%, sombra `0 18px 40px rgba(0,0,0,.45)`.
- H2 sección: `clamp(40px, 6.4vw, 96px)`, line-height .98, uppercase. Variantes grandes: `clamp(56px, 8–9vw, 120–140px)`, lh .9.
- Subtítulo hero: `clamp(34px, 4.6vw, 60px)`.
- Párrafo: `clamp(16px, 1.3vw, 18px)`, lh 1.6–1.7.
- Kicker de sección: JetBrains Mono 12px, `.25em`, ámbar, formato `00:0X — NOMBRE`.

### Espaciado / forma
- Padding de sección: `clamp(72px, 10vw, 140px)` vertical, `clamp(20px, 5vw, 48px)` horizontal. Contenedor `max-width: 1240px` (Agenda/FAQ 1000px).
- Radio: **2px** en botones; todo lo demás sin redondeo (estética cinematográfica). Chat flotante: pill 28px.
- Grids: `repeat(auto-fit, minmax(min(100%, Npx), 1fr))`; grids "de celdas" con `gap:1px` sobre fondo de línea para divisores finos.
- Botón primario: bg `#F2B33D`, texto `#0a0a0a` 700, padding 16×28, hover `#FFD27A`. Secundario: borde `rgba(239,231,218,.35)`, hover borde+texto ámbar.

### Efectos
- Grano: overlay fijo con SVG `feTurbulence` (baseFrequency .9), opacity .09, `mix-blend-mode: overlay`, `pointer-events:none`. Activable por prop.

---

## Screens / Secciones (en orden)

1. **Header fijo**: blur `rgba(10,10,10,.82)` + `backdrop-filter: blur(10px)`; punto ámbar con glow + "STORYCRAFTERS"; nav (≥860px): Programa · Expositores · Agenda · Incluye · Preguntas (anclas); botón "Inscribirme" → `#inscripcion`.
2. **Hero**: foto a sangre `assets/hero-mirada-web.webp` (color, `background-position: 62% 40%`, cover) con degradado superior/inferior a negro. Arriba-izquierda: logo Media Builders (WebP invertido a blanco) + "presenta", slot para logo STORYCRAFTERS (en diseño), "Investiga · Estructura · Graba". Fecha vertical a la derecha ("12 · 12 · 2026 — SAN PEDRO SULA", `writing-mode: vertical-rl`). H1 amarillo en perspectiva abajo. Debajo: subtítulo, bajada, CTA "Reserva tu lugar" + "Ver el programa", lista de datos (FECHA/HORA/SEDE/CUPO) y **cuenta regresiva timecode** `DD:HH:MM:SS` hasta 2026-12-12 08:00 (UTC−6).
3. **Qué es** (`#programa`): titular + 2 columnas de texto + 3 pilares (Aprende / Practica / Llévatelo).
4. **¿Es para ti?**: fondo `bg-playa-web.webp` B/N ~26% con degradado; lista A–E; nota ámbar "No necesitas traer cámara…".
5. **Expositores** (`#expositores`): 4 tarjetas (foto 4:5 B/N, etiqueta modalidad PRESENCIAL ámbar / VÍA ZOOM hueso, nombre, rol, sesión en mono, bio). Fotos: luis-emilio-3, (Héctor pendiente), eric-salguero, jd-macias.
6. **Agenda** (`#agenda`): timeline vertical estilo edición. Mañana "Aprende" (V1) y Tarde "Haz" (V2). Bloques de práctica en ámbar sólido. Horarios intermedios `--:--` (pendientes de confirmar).
7. **Incluye** (`#incluye`): grid de 7 celdas; la 7ª en ámbar.
8. **Después de la masterclass**: foto `despues-retrato-web.webp` a color. **≥1180px**: foto de fondo (`auto 90%`, anclada a la izquierda), texto a la derecha `max-width:340px`, degradado lateral suave (máx. .55). **<1180px**: foto 2:1 arriba, texto debajo.
9. **La sede**: texto, dirección, plus code GXMW+W59, botón a `https://maps.app.goo.gl/3DXgQzQmvxdWX4Ti9`; slot de mapa/foto.
10. **Inscripción** (`#inscripcion`): fondo ámbar. Izquierda: tarifas + aviso + contador de cupo. Derecha: formulario en 3 pasos (ver abajo).
11. **Preguntas** (`#preguntas`): acordeón (una abierta a la vez, ± en mono).
12. **Cierre**: foto `bg-mascara-web.webp` **a color**, aspect ~16:9, degradado solo abajo; titular pequeño abajo-izquierda y botón abajo-derecha.
13. **Footer**: logo + "Un programa de [logo MB]", contacto `info@themediabuilders.com`, redes, ©.

Flotantes:
- **Chat "¿Tienes preguntas?"** abajo-derecha (pill hueso). Abre panel con 4 preguntas rápidas que saltan al FAQ y abren la respuesta. *A futuro: asistente virtual real.*
- **CTA fijo móvil** (<860px): barra inferior con "SÁB 12 DIC / CUPO 40" + botón "Inscribirme". El chat sube a `bottom:84px` en móvil.

---

## Precios (lógica por fecha, zona UTC−6)
| Tarifa | Precio | Vigencia |
|---|---|---|
| Preventa | L 1,700 | hasta 5 nov 2026 (23:59) |
| Regular | L 1,900 | 6 – 25 nov |
| Cupos finales | L 2,200 | 26 nov – 11 dic |
| Estudiantes | L 1,700 | siempre, con carné, cupos limitados |

- La tarifa vigente se resalta (fondo negro, texto ámbar, "● VIGENTE"); las pasadas se atenúan ("CERRADO").
- Aviso dinámico: "Sube a L 1,900 el 6 de noviembre" (se calcula con la siguiente tarifa).
- Contador "Quedan X lugares de 40" + barra de progreso → **debe venir del backend** (inscripciones confirmadas).

## Formulario de inscripción (3 pasos)
Indicador de progreso: 01 DATOS · 02 PAGO · 03 CONFIRMACIÓN.

**Paso 1 – Datos** (todos obligatorios salvo indicados):
Nombre completo (como en diploma) · Correo (email) · WhatsApp (tel) · Ciudad · Ocupación [Filmmaker / Videógrafo, Fotógrafo, Creador de contenido, Estudiante, Comunicador / ONG, Otro] · Nivel [Principiante, Intermedio, Avanzado] · Talla camiseta [XS–XXL] · ¿Cómo te enteraste? (opcional) [Instagram, Facebook, WhatsApp, Recomendación, Otro] · Restricciones alimentarias (opcional) · Checkbox "Acepto recibir comunicaciones" (obligatorio). Botón "Continuar al pago →". Nota: "Tu inscripción queda confirmada una vez recibido el pago."

**Paso 2 – Pago**: resumen (nombre + precio vigente). Checkbox "Soy estudiante" → precio L 1,700. Selector:
- **Tarjeta**: botón "Ir a pagar L X ↗" que abre **enlace de pago externo** en nueva pestaña + checkbox obligatorio "Ya realicé el pago". *Recomendado en producción: pasarela con webhook (p. ej. enlace de pago bancario local, PayPal, Stripe si aplica) que confirme automáticamente.*
- **Transferencia**: datos bancarios (pendientes) + subida de comprobante (imagen/PDF, obligatorio). Lugar apartado mientras se verifica (plazo pendiente, propuesto 48 h).
Botones "← Datos" y "Confirmar inscripción" / "Enviar comprobante".

**Paso 3 – Confirmación**: tarjeta → "¡Listo!" lugar reservado, confirmación final al validar pago. Transferencia → "Lugar apartado", en revisión. Botón "Inscribir a otra persona".

**Backend necesario**: guardar inscripciones, estado de pago (pendiente/pagado), comprobantes, decrementar cupo, enviar correo de confirmación (texto en el brief original, §5), y aviso posterior cuando las fotos/escenas estén en el portal.

## State (prototipo)
`step` (1–3), `method` ('card'|'transfer'), `student` (bool), `name`, `email`, `open` (índice FAQ), `chat` (bool), `now` (tick 1s para countdown y tarifas), `w` (ancho ventana para breakpoints 860 / 1180).

## Responsive
- <860px: nav oculto, CTA fijo inferior, chat elevado.
- <1180px: sección "Después" pasa a layout apilado.
- Todo lo demás reflujo con grids `auto-fit` y tipografía `clamp`.

## Assets (`site/assets/`)
- `hero-mirada-web.webp` — hero (color)
- `bg-playa-web.webp` — fondo "¿Es para ti?" (B/N)
- `despues-retrato-web.webp` — "Después de la masterclass" (color)
- `bg-mascara-web.webp` — cierre (color)
- `luis-emilio-3.webp`, `eric-salguero.webp`, `jd-macias.webp` — expositores (B/N)
- `design/assets-unused/` — fotos alternativas de Luis Emilio y `bg-mascara.jpg` (no usadas)
- `logo-media-builders.webp` — logo MB (negro; se invierte a blanco con `filter: invert(1)`)
Todas las fotos son propiedad de Media Builders. Ya comprimidas (~0.2–0.4 MB, 2400px máx.).

## Pendientes de contenido
Logo STORYCRAFTERS · horarios intermedios de agenda · instalar el backend de inscripciones y las claves de PayPal (`backend/LEEME.md`) · políticas de transferencia de cupo y reembolsos · mapa embebido o foto de la sede.

## Files
- `site/` — sitio publicado.
- `design/` — referencias del handoff (bundle, fuente del prototipo, imágenes sin usar).
