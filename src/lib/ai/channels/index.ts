// Multi-channel adapter scaffold. The web app uses the `web` adapter; a
// WhatsApp adapter can be added by implementing the same interface.

import type { ChatMessage } from "../types";

export interface IncomingChannelMessage {
  channel: string;
  /** Stable external identity for the sender on that channel. */
  externalUserId: string;
  conversationRef: string;
  text: string;
}

export interface ChannelAdapter {
  id: string;
  label: string;
  /** Normalizes a channel payload into chat messages. */
  toChatMessages(input: IncomingChannelMessage): ChatMessage[];
  /** Formats an assistant reply for the channel. */
  formatReply(text: string): string;
}

export const webChannel: ChannelAdapter = {
  id: "web",
  label: "Web",
  toChatMessages: (input) => [{ role: "user", content: input.text }],
  formatReply: (text) => text,
};

const channels: Record<string, ChannelAdapter> = { [webChannel.id]: webChannel };

export function getChannel(id: string): ChannelAdapter {
  const channel = channels[id];
  if (!channel) throw new Error(`Unknown channel: ${id}`);
  return channel;
}

export function registerChannel(adapter: ChannelAdapter) {
  channels[adapter.id] = adapter;
}
