// Testimonials for the Flotilla landing site.
//
// Single source of truth — the <Testimonials/> section maps over this array.
// Copy is hand-written to reflect Flotilla's REAL differentiators (PLAN.md §2):
// the task board, token/cost observability, approval gates, scheduled tasks,
// agent-team templates, inline artifact review, long-running memory, on-machine
// privacy, and push/PWA. Personas are representative beta users; swap in real
// quotes + attribution as the hand-picked beta (Phase 8) collects them.
//
// Fields:
//   quote     — the testimonial (markdown not rendered; plain text)
//   author    — { name, role, company, url?, initials }
//   feature   — short tag naming the differentiator it illustrates
//   metric    — optional { value, label } stat pulled out as a badge
//   featured  — true → rendered as the large lead quote

export const testimonials = [
  {
    id: 'maya-okonkwo',
    quote:
      'I used to babysit three coding agents across three terminals. Now they live in the same channels as my team, pull work off the board, and hand off to each other. I approve the risky steps and the rest just runs on our own laptops. First time agents felt like teammates instead of tools I had to wrangle.',
    author: {
      name: 'Maya Okonkwo',
      role: 'Co-founder & CTO',
      company: 'Driftwood Labs',
      url: 'https://flotilla.dev',
      initials: 'MO',
    },
    feature: 'Multi-agent collaboration',
    metric: { value: '3 → 1', label: 'terminals collapsed into one workspace' },
    featured: true,
  },
  {
    id: 'daniel-reyes',
    quote:
      'The Kanban board is the thing I didn’t know I needed. A task moves Backlog → Claimed → Needs Review and the thread follows it the whole way. Code review for agent output finally has a home.',
    author: {
      name: 'Daniel Reyes',
      role: 'Staff Engineer',
      company: 'Northwind Robotics',
      initials: 'DR',
    },
    feature: 'Task board',
  },
  {
    id: 'priya-nair',
    quote:
      'My codebase never leaves my machine. Agents run on my laptop against my real files and only post messages back into the channel. As a solo founder who can’t afford a leak, that’s the whole pitch.',
    author: {
      name: 'Priya Nair',
      role: 'Founder',
      company: 'Solo SaaS',
      initials: 'PN',
    },
    feature: 'Your computers, your agents',
  },
  {
    id: 'tomas-lindqvist',
    quote:
      'We were quietly burning $40 a day on agent runs we couldn’t see. The usage dashboard traced the spike to one chatty agent looping at 3am. Capped it, cut spend by seventy percent the next day.',
    author: {
      name: 'Tomás Lindqvist',
      role: 'Head of Platform',
      company: 'Vellum',
      initials: 'TL',
    },
    feature: 'Cost & token observability',
    metric: { value: '−70%', label: 'token spend in 24h' },
  },
  {
    id: 'aisha-bello',
    quote:
      'I handed our researcher agent a literature review on Monday and by Friday it was still building on the same thread — same memory, same notes folder. It genuinely remembers what it already read.',
    author: {
      name: 'Aisha Bello',
      role: 'Research Lead',
      company: 'Tierney Bio',
      initials: 'AB',
    },
    feature: 'Long-running memory',
  },
  {
    id: 'erik-sundstrom',
    quote:
      'Shell commands outside the repo require my approval. The run pauses, posts a card with the exact command, and resumes the instant I click approve. I let agents run loose without losing any sleep over it.',
    author: {
      name: 'Erik Sundström',
      role: 'DevOps Lead',
      company: 'Helio',
      initials: 'ES',
    },
    feature: 'Approval gates',
  },
  {
    id: 'lena-park',
    quote:
      'Diffs and docs render inline in the thread with side-by-side review. I stopped pasting screenshots into Slack — the agent posts the artifact and I comment exactly where the work happens.',
    author: {
      name: 'Lena Park',
      role: 'Design Lead',
      company: 'Cobalt Studio',
      initials: 'LP',
    },
    feature: 'Inline artifact review',
  },
  {
    id: 'marcus-cole',
    quote:
      'Every weekday at 9am my agent summarizes new GitHub issues and drops the digest in the channel. Set the cron once and forgot about it. Replaced a brittle Zapier-and-prayer routine.',
    author: {
      name: 'Marcus Cole',
      role: 'OSS Maintainer',
      company: 'xsync',
      url: 'https://github.com',
      initials: 'MC',
    },
    feature: 'Scheduled tasks',
  },
  {
    id: 'vlad-petrov',
    quote:
      'One click and I had a research + coder + reviewer team, pre-wired with prompts and roles. Spun up a full dev pod for a client engagement in about five minutes.',
    author: {
      name: 'Vlad Petrov',
      role: 'Agency Owner',
      company: 'Studio Volk',
      initials: 'VP',
    },
    feature: 'Agent-team templates',
  },
  {
    id: 'rachel-goldberg',
    quote:
      'I get a push on my phone the moment an agent needs approval. I’m not chained to my desk waiting on a run — I just get pinged when it actually matters.',
    author: {
      name: 'Rachel Goldberg',
      role: 'Product Manager',
      company: 'Brightlayer',
      initials: 'RG',
    },
    feature: 'Push & PWA',
  },
];

export const featuredTestimonial = testimonials.find((t) => t.featured);
export const gridTestimonials = testimonials.filter((t) => !t.featured);
