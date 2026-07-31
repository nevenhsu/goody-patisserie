import sharp from 'sharp';

const source = process.argv[2] ?? new URL('./clipboard-source.png', import.meta.url).pathname;
const output = process.argv[3] ?? new URL('./clipboard-normalized.png', import.meta.url).pathname;

const { data: src, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
const isMagenta = (r, g, b) => {
  const minChannel = Math.min(r, b);
  return (r > 180 && b > 150 && g < 100) ||
    (minChannel > 80 && g < minChannel * 0.3 && Math.abs(r - b) < 80);
};

let minX = info.width;
let minY = info.height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    const i = (y * info.width + x) * info.channels;
    if (!isMagenta(src[i], src[i + 1], src[i + 2])) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
}
if (maxX < minX || maxY < minY) throw new Error('No non-magenta subject pixels found');

const subjectWidth = maxX - minX + 1;
const subjectHeight = maxY - minY + 1;
const subject = Buffer.alloc(subjectWidth * subjectHeight * 4);
for (let y = 0; y < subjectHeight; y += 1) {
  for (let x = 0; x < subjectWidth; x += 1) {
    const si = ((minY + y) * info.width + minX + x) * info.channels;
    const di = (y * subjectWidth + x) * 4;
    const r = src[si];
    const g = src[si + 1];
    const b = src[si + 2];
    subject[di] = r;
    subject[di + 1] = g;
    subject[di + 2] = b;
    subject[di + 3] = isMagenta(r, g, b) ? 0 : 255;
  }
}

const visibleWidth = 237;
const visibleHeight = 385;
const resized = await sharp(subject, {
  raw: { width: subjectWidth, height: subjectHeight, channels: 4 },
})
  .resize(visibleWidth, visibleHeight, { fit: 'fill', kernel: sharp.kernel.nearest })
  .raw()
  .toBuffer();

const canvasWidth = 384;
const canvasHeight = 448;
const canvas = Buffer.alloc(canvasWidth * canvasHeight * 4);
for (let i = 0; i < canvas.length; i += 4) canvas[i + 3] = 0;
const offsetX = 74;
const offsetY = 28;
for (let y = 0; y < visibleHeight; y += 1) {
  for (let x = 0; x < visibleWidth; x += 1) {
    const si = (y * visibleWidth + x) * 4;
    const di = ((offsetY + y) * canvasWidth + offsetX + x) * 4;
    canvas[di] = resized[si];
    canvas[di + 1] = resized[si + 1];
    canvas[di + 2] = resized[si + 2];
    canvas[di + 3] = resized[si + 3];
  }
}

await sharp(canvas, { raw: { width: canvasWidth, height: canvasHeight, channels: 4 } })
  .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
  .toFile(output);

console.log(JSON.stringify({ source, output, sourceSize: [info.width, info.height], sourceSubject: { minX, maxX, minY, maxY, width: subjectWidth, height: subjectHeight }, canvas: [canvasWidth, canvasHeight], alphaBox: [offsetX, offsetY, offsetX + visibleWidth - 1, offsetY + visibleHeight - 1] }));
