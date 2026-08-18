#!/usr/bin/env node

/**
 * MapleBot — Session Cleaner
 *
 * Membersihkan file temporary/sampah dari session
 * tanpa menghapus authentication utama WhatsApp.
 *
 * Usage:
 *   node scripts/clean-session.js
 *   node scripts/clean-session.js --dry-run
 *   node scripts/clean-session.js --session ./data/sessions
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();

const args = process.argv.slice(2);

function getArg(name, fallback = null) {
  const index = args.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
}

const dryRun = args.includes("--dry-run");

const sessionDir = path.resolve(
  ROOT,
  getArg(
    "--session",
    process.env.SESSION_DIR || "./data/sessions",
  ),
);

/**
 * Nama file/directory temporary
 * yang boleh dibersihkan.
 */
const TEMP_NAMES = new Set([
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",

  "session.lock",
  "lock",
  "lockfile",

  "tmp",
  "temp",
  "cache",
  "caches",
]);

/**
 * Extension file temporary.
 */
const TEMP_EXTENSIONS = new Set([
  ".tmp",
  ".temp",
  ".bak",
  ".old",
  ".swp",
  ".swo",
  ".part",
]);

/**
 * Authentication/session yang TIDAK BOLEH dihapus.
 *
 * Kita sengaja konservatif.
 */
const PROTECTED_NAMES = new Set([
  "creds.json",
  "creds",

  "auth",
  "auth_info",
  "auth_info_baileys",

  "credentials",

  "keys",
  "key",

  "app-state-sync-key",
  "app-state-sync-keys",

  "pre-key",
  "pre-keys",

  "sessions",

  "signal",

  "sender-key",
  "sender-keys",
]);

/**
 * Mengecek apakah path berada di dalam
 * direktori authentication.
 */
function isProtected(relativePath, name) {
  const lowerName = name.toLowerCase();

  if (PROTECTED_NAMES.has(lowerName)) {
    return true;
  }

  const parts = relativePath
    .split(path.sep)
    .map((part) => part.toLowerCase());

  const protectedDirectories = [
    "auth",
    "auth_info",
    "auth_info_baileys",
    "credentials",
    "keys",
    "sessions",
    "signal",
    "pre-keys",
    "pre_keys",
    "app-state-sync-key",
    "app-state-sync-keys",
  ];

  return parts.some((part) =>
    protectedDirectories.includes(part),
  );
}

/**
 * Mengecek apakah nama file/directory
 * terlihat seperti temporary data.
 */
function isTemporary(name) {
  const lower = name.toLowerCase();

  if (TEMP_NAMES.has(lower)) {
    return true;
  }

  for (const extension of TEMP_EXTENSIONS) {
    if (lower.endsWith(extension)) {
      return true;
    }
  }

  /*
   * Contoh:
   *
   * .tmp-123
   * tmp-123
   * temp-123
   */
  if (
    lower.startsWith(".tmp-") ||
    lower.startsWith("tmp-") ||
    lower.startsWith("temp-")
  ) {
    return true;
  }

  return false;
}

/**
 * Format byte menjadi ukuran manusia.
 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes || 0} B`;
  }

  const units = [
    "KB",
    "MB",
    "GB",
    "TB",
  ];

  let value = bytes;
  let unit = -1;

  do {
    value /= 1024;
    unit++;
  } while (
    value >= 1024 &&
    unit < units.length - 1
  );

  return `${value.toFixed(
    value >= 10 ? 1 : 2,
  )} ${units[unit]}`;
}

/**
 * Scan session directory.
 */
function inspectDirectory(
  directory,
  relative = "",
) {
  const results = [];

  let entries;

  try {
    entries = fs.readdirSync(directory, {
      withFileTypes: true,
    });
  } catch (error) {
    console.error(
      `Cannot read: ${directory}`,
    );

    console.error(
      `  ${error.message}`,
    );

    return results;
  }

  for (const entry of entries) {
    const absolute = path.join(
      directory,
      entry.name,
    );

    const rel = path.join(
      relative,
      entry.name,
    );

    /**
     * Authentication data dilewati.
     */
    if (
      isProtected(
        rel,
        entry.name,
      )
    ) {
      continue;
    }

    /**
     * Temporary directory.
     */
    if (entry.isDirectory()) {
      if (isTemporary(entry.name)) {
        results.push({
          type: "directory",
          path: absolute,
          relative: rel,
        });

        continue;
      }

      results.push(
        ...inspectDirectory(
          absolute,
          rel,
        ),
      );

      continue;
    }

    /**
     * Temporary file.
     */
    if (
      entry.isFile() &&
      isTemporary(entry.name)
    ) {
      results.push({
        type: "file",
        path: absolute,
        relative: rel,
      });
    }
  }

  return results;
}

/**
 * Hitung ukuran file/directory.
 */
function getSize(target) {
  try {
    const stat = fs.statSync(target);

    if (stat.isFile()) {
      return stat.size;
    }

    if (stat.isDirectory()) {
      let total = 0;

      for (
        const entry of fs.readdirSync(
          target,
          {
            withFileTypes: true,
          },
        )
      ) {
        total += getSize(
          path.join(
            target,
            entry.name,
          ),
        );
      }

      return total;
    }
  } catch {
    return 0;
  }

  return 0;
}

/**
 * Hapus target.
 */
function remove(target, type) {
  if (dryRun) {
    return;
  }

  if (type === "directory") {
    fs.rmSync(target, {
      recursive: true,
      force: true,
    });

    return;
  }

  fs.rmSync(target, {
    force: true,
  });
}

/**
 * Main.
 */
function main() {
  console.log("");
  console.log(
    "🍁 MapleBot Session Cleaner",
  );
  console.log(
    "===========================",
  );

  console.log(
    `Session : ${sessionDir}`,
  );

  console.log(
    `Mode    : ${
      dryRun
        ? "DRY RUN"
        : "CLEAN"
    }`,
  );

  console.log("");

  /**
   * Session directory belum ada.
   */
  if (!fs.existsSync(sessionDir)) {
    console.log(
      "Session directory does not exist.",
    );

    console.log(
      "Nothing to clean.",
    );

    return;
  }

  /**
   * Pastikan benar-benar directory.
   */
  if (
    !fs.statSync(sessionDir).isDirectory()
  ) {
    console.error(
      "SESSION_DIR is not a directory.",
    );

    process.exitCode = 1;

    return;
  }

  /**
   * Cari file temporary.
   */
  const candidates =
    inspectDirectory(sessionDir);

  if (candidates.length === 0) {
    console.log(
      "✅ No temporary session files found.",
    );

    console.log(
      "🔐 Authentication/session credentials were left untouched.",
    );

    return;
  }

  let totalBytes = 0;

  /**
   * Proses setiap candidate.
   */
  for (const item of candidates) {
    const size = getSize(item.path);

    totalBytes += size;

    console.log(
      `${
        dryRun
          ? "[WOULD REMOVE]"
          : "[REMOVE]"
      } ${item.relative} (${formatBytes(size)})`,
    );

    try {
      remove(
        item.path,
        item.type,
      );
    } catch (error) {
      console.error(
        `  ❌ Failed: ${error.message}`,
      );
    }
  }

  console.log("");

  console.log(
    `${
      dryRun
        ? "Would clean"
        : "Cleaned"
    }: ${candidates.length} item(s), ${formatBytes(totalBytes)}`,
  );

  console.log(
    "🔐 Protected authentication/session data was not touched.",
  );

  console.log("");
}

main();