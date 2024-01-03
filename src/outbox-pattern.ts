import { hostname as osHostName } from 'os';
import { Collection, MongoClient, ObjectId } from 'mongodb';
import { ILogger } from './repo/logger';

type OutBoxModel = {
    producerHostname: string;
    eventRoutingKey: string;
    eventPayload: any;
    scheduledAt: Date;
    status: 'scheduled' | 'sent';
    _id: string;
};

export class OutboxPattern {
    private readonly collection: Collection<OutBoxModel>;

    constructor(
        private readonly hostname = osHostName(),
        mongoClient: MongoClient,
        private readonly sendCallback: (eventRoutingKey: string, eventPayload: any) => Promise<void>,
        private readonly logger: ILogger = console,
    ) {
        this.collection = mongoClient.db().collection('outbox');
    }

    public async scheduleEvent(eventRoutingKey: string, eventPayload: any) {
        await this.collection.insertOne({
            _id: new ObjectId().toString(),
            eventPayload,
            eventRoutingKey,
            status: 'scheduled',
            producerHostname: this.hostname,
            scheduledAt: new Date(),
        });
        this.logger.debug(
            `Scheduled event ${eventRoutingKey} with payload ${JSON.stringify(eventPayload)} for host ${this.hostname}`,
        );
    }

    public async sentAllScheduledEvents() {
        this.logger.debug(`Sending all scheduled events for every hostname`);
        const scheduledEvents = await this.collection.find({ status: 'scheduled' }).toArray();
        this.logger.debug(`Found ${scheduledEvents.length} scheduled events for every hostname`);

        for (const scheduledEvent of scheduledEvents) {
            await this.sendAndMarkAsSent(scheduledEvent);
        }

        this.logger.debug(`Sent all scheduled events for every hostname`);
    }

    public async startMyScheduledEventsPolling() {
        this.logger.debug(`Starting polling for scheduled events for host ${this.hostname}`);
        const changeStream = this.collection.watch([{ $match: { 'fullDocument.producerHostname': this.hostname } }]);
        for await (const change of changeStream) {
            await this.sendAndMarkAsSent((change as any).fullDocument as OutBoxModel);
        }
    }

    public getCollection() {
        return this.collection;
    }

    private async sendAndMarkAsSent(scheduledEvent: OutBoxModel) {
        try {
            await this.sendCallback(scheduledEvent.eventRoutingKey, scheduledEvent.eventPayload);
            await this.collection.updateOne({ _id: scheduledEvent._id }, { $set: { status: 'sent' } });
        } catch (e) {
            this.logger.warn(
                `Failed to send event ${scheduledEvent.eventRoutingKey} with payload ${JSON.stringify(
                    scheduledEvent.eventPayload,
                )} for host ${this.hostname}`,
            );
        }
    }
}
