# Cómo editar el sitio (guía para colaboradores)

El sitio vive en la carpeta **`site/`**. Solo lo que está ahí se publica en https://sc.themediabuilders.com. Todo lo demás (este archivo, `design/`, `README.md`) es documentación y nunca llega al servidor.

## Una sola vez

1. Instala [GitHub Desktop](https://desktop.github.com/) y [VS Code](https://code.visualstudio.com/).
2. En GitHub Desktop: *File → Clone repository* → `ahvega/sc-mb`.
3. En GitHub Desktop: *Repository → Open in Visual Studio Code*. VS Code propondrá instalar la extensión **Live Server**; acepta.

## Cada vez que quieras cambiar algo

1. **Rama nueva.** En GitHub Desktop: *Branch → New branch*. Nómbrala `chore/<tema>--user` (por ejemplo `chore/horarios-agenda--user`).
2. **Edita** los archivos de `site/`:
   | Qué cambiar | Dónde |
   |---|---|
   | Textos, expositores, agenda, FAQ, precios y fechas de cada tarifa | `site/index.html` |
   | Colores, tamaños, espaciados | `site/css/styles.css` (los colores están al inicio, en `:root`) |
   | Cuenta regresiva, tarifa vigente, chat | `site/js/script.js` (normalmente no hay que tocarlo) |
   | Imágenes | `site/assets/` |
3. **Míralo en tu computadora.** Abre `site/index.html` en VS Code y pulsa **Go Live** (abajo a la derecha). Se abre el sitio en `localhost:5500` y se recarga solo cuando guardas.
4. **Publica la rama.** En GitHub Desktop: escribe un resumen, *Commit to ...*, *Publish branch* y luego *Create Pull Request*.
5. **Merge.** Cuando el resultado te convenza, pulsa *Merge pull request* en GitHub. En 1–2 minutos el sitio se actualiza solo.

## Cosas que hay que saber

- Lo que aparece con **recuadro punteado** en el sitio (`[URL DEL FORMULARIO DE GOOGLE]`, `[BANCO]`, etc.) es contenido pendiente. Búscalo en `index.html` con la clase `pending`, reemplázalo por el dato real y borra la clase.
- **Tarifas:** cada una tiene `data-end` (cuándo deja de estar vigente, hora de Honduras `-06:00`). El sitio marca solo cuál es la vigente.
- **Cupos:** edita a mano el número visible dentro de `<span ... data-spots-left>40</span>`; la barra se ajusta sola.
- **Comprimir imágenes:** instala [Python](https://www.python.org/downloads/) y Pillow (`pip install Pillow`) y corre `python tools/optimize_images.py` desde la raíz del repo.
- **CSS/JS:** se revalidan en cada visita, pero si ves un cambio de estilo sin reflejarse, sube el número de `?v=` en los enlaces de `index.html`.
- **Imágenes reemplazadas:** el navegador las guarda hasta 7 días; si cambias una foto, dale un nombre nuevo para que se vea de inmediato.
- **Imágenes nuevas:** comprímelas antes de subirlas (idealmente menos de 300 KB cada una) y guárdalas en `site/assets/`.
- Si algo se rompe después del merge, avisa antes de seguir editando: se puede revertir el PR.
