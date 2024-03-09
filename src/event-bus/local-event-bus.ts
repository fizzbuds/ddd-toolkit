import { inspect } from 'util';
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

        void this.handleEvent(event, handlers);
    }

    private async handleEvent<T extends IEvent<unknown>>(event: T, handlers: IEventHandler<T>[]) {
        const results = await Promise.allSettled(handlers.map((handler) => handler.handle(event)));
        results.forEach((result, index) => {
            const handler = handlers[index];
            if (result.status === 'fulfilled') return;
            this.logger.error(
                `${handler.constructor.name} failed to handle ${event.name} event due to ${inspect(result.reason)}`,
            );
        });
    }
}
