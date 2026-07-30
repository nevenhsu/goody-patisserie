import type { Access } from "payload";

export const isAdmin: Access = ({ req }) => req.user?.role === "admin";

function secretsMatch(received: string, expected: string): boolean {
  if (received.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < received.length; index += 1) {
    difference |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export const isAdminOrBootstrap: Access = async ({ req }) => {
  if (isAdmin({ req })) return true;

  const expected = process.env.GOODY_BOOTSTRAP_SECRET;
  const received = req.headers.get("x-goody-bootstrap-secret") ?? "";
  if (!expected || !secretsMatch(received, expected)) return false;

  const result = await req.payload.count({ collection: "users" });
  return result.totalDocs === 0;
};

export const publicReadAdminWrite = {
  read: () => true,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
};

export const publishedReadAdminWrite = {
  read: (({ req }) => req.user?.role === "admin"
    ? true
    : { _status: { equals: "published" } }) satisfies Access,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
};
