import type { Obligation, OccurrenceDoc } from '../../src/core/types';
import { occId } from '../../src/core/timeline';

export function ob(p: Partial<Obligation> = {}): Obligation {
  return {
    id: 'o1',
    title: 'Parking',
    category: 'person',
    amountType: 'fixed',
    amount: 150000,
    handling: 'manual',
    method: 'upi',
    recurrence: { freq: 'months', interval: 1, start: '2026-10-01' },
    remind: [1, 0],
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

export function occ(o: Obligation, due: string, p: Partial<OccurrenceDoc> = {}): OccurrenceDoc {
  return { id: occId(o.id, due), obligationId: o.id, due, updatedAt: 0, ...p };
}

export function occMap(...docs: OccurrenceDoc[]): Map<string, OccurrenceDoc> {
  return new Map(docs.map((d) => [d.id, d]));
}
