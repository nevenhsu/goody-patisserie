import sharp from "sharp";
import { fileURLToPath } from "node:url";

const assets = [
  {
    input: "side-pan-pair-chroma.png",
    output: "goody-side-prop-left-pan-pair-perspective-v1.png",
    width: 220,
    height: 300,
    angle: 0,
  },
  {
    input: "side-utensil-rail-chroma.png",
    output: "goody-side-prop-left-utensil-rail-perspective-v1.png",
    width: 260,
    height: 250,
    angle: -11.2310028339,
  },
  {
    input: "side-mold-pair-chroma.png",
    output: "goody-side-prop-left-mold-pair-perspective-v1.png",
    width: 220,
    height: 170,
    angle: -14.8292140042,
  },
  {
    input: "side-frame-upper-chroma.png",
    output: "goody-side-prop-right-tokyo-frame-perspective-v1.png",
    width: 160,
    height: 200,
    angle: 0,
  },
  {
    input: "side-frame-lower-chroma.png",
    output: "goody-side-prop-right-melbourne-frame-perspective-v1.png",
    width: 160,
    height: 200,
    angle: 0,
  },
  {
    input: "side-plant-shelf-chroma.png",
    output: "goody-side-prop-right-plant-shelf-perspective-v1.png",
    width: 300,
    height: 280,
    angle: 0,
  },
];

const smoothstep = (value) => value * value * (3 - 2 * value);

async function removeChroma(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const distance = Math.hypot(red - 255, green, blue - 255);
      const distanceMatte = distance <= 12 ? 0 : distance >= 118 ? 1 : smoothstep((distance - 12) / 106);
      const magentaScore = Math.min(red, blue) - green;
      const magentaMatte = magentaScore <= 16
        ? 1
        : magentaScore >= 80
          ? 0
          : 1 - smoothstep((magentaScore - 16) / 64);
      const matte = Math.min(distanceMatte, magentaMatte);
      const alpha = Math.round(data[index + 3] * matte);
      data[index + 3] = alpha;
      if (alpha > 0 && magentaScore > 16) {
        const despill = Math.min(magentaScore - 16, 96);
        data[index] = Math.max(0, red - despill);
        data[index + 2] = Math.max(0, blue - despill);
      }
      if (alpha >= 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) throw new Error(`No subject after chroma removal: ${input}`);
  return {
    data,
    info,
    bounds: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

async function processAsset(asset) {
  const input = new URL(`./${asset.input}`, import.meta.url);
  const output = new URL(`../public/imagegen/${asset.output}`, import.meta.url);
  const keyed = await removeChroma(fileURLToPath(input));
  const shear = Math.tan(asset.angle * Math.PI / 180);
  const padding = 8;
  const availableWidth = asset.width - padding * 2;
  const maxSubjectHeight = asset.height - padding * 2;
  const scale = Math.min(
    availableWidth / keyed.bounds.width,
    maxSubjectHeight / (keyed.bounds.height + Math.abs(shear) * keyed.bounds.width),
  );
  const subjectWidth = Math.max(1, Math.round(keyed.bounds.width * scale));
  const subjectHeight = Math.max(1, Math.round(keyed.bounds.height * scale));
  let subject = sharp(keyed.data, {
    raw: { width: keyed.info.width, height: keyed.info.height, channels: 4 },
  })
    .extract(keyed.bounds)
    .resize(subjectWidth, subjectHeight, { kernel: sharp.kernel.nearest });
  if (asset.flip) subject = subject.flop();
  const cropped = await subject.raw().toBuffer();

  const outputData = Buffer.alloc(asset.width * asset.height * 4);
  const shearedHeight = subjectHeight + Math.ceil(Math.abs(shear) * subjectWidth);
  const originX = Math.floor((asset.width - subjectWidth) / 2);
  const originY = Math.floor((asset.height - shearedHeight) / 2);
  const shearOffset = shear < 0 ? Math.ceil(Math.abs(shear) * subjectWidth / 2) : 0;

  for (let y = 0; y < subjectHeight; y += 1) {
    for (let x = 0; x < subjectWidth; x += 1) {
      const source = (y * subjectWidth + x) * 4;
      if (cropped[source + 3] === 0) continue;
      const targetX = originX + x;
      const targetY = originY + y + Math.round(shear * (x - subjectWidth / 2)) + shearOffset;
      if (targetX < 0 || targetX >= asset.width || targetY < 0 || targetY >= asset.height) continue;
      const target = (targetY * asset.width + targetX) * 4;
      cropped.copy(outputData, target, source, source + 4);
    }
  }

  await sharp(outputData, { raw: { width: asset.width, height: asset.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(fileURLToPath(output));
}

for (const asset of assets) await processAsset(asset);

const floorOutput = new URL("../public/imagegen/goody-floor-canonical-v3.png", import.meta.url);
const floorWidth = 1536;
const floorHeight = 512;
const floorPitchX = 96;
const floorPitchY = 64;
const floorGrout = 4;
const floorData = Buffer.alloc(floorWidth * floorHeight * 3);

for (let y = 0; y < floorHeight; y += 1) {
  for (let x = 0; x < floorWidth; x += 1) {
    const localX = x % floorPitchX;
    const localY = y % floorPitchY;
    const target = (y * floorWidth + x) * 3;
    let red;
    let green;
    let blue;

    if (localX < floorGrout || localY < floorGrout) {
      [red, green, blue] = [118, 77, 55];
    } else if (localX === floorGrout || localY === floorGrout) {
      [red, green, blue] = [246, 207, 171];
    } else if (localX >= floorPitchX - 3 || localY >= floorPitchY - 3) {
      [red, green, blue] = [190, 132, 94];
    } else {
      const blockX = Math.floor(x / 4);
      const blockY = Math.floor(y / 4);
      const noise = ((blockX * 37 + blockY * 17 + (blockX ^ blockY) * 3) % 9) - 4;
      const checker = (blockX + blockY) % 7 === 0 ? 3 : 0;
      red = 228 + noise + checker;
      green = 177 + noise + checker;
      blue = 137 + noise + checker;
    }

    floorData[target] = red;
    floorData[target + 1] = green;
    floorData[target + 2] = blue;
  }
}

await sharp(floorData, { raw: { width: floorWidth, height: floorHeight, channels: 3 } })
  .png({ compressionLevel: 9, palette: false })
  .toFile(fileURLToPath(floorOutput));
