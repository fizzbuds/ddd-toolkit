import { ChangeStream, ClientSession, Collection, MongoClient, ObjectId } from 'mongodb';
import { ILogger } from '../repo/logger';
import { IInit } from '../init.interface';
import { ITerminate } from '../terminate.interface';
import { v4 as uuid } from 'uuid';

export type Event = { eventPayload: any; eventRoutingKey: string };
type OutboxEntryModel = {
    _id: string;
    id: string;
    event: Event;
    scheduledAt: Date;
    status: 'scheduled' | 'processing' | 'published';
    aggregateName: string;
    publishedAt?: Date | null;
    startProcessingAt?: Date | null;
    failedAt?: Date[] | null;
};

export const DEFAULT_OUTBOX_COLLECTION_NAME = 'outbox';

export class Outbox implements IInit, ITerminate {
    private readonly collection: Collection<OutboxEntryModel>;
    private activeChangeStream: ChangeStream<OutboxEntryModel> | undefined;

    constructor(
        mongoClient: MongoClient,
        private readonly publishEventFn: (event: Event) => Promise<void>,
        private readonly aggregateName: string,
        private readonly logger: ILogger = console,
        collectionName = DEFAULT_OUTBOX_COLLECTION_NAME,
    ) {
        this.collection = mongoClient.db().collection(collectionName);
    }

    async init() {
        void this.startOutboxWatching();
    }

    async terminate() {
        await this.activeChangeStream?.close();
    }

    public async scheduleEvent(event: Event, session?: ClientSession) {
        await this.collection.insertOne(
            {
                _id: new ObjectId().toString(),
                id: uuid(),
                event,
                status: 'scheduled',
                scheduledAt: new Date(),
                aggregateName: this.aggregateName,
            },
            { session },
        );
        this.logger.debug(`Scheduled event ${JSON.stringify(event)}`);
    }

    public async scheduleEvents(events: Event[], session?: ClientSession) {
        await Promise.all(events.map((event) => this.scheduleEvent(event, session)));
    }

    public async startOutboxWatching() {
        this.logger.debug(`Starting watching`);
        if (this.activeChangeStream && !this.activeChangeStream.closed) return;
        this.activeChangeStream = this.collection.watch([
            {
                $match: {
                    'fullDocument.aggregateName': this.aggregateName,
                },
            },
        ]);
        try {
            for await (const change of this.activeChangeStream) {
                await this.publishEvent((change as any).fullDocument);
            }
        } catch (e) {
            if (this.activeChangeStream.closed) {
                this.logger.debug(`Watching closed`);
                return;
            }
            throw e;
        }

        await this.activeChangeStream.close();
    }

    public getCollection() {
        return this.collection;
    }

    private async publishEvent(outBoxModel: OutboxEntryModel) {
        const { modifiedCount } = await this.collection.updateOne(
            { _id: outBoxModel._id, status: 'scheduled' },
            { $set: { status: 'processing' } },
        );
        if (modifiedCount !== 1) return;

        try {
            await this.publishEventFn(outBoxModel.event);
            await this.collection.updateOne(
                { _id: outBoxModel._id },
                {
                    $set: {
                        status: 'published',
                        publishedAt: new Date(),
                    },
                },
            );
        } catch (e) {
            this.logger.warn(`Failed publishEventFn with ${JSON.stringify(outBoxModel.event)}`);
            //TODO add status failed and retry
        }
    }
}
