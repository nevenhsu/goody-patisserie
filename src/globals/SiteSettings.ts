import type { GlobalConfig } from "payload";

import { isAdmin } from "../collections/access";

export const SiteSettings: GlobalConfig = {
  slug: "site-settings",
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    { name: "siteName", type: "text", required: true, defaultValue: "Goody" },
    { name: "tagline", type: "text" },
    { name: "defaultReleaseKey", type: "text" },
    { name: "featureFlags", type: "json" },
  ],
};
