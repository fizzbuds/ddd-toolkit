import { difference, intersection } from 'lodash';
import { ClientSession, Collection, MongoClient, ObjectId } from 'mongodb';
import { inspect } from 'util';
import { IEvent } from '../event-bus';
import { IInit } from '../init.interface';
import { ILogger } from '../logger';
import { ITerminate } from '../terminate.interface';
import { IOutbox } from './outbox.interface';

type OutboxEventModel = {
    event: IEvent<unknown>;
    scheduledAt: Date;
    status: 'scheduled' | 'processing' | 'published';
    publishedAt?: Date;
    contextName?: string;
};

export class MongoOutbox implements IOutbox, IInit, ITerminate {
    private collection: Collection<OutboxEventModel>;

    private stopping = false;

    constructor(
        private readonly mongoClient: MongoClient,
        collectionName: string = 'outbox',
        private readonly publishEventsFn: (events: IEvent<unknown>[]) => Promise<void> | void,
        private readonly logger: ILogger = console,
        private readonly contextName?: string,
        private readonly monitoringIntervalMs = 500,
    ) {
        this.collection = mongoClient.db().collection(collectionName);
    }

    public async init() {
        this.logger.debug(`Starting outbox monitoring with interval ${this.monitoringIntervalMs}ms`);
        this.checkScheduledEvents([]).catch(this.onCheckFailure);
    }

    public async terminate() {
        this.stopping = true;
        await sleep(this.monitoringIntervalMs);
    }

    public async scheduleEvents(events: IEvent<unknown>[], clientSession: ClientSession): Promise<string[]> {
        if (!events.length) return [];
        const { insertedIds } = await this.collection.insertMany(
            events.map((event) => ({
                event: event,
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
        await Promise.all(scheduledEventsIds.map((eventId) => this.publishEventWithConcurrencyControl(eventId)));
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
            this.checkScheduledEvents(nextWarning).catch(this.onCheckFailure);
        } catch (e) {
            this.logger.error(`Failed to check scheduled events. ${inspect(e)}`);
            this.checkScheduledEvents([]).catch(this.onCheckFailure);
        }
    }

    private async retrieveScheduledEvents() {
        const scheduledEventsIds = await this.collection
            .find({
                status: 'scheduled',
                contextName: this.contextName,
            })
            .project({ _id: 1 })
            .map((model) => model._id.toString())
            .toArray();
        return scheduledEventsIds;
    }

    private async publishEventWithConcurrencyControl(eventId: string) {
        const session = this.mongoClient.startSession();
        try {
            await session.withTransaction(async (client) => {
                const { modifiedCount } = await this.collection.updateOne(
                    { _id: new ObjectId(eventId), status: 'scheduled' },
                    { $set: { status: 'processing' } },
                    { session: client },
                );
                if (modifiedCount !== 1) {
                    this.logger.debug(`Event ${eventId} is already being processed.`);
                    return;
                }
                this.logger.debug(`Event ${eventId} is being processed.`);

                const outBoxModel = await this.collection.findOne({ _id: new ObjectId(eventId) }, { session: client });
                if (!outBoxModel) return;

                await this.publishEventsFn([outBoxModel.event]);
                await this.collection.updateOne(
                    { _id: new ObjectId(eventId) },
                    {
                        $set: {
                            status: 'published',
                            publishedAt: new Date(),
                        },
                    },
                    { session: client },
                );
            });
        } catch (e) {
            this.logger.warn(`Failed to publish event ${eventId}. ${inspect(e)}`);
        } finally {
            await session.endSession();
        }
    }

    // avoid un-handled rejected promises, causing Node.js process restart
    private onCheckFailure(e: any) {
        this.logger.warn('Could not check scheduled events', e);
    }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
