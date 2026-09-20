export function handleGenUi(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
  options?: { fetchImpl?: typeof fetch },
): Promise<void>
