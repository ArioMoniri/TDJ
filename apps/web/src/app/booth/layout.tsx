import type { Metadata } from "next";
import "./booth.css";

/* the tab reads the page (round8-qa.md B17); the root layout's template appends " · TDJ" */
export const metadata: Metadata = { title: "Booth" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
