import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();

export const galleryDlPath = path.join(projectRoot, 'runtime', 'gallery-dl', 'gallery-dl');

export function isGalleryDlAvailable(): boolean {
  return fs.existsSync(galleryDlPath);
}

if (!isGalleryDlAvailable()) {
  throw new Error(`gallery-dl runtime tidak ditemukan: ${galleryDlPath}`);
}
