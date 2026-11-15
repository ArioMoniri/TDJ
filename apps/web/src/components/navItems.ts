import {
  BookOpen,
  Clock,
  Database,
  Disc3,
  Hand,
  ListMusic,
  type LucideIcon,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { ROOMS_NAV } from "./RoomsNav";

/**
 * Every place the app can go, in one list for the three navs (wave 2: Rooms and Build by hand were missing from the
 * iPad-portrait pill and the iPhone tab bar, and Booth from the iPhone): the lg sidebar shows `NAV_MAIN` under its
 * first section and `NAV_PINNED` at its foot, the sm–lg pill shows both, and the phone tab bar shows `PHONE_TABS`
 * with the rest (`PHONE_MORE`) behind a More tab.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}
const at = (href: string): NavItem => ALL.find((i) => i.href === href)!;

export const NAV_MAIN: NavItem[] = [
  {
    href: "/",
    get label() {
      return t("navItems.compose");
    },
    icon: ListMusic,
  },
  {
    href: "/booth",
    get label() {
      return t("navItems.booth");
    },
    icon: Play,
  },
  {
    href: "/build",
    get label() {
      return t("navItems.build_by_hand");
    },
    icon: Hand,
  },
  {
    href: "/library",
    get label() {
      return t("navItems.library");
    },
    icon: Disc3,
  },
  {
    href: "/database",
    get label() {
      return t("navItems.database");
    },
    icon: Database,
  },
  {
    href: "/history",
    get label() {
      return t("navItems.history");
    },
    icon: Clock,
  },
  ROOMS_NAV,
];
export const NAV_PINNED: NavItem[] = [
  {
    href: "/guide",
    get label() {
      return t("navItems.guide");
    },
    icon: BookOpen,
  },
  {
    href: "/settings",
    get label() {
      return t("navItems.settings");
    },
    icon: SlidersHorizontal,
  },
];
const ALL = [...NAV_MAIN, ...NAV_PINNED];

/** the sm–lg pill: everything, in the sidebar's order */
export const PILL_ITEMS: NavItem[] = ALL;
/** the phone tab bar: five tabs, then More */
export const PHONE_TABS: NavItem[] = ["/", "/booth", "/library", "/history", "/database"].map(at);
export const PHONE_MORE: NavItem[] = ["/build", "/rooms", "/guide", "/settings"].map(at);
/** the sidebar's first section: the night and what it is made from (it was "Library", like the item inside it) */
export const NAV_MAIN_TITLE = () => t("navItems.night");
