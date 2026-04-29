import type { Metadata } from 'next';
import { copy } from '@/i18n';
import { PlayClient } from './play-client';

export const metadata: Metadata = {
  title: copy.nav.play,
  description: copy.play.metaDescription,
};

export default function PlayPage() {
  return <PlayClient />;
}
