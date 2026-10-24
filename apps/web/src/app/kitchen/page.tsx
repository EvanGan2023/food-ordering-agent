import type { Metadata } from "next";
import { KitchenBoard } from "./KitchenBoard";

export const metadata: Metadata = { title: "Kitchen | Patty & Co. (demo)" };

export default function KitchenPage() {
  return <KitchenBoard />;
}
