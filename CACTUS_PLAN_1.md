Let's redo the bridge a bit, as I tested it and it will likely not meet power user demands (I gave it to a power user and he had many complaints lol 😅)



Migrate Cactus Bridge to WKScriptMessageHandler + tools + structured output + drop stop_sequences


Writing up the next iteration on the Cactus webview wrapper. Four things bundled together because they're related: migrate the bridge to a proper JSON postMessage transport, add tool calling, add structured JSON output, and remove the stop_sequences hack.

1. Migrate JS to native bridge from URL scheme to WKScriptMessageHandler
Current state
JS triggers native via:

window.despia = 'intelligence://text?model=qwen3&prompt=...&id=...';
Why migrate
URL length cap (~2048 chars on iOS), breaks the moment we send real chat history
Can only pass a single prompt string, not an array of messages
Structured params (temperature, max_tokens, tools, images, stop) become ugly query strings
Special characters (newlines, quotes, emojis, code) need layered escaping
Not OpenAI-shaped, so devs porting from OpenAI/Anthropic SDKs have to rewrite
Target API
New JS surface, all under window.intelligence, mirroring OpenAI chat completions:

window.intelligence.completion({
  id: 'job_abc123',
  model: 'qwen3-1.7b',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the weather in Dubai?' }
  ],
  temperature: 0.7,
  max_tokens: 512,
  stream: true,
  tools: [/* see section 2 */]
});

window.intelligence.listModels({ query: 'all' | 'installed' });
window.intelligence.downloadModel({ model: 'qwen3-1.7b' });
window.intelligence.removeModel({ model: 'qwen3-1.7b' });  // or 'all'
window.intelligence.cancel({ id: 'job_abc123' });  // optional, nice to have
Native side (Swift / WKWebView)
let contentController = WKUserContentController()
contentController.add(self, name: "intelligenceBridge")
config.userContentController = contentController

func userContentController(_ uc: WKUserContentController,
                           didReceive message: WKScriptMessage) {
    guard message.name == "intelligenceBridge",
          let body = message.body as? [String: Any],
          let action = body["action"] as? String else { return }
    switch action {
    case "completion":    handleCompletion(payload: body)
    case "listModels":    handleListModels(payload: body)
    case "downloadModel": handleDownload(payload: body)
    case "removeModel":   handleRemove(payload: body)
    case "cancel":        handleCancel(payload: body)
    default: break
    }
}
JS side
window.intelligence.completion = function(payload) {
  window.webkit.messageHandlers.intelligenceBridge.postMessage({
    action: 'completion',
    ...payload
  });
};
Callbacks, mostly keep as-is
Most existing native to JS callbacks work fine, no changes needed:

window.intelligence.onMLError(error) UNCHANGED
window.intelligence.onDownloadStart / onDownloadProgress / onDownloadEnd / onDownloadError UNCHANGED
window.intelligence.onAvailableModelsLoaded / onInstalledModelsLoaded UNCHANGED
window.intelligence.onRemoveSuccess / onRemoveError / onRemoveAllSuccess / onRemoveAllError UNCHANGED
onMLToken and onMLComplete change shape, see section 2.

Migration strategy (don't break existing builds)
Keep both paths in native for one release:

Add the WKScriptMessageHandler
Leave the existing intelligence:// URL scheme handler in place (deprecated)
JS feature-detects and prefers the new path:
if (window.webkit?.messageHandlers?.intelligenceBridge) {
  // new JSON path
} else {
  // legacy URL scheme
}
Drop the URL scheme handler in the release after we confirm all clients have shipped with the new bridge.
2. Add tool calling support
Cactus supports tool calling natively (Swift SDK has FunctionDefinition with JSON Schema parameters, Kotlin/Flutter SDKs expose CactusTool, completion results include a toolCalls array).

The dev API for tools is intentionally tiny:

// 1. Register a tool once at app init, single statement
window.intelligence.tools.get_weather = Object.assign(
  async (args) => { /* fetch weather and return */ },
  { schema: { description: '...', parameters: {...} } }
);

// 2. Use completion() normally — tools auto-included
window.intelligence.completion({ id, model, messages });
Under the hood, the JS bridge wrapper translates window.intelligence.tools into the OpenAI-shaped tools[] array that native and Cactus expect. Devs never have to write that shape themselves unless they want to (escape hatch for ad-hoc/MCP tools, see below).

How tool execution actually works
Important: the bridge does NOT run tools. The model decides WHEN to call a tool and WITH WHAT ARGS. The JS app actually runs it. Then JS sends the return value back into the conversation and the model continues. The flow is:

1. JS calls completion() with messages (tools auto-included from window.intelligence.tools)
2. Model decides to call a tool, native streams snapshots until status: 'ready'
3. onMLComplete fires with the final snapshot for that turn
4. JS finds the 'ready' tool block, calls window.intelligence.tools[name](args), gets a return value
5. JS mutates the block to status: 'done' (or 'failed') with result/error
6. JS appends to conversation history and calls completion() again
7. Model sees the result and generates final text streaming via onMLToken / onMLComplete
Tools are just plain JS functions. They can do anything (fetch APIs, read storage, do math) and return a value. Sync or async, doesn't matter.

Tool registration: register once, forget forever
The dev API is intentionally tiny. Register a tool once at app init by attaching it to window.intelligence.tools[name], with the schema as a property on the function itself. From that point on, every completion() call automatically includes all registered tools. No helper to remember, no array to build, no schema to repeat per call.

Use Object.assign to attach the schema in a single statement, so the function body and schema live in one expression:

window.intelligence.tools.get_weather = Object.assign(
  async (args) => {
    const res = await fetch(`https://api.weather.com/v1/${args.city}`);
    const data = await res.json();
    return { temp: data.temp, conditions: data.conditions };
  },
  {
    schema: {
      description: 'Get current weather for a city',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string', description: 'City name' } },
        required: ['city']
      }
    }
  }
);

window.intelligence.tools.add_numbers = Object.assign(
  (args) => ({ sum: args.a + args.b }),
  {
    schema: {
      description: 'Add two numbers',
      parameters: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b']
      }
    }
  }
);

// That's it. Use completion() normally, tools just work.
window.intelligence.completion({
  id: 'job_1',
  model: 'qwen3-1.7b',
  messages: [{ role: 'user', content: "What's the weather in Dubai?" }]
  // no tools field needed, all registered tools auto-included
});
Why Object.assign instead of a defineTool() helper:

It's plain JavaScript. Anyone reading it understands it the first time, no new API to learn.
No magic. Object.assign(fn, { schema }) literally means "take this function and put a schema property on it." Exactly what's happening, exactly how it's expressed.
Keeps the bridge API small. We're shipping completion, listModels, downloadModel, removeModel, cancel, tools — that's the whole surface. No helper to add.
Errors surface naturally. If a dev forgets the schema, the bridge wrapper throws "Tool missing .schema: get_weather" when resolving tools. With a helper, the failure mode would be hidden.
Why design choices in general:

Discovery is trivial. Object.keys(window.intelligence.tools) lists every registered tool.
Late binding. Different parts of the app can register tools without coordinating through a central registry. A weather module attaches get_weather, a calendar module attaches add_event, none of them need to know about each other.
Mirrors the bridge structure. window.intelligence.completion(...) is a function on the bridge. Tools being functions on window.intelligence.tools is consistent.
Testing ergonomics. Call any tool from the dev console without involving the model: await window.intelligence.tools.get_weather({ city: 'Dubai' }).
Why run functions stay in JS and never cross the bridge:

Functions are not JSON-serializable, they cannot be sent through WKScriptMessageHandler.postMessage.
Real tool implementations capture closures (api keys, caches, app state). Forcing them to be self-contained pure functions would cripple them.
Native running JS functions from a bridge would be weird and hard to debug. Native handles inference, JS handles app logic. Clear boundary.
The tools field is polymorphic
For control when you want it, the tools field on completion() accepts four shapes:

// 1. OMITTED (default) — auto-include all registered tools
window.intelligence.completion({ id, model, messages });

// 2. ARRAY OF NAMES — restrict to specific registered tools
window.intelligence.completion({ id, model, messages, tools: ['get_weather'] });

// 3. EMPTY ARRAY — disable tools entirely for this call
window.intelligence.completion({ id, model, messages, tools: [] });

// 4. ARRAY OF FULL SCHEMAS — escape hatch for ad-hoc tools (e.g. MCP-sourced)
window.intelligence.completion({
  id, model, messages,
  tools: [{ type: 'function', function: { name: '...', parameters: {...} } }]
});
Resolution happens in the JS bridge wrapper before the postMessage to native. Native always receives the full OpenAI-shaped tools[] array, so the native side stays simple. All the convenience lives in JS:

// Inside the bridge wrapper, simplified
window.intelligence.completion = function(payload) {
  let resolvedTools;

  if (payload.tools === undefined) {
    // Default: all registered tools
    resolvedTools = Object.entries(window.intelligence.tools).map(([name, fn]) => ({
      type: 'function',
      function: { name, ...fn.schema }
    }));
  } else if (Array.isArray(payload.tools)) {
    resolvedTools = payload.tools.map(t => {
      if (typeof t === 'string') {
        const fn = window.intelligence.tools[t];
        if (!fn) throw new Error(`Tool not registered: ${t}`);
        if (!fn.schema) throw new Error(`Tool missing .schema: ${t}`);
        return { type: 'function', function: { name: t, ...fn.schema } };
      }
      return t;  // already a full schema, pass through
    });
  }

  window.webkit.messageHandlers.intelligenceBridge.postMessage({
    action: 'completion',
    ...payload,
    tools: resolvedTools
  });
};
Tool dispatch in onMLComplete is a one-liner
When the model emits a tool call, the snapshot has a tool block with status: 'ready'. JS just calls the registered function directly via the namespace. No registry helper, no if/else, no dispatch function:

const result = await window.intelligence.tools[pendingTool.name](pendingTool.arguments);
If the tool name doesn't exist on window.intelligence.tools, that's a programming error (the model called something the bridge sent a schema for but JS no longer has registered). Wrap in a try/catch to surface it as a 'failed' status.

Native side responsibilities
Map incoming tools[] to Cactus FunctionDefinition[] before calling chatCompletion
Maintain the canonical pieces array for the current turn
Fire onMLToken(jobId, snapshot) with the FULL current pieces array on every meaningful update (text growing, tool call starting, args parsed)
Fire onMLComplete(jobId, finalSnapshot) when the turn is done
Every snapshot is valid parseable JSON. No partial JSON, no string concatenation in JS, no chunk reassembly.
One callback, snapshots of typed blocks
onMLToken is now the single streaming callback. Each fire gives JS the FULL current blocks array as it exists right now. Native maintains the canonical state and re-emits the whole array whenever something meaningful changes. UI just blows away and re-renders the latest snapshot every fire. React/Vue/whatever diffing handles the rest.

There are TWO block types: content and tool. Content blocks have a format that says how to interpret the value. This keeps the type system flat and extensible.

// Text content from the model (default format)
{ type: 'content', format: 'string', content: 'some text' }

// Structured JSON content (when response_format is set, see section 3)
{ type: 'content', format: 'json', content: { name: 'John', age: 42 } }

// A tool call the model wants to make
{
  type: 'tool',
  id: 'call_xyz',
  name: 'get_weather',
  status: 'loading' | 'ready' | 'done' | 'failed',
  arguments: { ... },   // present when status is 'ready' or later
  result: { ... },       // present when status is 'done', added by JS
  error: 'some error'    // present when status is 'failed'
}
Two blocks instead of three. Whether the model writes prose or structured JSON, both are content emitted by the model. They differ only in shape, not in role. Tools are categorically different (they call out to JS for execution and have a status lifecycle), so they earn their own block type.

Status meanings for tool blocks:

'loading': model is still generating the args, name might be known but arguments not parsed yet
'ready': args fully assembled and parsed into a real JS object, JS should now run the tool
'done': tool ran, JS added the result field
'failed': tool errored or model produced unparseable args, error field has details
When format: 'json' content is being generated, native does NOT emit partial JSON snapshots. The block appears in the snapshot only once parsing succeeds, with content as a real JS object. Same no-partial-JSON principle as tool args.

What the stream looks like
User asks "what's the weather in Dubai?" with a get_weather tool registered.

onMLToken fire 1 — model starts text:

[ { type: 'content', format: 'string', content: 'Let' } ]
onMLToken fire 2 — text grows:

[ { type: 'content', format: 'string', content: 'Let me check the weath' } ]
onMLToken fire 3 — model finishes text, starts tool call:

[
  { type: 'content', format: 'string', content: 'Let me check the weather for you.' },
  { type: 'tool', id: 'call_xyz', name: 'get_weather', status: 'loading' }
]
onMLToken fire 4 — args fully parsed:

[
  { type: 'content', format: 'string', content: 'Let me check the weather for you.' },
  { type: 'tool', id: 'call_xyz', name: 'get_weather', status: 'ready', arguments: { city: 'Dubai' } }
]
onMLComplete fires — Cactus done with this turn (model wants tool result before continuing). JS now runs the tool, mutates its local snapshot to add the result, calls completion() again with updated messages.

onMLToken fire 5 — new completion starts, model generates final text. JS keeps the previous turn's blocks in UI history and starts a fresh array for the new turn:

[ { type: 'content', format: 'string', content: "It's" } ]
onMLToken fire 6 — final text grows:

[ { type: 'content', format: 'string', content: "It's 32°C in Dubai." } ]
onMLComplete fires with the final snapshot, turn done.

Tool execution flow
JS owns the state. Native streams snapshots, JS calls the registered tool function directly via window.intelligence.tools[name], JS calls completion() again to continue. No magic auto-continue, no helper dispatch function needed.

let conversation = [
  { role: 'system', content: '...' },
  { role: 'user', content: "What's the weather in Dubai?" }
];

// Latest snapshot for the current turn, replaced on every onMLToken fire
let currentSnapshot = [];

window.intelligence.onMLToken = function(jobId, snapshot) {
  currentSnapshot = snapshot;
  renderTurn(snapshot);  // UI just re-renders the latest array
};

window.intelligence.onMLComplete = async function(jobId, finalSnapshot) {
  currentSnapshot = finalSnapshot;
  renderTurn(finalSnapshot);

  // Find any tool blocks with status 'ready' that need to run
  const pendingTool = finalSnapshot.find(
    b => b.type === 'tool' && b.status === 'ready'
  );

  if (!pendingTool) {
    // No tools to run, save turn to history, done
    conversation.push({ role: 'assistant', content: finalSnapshot });
    return;
  }

  // Call the registered tool function directly. One-liner dispatch.
  let result, error;
  try {
    const toolFn = window.intelligence.tools[pendingTool.name];
    if (!toolFn) throw new Error(`Tool not registered: ${pendingTool.name}`);
    result = await toolFn(pendingTool.arguments);
  } catch (e) {
    error = e.message;
  }

  // Mutate the snapshot with the result so the UI shows it in the pill
  if (error) {
    pendingTool.status = 'failed';
    pendingTool.error = error;
  } else {
    pendingTool.status = 'done';
    pendingTool.result = result;
  }
  renderTurn(finalSnapshot);

  // Save this turn to conversation history
  conversation.push({ role: 'assistant', content: finalSnapshot });
  conversation.push({
    role: 'tool',
    tool_call_id: pendingTool.id,
    content: JSON.stringify(error ? { error } : result)
  });

  // Continue the conversation, model will see the tool result and respond.
  // tools auto-included from window.intelligence.tools, no need to pass.
  window.intelligence.completion({
    id: jobId + '_followup',
    model: 'qwen3-1.7b',
    messages: conversation
  });
};
Why this design
One callback to render from. onMLToken is the only thing the UI listens to during streaming. No accumulator state, no block tracking, no "is this complete or still streaming" checks.
Always valid JSON. Every snapshot is fully parseable. JS never deals with partial strings or partial JSON.
Status field on tool blocks gives the UI everything it needs. Loading state, args, result, error all in one place per block.
Tool results live inside the tool block. No separate "tool result" block type. JS mutates the block in place when the tool returns.
Failed tools are first-class. status: 'failed' with error field, UI shows a red pill, model can see the error in the next turn.
JS owns state and drives turns. Explicit, debuggable, matches OpenAI/Anthropic SDK patterns. JS can intercept, modify results, ask user permission, skip a result, or abort entirely.
Two block types, not three. Content blocks handle both prose and structured JSON output via the format field. Tool blocks are a separate type because they have a status lifecycle and call out to JS.
UI rendering
The UI just maps over the latest snapshot every render. Plain JSX:

function Turn({ snapshot }) {
  return snapshot.map(block => {
    if (block.type === 'content' && block.format === 'string') {
      return <MessageBubble text={block.content} />;
    }
    if (block.type === 'content' && block.format === 'json') {
      return <JsonViewer data={block.content} />;  // pretty-printed object
    }
    if (block.type === 'tool') {
      return <ToolPill
        name={block.name}
        status={block.status}
        args={block.arguments}
        result={block.result}
        error={block.error}
      />;
    }
  });
}
The tool pill renders differently per status:

status: 'loading'  →  ⟳ Calling get_weather...
status: 'ready'    →  ⟳ Running get_weather (city: Dubai)...
status: 'done'     →  ✓ get_weather  [▾ expand to see args + result]
status: 'failed'   →  ✗ get_weather  [▾ expand to see error]
String content blocks render as normal message bubbles. While streaming, the last content block will keep growing on each onMLToken fire, the UI just shows whatever block.content currently is, optionally with a cursor at the end. JSON content blocks appear in one shot once parsing succeeds and render however your UI wants (form view, JSON viewer, custom rendering per schema).

MCP, out of scope for this ticket but unblocked by it
Once the bridge speaks tools[], we can layer MCP servers on top in a follow-up. MCP just exposes remote tools that get translated into the same tools[] schema before being passed to the model. The bridge doesn't need to know about MCP at all, that's a JS-side concern.

3. Add structured output support (response_format)
Cactus supports constrained JSON generation via JSON Schema, same shape as OpenAI's response_format. The model is constrained at sampling time so it can only emit tokens that produce valid JSON matching the schema. This is grammar-based constrained decoding, not just prompting, the model literally cannot output invalid JSON.

API
window.intelligence.completion({
  id: 'job_extract',
  model: 'qwen3-1.7b',
  messages: [
    { role: 'system', content: 'Extract structured data from user messages.' },
    { role: 'user', content: 'John Smith, 42, lives in Dubai' }
  ],
  response_format: {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        city: { type: 'string' }
      },
      required: ['name', 'age', 'city']
    }
  }
});
How it streams
When response_format is set, the model output is a single JSON object. Native does NOT emit partial JSON snapshots while it generates, same no-partial-JSON principle as tool args. The snapshot stream stays empty (or shows a 'loading' indicator if you want to add one) until parsing succeeds, then a single content block appears with format: 'json' and the parsed object as content.

Final snapshot for a structured output completion:

[
  {
    type: 'content',
    format: 'json',
    content: { name: 'John Smith', age: 42, city: 'Dubai' }
  }
]
onMLComplete fires with this snapshot. JS gets a real parsed object, no JSON.parse needed.

Mixing structured output with tools
These are mutually exclusive in the same turn for v1. If the model needs tool calls to gather data before producing structured output, do two completion calls:

First completion with tools and no response_format, model calls tools, JS runs them and feeds results back
Second completion with response_format and no tools, model produces the structured output from gathered context
Forcing tools and structured output to coexist in one turn would complicate the constrained sampling logic. Keep them separate for now.

Native side
Pass response_format.schema to Cactus via the appropriate API for constrained generation
During streaming, do NOT emit partial JSON in snapshots
Once generation completes, parse the result and emit a single { type: 'content', format: 'json', content: <parsed> } block
If parsing fails (shouldn't happen with constrained sampling but defensive code), emit onMLError with the raw string and parse error
4. Drop stop_sequences: ['<|im_end|>']
The current code hardcodes stop_sequences: ['<|im_end|>']. I want to remove this:

Cactus applies the model's chat template automatically when you pass messages[]
The template already inserts the right end-of-turn tokens per model
<|im_end|> is ChatML-specific, works for Qwen, but Gemma uses <end_of_turn>, Llama uses <|eot_id|>, etc. So the current default is actually wrong for half our supported models
The Flutter SDK defaults to ['<|im_end|>', '<end_of_turn>'] which is also a hack
Default behavior: omit stop_sequences entirely, let the engine handle it. Keep it as an optional override in the payload for edge cases:

window.intelligence.completion({
  ...,
  stop_sequences: ['###']  // only if caller explicitly needs it
});
Summary of changes
Bridge plumbing
[ ] Native: add WKScriptMessageHandler intelligenceBridge
[ ] Native: dispatch action: 'completion' | 'listModels' | 'downloadModel' | 'removeModel' | 'cancel'
[ ] Native: keep URL scheme handler for one release (deprecated)
[ ] Native: parse messages[] to Cactus ChatMessage[]
[ ] Native: parse tools[] to Cactus FunctionDefinition[]
[ ] JS: window.intelligence.completion / listModels / downloadModel / removeModel / cancel
[ ] JS: feature-detect new bridge, fall back to URL scheme
Snapshot streaming model
[ ] Native: maintain canonical blocks array for the current turn
[ ] Native: fire onMLToken(jobId, snapshot) with the FULL current blocks array on every meaningful update
[ ] Native: fire onMLComplete(jobId, finalSnapshot) with the final blocks array when turn ends
[ ] Native: every snapshot must be valid parseable JSON, never partial
[ ] Native: two block types only: type: 'content' (with format: 'string' | 'json') and type: 'tool'
[ ] JS: re-render the latest snapshot on every onMLToken fire
Tool calling
[ ] Native: parse tool arguments to a real JS object before emitting, never raw JSON strings
[ ] Native: emit tool blocks with status: 'loading' | 'ready' (JS owns 'done' and 'failed')
[ ] JS bridge wrapper: resolve tools field polymorphically (omitted = all registered, array of strings = lookup, array of schemas = pass through, empty = disabled)
[ ] JS: tools register via single-statement Object.assign(fn, { schema: {...} }) attached to window.intelligence.tools[name]
[ ] JS: in onMLComplete, find any status: 'ready' tool blocks, call window.intelligence.tools[name](args), mutate to 'done' or 'failed', call completion() again with updated messages
Structured output
[ ] Native: accept response_format: { type: 'json_schema', schema: {...} } and pass to Cactus constrained generation
[ ] Native: do NOT emit partial JSON in snapshots while structured output is generating
[ ] Native: emit a single { type: 'content', format: 'json', content: <parsed> } block when complete
Misc
[ ] Native: drop the default stop_sequences, accept optional override
[ ] Update test page to use the new API and demonstrate: regular streaming, tool call round-trip with pill UI, structured output
Not in scope: MCP server integration, mixing tools and structured output in the same turn, partial JSON streaming for structured output.

Let me know if anything's unclear.

Thanks!
