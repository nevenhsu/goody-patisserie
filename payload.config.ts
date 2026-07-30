import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sqliteD1Adapter } from "@payloadcms/db-d1-sqlite";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { r2Storage } from "@payloadcms/storage-r2";
import type { CloudflareContext } from "@opennextjs/cloudflare";
import type { GetPlatformProxyOptions } from "wrangler";
import { buildConfig } from "payload";

import { AssetDefinitions } from "./src/collections/AssetDefinitions";
import { CharacterParts } from "./src/collections/CharacterParts";
import { CharacterPresets } from "./src/collections/CharacterPresets";
import { InteractionDefinitions } from "./src/collections/InteractionDefinitions";
import { Media } from "./src/collections/Media";
import { ReleaseManifests } from "./src/collections/ReleaseManifests";
import { SceneSchedules } from "./src/collections/SceneSchedules";
import { SceneTemplates } from "./src/collections/SceneTemplates";
import { SceneVariants } from "./src/collections/SceneVariants";
import { Users } from "./src/collections/Users";
import { SiteSettings } from "./src/globals/SiteSettings";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const realpath = (value: string) =>
  fs.existsSync(value) ? fs.realpathSync(value) : undefined;
const isCLI = process.argv.some((value) =>
  realpath(value)?.endsWith(path.join("payload", "bin.js")),
);
const isProduction = process.env.NODE_ENV === "production";

const cloudflare =
  isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true });

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    AssetDefinitions,
    CharacterParts,
    CharacterPresets,
    SceneTemplates,
    SceneVariants,
    SceneSchedules,
    InteractionDefinitions,
    ReleaseManifests,
  ],
  editor: lexicalEditor(),
  graphQL: {
    disable: true,
  },
  secret: process.env.PAYLOAD_SECRET || cloudflare.env.PAYLOAD_SECRET || "",
  telemetry: false,
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: sqliteD1Adapter({ binding: cloudflare.env.D1 }),
  globals: [SiteSettings],
  plugins: [
    r2Storage({
      bucket: cloudflare.env.R2,
      collections: { media: true },
    }),
  ],
});

// Wrangler injects this module in development and OpenNext injects the
// platform context in a deployed Worker. Keeping the import webpack-ignored
// matches Payload's official Cloudflare template and avoids bundling Wrangler.
async function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${"__wrangler".replaceAll("_", "")}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        remoteBindings: isProduction,
      } satisfies GetPlatformProxyOptions),
  );
}
