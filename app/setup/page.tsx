import type { Metadata } from "next";
import { SetupWizard } from "@/components/setup/setup-wizard";

export const metadata: Metadata = {
  title: "Add product — Akif CPG",
};

export default function SetupPage() {
  return <SetupWizard />;
}
