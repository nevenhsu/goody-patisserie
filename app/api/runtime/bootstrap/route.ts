import config from "@payload-config";
import { getPayload } from "payload";

import { getRuntimeExperience } from "@/src/runtime";
import {
  createPayloadRuntimeExperienceSource,
  type PayloadRuntimeReader,
} from "@/src/runtime/payload";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  let experience;
  try {
    const payload = await getPayload({ config });
    const reader: PayloadRuntimeReader = {
      findGlobal: (args) => payload.findGlobal(args),
      find: async (args) => {
        const result = await payload.find(args);
        return { docs: result.docs };
      },
    };
    experience = await getRuntimeExperience(
      createPayloadRuntimeExperienceSource(reader),
    );
  } catch {
    experience = await getRuntimeExperience();
  }

  return Response.json(experience, {
    headers: { "cache-control": "no-store" },
  });
}
