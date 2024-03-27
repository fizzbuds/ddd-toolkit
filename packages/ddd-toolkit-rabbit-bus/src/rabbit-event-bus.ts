import {
    ExponentialBackoff,
    IEvent,
    IEventBus,
    IEventClass,
    IEventHandler,
    ILogger,
    IRetryMechanism,
} from '../../ddd-toolkit';

import { Channel, ConfirmChannel, connect, Connection, ConsumeMessage } from 'amqplib';
import { inspect } from 'util';

export class RabbitEventBus implements IEventBus {
    private amqpConnection: Connection;
    private consumerChannel: Channel;
    private producerChannel: ConfirmChannel;

    private handlers: { eventName: string; queueName: string; handler: IEventHandler<IEvent<unknown>> }[] = [];

    constructor(
        private readonly amqpUrl: string,
        private readonly exchangeName: string,
        private readonly consumerPrefetch: number = 10,
        private readonly maxAttempts: number = 3,
        private readonly exponentialBackoff: IRetryMechanism = new ExponentialBackoff(1000),
        private readonly logger: ILogger,
        private readonly queuePrefix: string = '',
        private readonly queueNameFormatter: (handlerName: string) => string = camelCaseToKebabCase,
        private readonly queueExpirationMs: number = 30 * 60000,
    ) {}

    public async init(): Promise<void> {
        this.amqpConnection = await connect(this.amqpUrl);
        this.consumerChannel = await this.amqpConnection.createChannel();
        this.producerChannel = await this.amqpConnection.createConfirmChannel();

        await this.consumerChannel.assertExchange(this.exchangeName, 'direct', { durable: true });
        await this.consumerChannel.prefetch(this.consumerPrefetch);
    }

    public async subscribe<T extends IEvent<unknown>>(event: IEventClass<T>, handler: IEventHandler<T>): Promise<void> {
        const queueName = this.queuePrefix + this.queueNameFormatter(handler.constructor.name);
        if (this.handlers.find((h) => h.queueName === queueName))
            throw new Error(`Handler ${handler.constructor.name} already exists`);

        await this.consumerChannel.assertQueue(queueName, {
            durable: true,
            arguments: { 'x-queue-type': 'quorum', 'x-expires': this.queueExpirationMs },
        });

        this.handlers.push({ eventName: event.name, queueName, handler });

        await this.consumerChannel.consume(queueName, (msg) => this.onMessage(msg, queueName));
        await this.consumerChannel.bindQueue(queueName, this.exchangeName, event.name);
    }

    public async publish<T extends IEvent<unknown>>(event: T): Promise<void> {
        const serializedEvent = JSON.stringify(event);
        const message = Buffer.from(serializedEvent);
        this.producerChannel.publish(this.exchangeName, event.name, message);
        await this.producerChannel.waitForConfirms();
    }

    public async terminate(): Promise<void> {
        await this.consumerChannel.close();
        await this.producerChannel.close();
        await this.amqpConnection.close();
    }

    private async onMessage(rawMessage: ConsumeMessage | null, queueName: string) {
        if (rawMessage === null) return;
        const parsedMessage = JSON.parse(rawMessage.content.toString());

        if (!this.isAValidMessage(parsedMessage)) {
            this.consumerChannel.nack(rawMessage, false, false);
            this.logger.warn(`Message discarded due to invalid format`);
            return;
        }

        const handler = this.handlers.find((h) => h.eventName === parsedMessage.name && h.queueName === queueName)
            ?.handler;

        if (!handler) {
            this.consumerChannel.nack(rawMessage, false, false);
            this.logger.warn(`Message discarded due to missing handler for ${parsedMessage.name}`);
            return;
        }

        try {
            await handler.handle(parsedMessage);
            this.consumerChannel.ack(rawMessage);
        } catch (e) {
            this.logger.warn(`Error handling message due ${inspect(e)}`);
            const deliveryCount = rawMessage.properties.headers?.['x-delivery-count'] || 0;
            if (deliveryCount < this.maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, this.exponentialBackoff.getDelay(deliveryCount)));
                this.consumerChannel.nack(rawMessage, false, true);
                this.logger.warn(`Message re-queued due ${inspect(e)}`);
            } else {
                this.consumerChannel.nack(rawMessage, false, false);
                this.logger.error(`Message sent to dlq due ${inspect(e)}`);
            }
        }
    }

    private isAValidMessage(parsedMessage: any): boolean {
        return !!(parsedMessage.name && parsedMessage.payload);
    }
}

const camelCaseToKebabCase = (str: string) => str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
