import { ClientSession, Collection, MongoClient, ObjectId } from 'mongodb';
import { IEvent } from '../event-bus/event-bus.interface';
import { ILogger } from '../logger';
import { inspect } from 'util';
import { difference, intersection } from 'lodash';
import { IOutbox } from './outbox.interface';

type OutboxEventModel = {
    event: IEvent<unknown>;
    scheduledAt: Date;
    status: 'scheduled' | 'published';
    publishedAt?: Date;
    contextName?: string;
};

export class MongoOutbox implements IOutbox {
    private outboxCollection: Collection<OutboxEventModel>;

    private stopping = false;

    constructor(
        private readonly mongoClient: MongoClient,
        collectionName: string = 'outbox',
        private readonly publishEventsFn: (events: IEvent<unknown>[]) => Promise<void> | void,
        private readonly logger: ILogger = console,
        private readonly contextName?: string,
        private readonly monitoringIntervalMs = 500,
    ) {
        this.outboxCollection = mongoClient.db().collection(collectionName);
    }

    public async init() {
        void this.checkScheduledEvents([]);
    }

    public async dispose() {
        this.stopping = true;
        await sleep(this.monitoringIntervalMs);
    }

    public async scheduleEvents(events: IEvent<unknown>[], clientSession: ClientSession): Promise<string[]> {
        const { insertedIds } = await this.outboxCollection.insertMany(
            events.map((event) => ({
                event,
                scheduledAt: new Date(),
                status: 'scheduled',
                contextName: this.contextName,
            })),
            { session: clientSession },
        );
        return Object.values(insertedIds).map((id) => id.toString());
    }

    public async publishEvents(eventIds: string[]): Promise<void> {
        const session = this.mongoClient.startSession();
        try {
            await session.withTransaction(async () => {
                const outboxModels = await this.outboxCollection
                    .find({ _id: { $in: eventIds.map((id) => new ObjectId(id)) }, status: 'scheduled' }, { session })
                    .toArray();
                const events = outboxModels.map((model) => model.event);
                await this.publishEventsFn(events);
                const publishedIds = outboxModels.map((model) => model._id);
                await this.outboxCollection.updateMany(
                    {
                        _id: { $in: publishedIds },
                        status: 'scheduled',
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
            this.logger.warn(`Failed to publish events ${eventIds.join(', ')}. ${inspect(e)}`);
        } finally {
            await session.endSession();
        }
    }

    //FROM https://github.com/gpad/ms-practical-ws/blob/main/src/infra/outbox_pattern.ts
    private async checkScheduledEvents(warningIds: string[]) {
        try {
            if (this.stopping) return;
            await sleep(this.monitoringIntervalMs);
            const currentIds = await this.retrieveScheduledEvents();
            const toPublish = intersection(currentIds, warningIds);
            if (toPublish.length) {
                this.logger.warn(`Events ${toPublish.join(', ')} are still scheduled.`);
                await this.publishEvents(toPublish);
            }
            const nextWarning = difference(currentIds, toPublish);
            void this.checkScheduledEvents(nextWarning);
        } catch (e) {
            this.logger.error(`Failed to check scheduled events. ${inspect(e)}`);
        }
    }

    private async retrieveScheduledEvents() {
        const scheduledEvents = await this.outboxCollection
            .find({
                status: 'scheduled',
                contextName: this.contextName,
            })
            .toArray();
        return scheduledEvents.map((event) => event._id.toString());
    }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
