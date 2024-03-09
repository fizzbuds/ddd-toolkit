import { ILogger } from '../logger';
import { EventClass, IEvent, IEventBus, IEventHandler } from './event-bus.interface';

export class LocalEventBus implements IEventBus {
    private handlers: { [key: string]: IEventHandler<IEvent<unknown>>[] } = {};

    constructor(private logger: ILogger) {}

    public subscribe<T extends IEvent<unknown>>(handler: IEventHandler<T>, event: EventClass<T>): void {
        if (!this.handlers[event.name]) this.handlers[event.name] = [];
        this.handlers[event.name].push(handler);
    }

    public async publish<T extends IEvent<unknown>>(event: T): Promise<void> {
        const handlers = this.handlers[event.name] as IEventHandler<T>[];
        if (!handlers || !handlers.length) {
            this.logger.warn(`No handler found for ${event.name}`);
            return;
        }

        const results = await Promise.allSettled(handlers.map((handler) => handler.handle(event)));
        const rejected = results.filter((result) => result.status === 'rejected');
        if (rejected.length) {
            throw new Error(`Failed to handle event. ${rejected.length} handlers failed`);
        }
        this.logger.debug(
            `Handled ${event.constructor.name} event. ${handlers.length} handlers. ${JSON.stringify(event)}`,
        );
    }
}
