import type { problem } from '../../copy';
import {
  RepetitiveQuestionsPreview,
  ScatteredOrderPreview,
  UnreadInboxPreview,
} from './ProblemWhatsAppIllustrations';

type ProblemItem = (typeof problem.items)[number];

export function ProblemMiniPreview({ item }: { item: ProblemItem }) {
  if (item.id === 'repeat') return <RepetitiveQuestionsPreview item={item} />;
  if (item.id === 'missed') return <UnreadInboxPreview item={item} />;
  return <ScatteredOrderPreview item={item} />;
}
