/** Interface used by generated wrapper code */
export interface HttpScriptApi {
  addStep: (opts: StepOpts) => void;
  runNow: () => Promise<void>;
};

/** The client interface that embedded scripts can reference */
export interface Client {
  // Standard .http API
  global: Map<string,string>;
  assert: (expr: unknown, msg?: string) => asserts expr;
  log: (text: string) => void;
  test: (title: string, callback: () => void) => void;
  // Extra API for our generated code
  close: () => Promise<void>;
  performStep: (opts: StepOpts) => Promise<void>;
};

/** An http request definition parsed out of a .http file */
export type HttpBlock = {
  name: string;
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body: string;
  preScript: string;
  postScript: string;
};

export type StepOpts = {
  name: string;
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body?: string;
  preScript?: (client: Client, request: HttpRequestPre) => void | Promise<void>;
  postScript?: (client: Client, request: HttpRequestPost, response: HttpResponse) => void | Promise<void>;
};

/** Interface implemented by http-file plugins */
export type ClientPlugin = {
  name: string;
  denoFlags?: Array<string>;
  open?: (client: Client) => Promise<void>;
  close?: () => Promise<void>;
  emitLog?: (text: string) => void | Promise<void>;
  wrapFile?: (name: string, callable: () => Promise<void>) => Promise<void>;
  wrapStep?: (name: string, callable: () => Promise<void>) => Promise<void>;
  wrapFetch?: (callable: (request: Request) => Promise<Response>, request: Request) => Promise<Response>;
  wrapTest?: (name: string, callable: () => void | Promise<void>) => Promise<void>;
};

// Various API expected by embedded scripts

type Substitutable = {
  getRaw: () => string;
  tryGetSubstituted: () => string;
};
type NamedArray<T extends {name: string}> = {
  all: () => Array<T>;
  findByName: (name: string) => T | null;
};

export type HeaderPre = {
  name: string;
  getRawValue: () => string;
  tryGetSubstitutedValue: () => string;
};
export type HeaderPost = {
  name: string;
  value: () => string;
};

// https://www.jetbrains.com/help/idea/http-response-reference.html#request-properties
type HttpRequestCommon = {
  environment: Map<string,string>;
  method: string;
  variables: Map<string,string>;
  // iteration()
  // templateValue(Integer)
};
export type HttpRequestPre = HttpRequestCommon & {
  body: Substitutable;
  url: Substitutable;
  headers: NamedArray<HeaderPre>;
};
export type HttpRequestPost = HttpRequestCommon & {
  body: () => string;
  url: () => string;
  headers: NamedArray<HeaderPost>;
};

export type HttpResponse = {
  // deno-lint-ignore no-explicit-any
  body: any;
  // headers: Headers;
  status: number;
  contentType: {
    mimeType: string;
    charset: string;
  };
};
