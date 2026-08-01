import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const staging = path.join(root, ".codex-art-staging", "mobile-portrait");
const output = path.join(root, "public", "imagegen");

const alphaAssets = [
  ["goody-mobile-side-wall-v1-alpha.png", "goody-mobile-side-wall-v1.png", 99, 930],
  ["goody-mobile-ceiling-fixture-v1-alpha.png", "goody-mobile-ceiling-fixture-v1.png", 417, 360],
  ["goody-mobile-fridge-v1-alpha.png", "goody-mobile-fridge-v1.png", 215, 364],
  ["goody-mobile-oven-v1-alpha.png", "goody-mobile-oven-v1.png", 150, 450],
  ["goody-mobile-oven-curtain-v1-alpha.png", "goody-mobile-oven-curtain-v1.png", 300, 452],
  ["goody-mobile-counter-base-v1-alpha.png", "goody-mobile-counter-base-v1.png", 980, 301],
  ["goody-mobile-counter-top-v1-alpha.png", "goody-mobile-counter-top-v1.png", 948, 83],
];

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

for (const [inputName, outputName, width, height] of alphaAssets) {
  const inputPath = path.join(staging, inputName);
  const bounds = await alphaBounds(inputPath);
  await sharp(inputPath)
    .extract(bounds)
    .resize(width, height, {
      fit: "contain",
      kernel: sharp.kernel.nearest,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, palette: false })
    .toFile(path.join(output, outputName));
}

await sharp(path.join(staging, "goody-mobile-ceiling-backwall-v1-source.png"))
  .resize({ width: 1086, kernel: sharp.kernel.nearest })
  .extract({ left: 0, top: 0, width: 1086, height: 809 })
  .png({ compressionLevel: 9, palette: false })
  .toFile(path.join(output, "goody-mobile-ceiling-backwall-v1.png"));

await sharp(path.join(staging, "goody-mobile-floor-v1-source.png"))
  .resize(1086, 349, { fit: "cover", position: "centre", kernel: sharp.kernel.nearest })
  .png({ compressionLevel: 9, palette: false })
  .toFile(path.join(output, "goody-mobile-floor-v1.png"));
