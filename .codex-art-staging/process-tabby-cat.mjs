import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourcePath = path.join(root, ".codex-art-staging", "tabby-cat-sheet-chroma.png");
const outputPath = path.join(root, "public", "imagegen", "goody-animal-cat-8f-v1.png");

const sourceWidth = 2048;
const sourceHeight = 768;
const sourceFrameWidth = sourceWidth / 4;
const sourceFrameHeight = sourceHeight / 2;
const frameWidth = 512;
const frameHeight = 384;
const targetWidth = 373;
const targetHeight = 330;
const targetBaseline = 365;

const { data: keyedPixels, info } = await sharp(sourcePath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

if (info.width !== sourceWidth || info.height !== sourceHeight) {
  throw new Error(`Unexpected source size ${info.width}x${info.height}`);
}

for (let i = 0; i < keyedPixels.length; i += 4) {
  const red = keyedPixels[i];
  const green = keyedPixels[i + 1];
  const blue = keyedPixels[i + 2];
  const chroma = red > 165 && blue > 165 && red - green > 70 && blue - green > 70;
  if (chroma) {
    keyedPixels[i + 3] = 0;
  }
}

for (let pass = 0; pass < 2; pass += 1) {
  const alpha = Buffer.alloc(sourceWidth * sourceHeight);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = keyedPixels[pixel * 4 + 3];
  for (let y = 1; y < sourceHeight - 1; y += 1) {
    for (let x = 1; x < sourceWidth - 1; x += 1) {
      const pixel = y * sourceWidth + x;
      const offset = pixel * 4;
      if (alpha[pixel] === 0) continue;
      const touchesTransparent = alpha[pixel - 1] === 0
        || alpha[pixel + 1] === 0
        || alpha[pixel - sourceWidth] === 0
        || alpha[pixel + sourceWidth] === 0;
      if (!touchesTransparent) continue;
      const red = keyedPixels[offset];
      const green = keyedPixels[offset + 1];
      const blue = keyedPixels[offset + 2];
      const magentaEdge = red + blue - green * 2 > 150 && Math.abs(red - blue) < 105;
      if (magentaEdge) keyedPixels[offset + 3] = 0;
    }
  }
}

const composites = [];

for (let frame = 0; frame < 8; frame += 1) {
  const column = frame % 4;
  const row = Math.floor(frame / 4);
  const frameBuffer = await sharp(keyedPixels, {
    raw: { width: sourceWidth, height: sourceHeight, channels: 4 },
  })
    .extract({
      left: column * sourceFrameWidth,
      top: row * sourceFrameHeight,
      width: sourceFrameWidth,
      height: sourceFrameHeight,
    })
    .png()
    .toBuffer();
  const extracted = await sharp(frameBuffer)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });

  const scale = Math.min(targetWidth / extracted.info.width, targetHeight / extracted.info.height);
  const width = Math.round(extracted.info.width * scale);
  const height = Math.round(extracted.info.height * scale);
  const resized = await sharp(extracted.data)
    .resize(width, height, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  composites.push({
    input: resized,
    left: column * frameWidth + Math.round((frameWidth - width) / 2),
    top: row * frameHeight + targetBaseline - height,
  });
}

await sharp({
  create: {
    width: frameWidth * 4,
    height: frameHeight * 2,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(composites)
  .png()
  .toFile(outputPath);

console.log(outputPath);
