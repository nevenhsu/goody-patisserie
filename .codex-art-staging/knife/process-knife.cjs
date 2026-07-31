// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');

const sourcePath = process.argv[2] ?? '.codex-art-staging/knife/chroma-source.png';
const cutoutPath = process.argv[3] ?? '.codex-art-staging/knife/chroma-cutout.png';
const finalPath = process.argv[4] ?? 'public/imagegen/goody-side-prop-left-magnetic-knife-rack-perspective-v1.png';

const TARGET_WIDTH = 220;
const TARGET_HEIGHT = 170;
const BBOX = { left: 12, top: 20, width: 197, height: 145 };

async function main() {
  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(info.width * info.height * 4);
  const alpha = new Uint8Array(info.width * info.height);
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  // ImageGen's chroma is near #ff00ff, with small source-side color drift.
  // Key only pixels where both red and blue dominate green; warm metal and
  // cool steel fail this test and stay opaque.
  for (let p = 0; p < info.width * info.height; p += 1) {
    const r = data[p * 3];
    const g = data[p * 3 + 1];
    const b = data[p * 3 + 2];
    const magentaScore = Math.min(r - g, b - g);
    const a = magentaScore >= 170
      ? 0
      : magentaScore <= 50
        ? 255
        : Math.max(0, Math.min(255, Math.round((170 - magentaScore) * (255 / 120))));
    alpha[p] = a;
    const offset = p * 4;
    if (a > 0) {
      // Unmix anti-aliased edge pixels from magenta background to avoid a
      // visible pink fringe after compositing on the cafe wall.
      const mix = a / 255;
      const bgR = 251;
      const bgG = 3;
      const bgB = 249;
      rgba[offset] = Math.max(0, Math.min(255, Math.round((r - (1 - mix) * bgR) / mix)));
      rgba[offset + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - mix) * bgG) / mix)));
      rgba[offset + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - mix) * bgB) / mix)));
      rgba[offset + 3] = a;
      if (a > 0) {
        const x = p % info.width;
        const y = Math.floor(p / info.width);
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) throw new Error('Chroma removal produced empty image');

  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(cutoutPath);

  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const fitted = await sharp(cutoutPath)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(BBOX.width, BBOX.height, { fit: 'fill', kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  // Nearest-neighbor can drop a one-pixel source edge when its coverage is
  // below half a destination pixel. Copy the adjacent visible edge inward so
  // final alpha bounds remain the approved exact coordinates.
  const fittedRaw = await sharp(fitted).raw().toBuffer({ resolveWithObject: true });
  const fittedPixels = Buffer.from(fittedRaw.data);
  const copyColumnIfEmpty = (targetX, sourceX) => {
    let hasAlpha = false;
    for (let y = 0; y < BBOX.height; y += 1) {
      if (fittedPixels[(y * BBOX.width + targetX) * 4 + 3] > 0) { hasAlpha = true; break; }
    }
    if (!hasAlpha) {
      for (let y = 0; y < BBOX.height; y += 1) {
        const to = (y * BBOX.width + targetX) * 4;
        const from = (y * BBOX.width + sourceX) * 4;
        fittedPixels[to] = fittedPixels[from];
        fittedPixels[to + 1] = fittedPixels[from + 1];
        fittedPixels[to + 2] = fittedPixels[from + 2];
        fittedPixels[to + 3] = fittedPixels[from + 3];
      }
    }
  };
  const copyRowIfEmpty = (targetY, sourceY) => {
    let hasAlpha = false;
    for (let x = 0; x < BBOX.width; x += 1) {
      if (fittedPixels[(targetY * BBOX.width + x) * 4 + 3] > 0) { hasAlpha = true; break; }
    }
    if (!hasAlpha) {
      for (let x = 0; x < BBOX.width; x += 1) {
        const to = (targetY * BBOX.width + x) * 4;
        const from = (sourceY * BBOX.width + x) * 4;
        fittedPixels[to] = fittedPixels[from];
        fittedPixels[to + 1] = fittedPixels[from + 1];
        fittedPixels[to + 2] = fittedPixels[from + 2];
        fittedPixels[to + 3] = fittedPixels[from + 3];
      }
    }
  };
  copyColumnIfEmpty(0, 1);
  copyColumnIfEmpty(BBOX.width - 1, BBOX.width - 2);
  copyRowIfEmpty(0, 1);
  copyRowIfEmpty(BBOX.height - 1, BBOX.height - 2);
  const fittedNormalized = await sharp(fittedPixels, {
    raw: { width: BBOX.width, height: BBOX.height, channels: 4 },
  }).png().toBuffer();

  await sharp({
    create: {
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fittedNormalized, left: BBOX.left, top: BBOX.top }])
    .png()
    .toFile(finalPath);

  console.log(JSON.stringify({ sourcePath, cutoutPath, finalPath, sourceSize: [info.width, info.height], sourceAlphaBbox: { left, top, right, bottom, width: cropWidth, height: cropHeight }, finalBbox: BBOX }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
