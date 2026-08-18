import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type SupportedInputFormat =
  | 'gif'
  | 'webm'
  | 'mov';

function createTempPath(
  extension: string,
): string {
  return path.join(
    os.tmpdir(),
    `maplebot-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`,
  );
}

function runFfmpeg(
  args: string[],
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      const process = spawn(
        'ffmpeg',
        args,
        {
          stdio: [
            'ignore',
            'ignore',
            'pipe',
          ],
        },
      );

      let stderr = '';

      process.stderr.on(
        'data',
        (chunk: Buffer) => {
          stderr += chunk.toString();
        },
      );

      process.once(
        'error',
        (error) => {
          reject(error);
        },
      );

      process.once(
        'close',
        (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(
            new Error(
              [
                `FFmpeg exited with code ${code}.`,
                stderr.trim(),
              ]
                .filter(Boolean)
                .join(' '),
            ),
          );
        },
      );
    },
  );
}

/**
 * Convert GIF → MP4 suitable for WhatsApp.
 *
 * The output is an MP4 video encoded with
 * H.264 and yuv420p.
 */
export async function gifToMp4(
  input: Buffer,
): Promise<Buffer> {
  return convertBufferToMp4(
    input,
    'gif',
  );
}

/**
 * Convert WebM/MOV → MP4.
 */
export async function convertToMp4(
  input: Buffer,
  format: SupportedInputFormat,
): Promise<Buffer> {
  return convertBufferToMp4(
    input,
    format,
  );
}

async function convertBufferToMp4(
  input: Buffer,
  inputExtension: string,
): Promise<Buffer> {
  const inputPath =
    createTempPath(
      inputExtension,
    );

  const outputPath =
    createTempPath('mp4');

  try {
    /*
     * Write source media to temporary file.
     */
    await fs.writeFile(
      inputPath,
      input,
    );

    /*
     * Convert to MP4.
     *
     * - movflags +faststart:
     *   places MP4 metadata at the beginning.
     *
     * - libx264:
     *   broadly supported H.264 codec.
     *
     * - yuv420p:
     *   compatibility with WhatsApp/mobile devices.
     *
     * - an:
     *   remove audio from GIF/video assets
     *   where it is not needed.
     */
    await runFfmpeg([
      '-y',

      '-i',
      inputPath,

      '-movflags',
      '+faststart',

      '-vf',
      [
        'fps=15',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      ].join(','),

      '-c:v',
      'libx264',

      '-pix_fmt',
      'yuv420p',

      '-an',

      outputPath,
    ]);

    /*
     * Read converted MP4.
     */
    return await fs.readFile(
      outputPath,
    );
  } finally {
    /*
     * Always remove temporary files.
     */
    await Promise.allSettled([
      fs.unlink(inputPath),
      fs.unlink(outputPath),
    ]);
  }
}