/**
 * Exports a module which writes machine-readable execution progress
 * to stdout in a line-by-line JSON format.
 * Uses Markdown comments if necessary.
 *
 * @module
 */

import type { PluginRegistration } from "../types.ts";

/**
 * Emits only high-level script progress to stdout as JSON lines
 * Enables realtime progress bars in wrapping UI.
 *
 * When loaded alongside a `markdown-log` plugin,
 * the JSON lines are encoded as individual Markdown comments.
*/
export const plugin: PluginRegistration = {
  name: 'progress-stream',
  create(props) {

    // We one-index steps to keep 0 for "before anything",
    // and we also leave a slot at the end to reach when everything is complete.
    const stepCount = props.script.steps
      // Support for nested scripts by counting child steps
      .map(step => step.type == 'run'
        ? step.childScript.steps.length
        : 1)
      .reduce((sum, it) => sum + it, 0);

    function writeProgress(progress: {
      message: string;
      stepNum: number;
      result?: string;
    }) {
      const progressJson = JSON.stringify({
        ...progress,
        stepCount,
      });
      if (props.script.plugins.some(x => x.name == 'markdown-log')) {
        console.log(`\n[//]: #http-file-progress (${progressJson})\n`);
      } else {
        console.log(`${progressJson}`);
      }
    }

    writeProgress({ message: 'Starting script...', stepNum: 0 });
    let stepNum = 0;
    let stepFailed = false;
    return Promise.resolve({

      close() {
        if (!stepFailed) {
          writeProgress({ message: 'Execution ended', stepNum: stepCount, result: 'success' });
        }
      },

      async wrapStep(name, callable) {
        writeProgress({ message: `Running step "${name}"...`, stepNum: ++stepNum });
        try {
          return await callable();
        } catch (thrown) {
          stepFailed = true;
          writeProgress({ message: `Step "${name}" failed!`, stepNum: stepNum, result: 'failure' });
          throw thrown;
        }
      },

    });
  },
};
