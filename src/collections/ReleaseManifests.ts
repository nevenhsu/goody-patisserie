import type { CollectionConfig } from "payload";

import { publishedReadAdminWrite } from "./access";
import { stableKeyFields } from "./stableKey";

export const ReleaseManifests: CollectionConfig = {
  slug: "release-manifests",
  admin: { useAsTitle: "label" },
  access: publishedReadAdminWrite,
  fields: [
    ...stableKeyFields(),
    { name: "version", type: "text", required: true, unique: true, index: true },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Released", value: "released" },
        { label: "Retired", value: "retired" },
      ],
    },
    { name: "manifest", type: "json", required: true },
    { name: "releasedAt", type: "date" },
  ],
  hooks: {
    beforeChange: [({ operation, originalDoc }) => {
      if (operation === "update" && originalDoc?.status === "released") {
        throw new Error("Released manifests are immutable; create a new release instead.");
      }
    }],
    beforeDelete: [async ({ id, req }) => {
      const release = await req.payload.findByID({
        collection: "release-manifests",
        id,
        depth: 0,
        overrideAccess: true,
      });
      if (release.status === "released") {
        throw new Error("Released manifests cannot be deleted.");
      }
    }],
  },
  versions: { drafts: true, maxPerDoc: 20 },
};
