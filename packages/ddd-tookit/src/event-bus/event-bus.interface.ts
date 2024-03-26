export interface IEvent<T> {
    name: string;
    payload: T;
}

export interface IEventClass<E extends IEvent<unknown>> {
    new (payload: unknown): E;
}

export interface IEventHandler<E extends IEvent<unknown>> {
    handle: (event: E) => Promise<void>;
}

export interface IEventBus {
    subscribe<E extends IEvent<unknown>>(event: IEventClass<E>, handler: IEventHandler<E>): void;

    publish<E extends IEvent<unknown>>(event: E): Promise<void>;
}
