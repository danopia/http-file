import { LogicTracer } from '@cloudydeno/opentelemetry/instrumentation/async.ts';

import { ActivePlugins } from "../plugin.ts";

const fileTracer = new LogicTracer({ name: 'http.script' });
const stepTracer = new LogicTracer({ name: 'http.step' });
const testTracer = new LogicTracer({ name: 'http.test' });

ActivePlugins.push({
  name: 'OpenTelemetry',

  wrapFile: (callable) => fileTracer
    .asyncSpan(Deno.env.get('OTEL_ROOT_SPAN_NAME') ?? 'execution', {}, async (span) => {
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

  wrapStep: (name, callable) => stepTracer
    .asyncSpan(`step: ${name}`, {
      attributes: {
        'httpfile.step_name': name,
      },
    }, async () => {
      await callable();
      // We force a gap between steps so they can't overlap
      await new Promise(ok => setTimeout(ok, 100));
    }),

  wrapTest: (name, callable) => testTracer
    .asyncSpan(`test: ${name}`, {
      attributes: {
        'httpfile.test_name': name,
      },
    }, callable),

});
