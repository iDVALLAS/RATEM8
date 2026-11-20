import type { Metadata } from "next";
import { MLO_COMMAND_ICONS } from "@/lib/content/mlo-command-meta";

/** MLO Command's own tab and home-screen icon on these pages. */
export const metadata: Metadata = { title: { template: "%s — MLO Command Center", default: "MLO Command Center" }, icons: MLO_COMMAND_ICONS };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
