import {
    ExponentialBackoff,
    IEvent,
    IEventBus,
    IEventClass,
    IEventHandler,
    ILogger,
    IRetryMechanism,
} from '@fizzbuds/ddd-toolkit';

import { ConsumeMessage } from 'amqplib';
import { inspect } from 'util';
import { RabbitConnection } from './rabbit-connection';

export class RabbitEventBus implements IEventBus {
    private connection: RabbitConnection;

    private handlers: { eventName: string; queueName: string; handler: IEventHandler<IEvent<unknown>> }[] = [];

    constructor(
        amqpUrl: string,
        private readonly exchangeName: string,
        consumerPrefetch: number = 10,
        private readonly maxAttempts: number = 3,
        private readonly exponentialBackoff: IRetryMechanism = new ExponentialBackoff(1000),
        private readonly logger: ILogger = console,
        private readonly queuePrefix: string = '',
        private readonly queueNameFormatter: (handlerName: string) => string = camelCaseToKebabCase,
        private readonly queueExpirationMs: number = 30 * 60000,
        private readonly deadLetterExchangeName: string = 'dead-letter',
        private readonly deadLetterQueueName = 'dead-letter-queue',
    ) {
        this.connection = new RabbitConnection(
            amqpUrl,
            exchangeName,
            consumerPrefetch,
            logger,
            deadLetterExchangeName,
            deadLetterQueueName,
        );
    }

    public async init(): Promise<void> {
        await this.connection.setupConnection();
    }

    public async subscribe<T extends IEvent<unknown>>(event: IEventClass<T>, handler: IEventHandler<T>): Promise<void> {
        const queueName = this.queuePrefix + this.queueNameFormatter(handler.constructor.name);
        if (this.handlers.find((h) => h.queueName === queueName))
            throw new Error(`Handler ${handler.constructor.name} already exists`);

        await this.connection.getChannel().assertQueue(queueName, {
            durable: true,
            arguments: { 'x-queue-type': 'quorum', 'x-expires': this.queueExpirationMs },
            deadLetterExchange: this.deadLetterExchangeName,
        });

        this.handlers.push({ eventName: event.name, queueName, handler });

        await this.connection.getChannel().consume(queueName, (msg) => this.onMessage(msg, queueName));
        await this.connection.getChannel().bindQueue(queueName, this.exchangeName, event.name);
        this.logger.debug(
            `Handler ${handler.constructor.name} subscribed to event ${event.name} on queue ${queueName}`,
        );
    }

    public async publish<T extends IEvent<unknown>>(event: T): Promise<void> {
        const serializedEvent = JSON.stringify(event);
        const message = Buffer.from(serializedEvent);
        this.connection.getChannel().publish(this.exchangeName, event.name, message);
        await this.connection.getChannel().waitForConfirms();
        this.logger.debug(`Event ${event.name} published. ${serializedEvent}`);
    }

    public async terminate(): Promise<void> {
        await this.connection.terminate();
    }

    private async onMessage(rawMessage: ConsumeMessage | null, queueName: string) {
        if (rawMessage === null) return;
        let parsedMessage: unknown;

        try {
            parsedMessage = JSON.parse(rawMessage.content.toString());
        } catch (e) {
            this.connection.getChannel().nack(rawMessage, false, false);
            this.logger.warn(`Message discarded due to invalid format (not json)`);
            return;
        }

        if (!this.isAValidMessage(parsedMessage)) {
            this.connection.getChannel().nack(rawMessage, false, false);
            this.logger.warn(`Message discarded due to invalid format`);
            return;
        }

        const event = parsedMessage as IEvent<unknown>;

        const handler = this.handlers.find((h) => h.eventName === event.name && h.queueName === queueName)?.handler;

        if (!handler) {
            this.connection.getChannel().nack(rawMessage, false, false);
            this.logger.warn(`Message discarded due to missing handler for ${event.name}`);
            return;
        }

        try {
            await handler.handle(event);
            this.connection.getChannel().ack(rawMessage);
            this.logger.debug(`Event ${event.name} handled by ${handler.constructor.name} successfully`);
        } catch (e) {
            this.logger.warn(`Error handling message due ${inspect(e)}`);
            const deliveryCount = rawMessage.properties.headers?.['x-delivery-count'] || 0;
            if (deliveryCount < this.maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, this.exponentialBackoff.getDelay(deliveryCount)));
                this.connection.getChannel().nack(rawMessage, false, true);
                this.logger.warn(`Message re-queued due ${inspect(e)}`);
            } else {
                this.connection.getChannel().nack(rawMessage, false, false);
                this.logger.error(`Message sent to dlq due ${inspect(e)}`);
            }
        }
    }

    private isAValidMessage(parsedMessage: any): boolean {
        return !!(parsedMessage.name && parsedMessage.payload);
    }
}

const camelCaseToKebabCase = (str: string) => str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
