import { en } from '@/i18n/locales/en';

// Single-locale compile-time singleton. See docs/I18N_GUIDE.md §6 for the
// criteria to upgrade to route-level multi-locale with middleware detection.
export const copy = en;

export type FrontendCopy = typeof copy;

export { en };

