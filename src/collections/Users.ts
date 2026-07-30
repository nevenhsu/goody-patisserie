import type { CollectionConfig } from "payload";

import { isAdmin, isAdminOrBootstrap } from "./access";

export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "role", "updatedAt"],
  },
  access: {
    read: isAdmin,
    create: isAdminOrBootstrap,
    update: isAdmin,
    delete: isAdmin,
  },
  auth: true,
  fields: [
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "admin",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Editor", value: "editor" },
      ],
      access: {
        update: ({ req }) => req.user?.role === "admin",
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, req }) => {
        if (operation === "create" && !req.user) {
          return { ...data, role: "admin" };
        }
        return data;
      },
    ],
  },
  versions: false,
};
