// Regenerates every favicon/app-icon/OG-image asset from the single
// canonical OrbitsWorks logo at ../orbitworks-app/assets/icon.png (1024x1024,
// opaque brand-blue background - the opacity matters, it's what keeps iOS
// from compositing a black background behind the home-screen icon).
//
// Re-run with `npm run generate:icons` any time that source logo changes.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SOURCE_LOGO = path.join(root, "..", "orbitworks-app", "assets", "icon.png");
const BRAND_BLUE = "#3b6fe0";

async function writePng(outPath, buffer) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await sharp(buffer).toFile(outPath);
}

async function main() {
  const logo = await sharp(SOURCE_LOGO).toBuffer();

  // favicon.ico - multi-resolution, for browsers that don't support the
  // app/icon.svg file convention (notably iOS Safari).
  const icoSizes = await Promise.all(
    [16, 32, 48].map((size) => sharp(logo).resize(size, size).png().toBuffer())
  );
  const ico = await pngToIco(icoSizes);
  await mkdir(path.join(root, "app"), { recursive: true });
  await writeFile(path.join(root, "app", "favicon.ico"), ico);

  // apple-icon.png - Next's file convention for the apple-touch-icon.
  // Must stay fully opaque (no alpha) or iOS renders a black background.
  await writePng(
    path.join(root, "app", "apple-icon.png"),
    await sharp(logo).resize(180, 180).flatten({ background: BRAND_BLUE }).png().toBuffer()
  );

  // Web app manifest icons (Android "Add to Home Screen" / PWA install).
  await writePng(
    path.join(root, "public", "icons", "icon-192.png"),
    await sharp(logo).resize(192, 192).png().toBuffer()
  );
  await writePng(
    path.join(root, "public", "icons", "icon-512.png"),
    await sharp(logo).resize(512, 512).png().toBuffer()
  );

  // opengraph-image.png - Next's file convention, auto-used for both Open
  // Graph and Twitter card previews. Logo centered on the brand color so it
  // reads clearly as a link-preview thumbnail, not just a cropped icon.
  const ogSize = 630;
  const ogLogo = await sharp(logo).resize(Math.round(ogSize * 0.55)).png().toBuffer();
  // sharp applies operations in a fixed internal order regardless of call
  // order, so composite (which always adds an alpha channel) has to be
  // materialized to a buffer before flatten can strip that alpha back out -
  // chaining .composite().flatten() in one pipeline silently keeps the alpha.
  const ogComposited = await sharp({
    create: {
      width: 1200,
      height: ogSize,
      channels: 3,
      background: BRAND_BLUE,
    },
  })
    .composite([{ input: ogLogo, gravity: "center" }])
    .png()
    .toBuffer();
  await writePng(
    path.join(root, "app", "opengraph-image.png"),
    await sharp(ogComposited).flatten({ background: BRAND_BLUE }).png().toBuffer()
  );

  console.log("Generated favicon.ico, apple-icon.png, manifest icons, and opengraph-image.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
