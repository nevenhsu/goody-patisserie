import type { CollectionConfig } from "payload";

import { publishedReadAdminWrite } from "./access";
import { stableKeyFields } from "./stableKey";

export const InteractionDefinitions: CollectionConfig = {
  slug: "interaction-definitions",
  admin: { useAsTitle: "label" },
  access: publishedReadAdminWrite,
  fields: [
    ...stableKeyFields(),
    { name: "trigger", type: "text", required: true },
    { name: "action", type: "text", required: true },
    { name: "config", type: "json" },
  ],
  versions: { drafts: true, maxPerDoc: 10 },
};
