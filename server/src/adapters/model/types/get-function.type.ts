export type GetFunction = (
  url: string,
  init: { method: 'GET'; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
