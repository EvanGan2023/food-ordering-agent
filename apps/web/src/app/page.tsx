import Link from "next/link";
import { BrandMark, DemoBadge } from "@/components/ui";

const pages = [
  { href: "/order/demo", title: "Ordering link", text: "The agent restaurants embed on their own website: customers say or type their order." },
  { href: "/kiosk", title: "Kiosk", text: "Portrait kiosk screen (a monitor turned 90°): just say what you'd like." },
  { href: "/kitchen", title: "Kitchen screen", text: "Live tickets for staff, standing in for the POS while testing." },
  { href: "/admin", title: "Owner settings", text: "Turn the assistant on or off and choose the questions asked on every order." },
  { href: "/embed-demo", title: "Sample website", text: "A pretend restaurant homepage with the ordering button embedded." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-20">
      <div className="flex items-center gap-3">
        <BrandMark className="h-12 w-12" />
        <DemoBadge />
      </div>
      <h1 className="mt-6 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
        Patty &amp; Co.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-char-soft">
        A fictional burger shop running the open-source food ordering agent. Open each screen in its own tab to watch an
        order travel from customer to kitchen.
      </p>

      <ul className="mt-10 divide-y-2 divide-dashed divide-line border-y-2 border-dashed border-line">
        {pages.map((page) => (
          <li key={page.href}>
            <Link
              href={page.href}
              className="group flex flex-col gap-1 rounded-xl px-2 py-5 transition-colors hover:bg-card sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="font-display text-2xl font-bold group-hover:text-pickle sm:w-52 sm:shrink-0">{page.title}</span>
              <span className="text-char-soft">{page.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-char-soft">
        Menu items, prices and allergens are made up. No payments are taken.
      </p>
    </main>
  );
}
