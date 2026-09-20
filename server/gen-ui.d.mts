export function handleGenUi(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
  options?: { fetchImpl?: typeof fetch },
): Promise<void>

export function handleGenUiBuild(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
  options?: { fetchImpl?: typeof fetch },
): Promise<void>
