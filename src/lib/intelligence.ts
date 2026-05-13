export function defineTool<
  TArgs extends Record<string, unknown>,
  TResult,
>(
  fn: (args: TArgs) => TResult | Promise<TResult>,
  schema: ToolSchema,
): Tool<TArgs, TResult> {
  return Object.assign(fn, { schema });
}
