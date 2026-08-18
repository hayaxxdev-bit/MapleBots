const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();

const runtimeDir = path.join(
  projectRoot,
  'runtime',
  'gallery-dl'
);

const galleryDlPath = path.join(
  runtimeDir,
  'gallery-dl'
);

const sitePackages = path.join(
  runtimeDir,
  'site-packages'
);

console.log('=== GALLERY-DL BOOTSTRAP ===');
console.log(`Project      : ${projectRoot}`);
console.log(`Runtime      : ${runtimeDir}`);
console.log(`Site-packages: ${sitePackages}`);
console.log(`Binary       : ${galleryDlPath}`);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!fs.existsSync(runtimeDir)) {
  fail(`Runtime directory tidak ditemukan: ${runtimeDir}`);
}

if (!fs.existsSync(sitePackages)) {
  fail(
    `gallery-dl site-packages tidak ditemukan: ${sitePackages}`
  );
}

if (!fs.existsSync(galleryDlPath)) {
  fail(
    `gallery-dl launcher tidak ditemukan: ${galleryDlPath}`
  );
}

try {
  fs.accessSync(galleryDlPath, fs.constants.X_OK);
} catch {
  fail(
    `gallery-dl launcher tidak executable: ${galleryDlPath}`
  );
}

console.log('\n[1] Python runtime...');

try {
  const pythonVersion = execFileSync(
    'python3',
    ['--version'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  ).trim();

  console.log(`Python       : ${pythonVersion}`);
} catch (error) {
  fail(`python3 tidak tersedia: ${error.message}`);
}

console.log('\n[2] Verifikasi gallery-dl...');

try {
  const version = execFileSync(
    galleryDlPath,
    ['--version'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  ).trim();

  if (!version) {
    fail('gallery-dl tidak mengembalikan versi.');
  }

  console.log(`gallery-dl   : ${version}`);
} catch (error) {
  console.error(
    error.stderr || error.message || error
  );

  fail('gallery-dl gagal dijalankan.');
}

console.log('\n[3] Verifikasi Python module...');

try {
  const output = execFileSync(
    galleryDlPath,
    ['--help'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024,
    }
  );

  if (!output.includes('Usage:')) {
    fail('gallery-dl berhasil dijalankan tetapi output help tidak valid.');
  }

  console.log('gallery-dl module: OK');
} catch (error) {
  console.error(
    error.stderr || error.message || error
  );

  fail('gallery-dl module verification gagal.');
}

console.log('\n=== GALLERY-DL READY ===');
console.log(`GALLERY_DL_PATH=${galleryDlPath}`);