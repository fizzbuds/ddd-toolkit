import { ISerializer } from './serializer.interface';
import { Collection, MongoClient } from 'mongodb';
import { IOutbox } from '../outbox/outbox.interface';
import { IRepoHooks } from './repo-hooks';
import { ILogger } from '../logger';
import { IEvent } from '../event-bus/event-bus.interface';
import { MongoAggregateRepo } from './mongo-aggregate-repo';
import { DocumentWithId, IRepo, WithOptionalVersion } from './repo.interface';

export interface IAggregateRepoWithOutbox<A> extends IRepo<A> {
    saveAndPublish: (aggregate: A, eventsToBePublished?: IEvent<unknown>[]) => Promise<void>;
}

export class MongoAggregateRepoWithOutbox<A, AM extends DocumentWithId>
    extends MongoAggregateRepo<A, AM>
    implements IAggregateRepoWithOutbox<A>
{
    constructor(
        serializer: ISerializer<A, AM>,
        mongoClient: MongoClient,
        collectionName: string,
        private readonly outbox: IOutbox,
        collection?: Collection<AM>,
        repoHooks?: IRepoHooks<AM>,
        logger?: ILogger,
    ) {
        super(serializer, mongoClient, collectionName, undefined, repoHooks, logger);
    }

    public async saveAndPublish(aggregate: WithOptionalVersion<A>, eventsToPublish: IEvent<unknown>[] = []) {
        const aggregateModel = this.serializer.aggregateToModel(aggregate);
        const aggregateVersion = aggregate.__version || 0;

        const session = this.mongoClient.startSession();

        let scheduledEventIds: string[] = [];
        try {
            await session.withTransaction(async () => {
                await this.upsertWriteModel(aggregateModel, aggregateVersion, session);
                await this.handleRepoHooks(aggregateModel, session);
                scheduledEventIds = await this.outbox.scheduleEvents(eventsToPublish, session);
            });
        } catch (e) {
            this.catchSaveTransaction(e, aggregateVersion, aggregateModel);
        } finally {
            await session.endSession();
        }

        void this.outbox.publishEvents(scheduledEventIds);
    }
}
