import { IRepoHooks } from './repo-hooks';
import { ClientSession, Collection, Document, MongoClient, WithId } from 'mongodb';
import { ISerializer } from './serializer.interface';
import { merge } from 'lodash';
import { AggregateNotFoundError, DuplicatedIdError, OptimisticLockError, RepoHookError } from '../errors';
import { ILogger } from '../logger';
import { IInit } from '../init.interface';
import { IEvent } from '../event-bus/event-bus.interface';
import { IOutbox } from '../outbox/outbox.interface';

export interface IAggregateRepo<A> {
    // TODO add id as a generic type
    getById: (id: string) => Promise<WithVersion<A> | null>;
    getByIdOrThrow: (id: string) => Promise<WithVersion<A>>;
    save: (aggregate: A) => Promise<void>;
}

export interface IAggregateRepoWithOutbox<A> extends IAggregateRepo<A> {
    saveAndPublish: (aggregate: A, eventsToBePublished?: IEvent<unknown>[]) => Promise<void>;
}

export type DocumentWithId = { id: string } & Document;

export type WithVersion<T> = T & { __version: number };

type WithOptionalVersion<T> = T & { __version?: number };

// TODO probably we should create a dedicated interface whit like DocumentWithIdAndTimestamps
const MONGODB_UNIQUE_INDEX_CONSTRAINT_ERROR = 11000;

export class MongoAggregateRepo<A, AM extends DocumentWithId>
    implements IAggregateRepo<A>, IAggregateRepoWithOutbox<A>, IInit
{
    protected readonly collection: Collection<AM>;

    constructor(
        protected readonly serializer: ISerializer<A, AM>,
        protected readonly mongoClient: MongoClient,
        protected readonly collectionName: string,
        collection?: Collection<AM>,
        protected readonly repoHooks?: IRepoHooks<AM>,
        protected readonly logger: ILogger = console,
        protected readonly outbox?: IOutbox,
    ) {
        if (!collection) {
            this.collection = this.mongoClient.db().collection(this.collectionName);
        }
    }

    async init() {
        await this.collection.createIndex({ id: 1 }, { unique: true });
    }

    async save(aggregate: WithOptionalVersion<A>) {
        const aggregateModel = this.serializer.aggregateToModel(aggregate);
        const aggregateVersion = aggregate.__version || 0;
        const session = this.mongoClient.startSession();
        try {
            await session.withTransaction(async () => {
                await this.upsertWriteModel(aggregateModel, aggregateVersion, session);
                await this.handleRepoHooks(aggregateModel, session);
            });
        } catch (e) {
            this.catchSaveTransaction(e, aggregateVersion, aggregateModel);
        } finally {
            await session.endSession();
        }
    }

    public async saveAndPublish(aggregate: WithOptionalVersion<A>, eventsToBePublished: IEvent<unknown>[] = []) {
        const aggregateModel = this.serializer.aggregateToModel(aggregate);
        const aggregateVersion = aggregate.__version || 0;

        const session = this.mongoClient.startSession();

        const scheduledEventIds: string[] = [];
        try {
            await session.withTransaction(async () => {
                await this.upsertWriteModel(aggregateModel, aggregateVersion, session);
                await this.handleRepoHooks(aggregateModel, session);
                await this.handleOutbox(eventsToBePublished, session);
            });
        } catch (e) {
            this.catchSaveTransaction(e, aggregateVersion, aggregateModel);
        } finally {
            await session.endSession();
        }

        if (this.outbox && scheduledEventIds.length) void this.outbox.publishEvents(scheduledEventIds);
    }

    async getById(id: string): Promise<WithVersion<A> | null> {
        const aggregateModel = await this.collection.findOne({ id: id } as any);
        this.logger.debug(`Retrieving aggregate ${id}. Found: ${JSON.stringify(aggregateModel)}`);
        if (!aggregateModel) return null;

        return this.modelToAggregateWithVersion(aggregateModel);
    }

    private modelToAggregateWithVersion(aggregateModel: WithId<AM>): WithVersion<A> {
        const aggregate = this.serializer.modelToAggregate(aggregateModel as AM);
        return merge<A, { __version: number }>(aggregate, { __version: aggregateModel.__version });
    }

    async getByIdOrThrow(id: string): Promise<WithVersion<A>> {
        const aggregate = await this.getById(id);
        if (!aggregate) throw new AggregateNotFoundError(`Aggregate ${id} not found.`);
        return aggregate;
    }

    private async handleOutbox(eventsToBePublished: IEvent<unknown>[], session: ClientSession) {
        if (!this.outbox) throw new Error('Outbox not configured');
        return await this.outbox.scheduleEvents(eventsToBePublished, session);
    }

    private catchSaveTransaction(e: any, aggregateVersion: number, aggregateModel: AM) {
        // FIXME verify the field name because constraints could be added on other fields
        if (e.code === MONGODB_UNIQUE_INDEX_CONSTRAINT_ERROR) {
            if (this.isTheFirstVersion(aggregateVersion)) {
                throw new DuplicatedIdError(
                    `Cannot save aggregate with id: ${aggregateModel.id} due to duplicated id.`,
                );
            } else {
                throw new OptimisticLockError(
                    `Cannot save aggregate with id: ${aggregateModel.id} due to optimistic locking.`,
                );
            }
        }
        throw e;
    }

    private async handleRepoHooks(aggregateModel: AM, session: ClientSession) {
        try {
            if (this.repoHooks) {
                await this.repoHooks.onSave(aggregateModel, session);
                this.logger.debug(`RepoHook onSave method executed successfully.`);
            }
        } catch (e) {
            throw new RepoHookError(`RepoHook onSave method failed with error: ${e.message}`);
        }
    }

    private async upsertWriteModel(aggregateModel: AM, aggregateVersion: number, session: ClientSession) {
        await this.collection.updateOne(
            { id: aggregateModel.id, __version: aggregateVersion } as any,
            {
                $set: {
                    ...aggregateModel,
                    __version: aggregateVersion + 1,
                    updatedAt: new Date(),
                },
                $setOnInsert: { createdAt: new Date() } as any,
            },
            { upsert: true, session, ignoreUndefined: true },
        );
        this.logger.debug(
            `Aggregate with id ${
                aggregateModel.id
            } and version ${aggregateVersion} saved successfully. ${JSON.stringify(aggregateModel)}`,
        );
    }

    private isTheFirstVersion(aggregateVersion: number) {
        return aggregateVersion === 0;
    }
}
