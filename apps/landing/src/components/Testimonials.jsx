import { ArrowUpRight, Quote } from 'lucide-react';
import { testimonials, featuredTestimonial, gridTestimonials } from '../data/testimonials.js';

function Avatar({ initials, featured = false }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'flex h-11 w-11 shrink-0 items-center justify-center border font-mono text-sm font-semibold',
        featured ? 'border-brand bg-brand text-accent-fg' : 'border-border bg-bg-subtle text-fg',
      ].join(' ')}
    >
      {initials}
    </span>
  );
}

function FeatureTag({ children }) {
  return (
    <span className="inline-block border border-border-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
      {children}
    </span>
  );
}

function Metric({ metric }) {
  if (!metric) return null;
  return (
    <div className="flex items-baseline gap-2 border border-border-soft bg-bg-subtle px-3 py-2">
      <span className="font-mono text-lg font-semibold text-brand">{metric.value}</span>
      <span className="text-xs text-fg-muted">{metric.label}</span>
    </div>
  );
}

function FeaturedCard({ t }) {
  return (
    <figure className="mt-12 border border-border bg-bg-subtle">
      <div className="flex items-start gap-4 border-b border-border-soft px-6 py-4 sm:px-10">
        <Quote className="mt-0.5 h-6 w-6 shrink-0 text-brand" strokeWidth={2.25} />
        <FeatureTag>{t.feature}</FeatureTag>
      </div>
      <blockquote className="px-6 py-8 text-2xl font-medium leading-snug tracking-tight sm:px-10 sm:text-3xl">
        “{t.quote}”
      </blockquote>
      <figcaption className="flex flex-col gap-4 border-t border-border-soft px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="flex items-center gap-3">
          <Avatar initials={t.author.initials} featured />
          <div>
            <div className="font-semibold">{t.author.name}</div>
            <div className="text-sm text-fg-muted">
              {t.author.role}
              {t.author.company ? `, ${t.author.company}` : ''}
            </div>
          </div>
        </div>
        <Metric metric={t.metric} />
      </figcaption>
    </figure>
  );
}

function GridCard({ t }) {
  return (
    <figure className="flex flex-col border-b border-r border-border-soft p-6">
      <div className="mb-3">
        <FeatureTag>{t.feature}</FeatureTag>
      </div>
      <blockquote className="flex-1 text-[15px] leading-relaxed text-fg">“{t.quote}”</blockquote>
      {t.metric && (
        <div className="mt-4">
          <Metric metric={t.metric} />
        </div>
      )}
      <figcaption className="mt-5 flex items-center gap-3 border-t border-border-soft pt-4">
        <Avatar initials={t.author.initials} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{t.author.name}</div>
          <div className="truncate text-xs text-fg-muted">
            {t.author.role}
            {t.author.company ? `, ${t.author.company}` : ''}
          </div>
        </div>
      </figcaption>
    </figure>
  );
}

export default function Testimonials() {
  return (
    <section id="testimonials" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand">From the beta</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Builders shipping with Flotilla
          </h2>
          <p className="mt-4 text-lg text-fg-muted">
            A hand-picked private beta is running Flotilla against real work. These are the people
            using it every day — and what changed when humans and agents started sharing the same
            channels.
          </p>
        </div>

        {featuredTestimonial && <FeaturedCard t={featuredTestimonial} />}

        {/* Brutalist grid: touching cells share 1px borders (container draws the
            left + top edges; each card draws its right + bottom). */}
        <div className="mt-8 grid grid-cols-1 border-l border-t border-border-soft md:grid-cols-2 lg:grid-cols-3">
          {gridTestimonials.map((t) => (
            <GridCard key={t.id} t={t} />
          ))}
        </div>

        <p className="mt-8 font-mono text-xs text-fg-muted">
          {testimonials.length} teams · hand-picked private beta ·{' '}
          <span className="text-fg">want in?</span>{' '}
          <a
            href="mailto:hello@flotilla.dev"
            className="inline-flex items-center gap-0.5 font-semibold text-brand underline-offset-4 hover:underline"
          >
            Request access <ArrowUpRight className="h-3 w-3" />
          </a>
        </p>
      </div>
    </section>
  );
}
