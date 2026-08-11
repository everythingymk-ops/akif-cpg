import type { Metadata } from "next";
import { PortfolioScreen } from "@/components/portfolio/portfolio-screen";

export const metadata: Metadata = {
  title: "Portfolio — Akif CPG",
};

export default function PortfolioPage() {
  return <PortfolioScreen />;
}
