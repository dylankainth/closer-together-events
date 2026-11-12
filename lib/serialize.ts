import { SLOTS } from "./seed";

export function publicEvent<T extends { messages: unknown[]; slotId: string }>(e: T) {
  const { messages, ...rest } = e;
  return { ...rest, messageCount: messages.length, slotLabel: SLOTS.find((s) => s.id === e.slotId)?.label };
}
