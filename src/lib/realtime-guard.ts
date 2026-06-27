type RealtimeChannelLike = {
  topic?: string;
  on?: (...args: any[]) => any;
  subscribe?: (...args: any[]) => any;
};

type SupabaseRealtimeClientLike = {
  channel: (topic: string, opts?: any) => RealtimeChannelLike;
};

const LATE_CALLBACK_ERROR = "after `subscribe()`";

let installed = false;
let sequence = 0;

function isLateCallbackError(error: unknown) {
  return error instanceof Error && error.message.includes(LATE_CALLBACK_ERROR);
}

function makeUniqueTopic(topic: string) {
  sequence += 1;
  const suffix = `${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${topic}__rt_${suffix}`;
}

function hardenChannel(channel: RealtimeChannelLike, logicalTopic: string) {
  if (!channel || typeof channel !== "object") return channel;

  if (typeof channel.on === "function") {
    const originalOn = channel.on.bind(channel);
    channel.on = (...args: any[]) => {
      try {
        return originalOn(...args);
      } catch (error) {
        if (isLateCallbackError(error)) {
          console.warn("[RealtimeGuard] تجاهل callback متأخر بعد subscribe", { logicalTopic });
          return channel;
        }
        throw error;
      }
    };
  }

  if (typeof channel.subscribe === "function") {
    const originalSubscribe = channel.subscribe.bind(channel);
    channel.subscribe = (...args: any[]) => {
      try {
        return originalSubscribe(...args);
      } catch (error) {
        if (isLateCallbackError(error)) {
          console.warn("[RealtimeGuard] منع انهيار Realtime عند subscribe", { logicalTopic });
          return channel;
        }
        throw error;
      }
    };
  }

  return channel;
}

export function installRealtimeGuard(client: SupabaseRealtimeClientLike) {
  if (installed || !client || typeof client.channel !== "function") return;
  installed = true;

  const originalChannel = client.channel.bind(client);

  client.channel = ((topic: string, opts?: any) => {
    const safeTopic = makeUniqueTopic(topic);
    const channel = originalChannel(safeTopic, opts);
    return hardenChannel(channel, topic);
  }) as SupabaseRealtimeClientLike["channel"];
}