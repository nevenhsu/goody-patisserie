import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, ".codex-art-staging", "mobile-portrait", "sources-v3");
const output = path.join(root, "public", "imagegen");

async function alphaBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] < 64) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) throw new Error(`No visible pixels in ${file}`);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function normalizeOpaque(input, filename, width, height, position = "centre") {
  await sharp(path.join(source, input))
    .resize(width, height, { fit: "cover", position, kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9, palette: false })
    .toFile(path.join(output, filename));
}

async function normalizeIsolated(input, filename, width, height, trimTop = 0) {
  const inputPath = path.join(source, input);
  const bounds = await alphaBounds(inputPath);
  const trimmedBounds = {
    ...bounds,
    top: bounds.top + trimTop,
    height: bounds.height - trimTop,
  };
  await sharp(inputPath)
    .extract(trimmedBounds)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9, palette: false })
    .toFile(path.join(output, filename));
}

await normalizeOpaque("goody-mobile-ceiling-v2-source.png", "goody-mobile-ceiling-v2.png", 1170, 252, "south");
await normalizeIsolated("goody-mobile-backwall-v2-alpha.png", "goody-mobile-backwall-v2.png", 918, 1467);
await normalizeIsolated("goody-mobile-side-wall-v3-alpha.png", "goody-mobile-side-wall-v3.png", 165, 1770);
await normalizeOpaque("goody-mobile-floor-v3-source.png", "goody-mobile-floor-v3.png", 1170, 843);
await normalizeIsolated("goody-mobile-counter-top-v2-alpha.png", "goody-mobile-counter-top-v2.png", 1014, 132);
await normalizeIsolated("goody-mobile-counter-base-v2-alpha.png", "goody-mobile-counter-base-v2.png", 978, 486, 58);
