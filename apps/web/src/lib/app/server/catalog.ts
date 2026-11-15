import type { AppOverrides } from "@/lib/types";
import { runtime } from "./runtime";

/** `@/lib/server/catalog` on the device: the index bundled in the app (lib/app/deps.ts → catalogStore). */
export const getCatalog = () => runtime().catalog();
export const getCatalogFor = (overrides?: AppOverrides | null) => runtime().catalogFor(overrides);
export const coverageRows = () => runtime().catalog().coverage;
