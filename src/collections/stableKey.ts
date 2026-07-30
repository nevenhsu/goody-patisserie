import type { Field } from "payload";

export const stableKeyFields = (): Field[] => [
  {
    name: "key",
    type: "text",
    required: true,
    unique: true,
    index: true,
  },
  {
    name: "label",
    type: "text",
    required: true,
  },
];
