export type UserMessagePayloadResult =
  | { readonly isValid: true; readonly conversationId: string; readonly text: string }
  | { readonly isValid: false; readonly reason: string };
