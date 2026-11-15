import { Users } from "lucide-react";
import { t } from "@/lib/i18n";

/** §12: the Rooms entry of the sidebar and the tablet pill (phones reach rooms from History and the share sheet). */
export const ROOMS_NAV = {
  href: "/rooms",
  get label() {
    return t("roomsNav.rooms");
  },
  icon: Users,
};
