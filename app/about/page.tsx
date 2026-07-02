import type { Metadata } from 'next';
import Link from 'next/link';
import { ABOUT } from '@/lib/copy';
import { TAGLINE } from '@/lib/copy';

export const metadata: Metadata = {
  title: `${ABOUT.title} — WhatsVP`,
  description: ABOUT.intro,
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 h-14 bg-paper/90 backdrop-blur-md border-b border-hairline flex items-center px-4 gap-3">
        <Link href="/" className="text-ink/60 hover:text-ink text-lg leading-none" aria-label="Back to map">
          ‹
        </Link>
        <h1 className="text-[17px] font-semibold text-ink">{ABOUT.title}</h1>
      </header>

      <main className="max-w-xl mx-auto px-5 py-8 pb-16">
        <p className="text-body text-sub">{TAGLINE}</p>
        <p className="mt-2 text-sm text-ink/70 leading-relaxed">{ABOUT.intro}</p>

        <ol className="mt-8 space-y-5">
          {ABOUT.steps.map((step, i) => (
            <li key={step.title} className="flex gap-3.5">
              <span className="flex-none w-7 h-7 rounded-full bg-teal/15 text-teal text-sm font-semibold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">{step.title}</h2>
                <p className="mt-0.5 text-sm text-ink/60 leading-relaxed">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="mt-10 mb-3 text-xs font-semibold text-sub uppercase tracking-wide">Frequently asked</h2>
        <div className="space-y-4">
          {ABOUT.faq.map((item) => (
            <div key={item.q}>
              <h3 className="text-sm font-medium text-ink">{item.q}</h3>
              <p className="mt-0.5 text-sm text-ink/60 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>

        <Link
          href="/"
          className="mt-10 inline-block px-4 py-2 rounded-full bg-teal text-white text-sm font-medium hover:bg-teal/90 transition-colors"
        >
          Open the map
        </Link>
      </main>
    </div>
  );
}
