import type { Metadata } from "next";

export const metadata: Metadata = { title: "Build by hand" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
