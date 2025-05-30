import type { ClientPlugin, Client } from "./types.ts";

// Rough attempt to allow plugins registering across versions
const pluginSymbol: unique symbol = Symbol.for('@danopia/http-file/active-plugins');
export const ActivePlugins: Array<ClientPlugin> = (
  globalThis as unknown as {[pluginSymbol]: Array<ClientPlugin>}
)[pluginSymbol] ??= new Array<ClientPlugin>();

export async function open(client: Client): Promise<void> {
  for (const hooks of ActivePlugins) {
    await hooks.open?.(client);
  }
}

export async function close(): Promise<void> {
  for (const hooks of ActivePlugins) {
    await hooks.close?.();
  }
}

export async function emitLog(text: string) {
  for (const hooks of ActivePlugins) {
    if (!hooks.emitLog) continue;
    await hooks.emitLog(text);
  }
}

export async function runWrapFile(name: string, callable: () => Promise<void>): Promise<void> {
  for (const hooks of ActivePlugins) {
    if (hooks.wrapFile) {
      callable = hooks.wrapFile.bind(hooks, name, callable);
    }
  }
  return await callable();
}

export async function runWrapStep(name: string, callable: () => Promise<void>): Promise<void> {
  for (const hooks of ActivePlugins) {
    if (hooks.wrapStep) {
      callable = hooks.wrapStep.bind(hooks, name, callable);
    }
  }
  return await callable();
}

export function runWrapTest(name: string, callable: () => void | Promise<void>): void | Promise<void> {
  for (const hooks of ActivePlugins) {
    if (hooks.wrapTest) {
      callable = hooks.wrapTest.bind(hooks, name, callable);
    }
  }
  return callable();
}

export async function runWrapFetch(
  request: Request,
  callable: (request: Request) => Promise<Response>,
): Promise<Response> {
  for (const hooks of ActivePlugins) {
    if (hooks.wrapFetch) {
      callable = hooks.wrapFetch.bind(hooks, callable);
    }
  }
  return await callable(request);
}
