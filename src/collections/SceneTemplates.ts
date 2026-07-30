import type { CollectionConfig } from "payload";

import { publishedReadAdminWrite } from "./access";
import { stableKeyFields } from "./stableKey";

export const SceneTemplates: CollectionConfig = {
  slug: "scene-templates",
  admin: { useAsTitle: "label" },
  access: publishedReadAdminWrite,
  fields: [
    ...stableKeyFields(),
    { name: "sceneType", type: "text", required: true },
    { name: "definition", type: "json", required: true },
  ],
  versions: { drafts: true, maxPerDoc: 10 },
};
