# Solve or Boom

Un juego de disparos por equipos, en el estilo de ataque y defensa de la bomba, donde cada arma, cada cargador y cada desactivación cuestan una respuesta correcta. Pensado para clases de 10 a 14 años: el profesor elige la asignatura y el contenido, o sube sus propias preguntas.

> **Versión beta 0.1.0-beta.1.** Funciona sin internet, en el navegador del PC o del móvil.

## Qué tiene

- **Un jugador** contra bots (niveles Fácil, Normal y Difícil).
- **Modo clase** en la red del colegio: el PC del profesor hace de servidor y los alumnos entran desde el navegador.
- **Modos de juego:**
  - **Bomba:** atacar y defender, 4 contra 4.
  - **Free for All:** todos contra todos; para volver a la partida hay que responder bien.
- **Preguntas:** banco de preguntas por asignatura y nivel (Matemáticas, Ciencias, Geografía, Lengua), o preguntas propias en CSV.
- **Partida:** 5 mapas (uno de dos pisos), premios por racha de aciertos, y resultados por alumno y tema exportables a CSV.
- **Controles:** reasignables en PC, y controles táctiles en móviles y tabletas.

## Jugar solo

Abre `solve-or-boom.html` (de la página de versiones) en el navegador. No necesita internet ni instalar nada.

## Usarlo en clase (profesor)

1. Instala [Node.js](https://nodejs.org) 22 o más nuevo.
2. Descarga el código, abre una terminal en la carpeta y ejecuta:
   ```
   npm install
   npm run aula
   ```
3. La terminal muestra la dirección para los alumnos (por ejemplo `http://192.168.1.20:3000`) y la de tu pantalla de profesor (`/profesor`, solo en tu PC).
4. Los alumnos abren esa dirección en el navegador, escriben su nombre y entran a la sala que les asignes.

Los resultados se guardan solo en la memoria del programa, en tu PC: expórtalos a CSV antes de cerrarlo. No se envía nada a internet.

## Para desarrollar

- `npm run dev`: el juego en modo desarrollo.
- `npm run build:single`: el juego en un solo archivo HTML (`dist-single/`).
- `npm run smoke` y `npm test`: las comprobaciones.

Hecho con Vite, TypeScript y three.js. El proyecto empezó con la plantilla [Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios).

## Licencia

MIT, ver `LICENSE`.
