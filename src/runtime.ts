import { parseArgs } from '@std/cli/parse-args';

import type { HeaderPost, HeaderPre, Client, HttpRequestPre, HttpScriptApi, StepOpts, PluginRegistration } from './types.ts';
import { HooksManager } from "./hooks.ts";
export type { Client };

export class HttpScript implements HttpScriptApi {
  public steps: Array<StepOpts> = [];
  public plugins: Array<PluginRegistration> = [];
  constructor(
    public readonly name: string,
  ) {}
  addStep(opts: StepOpts) {
    this.steps.push(opts);
  }
  /**
   * Accepts plugin registrations directly as well as via 'plugin' imports
   * @example script.addPlugin(MyPlugin);
   * @example script.addPlugin(await import('./my-plugin.ts'));
   */
  addPlugin(plugin: PluginRegistration | { plugin: PluginRegistration }) {
    this.plugins.push('plugin' in plugin ? plugin.plugin : plugin);
  }
  async runNow(): Promise<void> {
    const client = new HttpClient;
    await client.runScript(this);
  }
}

export class HttpClient implements Client {
  public readonly global: Map<string,string> = new Map;

  private readonly hooks = new HooksManager;

  private pendingTests: Array<{
    title: string;
    callback: () => void | Promise<void>;
  }> = [];

  async runScript(script: HttpScript): Promise<void> {
    await this.setup();
    await this.hooks.createPlugins(script.plugins, {
      client: this,
      script,
    });
    await this.hooks.runWrapFile(script.name, async () => {
      try {
        for (const step of script.steps) {
          await this.performStep(step);
        }
      } finally {
        await this.hooks.close();
      }
    });
  }

  async setup() {
    if (Deno.args.includes('--from-env')) {
      await this.setupFromEnv(Deno.env);
    } else {
      await this.setupFromArgs(Deno.args);
    }
  }

  async performStep(opts: StepOpts) {
    this.pendingTests.length = 0;
    await this.hooks.runWrapStep(opts.name, async () => {
      const environment = this.global;
      const variables = new Map<string,string>();

      function replaceVars(text: string) {
        return text.replaceAll(/{{([^}]+)}}/g, (capture, varName) => {
          const replacement = variables.get(varName) ?? environment.get(varName);
          if (replacement == null) {
            console.error(`  ! WARN: reference to unresolved variable`, varName);
          }
          return replacement ?? capture;
        });
      }

      const headersPre = opts.headers.map<HeaderPre>(pair => ({
        name: pair[0],
        getRawValue: () => pair[1] ?? '',
        tryGetSubstitutedValue: () => replaceVars(pair[1] ?? ''),
      }));
      const requestPre: HttpRequestPre = {
        environment,
        variables,
        method: opts.method,
        body: {
          getRaw: () => opts.body ?? '',
          tryGetSubstituted: () => replaceVars(opts.body ?? ''),
        },
        url: {
          getRaw: () => opts.url ?? '',
          tryGetSubstituted: () => replaceVars(opts.url ?? ''),
        },
        headers: {
          all: () => headersPre.slice(0),
          findByName: (name) => headersPre.find(x => x.name == name) ?? null,
        },
      };
      await opts.preScript?.(this, requestPre);

      const rendered = {
        method: requestPre.method,
        url: requestPre.url.tryGetSubstituted(),
        headers: new Headers(requestPre.headers.all().map(x => [x.name, x.tryGetSubstitutedValue()])),
        body: requestPre.body.tryGetSubstituted(),
      };

      const resp = await this.hooks.runWrapFetch(new Request(rendered.url, {
        method: rendered.method,
        headers: rendered.headers,
        body: rendered.body || null,
      }), fetch);

      const respText = await resp.text();
      const respBody = respText.startsWith('{') ? JSON.parse(respText) : respText;
      // console.error(respBody);
      if (!resp.ok) {
        console.error(typeof respBody == 'string' ? respBody.slice(0, 255) : respBody);
        console.error(``);
      }

      const [mimeType, extraText] = resp.headers.get('content-type')?.split(';') ?? [];

      const headersPost = [...rendered.headers].map<HeaderPost>(pair => ({
        name: pair[0],
        value: () => pair[1],
      }));
      await opts.postScript?.(this, {
        environment,
        variables,
        method: rendered.method,
        body: () => rendered.body,
        url: () => rendered.url,
        headers: {
          all: () => headersPost.slice(0),
          findByName: (name) => headersPost.find(x => x.name == name) ?? null,
        }
      }, {
        body: respBody,
        status: resp.status,
        contentType: {
          mimeType: mimeType ?? '',
          charset: extraText?.match(/charset=([^ ,]+)/)?.[1] ?? '',
        },
      });

      // Run all tests sequintally and _then_ throw the first failure, if any
      const testFailures = new Array<unknown>;
      for (const test of this.pendingTests) {
        try {
          await this.hooks.runWrapTest(test.title, test.callback);
        } catch (thrown) {
          testFailures.push(thrown);
        }
      }
      if (testFailures.length > 0) {
        throw testFailures[0];
      }
    });
  }

  async log(text: string) {
    await this.hooks.emitLog(text);
  }

  test(title: string, callback: () => void | Promise<void>) {
    this.pendingTests.push({ title, callback });
  }

  assert(expr: unknown, msg = ""): asserts expr {
    if (!expr) {
      throw new AssertionError(msg);
    }
  }

  async loadEnvFile(filePath: string, envKey: string) {
    const envDict = await Deno.readTextFile(filePath).then(x => JSON.parse(x));
    if (!(envKey in envDict)) {
      throw `Environment "${envKey}" not found in "${filePath}". Available keys: [${Object.keys(envDict).join(', ')}]`;
    }
    const envData = envDict[envKey];
    for (const pair of Object.entries(envData)) {
      this.global.set(pair[0], String(pair[1]));
    }
  }

  async setupFromEnv(env: { get: (key: string) => string | undefined }) {
    const EnvFile = env.get('Http_EnvFile');
    const EnvName = env.get('Http_EnvName') ?? 'default';
    if (EnvFile) {
      await this.loadEnvFile(EnvFile, EnvName);
    }

    const ExtraVars = env.get('Http_ExtraVars') ?? '{}';
    for (const pair of Object.entries(JSON.parse(ExtraVars))) {
      this.global.set(pair[0], `${pair[1]}`);
    }
  }

  async setupFromArgs(givenArgs: Array<string>) {
    const args = parseArgs(givenArgs, {
      string: ['env-file', 'env', 'set'],
      collect: ['set'],
    });
    if (args['env-file']) {
      await this.loadEnvFile(args['env-file'], args['env'] ?? 'default');
    }
    for (const pair of args.set) {
      const delimIdx = pair.indexOf('=');
      if (delimIdx < 1) throw new Error(`invalid --set pair`);
      this.global.set(pair.slice(0, delimIdx), pair.slice(delimIdx+1));
    }
  }

}

export function wait(seconds: number): Promise<void> {
  // console.error(`Waiting ${seconds} seconds...`);
  return new Promise<void>(ok => setTimeout(ok, seconds * 1000));
}

export class AssertionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AssertionError";
  }
}
