export type IEvent<T> = {
    name: string;
    payload: T;
};

export interface IEventHandler<E extends IEvent<unknown>> {
    handle: (event: E) => Promise<void>;
}

export interface IEventBus {
    subscribe<E extends IEvent<unknown>>(handler: IEventHandler<E>, event: E): void;
    publish<E extends IEvent<unknown>>(event: E): Promise<void>;
}
