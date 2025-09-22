#!/usr/bin/env -S deno run --allow-read=. --allow-write=.
import { parseHttpSyntax } from "./parser.ts";
import type { HttpBlock } from "./types.ts";

if (import.meta.main) {
  if (Deno.args.length < 1) throw `Args: <input.http> [plugins...]`;
  await compileHttpFile({
    inputPath: Deno.args[0],
    outputPath: `${Deno.args[0]}.ts`,
    plugins: Deno.args.length > 1 ? Deno.args.slice(1) : null,
  });
}

/**
 * Reads the .http file and writes a compiled .ts file.
 * `importPath` defaults to where the compiler is imported from.
 * `plugins` defaults to `['console-log']`.
 * For more control over the input and output, see {@link renderHttpScript}.
 */
export async function compileHttpFile(opts: {
  inputPath: string;
  scriptName?: string;
  importPath?: string | null;
  outputPath: string;
  plugins?: string[] | null;
}) {
  await using inputFile = await Deno.open(opts.inputPath, { read: true });
  const blockStream = parseHttpSyntax(inputFile.readable
    .pipeThrough(new TextDecoderStream()));

  let importPath = opts.importPath;
  if (!importPath) {
    const ourRepoPath = new URL('..', import.meta.url);
    const targetPath = new URL(opts.outputPath, `file://${Deno.cwd()}/`);
    if (targetPath.toString().startsWith(ourRepoPath.toString())) {
      importPath =[
        ...new Array(targetPath.pathname.split('/').length - ourRepoPath.pathname.split('/').length).fill('..'),
        'src',
      ].join('/');
    }
  }
  importPath ??= import.meta.url
    .replace(/^https:\/\/jsr.io\/([^/]+\/[^/]+)\/([^/]+)\/src/, (_, pkg, ver) => `jsr:${pkg}@${ver}`)
    .replace(/\/[^/]+$/, '');

  const scriptStream = renderHttpScript(
    opts.scriptName ?? opts.inputPath,
    blockStream,
    importPath,
    opts.plugins ?? ['console-log']);

  const outputStream = ReadableStream
    .from(scriptStream)
    .pipeThrough(new TextEncoderStream());
  await Deno.writeFile(opts.outputPath, outputStream, {mode: 0o755});
  console.error(`Wrote ${opts.outputPath}`);
}

/**
 * Given a stream of requests as HttpBlock structures, emits a stream of typescript source.
 */
export async function* renderHttpScript(
  scriptName: string,
  blocks: AsyncGenerator<HttpBlock>,
  importPath: string,
  plugins: string[],
): AsyncGenerator<string> {
  const importExtension = import.meta.url.endsWith('.js') ? 'js' : 'ts';

  yield [
    // TODO: better way of knowing what flags to add to the file
    `#!/usr/bin/env -S deno run --allow-env --allow-read=. --allow-net${plugins.includes('opentelemetry') ? ' --unstable-otel' : ''}`,
    `// deno-lint-ignore-file no-unused-vars`,
    `import { HttpScript, type Client, wait } from '${importPath}/runtime.ts';`,
    '',
    `const script = new HttpScript(${JSON.stringify(scriptName)});`,
    ...plugins.map(x => `script.addPlugin(await import(${JSON.stringify(x.includes('/') ? x : `${importPath}/plugins/${x}.${importExtension}`)}));`),
  ].join('\n')+'\n\n';

  for await (const block of blocks) {
    yield `script.addStep({\n`;
    yield `  name: ${JSON.stringify(block.name)},\n`;
    yield `  method: ${JSON.stringify(block.method)},\n`;
    yield `  url: ${JSON.stringify(block.url)},\n`;
    yield `  headers: [\n`;
    for (const header of block.headers) {
      yield `    ${JSON.stringify(header)},\n`;
    }
    yield `  ],\n`;
    if (block.body) {
      yield `  body: ${JSON.stringify(block.body)},\n`;
    }
    // The client param is explicitly typed so that Typescript allows `client.assert()`
    if (block.preScript) {
      const transformed = transformScript(block.preScript);
      yield `  ${transformed.includes('await ') ? 'async ' : ''}preScript(client: Client, request) {\n`;
      yield transformed+'\n';
      yield `  },\n`;
    }
    if (block.postScript) {
      const transformed = transformScript(block.postScript);
      yield `  ${transformed.includes('await ') ? 'async ' : ''}postScript(client: Client, request, response) {\n`;
      yield transformed+'\n';
      yield `  },\n`;
    }
    yield `});\n\n`;
  }

  yield [
    `export default script;`,
    `if (import.meta.main) {`,
    `  await script.runNow();`,
    `}`,
  ].join('\n')+'\n';
}

function transformScript(text: string) {

  // The http file community has a 'wait' workaround for the lack of a delay function
  // We try to replace several versions of that with a proper async sleep
  text = text.replace(/const wait = seconds => \{[^}]+\};\n/, '');
  text = text.replace(/import {wait} from "[^"]+"\n/, '');
  text = text.replace(/^( +)(wait\()/m, (_,a,b) => `${a}await ${b}`);

  return text;
}
