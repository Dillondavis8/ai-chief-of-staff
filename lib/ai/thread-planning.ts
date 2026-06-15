import { z } from "zod";
import type { NormalizedMessage } from "@/lib/messages/schemas";

const plannedThreadSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    messageIds: z.array(z.string()),
    latestMessageId: z.string(),
    rationale: z.string()
  })
  .strict();

export const threadPlanSchema = z
  .object({
    sourceDate: z.string(),
    threads: z.array(plannedThreadSchema)
  })
  .strict();

export type ThreadPlan = z.infer<typeof threadPlanSchema>;
export type PlannedThread = ThreadPlan["threads"][number];

export type ThreadPlanValidationResult = {
  valid: boolean;
  issues: string[];
};

export function buildThreadPlanSchema(messageIds: string[]): z.ZodType<ThreadPlan> {
  const messageIdSchema = z.enum(messageIds as [string, ...string[]]);
  const messageIdArraySchema = z.array(messageIdSchema);

  return threadPlanSchema.extend({
    threads: z.array(
      plannedThreadSchema.extend({
        messageIds: messageIdArraySchema,
        latestMessageId: messageIdSchema
      })
    )
  }) as z.ZodType<ThreadPlan>;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "thread";
}

function compactText(value: string, maxLength = 90) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function fallbackTitle(message: NormalizedMessage) {
  return compactText(message.subject ?? message.channelName ?? `Message from ${message.sender}`);
}

function latestMessageIdFor(ids: string[], messagesById: Map<string, NormalizedMessage>) {
  const latest = ids
    .map((id) => messagesById.get(id))
    .filter((message): message is NormalizedMessage => Boolean(message))
    .sort((left, right) => {
      const delta = Date.parse(left.timestamp) - Date.parse(right.timestamp);
      return delta === 0 ? left.id.localeCompare(right.id, undefined, { numeric: true }) : delta;
    })
    .at(-1);

  return latest?.id ?? ids.at(-1) ?? "";
}

function uniqueThreadId(baseId: string, usedIds: Set<string>) {
  const base = slug(baseId);
  let candidate = base;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

export function completeThreadPlan(plan: ThreadPlan, messages: NormalizedMessage[], sourceDate: string): ThreadPlan {
  const validIds = new Set(messages.map((message) => message.id));
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const assignedIds = new Set<string>();
  const usedThreadIds = new Set<string>();
  const threads: PlannedThread[] = [];

  plan.threads.forEach((thread, index) => {
    const threadSeenIds = new Set<string>();
    const messageIds = thread.messageIds.filter((id) => {
      if (!validIds.has(id) || assignedIds.has(id) || threadSeenIds.has(id)) {
        return false;
      }

      threadSeenIds.add(id);
      return true;
    });
    if (messageIds.length === 0) {
      return;
    }

    messageIds.forEach((id) => assignedIds.add(id));
    const latestMessageId = latestMessageIdFor(messageIds, messagesById);
    const latestMessage = messagesById.get(latestMessageId);
    const title = thread.title.trim() || (latestMessage ? fallbackTitle(latestMessage) : `Thread ${index + 1}`);

    threads.push({
      id: uniqueThreadId(thread.id || title, usedThreadIds),
      title,
      messageIds,
      latestMessageId,
      rationale: thread.rationale.trim() || "Messages appear to concern the same evolving situation."
    });
  });

  messages.forEach((message) => {
    if (assignedIds.has(message.id)) {
      return;
    }

    const title = fallbackTitle(message);
    threads.push({
      id: uniqueThreadId(`thread-${message.id}-${title}`, usedThreadIds),
      title,
      messageIds: [message.id],
      latestMessageId: message.id,
      rationale: "Added by application validation because the model plan omitted this message."
    });
  });

  return {
    sourceDate,
    threads
  };
}

export function validateThreadPlan(
  plan: ThreadPlan,
  messages: NormalizedMessage[],
  expectedSourceDate: string
): ThreadPlanValidationResult {
  const issues: string[] = [];
  const messageIds = messages.map((message) => message.id);
  const validIds = new Set(messageIds);
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const threadIds = new Set<string>();

  if (plan.sourceDate !== expectedSourceDate) {
    issues.push(`sourceDate must be "${expectedSourceDate}".`);
  }

  plan.threads.forEach((thread) => {
    if (!thread.id.trim()) {
      issues.push("Every planned thread needs a nonempty id.");
    } else if (threadIds.has(thread.id)) {
      issues.push(`planned threads include duplicate id "${thread.id}".`);
    } else {
      threadIds.add(thread.id);
    }

    if (thread.messageIds.length === 0) {
      issues.push(`planned thread "${thread.id}" needs at least one message ID.`);
    }

    thread.messageIds.forEach((id) => {
      if (!validIds.has(id)) {
        issues.push(`planned thread "${thread.id}" references unknown message ID "${id}".`);
        return;
      }

      if (seenIds.has(id)) {
        duplicateIds.add(id);
      } else {
        seenIds.add(id);
      }
    });

    if (!validIds.has(thread.latestMessageId)) {
      issues.push(`planned thread "${thread.id}" latestMessageId is unknown.`);
    } else if (!thread.messageIds.includes(thread.latestMessageId)) {
      issues.push(`planned thread "${thread.id}" latestMessageId must be included in messageIds.`);
    } else {
      const chronologicalLatestId = latestMessageIdFor(thread.messageIds, messagesById);
      if (thread.latestMessageId !== chronologicalLatestId) {
        issues.push(`planned thread "${thread.id}" latestMessageId must be chronological latest "${chronologicalLatestId}".`);
      }
    }
  });

  duplicateIds.forEach((id) => issues.push(`message ID "${id}" appears in more than one planned thread.`));
  messageIds.forEach((id) => {
    if (!seenIds.has(id)) {
      issues.push(`thread plan is missing input message ID "${id}".`);
    }
  });

  return {
    valid: issues.length === 0,
    issues
  };
}
