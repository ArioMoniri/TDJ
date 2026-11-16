import type { Metadata } from "next";

/* the tab reads the page; the root layout's template appends " · T-DJ" */
export const metadata: Metadata = { title: "Song DNA" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
