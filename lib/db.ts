import { init } from "@instantdb/react";
import schema from "@/instant.schema";

const APP_ID =
  process.env.NEXT_PUBLIC_INSTANT_APP_ID ??
  "c9e94b2b-b3d9-45bd-957b-cebbedfbd732";

export const db = init({ appId: APP_ID, schema });
