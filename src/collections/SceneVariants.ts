import type { CollectionConfig } from "payload";

import { publishedReadAdminWrite } from "./access";
import { stableKeyFields } from "./stableKey";

export const SceneVariants: CollectionConfig = {
  slug: "scene-variants",
  admin: { useAsTitle: "label" },
  access: publishedReadAdminWrite,
  fields: [
    ...stableKeyFields(),
    { name: "templateKey", type: "text", required: true, index: true },
    { name: "variant", type: "json", required: true },
  ],
  versions: { drafts: true, maxPerDoc: 10 },
};
