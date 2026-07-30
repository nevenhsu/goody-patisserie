import type { CollectionConfig } from "payload";

import { publishedReadAdminWrite } from "./access";
import { stableKeyFields } from "./stableKey";

export const CharacterPresets: CollectionConfig = {
  slug: "character-presets",
  admin: { useAsTitle: "label" },
  access: publishedReadAdminWrite,
  fields: [
    ...stableKeyFields(),
    { name: "character", type: "text", required: true, index: true },
    { name: "parts", type: "json", required: true },
    { name: "metadata", type: "json" },
  ],
  versions: { drafts: true, maxPerDoc: 10 },
};
