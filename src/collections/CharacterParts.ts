import type { CollectionConfig } from "payload";

import { publishedReadAdminWrite } from "./access";
import { stableKeyFields } from "./stableKey";

export const CharacterParts: CollectionConfig = {
  slug: "character-parts",
  admin: { useAsTitle: "label" },
  access: publishedReadAdminWrite,
  fields: [
    ...stableKeyFields(),
    { name: "partType", type: "text", required: true },
    { name: "assetKey", type: "text", required: true, index: true },
    { name: "variants", type: "json" },
  ],
  versions: { drafts: true, maxPerDoc: 10 },
};
