import type { Metadata } from "next";

export const metadata: Metadata = { title: "Open a night" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
