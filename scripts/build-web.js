// Copia i file dell'app web in www/, la cartella che Capacitor impacchetta nell'app Android.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
const files = ['index.html', 'app.js', 'trends.js', 'insights.js', 'planned.js', 'portfolio.js', 'boot.js', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
files.forEach(f => fs.copyFileSync(path.join(root, f), path.join(out, f)));
console.log(`www/: ${files.length} file copiati`);
