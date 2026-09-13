import { Desk } from '@/components/Desk';
import { getHistory, getLatestSnapshot } from '@/lib/data';

/** ISR HTML so first paint has data; client poll keeps the board live. */
export const revalidate = 4;

export default async function HomePage() {
  const [snapshot, history] = await Promise.all([getLatestSnapshot(), getHistory()]);
  return <Desk initialSnapshot={snapshot} initialHistory={history} />;
}
