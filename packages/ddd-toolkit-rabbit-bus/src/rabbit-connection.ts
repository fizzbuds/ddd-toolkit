import { Channel, ConfirmChannel, connect, Connection } from 'amqplib';
import { ILogger } from '@fizzbuds/ddd-toolkit';
import { inspect } from 'util';

// FROM https://github.com/gpad/ms-practical-ws/blob/main/src/infra/rabbit.ts

/* istanbul ignore next */
export class RabbitConnection {
    private static RECONNECTION_TIMEOUT = 2000;

    private connection: Connection;
    private consumerChannel: Channel;
    private producerChannel: ConfirmChannel;

    private waiting = false;
    private stopping = false;

    constructor(
        private readonly amqpUri: string,
        private readonly exchangeName: string,
        private readonly prefetch: number,
        private readonly logger: ILogger = console,
        private readonly deadLetterExchangeName: string,
        private readonly deadLetterQueueName: string,
    ) {}

    public async setupConnection(): Promise<void> {
        try {
            this.logger.debug('Starting Rabbit connection');
            this.stopping = false;
            this.connection = await connect(this.amqpUri);
            this.connection.on('error', async (err) => {
                if (this.stopping) return;
                this.logger.error(`Connection with rabbit closed with ${inspect(err)} try to reconnect`);
                this.scheduleReconnection();
            });
            this.connection.on('close', async (reason) => {
                if (this.stopping) return;
                this.logger.debug(`Connection with rabbit closed with ${inspect(reason)} try to reconnect`);
                this.scheduleReconnection();
            });
            await this.setupConsumerChannel();
            await this.setupProducerChannel();
            await this.setupExchanges();
            await this.setupDqlQueue();
            this.logger.debug('Rabbit connection established');
        } catch (error) {
            this.logger.error(`Error connection ${inspect(error)}`);
            throw error;
        }
    }

    public getConsumerChannel(): Channel {
        return this.consumerChannel;
    }

    public getProducerChannel(): ConfirmChannel {
        return this.producerChannel;
    }

    public async terminate() {
        this.logger.debug('Stopping rabbit connection');
        this.stopping = true;
        await this.producerChannel?.close();
        await this.consumerChannel?.close();
        await this.connection?.close();
        this.logger.debug('Rabbit connection stopped');
    }

    private scheduleReconnection() {
        if (this.waiting) {
            this.logger.warn('Reconnection already scheduled');
            return;
        }
        this.waiting = true;
        setTimeout(async () => {
            this.waiting = false;
            try {
                await this.setupConnection();
            } catch (error) {
                this.logger.error(`Unable to connect with rabbit, schedule a new connection`);
                this.scheduleReconnection();
            }
        }, RabbitConnection.RECONNECTION_TIMEOUT);
    }

    private async setupConsumerChannel() {
        this.consumerChannel = await this.connection.createConfirmChannel();
        await this.consumerChannel.prefetch(this.prefetch);

        this.consumerChannel.on('error', async (err) => {
            if (!this.stopping) return;
            this.logger.error(`Consumer channel with rabbit closed with ${inspect(err)} try to recreate`);
            await new Promise((resolve) => setTimeout(resolve, RabbitConnection.RECONNECTION_TIMEOUT));
            await this.setupConsumerChannel();
        });
    }

    private async setupProducerChannel() {
        this.producerChannel = await this.connection.createConfirmChannel();
        this.producerChannel.on('error', async (err) => {
            this.logger.error(`Producer channel with rabbit closed with ${inspect(err)} try to recreate`);
            await new Promise((resolve) => setTimeout(resolve, RabbitConnection.RECONNECTION_TIMEOUT));
            await this.setupProducerChannel();
        });
    }

    private async setupExchanges() {
        if (!this.producerChannel) throw new Error('Unable to setup exchange because channel is null');
        await this.producerChannel.assertExchange(this.exchangeName, 'direct', {
            durable: true,
        });
        await this.producerChannel.assertExchange(this.deadLetterExchangeName, 'topic');
    }

    private async setupDqlQueue() {
        if (!this.consumerChannel) throw new Error('Unable to setup dql queue because channel is null');
        await this.consumerChannel.assertQueue(this.deadLetterQueueName, {
            durable: true,
            arguments: {
                'x-queue-type': 'quorum',
            },
        });
        await this.consumerChannel.bindQueue(this.deadLetterQueueName, this.deadLetterExchangeName, '#');
    }
}
