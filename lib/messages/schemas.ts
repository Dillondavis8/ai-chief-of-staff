import { z } from "zod";

export const normalizedChannelSchema = z.enum([
  "email",
  "slack",
  "whatsapp",
  "other"
]);

export type NormalizedChannel = z.infer<typeof normalizedChannelSchema>;

export const normalizedMessageSchema = z.object({
  id: z.string(),
  channel: normalizedChannelSchema,
  sender: z.string(),
  recipient: z.string().optional(),
  subject: z.string().optional(),
  channelName: z.string().optional(),
  timestamp: z.string(),
  body: z.string()
});

export type NormalizedMessage = z.infer<typeof normalizedMessageSchema>;

export type FieldValidationError = {
  index?: number;
  id?: string;
  field?: string;
  message: string;
};

export type MessageValidationSuccess = {
  ok: true;
  messages: NormalizedMessage[];
  sourceDate: string;
};

export type MessageValidationFailure = {
  ok: false;
  status: 400 | 413;
  errors: FieldValidationError[];
};

export type MessageValidationResult =
  | MessageValidationSuccess
  | MessageValidationFailure;

export const MAX_MESSAGE_COUNT = 250;
export const MAX_PAYLOAD_BYTES = 512 * 1024;
