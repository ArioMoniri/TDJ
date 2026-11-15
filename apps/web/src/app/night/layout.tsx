import type { Metadata } from "next";

export const metadata: Metadata = { title: "Open a night" };
// (wave 4: the link preview image is set per link by page.tsx generateMetadata)

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
