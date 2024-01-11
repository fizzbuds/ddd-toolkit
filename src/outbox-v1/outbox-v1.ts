import { hostname as osHostName } from 'os';
import { ChangeStream, ClientSession, Collection, MongoClient, ObjectId } from 'mongodb';
import { ILogger } from '../repo/logger';
import { IInit } from '../init.interface';
import { ITerminate } from '../terminate.interface';

export type OutBoxV1Event = { eventPayload: any; eventRoutingKey: string };
type OutBoxModel = {
    _id: string;
    scheduledBy: string;
    event: OutBoxV1Event;
    scheduledAtISO: string;
    status: 'scheduled' | 'published';
    aggregateName: string;
    publishedAtISO?: string | null;
    failedAtISO?: [] | null;
};

export const DEFAULT_OUTBOX_COLLECTION_NAME = 'outbox';

export class OutboxV1 implements IInit, ITerminate {
    private readonly collection: Collection<OutBoxModel>;
    private activeChangeStream: ChangeStream<OutBoxModel> | undefined;

    constructor(
        private readonly hostname = osHostName(),
        mongoClient: MongoClient,
        private readonly publishEventFn: (event: OutBoxV1Event) => Promise<void>,
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
        await this.publishAllEventsScheduledByMe();
    }

    public async scheduleEvent(event: OutBoxV1Event, session?: ClientSession) {
        await this.collection.insertOne(
            {
                _id: new ObjectId().toString(),
                event,
                status: 'scheduled',
                scheduledBy: this.hostname,
                scheduledAtISO: new Date().toISOString(),
                aggregateName: this.aggregateName,
            },
            { session },
        );
        this.logger.debug(`Scheduled event ${JSON.stringify(event)} for host ${this.hostname}`);
    }

    public async scheduleEvents(events: OutBoxV1Event[], session?: ClientSession) {
        await Promise.all(events.map((event) => this.scheduleEvent(event, session)));
    }

    public async publishAllScheduledEvents() {
        const scheduledEvents = await this.collection
            .find({
                status: 'scheduled',
                aggregateName: this.aggregateName,
            })
            .toArray();
        this.logger.debug(`Found ${scheduledEvents.length} events scheduled by all hosts`);

        for (const scheduledEvent of scheduledEvents) await this.publishEvent(scheduledEvent);
    }

    public async publishAllEventsScheduledByMe() {
        const scheduledEvents = await this.collection
            .find({
                status: 'scheduled',
                scheduledBy: this.hostname,
                aggregateName: this.aggregateName,
            })
            .toArray();
        this.logger.debug(`Found ${scheduledEvents.length} events scheduled by ${this.hostname}`);

        for (const scheduledEvent of scheduledEvents) await this.publishEvent(scheduledEvent);
    }

    public async startOutboxWatching() {
        if (this.activeChangeStream && !this.activeChangeStream.closed) return;
        this.logger.debug(`Starting watching. Host ${this.hostname}`);
        this.activeChangeStream = this.collection.watch([
            {
                $match: {
                    'fullDocument.scheduledBy': this.hostname,
                    'fullDocument.aggregateName': this.aggregateName,
                },
            },
        ]);
        try {
            for await (const change of this.activeChangeStream) {
                await this.publishEvent((change as any).fullDocument);
            }
        } catch (e) {
            //TODO: what happens if the connection is closed?
            if (this.activeChangeStream.closed) {
                this.logger.debug(`Watching closed. Host ${this.hostname}`);
                return;
            }
            throw e;
        }

        await this.activeChangeStream.close();
    }

    public getCollection() {
        return this.collection;
    }

    private async publishEvent(outBoxModel: any) {
        try {
            await this.publishEventFn(outBoxModel.event);
            await this.collection.updateOne(
                { _id: outBoxModel._id },
                {
                    $set: {
                        status: 'published',
                        publishedAtISO: new Date().toISOString(),
                    },
                },
            );
        } catch (e) {
            this.logger.warn(`Failed publishEventFn with ${JSON.stringify(outBoxModel.event)}`);
            await this.collection.updateOne(
                { _id: outBoxModel._id },
                {
                    $addToSet: {
                        failedAtISO: new Date().toISOString(),
                    },
                },
            );
        }
    }
}
