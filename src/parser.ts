import { TextLineStream } from "@std/streams/text-line-stream";
import type { HttpBlock } from "./types.ts";

function emptyBlock(name: string): HttpBlock {
  return {
    name,
    method: '',
    url: '',
    headers: [],
    body: '',
    preScript: '',
    postScript: '',
  };
}

/** Process a streaming string containing an .http file, and produces a stream of parsed HTTP request descriptions */
export async function* parseHttpSyntax(stream: ReadableStream<string>): AsyncGenerator<HttpBlock> {
  let idx = 0;
  let currentBlock = emptyBlock(`Request #${++idx}`);
  let currentMode: 'init' | 'headers' | 'body' | 'prescript' | 'postscript' = 'init';
  let headersDone = false;
  const lineBuffer = new Array<string>;

  let lineNum = 0;
  for await (const line of stream.pipeThrough(new TextLineStream())) {
    lineNum++;
    // for debugging the state machine:
    // console.log(currentMode, currentBlock, line);

    if (currentMode == 'prescript') {
      if (line == '%}') {
        currentBlock.preScript = lineBuffer.join('\n');
        currentMode = 'init';
      } else {
        lineBuffer.push(line);
      }
      continue;
    }

    if (currentMode == 'postscript') {
      if (line == '%}') {
        currentBlock.postScript = lineBuffer.join('\n');
        currentMode = 'init';
      } else {
        lineBuffer.push(line);
      }
      continue;
    }

    if (line.startsWith('###')) {
      if (currentBlock.url) {
        if (currentMode == 'body' && lineBuffer.length) {
          currentBlock.body = lineBuffer.join('\n');
          lineBuffer.length = 0;
        }
        yield currentBlock;

        currentBlock = emptyBlock(`Request #${++idx}`);
        currentMode = 'init';
        headersDone = false;
      }
      const extraText = line.slice(3).trim();
      if (extraText) {
        currentBlock.name = extraText;
      }
      continue;
    }

    if (line == '< {%') {
      currentMode = 'prescript';
      lineBuffer.length = 0;
      continue;
    }

    // comments
    if (line.startsWith('//') || line.startsWith('#')) {
      continue;
    }

    if (!currentBlock.method) {
      if (line.split(' ').length >= 2) { // sometimes has HTTP/1.1
        currentBlock.method = line.split(' ')[0];
        currentBlock.url = line.split(' ')[1];
        continue;
      }
      if (!line) continue;
      // Simplified syntax for GET requests
      currentBlock.method = 'GET';
      currentBlock.url = line;
      continue;
    }

    if (!headersDone) {
      if (line.includes(': ')) {
        const colonIdx = line.indexOf(': ');
        currentBlock.headers.push([
          line.slice(0, colonIdx),
          line.slice(colonIdx + 2),
        ]);
      } else if (!line) {
        headersDone = true;
        currentMode = 'body';
        lineBuffer.length = 0;
      } else {
        // this might be ok, it depends on when the warning next comes up
        console.warn('WARN: header parser unexpectedly skipping line', lineNum, 'in http file');
      }
      continue;
    }

    if (currentMode == 'body') {
      if (line == '> {%') {
        currentBlock.body = lineBuffer.join('\n');
        currentMode = 'postscript';
        lineBuffer.length = 0;
        continue;
      }

      lineBuffer.push(line);
      continue;
    }

    if (!line) continue;
    console.error('TODO:', { line, lineNum, currentBlock, currentMode, lineBuffer });
    break;
  }
  if (currentBlock.url) {
    if (currentMode == 'body' && lineBuffer.length) {
      currentBlock.body = lineBuffer.join('\n');
      lineBuffer.length = 0;
    }
    yield currentBlock;
  }
}
