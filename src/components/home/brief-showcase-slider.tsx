'use client';

import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { useCallback, useEffect, useId, useMemo, useState, memo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { copy } from '@/i18n';
import { TypewriterQuote } from './typewriter-quote';

export type ChallengeBriefPreview = {
  level: number;
  scenarioTitle: string;
  industry: string;
  requesterName: string;
  requesterRole?: string;
  requestContext: string;
  scoringFocus: string[];
  outputShape: string[];
};

type BriefShowcaseSliderProps = {
  requests: ChallengeBriefPreview[];
  expiresAt?: string;
};

const usdBudgetPattern = /(?:US\s*)?\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/i;
const budgetPhraseWords = [
  'paying',
  'pay',
  'budget(?:ed)?(?:\\s+at)?',
  'budget',
  'need(?:ed)?',
  'for',
  'at',
  'usd',
  'usd\\s+budget',
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBudget(value: string): string | null {
  return value.match(usdBudgetPattern)?.[0] ?? null;
}

function parseScenarioTitle(scenarioTitle: string): { title: string; budget: string | null } {
  const budget = extractBudget(scenarioTitle);

  if (!budget) {
    return { title: scenarioTitle, budget };
  }

  const escapedBudget = escapeRegExp(budget);
  const phrasePattern = new RegExp(
    `\\s*(?:[-–—:|]\\s*)?(?:${budgetPhraseWords.join('|')})\\s*:?\\s*${escapedBudget}\\b\\.?`,
    'i',
  );
  const standalonePattern = new RegExp(`\\s*(?:[-–—:]\\s*)?${escapedBudget}\\b\\.?`, 'i');

  const title = scenarioTitle
    .replace(phrasePattern, '')
    .replace(standalonePattern, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–—:]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { title: title || 'Client request', budget };
}

function getDeadlineLabel(level: number): string {
  if (level <= 3) return 'Deadline: 2h';
  if (level <= 5) return 'Deadline: 24h';
  if (level <= 7) return 'Deadline: 72h';
  return 'Urgent';
}

const ClientRequestCard = memo(({
  request,
  isActive
}: {
  request: ChallengeBriefPreview;
  isActive: boolean
}) => {
  const { title, budget } = parseScenarioTitle(request.scenarioTitle);
  const displayBudget = budget ?? extractBudget(request.requestContext);
  const deadlineLabel = getDeadlineLabel(request.level);
  const titleId = useId();

  return (
    <article aria-labelledby={titleId} className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm card-hover sm:p-8">
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 id={titleId} className="min-w-0 flex-1 break-words text-lg font-bold leading-snug text-slate-950 [overflow-wrap:anywhere] sm:text-xl">{title}</h3>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <span className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
              {deadlineLabel}
            </span>
            <span className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-sm font-semibold text-slate-700">
              {copy.briefShowcase.levelTag(request.level)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{request.industry}</p>
          {displayBudget && (
            <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700 ring-1 ring-green-100">
              <span className="sr-only">Budget </span>
              {displayBudget}
            </span>
          )}
        </div>
      </div>

      <div className="mb-6 flex-1 rounded-xl bg-slate-50 p-5 sm:p-6">
        <p className="mb-3 text-sm font-semibold text-slate-900">
          {request.requesterName}
          <span className="font-normal text-slate-500">{request.requesterRole ? ` — ${request.requesterRole}` : ''}</span>
        </p>
        <TypewriterQuote
          key={isActive ? `active-${request.level}-${request.scenarioTitle}` : `idle-${request.level}-${request.scenarioTitle}`}
          text={request.requestContext}
          isActive={isActive}
          speedMs={25}
          className="text-sm leading-7 text-slate-700 min-h-[140px] sm:min-h-[120px]"
        />
      </div>

      {/* Footer: Needs & Deliverables */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{copy.briefShowcase.scoringFocusLabel}</p>
          <ul className="space-y-2">
            {request.scoringFocus.map((need, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1 flex h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span className="leading-snug">{need}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{copy.briefShowcase.outputShapeLabel}</p>
          <ul className="space-y-2">
            {request.outputShape.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1 flex h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
});
ClientRequestCard.displayName = 'ClientRequestCard';

function formatCountdown(seconds: number): string {
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function BriefShowcaseSlider({ requests, expiresAt }: BriefShowcaseSliderProps) {
  // Hydration-safe: same-shape initial state on SSR + first CSR render;
  // sync to `window.matchMedia('(prefers-reduced-motion: reduce)')` only
  // after mount. See typewriter-quote.tsx for the full rationale —
  // previously the `useMemo(() => typeof window !== 'undefined' && ...)`
  // pattern here caused the same mismatch and broke the autoplay-off
  // behaviour for reduced-motion users.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const autoplay = useMemo(
    () => (prefersReducedMotion ? undefined : Autoplay({ delay: 15000, stopOnInteraction: true, stopOnMouseEnter: true })),
    [prefersReducedMotion],
  );
  const plugins = useMemo(() => (autoplay ? [autoplay] : []), [autoplay]);
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, skipSnaps: false },
    plugins,
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [countdown, setCountdown] = useState(0);
  // Start unpaused; a reduced-motion user has no autoplay plugin anyway
  // (`autoplay` is undefined above), so the button is hidden and this
  // default is inert. Tying the initial value to prefersReducedMotion
  // would be another SSR/CSR-divergent state.
  const [isPaused, setIsPaused] = useState(false);

  const scrollTo = useCallback(
    (index: number) => emblaApi && emblaApi.scrollTo(index),
    [emblaApi]
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi, setSelectedIndex]);

  // Keyboard navigation: Left/Right move between slides; Home/End jump
  // to first/last. Scoped to the carousel region via tabIndex={0} below.
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!emblaApi) return;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          emblaApi.scrollPrev();
          break;
        case 'ArrowRight':
          event.preventDefault();
          emblaApi.scrollNext();
          break;
        case 'Home':
          event.preventDefault();
          emblaApi.scrollTo(0);
          break;
        case 'End':
          event.preventDefault();
          emblaApi.scrollTo(requests.length - 1);
          break;
        default:
          break;
      }
    },
    [emblaApi, requests.length],
  );

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const toggleAutoplay = useCallback(() => {
    const autoplayApi = emblaApi?.plugins()?.autoplay as { play: () => void; stop: () => void } | undefined;
    if (!autoplayApi) return;
    if (isPaused) {
      autoplayApi.play();
      setIsPaused(false);
    } else {
      autoplayApi.stop();
      setIsPaused(true);
    }
  }, [emblaApi, isPaused]);

  if (!requests || requests.length === 0) return null;

  return (
    // Width + horizontal rhythm are inherited from page.tsx's section
    // (`max-w-6xl … gap-12 px-6 …`). Do NOT reintroduce `py-8` or a
    // width cap here — it breaks the vertical gap-12 and the visual
    // left edge alignment with the Hero heading.
    <section className="w-full" aria-labelledby="task-board-preview">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">{copy.briefShowcase.eyebrow}</p>
          <h2 id="task-board-preview" className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {copy.briefShowcase.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{copy.briefShowcase.subtitle}</p>
          <p className="mt-2 text-xs font-medium text-slate-500">{copy.briefShowcase.disclaimer}</p>
        </div>

        <div className="flex items-center gap-4">
          {expiresAt && countdown > 0 && (
            <span className="hidden text-xs font-mono text-slate-400 sm:inline-block">
              {copy.briefShowcase.refreshesIn(formatCountdown(countdown).split(':')[0], formatCountdown(countdown).split(':')[1])}
            </span>
          )}
          {autoplay && (
            <button
              type="button"
              onClick={toggleAutoplay}
              aria-pressed={isPaused}
              className="inline-flex rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-gentle"
            >
              {isPaused ? copy.briefShowcase.play : copy.briefShowcase.pause}
            </button>
          )}

          <div className="flex gap-2">
            {scrollSnaps.map((_, index) => (
              <button
                key={index}
                onClick={() => scrollTo(index)}
                className={`inline-flex h-8 items-center justify-center rounded-full transition-all ${
                  index === selectedIndex
                    ? 'w-10 before:block before:h-2 before:w-5 before:rounded-full before:bg-slate-700'
                    : 'w-8 before:block before:h-2 before:w-2 before:rounded-full before:bg-slate-300 hover:before:bg-slate-400'
                }`}
                aria-label={copy.briefShowcase.goToSlide(index + 1)}
                aria-current={index === selectedIndex ? 'true' : undefined}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden pb-6 focus-visible:outline-none focus-gentle rounded-xl"
        ref={emblaRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={copy.briefShowcase.title}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div className="flex touch-pan-y -ml-4">
          {requests.map((req, index) => (
            <div
              key={`${req.level}-${index}`}
              className="min-w-0 shrink-0 grow-0 basis-full pl-4 md:basis-[85%] lg:basis-[75%]"
            >
              <ClientRequestCard
                request={req}
                isActive={index === selectedIndex}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
