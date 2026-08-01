import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, ".codex-art-staging", "mobile-portrait", "sources-v4");
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

async function normalize(input, filename, width, height) {
  const inputPath = path.join(source, input);
  const bounds = await alphaBounds(inputPath);
  await sharp(inputPath)
    .extract(bounds)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9, palette: false })
    .toFile(path.join(output, filename));
}

await normalize("goody-mobile-counter-top-v3-alpha.png", "goody-mobile-counter-top-v3.png", 1014, 132);
await normalize("goody-mobile-counter-base-v3-alpha.png", "goody-mobile-counter-base-v3.png", 978, 486);
