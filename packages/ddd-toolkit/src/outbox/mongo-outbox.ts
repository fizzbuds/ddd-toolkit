import { ClientSession, Collection, MongoClient, ObjectId } from 'mongodb';
import { IEvent } from '../event-bus/event-bus.interface';
import { ILogger } from '../logger';
import { inspect } from 'util';
import { difference, intersection } from 'lodash';
import { IOutbox } from './outbox.interface';
import { IInit } from '../init.interface';
import { ITerminate } from '../terminate.interface';

type OutboxEventModel = {
    event: IEvent<unknown>;
    scheduledAt: Date;
    status: 'scheduled' | 'processing' | 'published';
    publishedAt?: Date;
    contextName?: string;
};

export class MongoOutbox implements IOutbox, IInit, ITerminate {
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
        this.logger.debug(`Starting outbox monitoring with interval ${this.monitoringIntervalMs}ms`);
        void this.checkScheduledEvents([]);
    }

    public async terminate() {
        this.stopping = true;
        await sleep(this.monitoringIntervalMs);
    }

    public async scheduleEvents(events: IEvent<unknown>[], clientSession: ClientSession): Promise<string[]> {
        if (!events.length) return [];
        const { insertedIds } = await this.outboxCollection.insertMany(
            events.map((event) => ({
                event,
                scheduledAt: new Date(),
                status: 'scheduled',
                contextName: this.contextName,
            })),
            { session: clientSession },
        );
        this.logger.debug(`Scheduled events ${Object.values(insertedIds).join(', ')}`);
        return Object.values(insertedIds).map((id) => id.toString());
    }

    public async publishEvents(scheduledEventsIds: string[]): Promise<void> {
        const session = this.mongoClient.startSession();
        try {
            await session.withTransaction(async () => {
                const outboxModels = await this.outboxCollection
                    .find(
                        {
                            _id: { $in: scheduledEventsIds.map((id) => new ObjectId(id)) },
                            status: 'scheduled',
                        },
                        { session },
                    )
                    .toArray();
                if (!outboxModels.length) return;
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
                this.logger.debug(`Published events ${publishedIds.join(', ')}`);
            });
        } catch (e) {
            this.logger.warn(`Failed to publish events ${scheduledEventsIds.join(', ')}. ${inspect(e)}`);
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
                await Promise.all(toPublish.map((eventId) => this.publishEventWithConcurrencyControl(eventId)));
            }
            const nextWarning = difference(currentIds, toPublish);
            void this.checkScheduledEvents(nextWarning);
        } catch (e) {
            this.logger.error(`Failed to check scheduled events. ${inspect(e)}`);
            void this.checkScheduledEvents([]);
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

    private async publishEventWithConcurrencyControl(eventId: string) {
        const session = this.mongoClient.startSession();
        try {
            await session.withTransaction(async () => {
                const { modifiedCount } = await this.outboxCollection.updateOne(
                    { _id: new ObjectId(eventId), status: 'scheduled' },
                    { $set: { status: 'processing' } },
                    { session },
                );
                if (modifiedCount !== 1) {
                    this.logger.debug(`Event ${eventId} is already being processed.`);
                    return;
                }
                this.logger.debug(`Event ${eventId} is being processed.`);

                const outBoxModel = await this.outboxCollection.findOne({ _id: new ObjectId(eventId) }, { session });
                if (!outBoxModel) return;

                await this.publishEventsFn([outBoxModel.event]);
                await this.outboxCollection.updateOne(
                    { _id: new ObjectId(eventId) },
                    {
                        $set: {
                            status: 'published',
                            publishedAt: new Date(),
                        },
                    },
                    { session },
                );
            });
        } finally {
            await session.endSession();
        }
    }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
