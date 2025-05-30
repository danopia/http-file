import { LogicTracer } from '@cloudydeno/opentelemetry/instrumentation/async.ts';

import { ActivePlugins } from "../plugin.ts";

const fileTracer = new LogicTracer({ name: 'http.script' });
const stepTracer = new LogicTracer({ name: 'http.step' });
const testTracer = new LogicTracer({ name: 'http.test' });

ActivePlugins.push({
  name: 'OpenTelemetry',
  denoFlags: ['--unstable-otel'],

  wrapFile: (name, callable) => fileTracer
    .asyncSpan(name, {}, async (span) => {
      await callable();

      // Enable printing a trace viewer deeplink if configured
      const urlTemplate = Deno.env.get('OTEL_TRACE_URL_TEMPLATE');
      if (urlTemplate && span) {
        const ctx = span.spanContext();
        if (ctx.traceId == '00000000000000000000000000000000') {
          console.log(`\nTracing of this script run was not recorded.\n`);
        } else {
          const fullUrl = urlTemplate
            .replaceAll('{TraceId}', ctx.traceId)
            .replaceAll('{SpanId}', ctx.spanId);
          // TODO: should this be sent via client.log()?
          console.log(`\nTracing of this script run will be available at ${fullUrl}\n`);
        }
      }
    }),

  wrapStep: async (name, callable) => {
    await stepTracer
      .asyncSpan(`step: ${name}`, {
        attributes: {
          'httpfile.step_name': name,
        },
      }, callable);
    // We add a brief gap between steps so their spans won't be at risk of overlapping
    await new Promise(ok => setTimeout(ok, 10));
  },

  wrapTest: (name, callable) => testTracer
    .asyncSpan(`test: ${name}`, {
      attributes: {
        'httpfile.test_name': name,
      },
    }, callable),

});
