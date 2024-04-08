export interface ICommand<TPayload, TResponse = void> {
    name: string;
    payload: TPayload;
    _returnType: TResponse;
}

export interface ICommandClass<C extends ICommand<unknown, unknown>> {
    new (payload: unknown): C;
}

export interface ICommandHandler<C extends ICommand<unknown, unknown>> {
    handle: (command: C) => Promise<C['_returnType']>;
}

export interface ICommandBus {
    register<C extends ICommand<unknown, unknown>>(command: ICommandClass<C>, handler: ICommandHandler<C>): void;

    send<C extends ICommand<unknown, unknown>>(command: C): Promise<void>;

    sendSync<C extends ICommand<unknown, unknown>>(command: C): Promise<C['_returnType']>;
}
