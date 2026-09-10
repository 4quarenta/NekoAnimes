import { z } from 'zod';

export const NEKO_BRIDGE_VERSION = 1 as const;
const RouteSchema = z.string().startsWith('/').max(512);
const IdSchema = z.string().min(1).max(128);

export const BridgeRequestSchema = z.discriminatedUnion('type', [
  z.object({ version: z.literal(NEKO_BRIDGE_VERSION), id: IdSchema, type: z.literal('bridge.handshake'), payload: z.object({ webVersion: z.string().min(1).max(64) }) }),
  z.object({ version: z.literal(NEKO_BRIDGE_VERSION), id: IdSchema, type: z.literal('navigation.routeChanged'), payload: z.object({ route: RouteSchema }) }),
  z.object({ version: z.literal(NEKO_BRIDGE_VERSION), id: IdSchema, type: z.literal('player.open'), payload: z.object({ episodeId: IdSchema }) }),
  z.object({ version: z.literal(NEKO_BRIDGE_VERSION), id: IdSchema, type: z.literal('app.event'), payload: z.object({ name: z.string().min(1).max(64), placement: z.string().min(1).max(128).optional() }) })
]);

export const BridgeResponseSchema = z.object({ version: z.literal(NEKO_BRIDGE_VERSION), id: IdSchema, type: z.literal('bridge.response'), ok: z.boolean(), payload: z.unknown().optional(), error: z.object({ code: z.string(), message: z.string() }).optional() });

export const BridgeNativeEventSchema = z.discriminatedUnion('type', [
  z.object({ version: z.literal(NEKO_BRIDGE_VERSION), type: z.literal('bridge.ready'), payload: z.object({ platform: z.enum(['android', 'ios']), bridgeVersion: z.literal(NEKO_BRIDGE_VERSION), capabilities: z.array(z.string()) }) }),
  z.object({ version: z.literal(NEKO_BRIDGE_VERSION), type: z.literal('navigation.navigate'), payload: z.object({ route: RouteSchema }) }),
  z.object({
    version: z.literal(NEKO_BRIDGE_VERSION),
    type: z.literal('player.closed'),
    payload: z.object({
      episodeId: IdSchema.optional(),
      positionSeconds: z.number().int().min(0).optional(),
      durationSeconds: z.number().int().min(0).optional()
    }).optional()
  })
]);

export type BridgeRequest = z.infer<typeof BridgeRequestSchema>;
export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;
export type BridgeNativeEvent = z.infer<typeof BridgeNativeEventSchema>;
export type BridgeEvent = BridgeResponse | BridgeNativeEvent;
export const BridgeEnvelopeSchema = BridgeRequestSchema;
export type BridgeEnvelope = BridgeRequest;
export const BridgeEventSchema = z.union([BridgeResponseSchema, BridgeNativeEventSchema]);
