export interface IContextManager<TContext> {
    wrapWithContext<T>(operation: (context: TContext) => Promise<T>, context?: TContext): Promise<T>;
}
