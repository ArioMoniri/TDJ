import type { Metadata } from "next";
import { PageQueryProvider } from "@/lib/usePageQuery";

/* the tab reads the page (round8-qa.md B17); the root layout's template appends " · TDJ" */
export const metadata: Metadata = { title: "Database" };

/** 2026-11: one search text for every tab of the Database (Songs, Orchestras, Cortinas), in `?q=` (lib/usePageQuery.ts) */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageQueryProvider page="database">{children}</PageQueryProvider>;
}
