export interface IContextManager<TContext> {
    wrapWithContext<T>(operation: (context: TContext) => Promise<T>): Promise<T>;
}
