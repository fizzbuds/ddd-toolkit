import { inspect } from 'util';
import { ILogger } from '../logger';
import { EventClass, IEvent, IEventBus, IEventHandler } from './event-bus.interface';

export class LocalEventBus implements IEventBus {
    private handlers: { [key: string]: IEventHandler<IEvent<unknown>>[] } = {};

    constructor(
        private logger: ILogger,
        private readonly maxAttempts = 3,
    ) {}

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

    private async handleEvent<T extends IEvent<unknown>>(event: T, handlers: IEventHandler<T>[], attempt = 0) {
        const results = await Promise.allSettled(handlers.map((handler) => handler.handle(event)));
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') return;

            const handler = handlers[index];
            const handlerName = handler.constructor.name;

            if (attempt < this.maxAttempts) {
                const nextAttempt = attempt + 1;
                this.logger.warn(
                    `${handlerName} failed to handle ${event.name} event. Attempt ${nextAttempt}/${this.maxAttempts}`,
                );
                void this.handleEvent(event, [handler], nextAttempt);
                return;
            }
            this.logger.error(`${handlerName} failed to handle ${event.name} event due to ${inspect(result.reason)}`);
        });
    }
}
