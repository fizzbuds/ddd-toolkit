export interface ICommand<T> {
    name: string;
    payload: T;
}

export interface ICommandClass<C extends ICommand<unknown>> {
    new (payload: unknown): C;
}

export interface ICommandHandler<C extends ICommand<unknown>> {
    handle: (command: C) => Promise<void>;
}

export interface ICommandBus {
    register<C extends ICommand<unknown>>(command: ICommandClass<C>, handler: ICommandHandler<C>): void;

    send<C extends ICommand<unknown>>(command: C): Promise<void>;
}
