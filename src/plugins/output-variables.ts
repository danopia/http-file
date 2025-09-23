/**
 * Tracks which client.global entries were changed during the script's execution
 * and logs the new values as a JSON object at the end of the script.
 * Helpful to retrieve created resource IDs and such for display or further processing.
 *
 * When loaded alongside a `markdown-log` plugin,
 * the JSON object is encoded as a hidden Markdown comment.
 *
 * @module
*/

import type { PluginRegistration } from '../types.ts';

/** A plugin that logs changed global variables after file execution */
export const plugin: PluginRegistration = {
  name: 'output-variables',
  create(props) {

    function writeValues(variables: Record<string,unknown>) {
      const valuesJson = JSON.stringify(variables);
      if (props.script.plugins.some(x => x.name == 'markdown-log')) {
        console.log(`\n[//]: #http-file-output-variables (${valuesJson})\n`);
      } else {
        console.log(`Output variables: ${valuesJson}`);
      }
    }

    return Promise.resolve({

      wrapFile: async (_name, callable) => {
        const beforeValues = new Map(props.client.global);
        try {
          await callable();
        } finally {
          const changedValues = diffValues(beforeValues, props.client.global);
          writeValues(changedValues);
        }
      },

    });
  },
};

function diffValues(beforeValues: Map<string, string>, afterValues: Map<string, string>) {
  const allKeys = new Set(beforeValues.keys()).union(new Set(afterValues.keys()));
  const changes = [...allKeys].flatMap<[string,unknown]>(key => {
    const before = beforeValues.get(key);
    const after = afterValues.get(key);
    if (before == after) return [];
    return [[key, after ?? null]];
  });
  return Object.fromEntries(changes);
}
