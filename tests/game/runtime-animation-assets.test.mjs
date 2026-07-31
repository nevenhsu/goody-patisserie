import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = fileURLToPath(new URL("../../public/imagegen/", import.meta.url));

async function rawImage(path, extract) {
  let image = sharp(path).ensureAlpha();
  if (extract) image = image.extract(extract);
  return image.raw().toBuffer({ resolveWithObject: true });
}

function alphaBounds(data, width, height, channels) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, right, top, bottom };
}

function rgbaPalette(data, channels) {
  const palette = new Set();
  for (let index = 0; index < data.length; index += channels) {
    if (data[index + 3] === 0) continue;
    palette.add(`${data[index]},${data[index + 1]},${data[index + 2]},${data[index + 3]}`);
  }
  return palette;
}

async function assertSourcePreservingSheet({ sourceName, sheetName, width, height, splitY }) {
  const sourcePath = `${root}${sourceName}`;
  const sheetPath = `${root}${sheetName}`;
  const source = await rawImage(sourcePath);
  const metadata = await sharp(sheetPath).metadata();
  assert.deepEqual([metadata.width, metadata.height], [width * 4, height * 2]);

  const sourcePalette = rgbaPalette(source.data, source.info.channels);
  const sourceLower = await rawImage(sourcePath, { left: 0, top: splitY, width, height: height - splitY });
  const sourceBounds = alphaBounds(source.data, width, height, source.info.channels);
  const frames = [];

  for (let frame = 0; frame < 8; frame += 1) {
    const left = (frame % 4) * width;
    const top = Math.floor(frame / 4) * height;
    const tile = await rawImage(sheetPath, { left, top, width, height });
    frames.push(tile.data);
    const bounds = alphaBounds(tile.data, width, height, tile.info.channels);
    assert.equal(bounds.bottom, sourceBounds.bottom, `frame ${frame} contact line drifted`);

    const lower = await rawImage(sheetPath, {
      left,
      top: top + splitY,
      width,
      height: height - splitY,
    });
    assert.deepEqual(lower.data, sourceLower.data, `frame ${frame} changed registered lower pixels`);

    for (let index = 0; index < tile.data.length; index += tile.info.channels) {
      if (tile.data[index + 3] === 0) continue;
      const color = `${tile.data[index]},${tile.data[index + 1]},${tile.data[index + 2]},${tile.data[index + 3]}`;
      assert.equal(sourcePalette.has(color), true, `frame ${frame} introduced a non-master color`);
    }

    for (let x = 0; x < width; x += 1) {
      assert.equal(tile.data[x * tile.info.channels + 3], 0, `frame ${frame} bleeds through top edge`);
      assert.equal(tile.data[((height - 1) * width + x) * tile.info.channels + 3], 0, `frame ${frame} bleeds through bottom edge`);
    }
    for (let y = 0; y < height; y += 1) {
      assert.equal(tile.data[(y * width) * tile.info.channels + 3], 0, `frame ${frame} bleeds through left edge`);
      assert.equal(tile.data[(y * width + width - 1) * tile.info.channels + 3], 0, `frame ${frame} bleeds through right edge`);
    }
  }

  assert.ok(frames.slice(1).some((frame) => !frame.equals(frames[0])), "all eight animation frames are identical");
}

test("shopkeeper 4x2 sheet has eight source-preserving registered frames", async () => {
  await assertSourcePreservingSheet({
    sourceName: "goody-character-shopkeeper-v1.png",
    sheetName: "goody-character-shopkeeper-8f-v1.png",
    width: 512,
    height: 768,
    splitY: 500,
  });
});

test("tabby cat 4x2 sheet has eight registered transparent frames", async () => {
  const sheetPath = `${root}goody-animal-cat-8f-v1.png`;
  const metadata = await sharp(sheetPath).metadata();
  assert.deepEqual([metadata.width, metadata.height], [2048, 768]);
  const frames = [];

  for (let frame = 0; frame < 8; frame += 1) {
    const tile = await rawImage(sheetPath, {
      left: (frame % 4) * 512,
      top: Math.floor(frame / 4) * 384,
      width: 512,
      height: 384,
    });
    frames.push(tile.data);
    const bounds = alphaBounds(tile.data, 512, 384, tile.info.channels);
    assert.deepEqual([bounds.left, bounds.right, bounds.bottom], [70, 442, 364]);
    assert.ok(bounds.top >= 35 && bounds.top <= 43, `frame ${frame} height drifted`);

    for (let index = 0; index < tile.data.length; index += tile.info.channels) {
      if (tile.data[index + 3] === 0) continue;
      const [red, green, blue] = tile.data.subarray(index, index + 3);
      assert.equal(red > 180 && blue > 150 && green < 100, false, `frame ${frame} retains magenta chroma`);
    }
  }

  assert.ok(frames.slice(1).some((frame) => !frame.equals(frames[0])), "all eight cat frames are identical");
});
