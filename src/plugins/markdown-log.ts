import type { PluginRegistration } from "../types.ts";

/**
 * Writes more-detailed http results as Markdown.
 * Includes automatic Github Actions step summary integration.
 */
export const plugin: PluginRegistration = {
  name: 'markdown-log',
  create: () => {
    const testRows = new Array<string>;

    const output = new TextEncoderStream();
    const writer = output.writable.getWriter();
    let outPromise: null | Promise<void> = null;

    async function writeLines(lines: string[]) {
      await writer.write([...lines, ''].join('\n'));
    }

    // Github provides a specific location to emit markdown to
    const summaryPath = Deno.env.get('GITHUB_STEP_SUMMARY');
    if (summaryPath) {
      console.error(`We appear to be running in Github Actions, will write markdown to Step Summary`);
      outPromise = Deno.writeFile(summaryPath, output.readable);
    } else {
      outPromise = output.readable.pipeTo(Deno.stdout.writable, {
        preventClose: true,
      });
    }

    async function writeHttpRecord(label: string, bodyMarkdown: string | undefined, expanded: boolean) {
      if (expanded && bodyMarkdown) {
        await writer.write(`> ${label}\n\n`);
        await writer.write(bodyMarkdown);
      } else if (bodyMarkdown) {
        await writer.write(`<details><summary>${label}</summary><p>\n\n`);
        await writer.write(bodyMarkdown);
        await writer.write(`</p></details>\n\n`);
      } else {
        await writer.write(`> ${label}\n\n`);
      }
    }

    let stepNum = 0;
    return {
      async close() {
        await writer.close();
        await outPromise;
      },

      async emitLog(text) {
        await writer.write(text.split('\n').map(x => `> ${x}`).join('\n') + '\n\n');
      },

      async wrapStep(name, callable) {
        await writer.write(`## Step ${++stepNum}: ${name}\n`);
        try {
          await callable();
        } finally {
          if (testRows.length) {
            await writer.write(['',
              `| Test Name | Result |`,
              `| --- | --- |`,
              ...testRows,
            '', ''].join('\n'));
            testRows.length = 0;
          }
        }
      },

      async wrapTest(name, callable) {
        try {
          await callable();
          testRows.push(`| ${name} | ✅ Pass |`);
        } catch (thrown) {
          const err = thrown as Error;
          testRows.push(`| ${name} | ❌ ${err.message} |`);
          throw thrown;
        }
      },

      async wrapFetch(callable, req) {

        // Try buffering and recording the request texts
        const interceptedReq = await interceptTextBody(req);
        if (interceptedReq) {
          req = new Request(req, { body: interceptedReq.text });
        }

        await writeHttpRecord(`${req.method} <code>${req.url}</code>`, interceptedReq?.markdown, false);
        const resp = await callable(req);

        // Try buffering and recording the response texts
        const interceptedResp = await interceptTextBody(resp);

        await writeHttpRecord(`${resp.status} ${resp.ok ? '' : '❗'} <code>${resp.statusText}</code>`, interceptedResp?.markdown, !resp.ok);

        if (interceptedResp) {
          return new Response(interceptedResp.text, resp);
        }
        return resp;
      },

    };
  },
};

/** Accepts a Request or Response and possibly buffers the body from it. */
async function interceptTextBody(message: {
  headers: Headers;
  text: () => Promise<string>;
}) {

  // Try buffering and recording the response texts
  const contentType = message.headers.get('content-type') ?? '';
  if (contentType.startsWith('text/') || contentType.startsWith('application/json')) {
    const text = await message.text();
    const formatted = text.startsWith('{')
      ? JSON.stringify(JSON.parse(text), null, 2)
      : text.trimEnd();
    const mdType = text.startsWith('{')
      ? 'json'
      : '';

    let markdown = ``; // `> (${text.length} bytes of text)`;
    if (text.length < 2048) {
      markdown = `\`\`\`${mdType}\n${formatted}\n\`\`\`\n\n`;
    }
    return { text, markdown };
  }

  return null;
}
