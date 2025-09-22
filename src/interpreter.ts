#!/usr/bin/env -S deno run --allow-read=. --allow-net
import { parseArgs } from "@std/cli/parse-args";

import { parseHttpSyntax } from "./parser.ts";
import { HttpScript } from "./runtime.ts";
import type { HttpBlock, PluginRegistration } from "./types.ts";

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ['file', 'plugin'],
    collect: ['plugin'],
  });
  if (!args.file) {
    console.error(`Usage: --file <input.http> [--plugin <plugin-name>]... [--env-file <env.json>] [--env <name>] [--set <key>=<value>]...`);
    Deno.exit(5);
  }
  await interpretHttpFile({
    inputPath: args.file,
    plugins: args.plugin.length ? args.plugin : ['console-log'],
  });
}

/**
 * Reads the .http file into memory and then evaluates all of its steps.
 * `importPath` defaults to where the compiler is imported from.
 * `plugins` defaults to `['console-log']`.
 * For more control over the input and output, see {@link renderHttpScript}.
 */
export async function interpretHttpFile(opts: {
  inputPath: string;
  plugins: string[];
}) {
  await using inputFile = await Deno.open(opts.inputPath, { read: true });
  const blockStream = parseHttpSyntax(inputFile.readable
    .pipeThrough(new TextDecoderStream()));

  // Load all of the plugins now, in parallel:
  const importPath = import.meta.url
    .replace(/^https:\/\/jsr.io\/([^/]+\/[^/]+)\/([^/]+)\/src/, (_, pkg, ver) => `jsr:${pkg}@${ver}`)
    .replace(/\/[^/]+$/, '');
  const importExtension = import.meta.url.endsWith('.js') ? 'js' : 'ts';
  const pluginObjs = await Promise.all(opts.plugins
    .map<Promise<PluginRegistration>>(plugin => plugin.includes('/')
      ? import(plugin)
      : import(`${importPath}/plugins/${plugin}.${importExtension}`)));

  const scriptObj = await instantiateHttpScript(
    opts.inputPath,
    blockStream,
    pluginObjs);

  scriptObj.runNow();
}

export async function instantiateHttpScript(
  scriptName: string,
  blocks: AsyncGenerator<HttpBlock>,
  plugins: PluginRegistration[],
): Promise<HttpScript> {

  const script = new HttpScript(scriptName);
  for (const plugin of plugins) {
    script.addPlugin(plugin);
  }

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  for await (const block of blocks) {
    script.addStep({
      name: block.name,
      method: block.method,
      url: block.url,
      headers: block.headers,
      body: block.body,
      preScript: block.preScript
        ? new AsyncFunction('client', 'request', transformScript(block.preScript))
        : null,
      postScript: block.postScript
        ? new AsyncFunction('client', 'request', 'response', transformScript(block.postScript))
        : null,
    });
  }

  return script;
}

function transformScript(text: string) {

  // The http file community has a 'wait' workaround for the lack of a delay function
  // We try to replace several versions of that with a proper async sleep
  text = text.replace(/const wait = seconds => \{[^}]+\};\n/, '');
  text = text.replace(/import {wait} from "[^"]+"\n/, '');
  text = text.replace(/^( +)(wait\()/m, (_,a,b) => `${a}await ${b}`);

  return text;
}
