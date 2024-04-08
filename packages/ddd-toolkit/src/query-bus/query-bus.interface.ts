export interface IQuery<TPayload, TResult = void> {
    name: string;
    payload: TPayload;
    _resultType: TResult;
}

export interface IQueryClass<Q extends IQuery<unknown, unknown>> {
    new (payload: unknown): Q;
}

export interface IQueryHandler<Q extends IQuery<unknown, unknown>> {
    handle: (query: Q) => Promise<void>;
}

export interface IQueryBus {
    register<Q extends IQuery<unknown, unknown>>(query: IQueryClass<Q>, handler: IQueryHandler<Q>): void;

    execute<Q extends IQuery<unknown, unknown>>(query: Q): Promise<Q['_resultType']>;
}
