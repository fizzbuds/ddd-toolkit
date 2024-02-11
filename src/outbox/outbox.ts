import { ClientSession, Collection, MongoClient, ObjectId } from 'mongodb';
import { ILogger } from '../repo/logger';
import { inspect } from 'util';
import { difference, intersection, sleep } from '../utils';

export type Event = { id: string; payload: any; routingKey: string };

type OutboxEntryModel = {
    _id: string;
    id: string;
    event: Event;
    scheduledAt: Date;
    status: 'scheduled' | 'published';
    aggregateName: string;
    publishedAt?: Date | null;
    startProcessingAt?: Date | null;
    failedAt?: Date[] | null;
};

export const DEFAULT_OUTBOX_COLLECTION_NAME = 'outbox';

export class Outbox {
    private readonly collection: Collection<OutboxEntryModel>;

    constructor(
        private readonly mongoClient: MongoClient,
        private readonly publishEventsFn: (events: Event[]) => Promise<void>,
        private readonly aggregateName: string,
        private readonly logger: ILogger = console,
        collectionName = DEFAULT_OUTBOX_COLLECTION_NAME,
    ) {
        this.collection = mongoClient.db().collection(collectionName);
    }

    public async startMonitoring() {
        void this.checkScheduledEvents([]);
    }

    public async publishEvents(ids: string[]) {
        const session = this.mongoClient.startSession();
        try {
            await session.withTransaction(async () => {
                const outboxModels = await this.collection.find({ id: { $in: ids } }).toArray();
                await this.publishEventsFn(outboxModels.map((model) => model.event));
                await this.collection.updateMany(
                    {
                        id: { $in: ids },
                        aggregateName: this.aggregateName,
                    },
                    {
                        $set: {
                            status: 'published',
                            publishedAt: new Date(),
                        },
                    },
                    { session },
                );
            });
        } catch (e) {
            this.logger.warn(`Failed to publish events ${ids.join(', ')}. ${inspect(e)}`);
        } finally {
            await session.endSession();
        }
    }

    public getCollection() {
        return this.collection;
    }

    public async scheduleEvents(events: Event[], session?: ClientSession) {
        await this.collection.insertMany(
            events.map((event) => ({
                id: event.id,
                event,
                status: 'scheduled',
                scheduledAt: new Date(),
                aggregateName: this.aggregateName,
                _id: new ObjectId().toString(),
            })),
            { session },
        );

        this.logger.debug(`Scheduled ${events.length} events: ${events.map((event) => event.id).join(', ')}`);
        return events.map((event) => event.id);
    }

    private async checkScheduledEvents(warningIds: string[]) {
        await sleep(500);
        const currentIds = await this.retrieveScheduledEvents();
        const toPublish = intersection(currentIds, warningIds);
        if (toPublish.length) {
            this.logger.warn(`Events ${toPublish.join(', ')} are still scheduled.`);
            await this.publishEvents(toPublish);
        }
        const nextWarning = difference(currentIds, toPublish);
        void this.checkScheduledEvents(nextWarning);
    }

    private async retrieveScheduledEvents() {
        const scheduledEvents = await this.collection
            .find({
                status: 'scheduled',
                aggregateName: this.aggregateName,
            })
            .toArray();
        return scheduledEvents.map((event) => event.id);
    }
}
