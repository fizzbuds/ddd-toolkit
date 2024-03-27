import {
    ExponentialBackoff,
    IEvent,
    IEventBus,
    IEventClass,
    IEventHandler,
    ILogger,
    IRetryMechanism,
} from '@fizzbuds/ddd-toolkit/src';
import { Channel, ConfirmChannel, connect, Connection, ConsumeMessage } from 'amqplib';
import { inspect } from 'util';

export class RabbitEventBus implements IEventBus {
    private connection: Connection;
    private consumerChannel: Channel;
    private producerChannel: ConfirmChannel;

    private handlers: { [key: string]: IEventHandler<IEvent<unknown>> } = {};

    constructor(
        private readonly amqpUrl: string,
        private readonly exchangeName: string,
        private readonly queueName: string,
        private readonly consumerPrefetch: number = 10,
        private readonly maxAttempts: number = 3,
        private readonly exponentialBackoff: IRetryMechanism = new ExponentialBackoff(1000),
        private readonly logger: ILogger,
    ) {}

    public async init(): Promise<void> {
        this.connection = await connect(this.amqpUrl);
        this.consumerChannel = await this.connection.createChannel();
        this.producerChannel = await this.connection.createConfirmChannel();

        await this.consumerChannel.assertExchange(this.exchangeName, 'topic', { durable: true });
        await this.consumerChannel.assertQueue(this.queueName, { arguments: { 'x-queue-type': 'quorum' } });
        await this.consumerChannel.prefetch(this.consumerPrefetch);

        await this.consumerChannel.consume(this.queueName, this.onMessage.bind(this));
    }

    public async subscribe<T extends IEvent<unknown>>(event: IEventClass<T>, handler: IEventHandler<T>): Promise<void> {
        if (this.handlers[event.name]) throw new Error(`Handler for event ${event.name} already exists`);
        await this.consumerChannel.bindQueue(this.queueName, this.exchangeName, event.name);

        this.handlers[event.name] = handler;
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
        await this.connection.close();
    }

    private async onMessage(rawMessage: ConsumeMessage | null) {
        if (rawMessage === null) return;
        const parsedMessage = JSON.parse(rawMessage.content.toString());

        if (!this.isAValidMessage(parsedMessage)) {
            this.consumerChannel.nack(rawMessage, false, false);
            this.logger.warn(`Message discarded due to invalid format`);
            return;
        }

        const handler = this.handlers[parsedMessage.name];
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
