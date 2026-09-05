/**
 * scripts/generate-pwa-icons.mjs
 * Generates PWA icon sizes from public/logo.png using sharp.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "public", "logo.png");
const DEST_DIR = resolve(ROOT, "public", "icons");

mkdirSync(DEST_DIR, { recursive: true });

const sizes = [192, 512];

for (const size of sizes) {
  const dest = resolve(DEST_DIR, `icon-${size}.png`);
  await sharp(SRC)
    .resize(size, size, { fit: "contain", background: { r: 13, g: 10, b: 26, alpha: 1 } })
    .toFile(dest);
  console.log(`✅  Generated ${dest}`);
}
