import { ChannelModel, ConfirmChannel, connect } from 'amqplib';
import { ILogger } from '@fizzbuds/ddd-toolkit';
import { inspect } from 'util';

// FROM https://github.com/gpad/ms-practical-ws/blob/main/src/infra/rabbit.ts

/* istanbul ignore next */
export class RabbitConnection {
    private static RECONNECTION_TIMEOUT = 2000;

    private connection: ChannelModel;
    private channel: ConfirmChannel;

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
            await this.setupChannel();
            await this.setupExchanges();
            await this.setupDqlQueue();
            this.logger.debug(`Rabbit connection established`);
        } catch (error) {
            this.logger.error(`Error connection ${inspect(error)}`);
            throw error;
        }
    }

    public getChannel(): ConfirmChannel {
        return this.channel;
    }

    public async terminate() {
        this.logger.debug('Stopping rabbit connection');
        this.stopping = true;
        await this.channel?.close();
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

    private async setupChannel() {
        this.channel = await this.connection.createConfirmChannel();
        await this.channel.prefetch(this.prefetch);
        this.logger.debug(`Channel created with prefetch ${this.prefetch}`);

        this.channel.on('error', async (err) => {
            if (!this.stopping) return;
            this.logger.error(`Consumer channel with rabbit closed with ${inspect(err)} try to recreate`);
            await new Promise((resolve) => setTimeout(resolve, RabbitConnection.RECONNECTION_TIMEOUT));
            await this.setupChannel();
        });
    }

    private async setupExchanges() {
        if (!this.channel) throw new Error('Unable to setup exchange because channel is null');
        await this.channel.assertExchange(this.exchangeName, 'direct', {
            durable: true,
        });
        await this.channel.assertExchange(this.deadLetterExchangeName, 'topic');
        this.logger.debug(`Exchange ${this.exchangeName} asserted`);
    }

    private async setupDqlQueue() {
        if (!this.channel) throw new Error('Unable to setup dql queue because channel is null');
        await this.channel.assertQueue(this.deadLetterQueueName, {
            durable: true,
            arguments: {
                'x-queue-type': 'quorum',
            },
        });
        await this.channel.bindQueue(this.deadLetterQueueName, this.deadLetterExchangeName, '#');
        this.logger.debug(`Dlq ${this.deadLetterQueueName} asserted`);
    }
}
