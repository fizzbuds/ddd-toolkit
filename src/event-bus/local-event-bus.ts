import { inspect } from 'util';
import { ILogger } from '../logger';
import { IEvent, IEventBus, IEventClass, IEventHandler } from './event-bus.interface';
import { ExponentialBackoff, IRetryMechanism } from './exponential-backoff';

export class LocalEventBus implements IEventBus {
    private readonly retryMechanism: IRetryMechanism;

    private handlers: { [key: string]: IEventHandler<IEvent<unknown>>[] } = {};

    constructor(
        private logger: ILogger,
        private readonly retryMaxAttempts = 5,
        retryInitialDelay = 100,
    ) {
        this.retryMechanism = new ExponentialBackoff(retryInitialDelay);
    }

    public subscribe<T extends IEvent<unknown>>(event: IEventClass<T>, handler: IEventHandler<T>): void {
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

            if (attempt < this.retryMaxAttempts) {
                const nextAttempt = attempt + 1;
                const delay = this.retryMechanism.getDelay(nextAttempt);
                this.logger.warn(
                    `${handlerName} failed to handle ${event.name} event. Attempt ${nextAttempt}/${this.retryMaxAttempts}. Delaying for ${delay}ms.`,
                );
                setTimeout(() => this.handleEvent(event, [handler], nextAttempt), delay);
                return;
            }
            this.logger.error(`${handlerName} failed to handle ${event.name} event due to ${inspect(result.reason)}`);
        });
    }
}
