import { GuidePage } from "@/components/GuidePage";
import { getCatalog } from "@/lib/server/catalog";

export default function Guide() {
  const { contextModel } = getCatalog();
  return <GuidePage contextModel={contextModel} />;
}
