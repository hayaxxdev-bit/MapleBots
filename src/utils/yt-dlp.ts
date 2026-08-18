import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../..');

const bundledYtDlp = path.join(
  projectRoot,
  'runtime',
  'yt-dlp',
  'yt-dlp'
);

if (!fs.existsSync(bundledYtDlp)) {
  throw new Error(
    `yt-dlp runtime tidak ditemukan: ${bundledYtDlp}`
  );
}

export const ytDlpPath = bundledYtDlp;