import { Composer } from "@/components/Composer";
export default function Page() {
  // no Suspense boundary here: it made React hydrate the composer at low priority, so a ⌘↩ or an Era change a few
  // hundred ms after load was lost (the `?featured=` deep link is read from `location` in an effect instead)
  return <Composer />;
}
