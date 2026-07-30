import type { CollectionConfig } from "payload";

import { publishedReadAdminWrite } from "./access";
import { stableKeyFields } from "./stableKey";

export const AssetDefinitions: CollectionConfig = {
  slug: "asset-definitions",
  admin: { useAsTitle: "label" },
  access: publishedReadAdminWrite,
  fields: [
    ...stableKeyFields(),
    {
      name: "assetType",
      type: "select",
      required: true,
      options: ["scene", "character", "weather", "item", "animal"],
    },
    {
      name: "loadType",
      type: "select",
      required: true,
      defaultValue: "image",
      options: ["image", "spritesheet", "atlas"],
    },
    { name: "media", type: "relationship", relationTo: "media" },
    { name: "metadata", type: "json" },
  ],
  versions: { drafts: true, maxPerDoc: 10 },
};
