import { z } from "zod";

export const messageCategorySchema = z.enum(["ignore", "delegate", "decide"]);
export type MessageCategory = z.infer<typeof messageCategorySchema>;

export const lifecycleStatusSchema = z.enum([
  "active",
  "superseded",
  "resolved",
  "informational"
]);
export type LifecycleStatus = z.infer<typeof lifecycleStatusSchema>;

export const prioritySchema = z.enum(["urgent", "high", "medium", "low"]);
export type Priority = z.infer<typeof prioritySchema>;

export const responseTypeSchema = z.enum([
  "no_response",
  "reply_to_sender",
  "internal_handoff",
  "acknowledgement"
]);
export type ResponseType = z.infer<typeof responseTypeSchema>;

export const actionItemSchema = z
  .object({
    id: z.string(),
    category: messageCategorySchema,
    title: z.string(),
    description: z.string(),
    ownerRole: z.string().nullable(),
    decisionRequired: z.string().nullable(),
    deadlineText: z.string().nullable(),
    deadlineAt: z.string().nullable(),
    recommendedNextStep: z.string().nullable(),
    missingContext: z.array(z.string())
  })
  .strict();
export type ActionItem = z.infer<typeof actionItemSchema>;

export const draftedResponseSchema = z
  .object({
    type: responseTypeSchema,
    to: z.string().nullable(),
    subject: z.string().nullable(),
    body: z.string()
  })
  .strict();
export type DraftedResponse = z.infer<typeof draftedResponseSchema>;

export const messageAnalysisSchema = z
  .object({
    messageId: z.string(),
    primaryCategory: messageCategorySchema,
    lifecycleStatus: lifecycleStatusSchema,
    relatedMessageIds: z.array(z.string()),
    supersededBy: z.array(z.string()),
    resolvedBy: z.array(z.string()),
    rationale: z.string(),
    actionItems: z.array(actionItemSchema),
    flagIds: z.array(z.string()),
    draftedResponse: draftedResponseSchema,
    confidence: z.number().min(0).max(1),
    missingContext: z.array(z.string())
  })
  .strict();
export type MessageAnalysis = z.infer<typeof messageAnalysisSchema>;

export const threadAnalysisSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    messageIds: z.array(z.string()),
    latestMessageId: z.string(),
    lifecycleStatus: lifecycleStatusSchema,
    currentState: z.string(),
    activeExecutiveItemIds: z.array(z.string())
  })
  .strict();
export type ThreadAnalysis = z.infer<typeof threadAnalysisSchema>;

export const executiveItemSchema = z
  .object({
    id: z.string(),
    threadId: z.string().nullable(),
    kind: z.enum(["decide", "delegate", "inform"]),
    section: z.enum(["urgent", "decisions", "delegated", "handled", "personal"]),
    title: z.string(),
    summary: z.string(),
    priority: prioritySchema,
    sourceMessageIds: z.array(z.string()),
    ownerRole: z.string().nullable(),
    deadlineText: z.string().nullable(),
    deadlineAt: z.string().nullable(),
    decisionQuestion: z.string().nullable(),
    options: z
      .array(
        z
          .object({
            label: z.string(),
            tradeoff: z.string()
          })
          .strict()
      )
      .nullable(),
    recommendedNextStep: z.string().nullable(),
    missingContext: z.array(z.string()),
    draftedResponse: draftedResponseSchema.nullable()
  })
  .strict();
export type ExecutiveItem = z.infer<typeof executiveItemSchema>;

export const executiveFlagSchema = z
  .object({
    id: z.string(),
    severity: z.enum(["critical", "high", "medium", "low"]),
    category: z.enum([
      "security",
      "financial",
      "legal",
      "customer",
      "people",
      "operational",
      "reputational",
      "scheduling",
      "personal",
      "other"
    ]),
    title: z.string(),
    description: z.string(),
    sourceMessageIds: z.array(z.string()),
    status: z.enum(["active", "resolved"]),
    recommendedAction: z.string().nullable()
  })
  .strict();
export type ExecutiveFlag = z.infer<typeof executiveFlagSchema>;

export const analysisResultSchema = z
  .object({
    sourceDate: z.string(),
    messageAnalyses: z.array(messageAnalysisSchema),
    threads: z.array(threadAnalysisSchema),
    executiveItems: z.array(executiveItemSchema),
    flags: z.array(executiveFlagSchema)
  })
  .strict();
export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const briefingItemSchema = z
  .object({
    title: z.string(),
    body: z.string(),
    priority: prioritySchema,
    sourceMessageIds: z.array(z.string())
  })
  .strict();
export type BriefingItem = z.infer<typeof briefingItemSchema>;

export const dailyBriefingSchema = z
  .object({
    title: z.string(),
    overview: z.string().nullable(),
    urgent: z.array(briefingItemSchema),
    decisions: z.array(briefingItemSchema),
    flags: z.array(briefingItemSchema),
    handled: z.array(briefingItemSchema),
    personal: z.array(briefingItemSchema)
  })
  .strict();
export type DailyBriefing = z.infer<typeof dailyBriefingSchema>;

export type AnalysisResponseMetadata = {
  model: string;
  promptVersion: string;
  processedMessageCount: number;
  processingMs: number;
  usedBriefingFallback: boolean;
};
