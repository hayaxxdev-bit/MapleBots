const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

console.log("=== GALLERY-DL DIAGNOSTIC ===");

console.log("Node:", process.version);
console.log("Platform:", process.platform);
console.log("Arch:", process.arch);
console.log("cwd:", process.cwd());
console.log("home:", process.env.HOME);

const candidates = [
  "gallery-dl",
  path.join(process.cwd(), "bin", "gallery-dl"),
  path.join(process.env.HOME || "", ".local/bin/gallery-dl"),
];

for (const candidate of candidates) {
  console.log(`\nTesting: ${candidate}`);

  try {
    if (candidate !== "gallery-dl") {
      console.log("exists:", fs.existsSync(candidate));

      if (!fs.existsSync(candidate)) {
        continue;
      }
    }

    const result = execFileSync(candidate, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    console.log("✅ FOUND");
    console.log("version:", result.trim());
  } catch (error) {
    console.log("❌ FAILED");
    console.log("message:", error.message);
  }
}

console.log("\n=== END ===");