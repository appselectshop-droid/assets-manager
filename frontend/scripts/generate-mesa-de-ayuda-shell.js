const fs = require('fs');
const path = require('path');

// Genera dist/mesa-de-ayuda.html a partir de dist/index.html, cambiando
// SOLO las etiquetas de identidad PWA (manifest, íconos, título de Apple)
// por las de Mesa de Ayuda — el script/CSS con hash que Vite generó se
// queda igual, así que ambos HTML cargan el mismo bundle de React.
//
// Por qué existe este archivo (no es cosmético): un navegador decide qué
// app se puede "instalar" con el HTML que le llegó de primera mano en la
// navegación — no vuelve a evaluar eso solo porque un script cambie el
// <link rel="manifest"> después de que React ya montó (ver
// usePwaIdentity.js). Antes de esto, Mesa de Ayuda y Sistema de Tickets
// compartían el MISMO index.html, así que cualquier carga fresca (o el
// intento de "instalar") siempre veía la identidad que estuviera escrita
// en ese único HTML estático, sin importar la ruta. vercel.json reescribe
// las rutas propias de Mesa de Ayuda hacia este archivo en vez de
// index.html — ver ese archivo para la lista de prefijos.
const distDir = path.join(__dirname, '../dist');
const indexPath = path.join(distDir, 'index.html');
const outPath = path.join(distDir, 'mesa-de-ayuda.html');

let html = fs.readFileSync(indexPath, 'utf-8');

const REPLACEMENTS = [
  [/href="\/manifest\.webmanifest"/, 'href="/manifest-mesa-de-ayuda.webmanifest"'],
  [/href="\/icons\/favicon-tickets-32\.png"/, 'href="/icons/favicon-mesa-ayuda.png"'],
  [/href="\/icons\/apple-touch-icon-tickets\.png"/, 'href="/icons/apple-touch-icon.png"'],
  [/content="Sistema de Tickets"/, 'content="Mesa de Ayuda"'],
];

for (const [pattern, replacement] of REPLACEMENTS) {
  if (!pattern.test(html)) {
    throw new Error(`generate-mesa-de-ayuda-shell: no se encontró ${pattern} en dist/index.html — ¿cambió el HTML base?`);
  }
  html = html.replace(pattern, replacement);
}

fs.writeFileSync(outPath, html);
console.log('dist/mesa-de-ayuda.html generado a partir de dist/index.html');
