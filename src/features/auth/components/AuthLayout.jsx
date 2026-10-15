import { APP_NAME } from '#shared';
import { MessageCircle, ShieldCheck, Users, Zap } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { BrandMark } from '../../../components/layout/BrandMark';
import { SkipLink } from '../../../components/layout/SkipLink';
import { usePageTitle } from '../../../hooks/use-page-title';
import { MaintenanceBanner } from '../../platform/MaintenanceBanner';

const highlights = [
  { icon: Zap, text: 'Messages, groups and calls in one place.' },
  { icon: Users, text: 'Groups for friends, family and teams.' },
  { icon: ShieldCheck, text: 'Strangers have to ask before they can message you.' },
];

/** Split layout for signed-out screens: brand panel on desktop, single column on mobile/tablet. */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <SkipLink />
      <aside className="hidden flex-col justify-between bg-primary-600 p-10 text-white lg:flex xl:p-14">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-2.5 rounded-lg focus-visible:outline-white"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-white text-primary-600">
            <MessageCircle aria-hidden="true" className="size-6" />
          </span>
          <span className="text-xl font-semibold tracking-tight">{APP_NAME}</span>
        </Link>
        <div className="max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-tight">
            A calm place to keep in touch.
          </p>
          <ul className="mt-8 space-y-4">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-primary-50">
                <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-primary-50">Works in your browser on any device.</p>
      </aside>
      <main id="main" className="flex flex-col">
        <MaintenanceBanner />
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-sm">
            <Link to="/" className="mb-8 inline-flex rounded-lg lg:hidden">
              <BrandMark size="lg" />
            </Link>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

export function AuthHeader({ title, description }) {
  usePageTitle(title);
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
    </header>
  );
}

export const authLinkClass =
  'rounded font-medium text-primary-700 hover:text-primary-800 hover:underline';
