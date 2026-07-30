import type { CollectionConfig } from "payload";

import { publishedReadAdminWrite } from "./access";
import { stableKeyFields } from "./stableKey";

export const SceneSchedules: CollectionConfig = {
  slug: "scene-schedules",
  admin: { useAsTitle: "label" },
  access: publishedReadAdminWrite,
  fields: [
    ...stableKeyFields(),
    { name: "sceneVariantKey", type: "text", required: true, index: true },
    { name: "startsAt", type: "date", required: true },
    { name: "endsAt", type: "date" },
    { name: "timezone", type: "text", required: true, defaultValue: "Asia/Taipei" },
    { name: "priority", type: "number", required: true, defaultValue: 0 },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
      ],
    },
    { name: "enabled", type: "checkbox", defaultValue: true },
  ],
  versions: { drafts: true, maxPerDoc: 20 },
};
