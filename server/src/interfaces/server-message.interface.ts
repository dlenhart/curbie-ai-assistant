export interface ServerMessage {
  event: string;
  data: Record<string, unknown>;
}
