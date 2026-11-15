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
  { href: "/", label: "Compose", icon: ListMusic },
  { href: "/booth", label: "Booth", icon: Play },
  { href: "/build", label: "Build by hand", icon: Hand },
  { href: "/library", label: "Library", icon: Disc3 },
  { href: "/database", label: "Database", icon: Database },
  { href: "/history", label: "History", icon: Clock },
  ROOMS_NAV,
];
export const NAV_PINNED: NavItem[] = [
  { href: "/guide", label: "Guide", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];
const ALL = [...NAV_MAIN, ...NAV_PINNED];

/** the sm–lg pill: everything, in the sidebar's order */
export const PILL_ITEMS: NavItem[] = ALL;
/** the phone tab bar: five tabs, then More */
export const PHONE_TABS: NavItem[] = ["/", "/booth", "/library", "/history", "/database"].map(at);
export const PHONE_MORE: NavItem[] = ["/build", "/rooms", "/guide", "/settings"].map(at);
/** the sidebar's first section: the night and what it is made from (it was "Library", like the item inside it) */
export const NAV_MAIN_TITLE = "Night";
