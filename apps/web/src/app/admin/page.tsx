import type { Metadata } from "next";
import { AdminSettings } from "./AdminSettings";

export const metadata: Metadata = { title: "Owner settings | Patty & Co. (demo)" };

export default function AdminPage() {
  return <AdminSettings />;
}
