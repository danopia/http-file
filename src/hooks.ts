import type { PluginInstance, Client, PluginRegistration } from "./types.ts";

export class HooksManager {
  constructor(
    private readonly client: Client,
  ) {}
  private readonly plugins: Array<PluginInstance> = [];

  async createPlugins(registrations: Array<PluginRegistration>) {
    for (const hooks of registrations) {
      this.plugins.push(await hooks.create(this.client));
    }
  }

  async close(): Promise<void> {
    for (const hooks of this.plugins) {
      await hooks.close?.();
    }
    this.plugins.length = 0;
  }

  async emitLog(text: string) {
    for (const hooks of this.plugins) {
      if (!hooks.emitLog) continue;
      await hooks.emitLog(text);
    }
  }

  runWrapFile(name: string, callable: () => Promise<void>): Promise<void> {
    for (const hooks of this.plugins) {
      if (hooks.wrapFile) {
        callable = hooks.wrapFile.bind(hooks, name, callable);
      }
    }
    return callable();
  }

  runWrapStep(name: string, callable: () => Promise<void>): Promise<void> {
    for (const hooks of this.plugins) {
      if (hooks.wrapStep) {
        callable = hooks.wrapStep.bind(hooks, name, callable);
      }
    }
    return callable();
  }

  runWrapTest(name: string, callable: () => void | Promise<void>): void | Promise<void> {
    for (const hooks of this.plugins) {
      if (hooks.wrapTest) {
        callable = hooks.wrapTest.bind(hooks, name, callable);
      }
    }
    return callable();
  }

  runWrapFetch(
    request: Request,
    callable: (request: Request) => Promise<Response>,
  ): Promise<Response> {
    for (const hooks of this.plugins) {
      if (hooks.wrapFetch) {
        callable = hooks.wrapFetch.bind(hooks, callable);
      }
    }
    return callable(request);
  }

}
