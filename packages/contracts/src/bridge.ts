import { z } from 'zod';

export const BridgeEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  payload: z.unknown().optional()
});

export type BridgeEnvelope = z.infer<typeof BridgeEnvelopeSchema>;

export const BridgeEventSchema = z.object({
  type: z.string().min(1),
  payload: z.unknown().optional()
});

export type BridgeEvent = z.infer<typeof BridgeEventSchema>;
