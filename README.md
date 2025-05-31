## `@danopia/http-file`

Jetbrains has [invented a syntax](https://www.jetbrains.com/help/idea/exploring-http-syntax.html)
for composing multiple HTTP requests along with JS snippits and saving them in `.http` files.

To run these files away from the IDE, Jetbrains provides a Java-based interpreter program.
I found this runner rather limiting for automated use and instead reimplemented
a subset of the `.http` syntax by producing a new JS file containing the HTTP requests and
the pre/post scripts all together. This file can be efficiently executed top-to-bottom with Deno.

### Goals and non-goals

I aim to:

* Compile and run .http files as a series of HTTP requests.
* Support many unmodified pre- and post- scripts (as much as is practical)
* Report results in multiple ways, e.g. plain text, markdown, or structured output for UIs
* Accept input variables dynamically from environment, process args, or custom plugins

I am *not currently* planning on:

* HTTP scripts which interact with files (e.g. response redirection)
* Running files piecemeal (e.g. triggering individual requests)
* Advanced scripting such as request loops based on array variables
* Automatic oauth / auth flows

### Usage Example

A basic `.http` file with several requests is included at `examples/get-client-info.http`.

If you have this file locally, you can compile it like so:

```shell
./src/compiler.ts examples/get-client-info.http

# from JSR:
deno run --allow-read=. --allow-write=. jsr:@danopia/http-file/compiler.ts examples/get-client-info.http
```

And then execute it directly:

```shell
./examples/get-client-info.http.ts
```

### Plugins

The runtime environment accepts plugins to customize side-effects such as logging.
The only default plugin is `console-log` which provides a minimal console output
outlining the HTTP requests sent and the results of HTTP tests.

To specify different plugins, pass their names at compile-time.
You'll then need to include `console-log` if you still want it included.

For example:

```shell
# Use opentelemetry plugin, and also keep the console-log default plugin
./src/compiler.ts examples/get-client-info.http opentelemetry console-log

# Run ths script with these new plugins active
./examples/get-client-info.http.ts
```

#### Provided plugins

* `console-log` writes a somewhat concise record of the http script's actions to the console as text. Included by default when no plugins are specified.
* `markdown-log` outputs a more-detailed record of the script's actions in a markdown format. When run in Github Actions, the markdown is sent to Github and gets displayed nicely on the Job Summary page; otherwise it is just written to the console.
* `opentelemetry` executes the http script within one Opentelemtry trace and also instruments the script steps and tests with spans. Combine this with [Deno's Otel support](https://docs.deno.com/runtime/fundamentals/open_telemetry/) to export the instrumentation to your preferred observability vendor.
* `progress-stream` outputs the ongoing high-level progress (step-by-step) as JSON lines for driving wrapper UIs.

#### Plugin development
If you specify a URL or relative path as a plugin, it will be imported directly.
Use this to create your own plugins.

Plugins can instrument script steps to have full control over your logging.
They can also run before the script to modify variables e.g. set up some custom authentication tokens.

To be documented.

### Programmatic usage
The parser and the compiler can be imported into other Deno programs and called directly.

To be documented.
