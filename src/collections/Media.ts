import type { CollectionConfig } from "payload";

import { publicReadAdminWrite } from "./access";

export const Media: CollectionConfig = {
  slug: "media",
  access: publicReadAdminWrite,
  admin: {
    useAsTitle: "alt",
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
    },
  ],
  upload: {
    crop: false,
    focalPoint: false,
    skipSafeFetch: true,
  },
};
