import { APP_NAME } from '#shared';
import {
  ArrowRight,
  Bell,
  MessageCircle,
  MonitorSmartphone,
  Paperclip,
  UserPlus,
  Users,
  Video,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router';
import { BrandMark } from '../../components/layout/BrandMark';
import { SkipLink } from '../../components/layout/SkipLink';
import { ButtonLink } from '../../components/ui/Button';
import { usePageTitle } from '../../hooks/use-page-title';
import { cn } from '../../lib/cn';

const features = [
  {
    icon: Zap,
    title: 'Instant messages',
    text: 'See when someone is typing, when they’re online and when they’ve read your message.',
  },
  {
    icon: Users,
    title: 'Groups and polls',
    text: 'Plan things together. Invite people with a link, share admin duties and settle decisions with a poll.',
  },
  {
    icon: Video,
    title: 'Voice and video calls',
    text: 'Call anyone you can message, straight from your chat.',
  },
  {
    icon: Paperclip,
    title: 'Photos, files and voice notes',
    text: 'Share what you need, then reply, react, forward, pin or star messages to find them later.',
  },
  {
    icon: Bell,
    title: 'Notifications you control',
    text: 'Pick what you hear about: messages, requests, group changes and missed calls.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Phone, tablet or laptop',
    text: 'Connect runs in your browser and fits any screen. Nothing to install.',
  },
];

const steps = [
  { icon: UserPlus, title: 'Create an account', text: 'All you need is an email address.' },
  {
    icon: Users,
    title: 'Find your people',
    text: 'Search by username, send a request or join a group from an invite link.',
  },
  { icon: MessageCircle, title: 'Start talking', text: 'Message, share and call in one place.' },
];

export function LandingPage() {
  usePageTitle(null);
  return (
    <div className="min-h-dvh bg-canvas">
      <SkipLink />
      <SiteHeader />
      <main id="main">
        <Hero />
        <Features />
        <HowItWorks />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="rounded-lg">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-2">
          <ButtonLink to="/login" variant="ghost">
            Sign in
          </ButtonLink>
          <ButtonLink to="/register">Sign up</ButtonLink>
        </div>
      </div>
    </header>
  );
}

/** Snippets that drift behind the hero headline. Purely decorative. */
const heroTicker = [
  [
    'Are you free tonight?',
    'Running 5 minutes late 🏃',
    'Poll: pizza or tacos?',
    'Sent you the photos 📷',
    'Call me when you land ✈️',
    'typing…',
  ],
  [
    'Happy birthday! 🎉',
    'See you at 8',
    'Voted ✅',
    'Can I join the group?',
    'Miss you all ❤️',
    'On my way',
  ],
  [
    'Good luck today 🍀',
    'Who’s bringing snacks?',
    'Voice message · 0:12',
    'Thanks for the invite!',
    'Let’s catch up soon',
    'Just landed 🛬',
  ],
  [
    'Meeting moved to 3pm',
    'Love this 😂',
    'Request accepted',
    'Movie night on Friday? 🍿',
    'Got it, thanks!',
    'Call ended · 12:48',
  ],
];

function HeroTicker() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-4 overflow-hidden select-none sm:gap-6 [mask-image:radial-gradient(ellipse_at_center,transparent_25%,black_75%)]"
    >
      {heroTicker.map((row, index) => (
        <div
          key={row[0]}
          className={cn(
            'flex w-max animate-marquee will-change-transform',
            index % 2 === 1 && '[animation-direction:reverse]',
            index === 1 && '[animation-duration:200s]',
            index === 2 && '[animation-duration:170s]',
          )}
        >
          {/* The marquee slides by exactly half its width, so the second half repeats the first.
              Each half repeats the row three times, wider than any screen, so it never runs out;
              spacing is a margin on every bubble (not a gap) so both halves are the same width. */}
          {Array.from({ length: 6 }, () => row)
            .flat()
            .map((text, position) => (
              <span
                key={position}
                className={cn(
                  'mr-4 rounded-lg px-4 py-2 text-sm whitespace-nowrap sm:text-base',
                  position % 3 === 1
                    ? 'bg-primary-600 text-white'
                    : 'border border-border bg-surface text-ink-muted',
                )}
              >
                {text}
              </span>
            ))}
        </div>
      ))}
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border bg-canvas">
      <HeroTicker />
      <div className="relative mx-auto max-w-3xl px-4 py-28 text-center sm:px-6 sm:py-36 lg:py-44">
        <h1 className="animate-rise text-4xl leading-tight font-bold tracking-tight text-balance text-ink sm:text-5xl lg:text-6xl">
          A calm place to{' '}
          <span className="relative z-0 inline-block whitespace-nowrap text-primary-600">
            keep in touch.
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-1 -z-10 h-3 origin-left animate-underline rounded-sm bg-primary-100 sm:h-4"
            />
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl animate-rise text-base leading-relaxed text-pretty text-ink-muted [animation-delay:150ms] sm:text-lg">
          Chat, share and call with the people who matter. You choose who can reach you, so your
          inbox stays yours.
        </p>
      </div>
    </section>
  );
}

function SectionHeading({ id, title, description }) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="text-2xl font-bold tracking-tight text-balance text-ink sm:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-pretty text-ink-muted">{description}</p>
      ) : null}
    </div>
  );
}

function IconTile({ icon: Icon }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}

function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="scroll-mt-16 py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          id="features-heading"
          title="Everything you need to stay in touch"
          description="From a quick hello to planning a weekend away."
        />
        <ul className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon, title, text }) => (
            <li key={title} className="bg-surface p-6">
              <IconTile icon={icon} />
              <h3 className="mt-4 font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="scroll-mt-16 border-t border-border bg-surface py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="how-heading" title="Get started in a minute" />
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary-200 bg-surface text-sm font-semibold text-primary-700">
                {index + 1}
              </span>
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-ink">
                  {title}
                  <Icon aria-hidden="true" className="size-4 text-ink-muted" />
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section aria-labelledby="cta-heading" className="bg-primary-600 text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="cta-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to say hello?
          </h2>
          <p className="mt-2 text-primary-50">It takes a minute to set up your account.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            to="/register"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 font-medium text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-white"
          >
            Create your account
            <ArrowRight aria-hidden="true" className="size-5" />
          </Link>
          <Link
            to="/login"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-white/50 px-5 font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-white"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:px-6 md:flex-row">
        <BrandMark />
        <p className="text-xs text-ink-muted">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </div>
    </footer>
  );
}
