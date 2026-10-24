import type { Metadata } from "next";
import { KioskApp } from "./KioskApp";

export const metadata: Metadata = { title: "Kiosk | Patty & Co. (demo)" };

export default function KioskPage() {
  return <KioskApp />;
}
