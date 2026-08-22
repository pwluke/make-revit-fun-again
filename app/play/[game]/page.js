import Link from "next/link";
import { notFound } from "next/navigation";
import { AGE_TIERS, findTier } from "@/components/game-2/tiers";

export function generateStaticParams() {
  return AGE_TIERS.map((tier) => ({ tier: tier.slug }));
}

export async function generateMetadata({ params }) {
  const { tier: slug } = await params;
  const tier = findTier(slug);
  if (!tier) return {};
  return { title: `${tier.title} · ${tier.ageLabel}` };
}

// `params` is a Promise in Next 16 — see docs/01-app/01-getting-started/
// 03-layouts-and-pages.md ("Creating a dynamic segment").
export default async function PlayTier({ params }) {
  const { tier: slug } = await params;
  const tier = findTier(slug);
  if (!tier) notFound();

  return (
    <main
      className="font-sans flex min-h-dvh flex-col items-center justify-center gap-4 bg-[linear-gradient(155deg,var(--tile-from)_0%,var(--tile-to)_100%)] px-6 text-center"
      style={{
        "--tile-from": tier.palette.from,
        "--tile-to": tier.palette.to,
        "--tile-accent": tier.palette.accent,
      }}
    >
      <span className="text-xs font-semibold tracking-[0.2em] text-white/80 uppercase">
        {tier.ageLabel}
      </span>
      <h1 className="text-4xl font-semibold text-white drop-shadow-sm sm:text-5xl">
        {tier.title}
      </h1>
      <p className="max-w-md text-white/85">{tier.tagline}</p>
      <p className="mt-2 rounded-full bg-black/25 px-4 py-1.5 text-sm text-white backdrop-blur-sm">
        This world is still in development.
      </p>
      <Link
        href="/"
        className="mt-4 text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white"
      >
        ← Back to all games
      </Link>
    </main>
  );
}
