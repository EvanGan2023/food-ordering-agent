import { notFound } from "next/navigation";
import { OrderApp } from "./OrderApp";

// The local MVP serves a single restaurant.
const RESTAURANTS = ["demo"];

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const { embed } = await searchParams;
  if (!RESTAURANTS.includes(slug)) notFound();
  return <OrderApp slug={slug} embed={embed === "1"} />;
}
