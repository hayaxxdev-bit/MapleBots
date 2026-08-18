const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const runtimeDir = path.join(__dirname, '..', 'runtime', 'gallery-dl');
const galleryDlPath = path.join(runtimeDir, 'gallery-dl');
const sitePackages = path.join(runtimeDir, 'site-packages');

console.log('=== GALLERY-DL BOOTSTRAP ===');
console.log(`Runtime      : ${runtimeDir}`);
console.log(`Site-packages: ${sitePackages}`);
console.log(`Binary       : ${galleryDlPath}`);

if (!fs.existsSync(sitePackages)) {
  throw new Error(
    `gallery-dl site-packages tidak ditemukan: ${sitePackages}`
  );
}

if (!fs.existsSync(galleryDlPath)) {
  console.log('[1] Membuat launcher gallery-dl...');

  const launcher = `#!/bin/sh

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

export PYTHONPATH="$SCRIPT_DIR/site-packages\${PYTHONPATH:+:$PYTHONPATH}"

exec python3 -m gallery_dl "$@"
`;

  fs.writeFileSync(galleryDlPath, launcher, {
    mode: 0o755,
  });

  console.log('[2] Launcher berhasil dibuat.');
} else {
  console.log('[1] Launcher gallery-dl sudah tersedia.');
}

console.log('[3] Memverifikasi gallery-dl...');

const version = execFileSync(galleryDlPath, ['--version'], {
  encoding: 'utf8',
}).trim();

if (!version) {
  throw new Error('gallery-dl tidak mengembalikan versi.');
}

console.log(`gallery-dl version: ${version}`);

console.log(`GALLERY_DL_PATH=${galleryDlPath}`);