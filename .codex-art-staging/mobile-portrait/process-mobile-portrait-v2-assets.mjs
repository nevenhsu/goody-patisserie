import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, ".codex-art-staging", "mobile-portrait", "sources-v2");
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

const sideWallInput = path.join(source, "side-wall-v2-alpha.png");
const sideWallBounds = await alphaBounds(sideWallInput);
await sharp(sideWallInput)
  .extract(sideWallBounds)
  .resize(99, 998, {
    fit: "contain",
    kernel: sharp.kernel.nearest,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png({ compressionLevel: 9, palette: false })
  .toFile(path.join(output, "goody-mobile-side-wall-v2.png"));

await sharp(path.join(source, "floor-v2-source.png"))
  .resize(1086, 1251, { fit: "cover", position: "centre", kernel: sharp.kernel.nearest })
  .png({ compressionLevel: 9, palette: false })
  .toFile(path.join(output, "goody-mobile-floor-v2.png"));
