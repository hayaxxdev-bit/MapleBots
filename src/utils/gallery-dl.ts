import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../..');

const bundledGalleryDl = path.join(
  projectRoot,
  'runtime',
  'gallery-dl',
  'gallery-dl'
);

if (!fs.existsSync(bundledGalleryDl)) {
  throw new Error(
    `gallery-dl runtime tidak ditemukan: ${bundledGalleryDl}`
  );
}

export const galleryDlPath = bundledGalleryDl;