import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const staging = path.join(root, ".codex-art-staging", "pastries");
const output = path.join(root, "public", "imagegen");
const canvas = 256;
const centerX = 128;
const baselineY = 220;

const pastries = [
  ["pandan-pearl-sugar-choux", 111, 117],
  ["pandan-thai-tea-saint-honore", 150, 122],
  ["pandan-thai-tea-saint-honore-6-inch", 206, 144],
  ["pistachio-cherry-tart", 111, 94],
  ["muscat-white-wine", 122, 117],
  ["pandan-thai-tea-cake-roll", 139, 106],
  ["vanilla-basque-cheesecake-slice", 156, 100],
  ["vanilla-basque-cheesecake-6-inch", 233, 128],
  ["pandan-madeleine-2-pack", 133, 78],
  ["pistachio-cherry-dacquoise", 122, 83],
  ["vanilla-canele", 78, 100],
];

function removeChroma(data, width, height) {
  for (let i = 0; i < data.length; i += 4) {
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    const chroma = red > 155 && blue > 155 && red - green > 65 && blue - green > 65;
    if (chroma) data[i + 3] = 0;
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const alpha = Buffer.alloc(width * height);
    for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = data[pixel * 4 + 3];
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        const offset = pixel * 4;
        if (alpha[pixel] === 0) continue;
        const touchesTransparent = alpha[pixel - 1] === 0
          || alpha[pixel + 1] === 0
          || alpha[pixel - width] === 0
          || alpha[pixel + width] === 0;
        if (!touchesTransparent) continue;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        if (red + blue - green * 2 > 145 && Math.abs(red - blue) < 110) data[offset + 3] = 0;
      }
    }
  }
}

function extendOpaqueBoundsToEdges(data, width, height) {
  const rowHasAlpha = (y) => {
    for (let x = 0; x < width; x += 1) if (data[(y * width + x) * 4 + 3] > 16) return true;
    return false;
  };
  const columnHasAlpha = (x) => {
    for (let y = 0; y < height; y += 1) if (data[(y * width + x) * 4 + 3] > 16) return true;
    return false;
  };
  let firstRow = 0;
  while (firstRow < height && !rowHasAlpha(firstRow)) firstRow += 1;
  let lastRow = height - 1;
  while (lastRow >= 0 && !rowHasAlpha(lastRow)) lastRow -= 1;
  for (let y = 0; y < firstRow; y += 1) {
    data.copy(data, y * width * 4, firstRow * width * 4, (firstRow + 1) * width * 4);
  }
  for (let y = lastRow + 1; y < height; y += 1) {
    data.copy(data, y * width * 4, lastRow * width * 4, (lastRow + 1) * width * 4);
  }
  let firstColumn = 0;
  while (firstColumn < width && !columnHasAlpha(firstColumn)) firstColumn += 1;
  let lastColumn = width - 1;
  while (lastColumn >= 0 && !columnHasAlpha(lastColumn)) lastColumn -= 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < firstColumn; x += 1) {
      data.copy(data, (y * width + x) * 4, (y * width + firstColumn) * 4, (y * width + firstColumn + 1) * 4);
    }
    for (let x = lastColumn + 1; x < width; x += 1) {
      data.copy(data, (y * width + x) * 4, (y * width + lastColumn) * 4, (y * width + lastColumn + 1) * 4);
    }
  }
}

async function alphaBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

for (const [slug, targetWidth, targetHeight] of pastries) {
  const sourcePath = path.join(staging, `${slug}-chroma.png`);
  const outputPath = path.join(output, `goody-pastry-${slug}-landscape-v2.png`);
  const source = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  removeChroma(source.data, source.info.width, source.info.height);
  const keyed = await sharp(source.data, {
    raw: { width: source.info.width, height: source.info.height, channels: 4 },
  }).png().toBuffer();
  const sourceBounds = await alphaBounds(keyed);
  const resized = await sharp(keyed)
    .extract({
      left: sourceBounds.minX,
      top: sourceBounds.minY,
      width: sourceBounds.width,
      height: sourceBounds.height,
    })
    .resize(targetWidth, targetHeight, { fit: "fill", kernel: sharp.kernel.nearest })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let offset = 3; offset < resized.data.length; offset += 4) {
    resized.data[offset] = resized.data[offset] > 16 ? 255 : 0;
  }
  extendOpaqueBoundsToEdges(resized.data, targetWidth, targetHeight);
  const trimmed = await sharp(resized.data, {
    raw: { width: targetWidth, height: targetHeight, channels: 4 },
  }).png().toBuffer();
  const left = Math.round(centerX - targetWidth / 2);
  const top = baselineY - targetHeight + 1;

  await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: trimmed, left, top }])
    .png()
    .toFile(outputPath);

  const bounds = await alphaBounds(outputPath);
  if (bounds.width !== targetWidth || bounds.height !== targetHeight || bounds.maxY !== baselineY) {
    throw new Error(`${slug}: unexpected bounds ${JSON.stringify(bounds)}`);
  }
  if (Math.abs((bounds.minX + bounds.maxX) / 2 - centerX) > 1) {
    throw new Error(`${slug}: off-center bounds ${JSON.stringify(bounds)}`);
  }
  console.log(`${slug}: ${bounds.width}x${bounds.height} center=${(bounds.minX + bounds.maxX) / 2} baseline=${bounds.maxY}`);
}
