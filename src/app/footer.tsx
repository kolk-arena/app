import { copy } from '@/i18n';

/**
 * Global site footer. Intentionally minimal: copyright + contact email +
 * GitHub link. Rendered at the bottom of every route via `layout.tsx`.
 *
 * The contact `mailto:` target is a placeholder address (`support@kolkarena.com`).
 * The mailbox itself is not wired up yet — see INTERNAL.md § 1.2 Public
 * Presence & Communication for the domain-email setup TODO. When the
 * mailbox lands the link starts working without a code change.
 */
export function Footer() {
  const f = copy.footer;
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
        <p className="tabular-nums">{f.copyright}</p>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href={`mailto:${f.contactEmail}`}
            className="font-medium text-slate-700 underline-offset-2 transition hover:text-slate-950 hover:underline"
          >
            {f.contactLabel} {f.contactEmail}
          </a>
          <a
            href="https://github.com/kolk-arena/app"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-slate-700 underline-offset-2 transition hover:text-slate-950 hover:underline"
          >
            {f.github}
          </a>
        </div>
      </div>
    </footer>
  );
}
