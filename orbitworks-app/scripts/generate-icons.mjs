// Regenerates the Android adaptive-icon layers and splash image from the
// canonical OrbitsWorks logo at assets/icon.png (1024x1024, opaque
// brand-blue background, white orbit glyph - same master used by
// orbitworks-web's icon generator).
//
// Re-run with `npm run generate:icons` any time that source logo changes.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SOURCE_LOGO = path.join(root, "assets", "icon.png");

// Must match the flat background baked into assets/icon.png (#3b6fe0).
const BG = { r: 59, g: 111, b: 224 };

// assets/icon.png is a flat blend of BG and solid white at every pixel (an
// opaque PNG with no other colors) - so solving pixel = (1-t)*BG + t*255 for
// t per channel and averaging recovers an exact alpha mask. Rewriting the
// glyph as solid white at that alpha lets it composite cleanly over any
// background, which is what Android's adaptive-icon foreground/monochrome
// layers need (they're drawn over a separate backgroundColor, not baked-in).
async function extractGlyphOnTransparent() {
  const { data, info } = await sharp(SOURCE_LOGO)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const t =
      ((r - BG.r) / (255 - BG.r) +
        (g - BG.g) / (255 - BG.g) +
        (b - BG.b) / (255 - BG.b)) /
      3;
    const alpha = Math.max(0, Math.min(255, Math.round(t * 255)));
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = alpha;
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function main() {
  const glyph = await extractGlyphOnTransparent();

  await sharp(glyph)
    .resize(512, 512)
    .png()
    .toFile(path.join(root, "assets", "android-icon-foreground.png"));

  await sharp(glyph)
    .resize(432, 432)
    .png()
    .toFile(path.join(root, "assets", "android-icon-monochrome.png"));

  // Splash reuses the full opaque master directly - its background already
  // matches the splash screen's own configured backgroundColor (#3b6fe0),
  // so there's no visible seam.
  await sharp(SOURCE_LOGO)
    .resize(512, 512)
    .png()
    .toFile(path.join(root, "assets", "splash-icon.png"));

  console.log(
    "Generated android-icon-foreground.png, android-icon-monochrome.png, and splash-icon.png"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
