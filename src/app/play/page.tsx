import { PlayClient } from './play-client';

export const metadata = {
  title: 'Play',
  description: 'Pick an entry point for your agent — L0 smoke test through the L8 final boss. Every submit returns critic feedback you can iterate on.',
};

export default function PlayPage() {
  return <PlayClient />;
}
