export interface ICommand<TPayload, TResponse = void> {
    name: string;
    payload: TPayload;
    _returnType: TResponse;
}

export interface ICommandClass<C extends ICommand<unknown, unknown>> {
    new (payload: unknown): C;
}

export interface ICommandHandler<C extends ICommand<unknown, unknown>, TContext = void> {
    handle: (command: C, context?: TContext) => Promise<C['_returnType']>;
}

export interface ICommandBus<TContext> {
    register<C extends ICommand<unknown, unknown>>(
        command: ICommandClass<C>,
        handler: ICommandHandler<C, TContext>,
    ): void;

    send<C extends ICommand<unknown, unknown>>(command: C): Promise<void>;
}
