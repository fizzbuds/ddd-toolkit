import { IRepoHooks } from './repo-hooks';
import { ClientSession, Collection, MongoClient, WithId } from 'mongodb';
import { ISerializer } from './serializer.interface';
import { merge } from 'lodash';
import { AggregateNotFoundError, DuplicatedIdError, OptimisticLockError, RepoHookError } from '../errors';
import { ILogger } from '../logger';
import { IInit } from '../init.interface';
import { DocumentWithId, IRepo, WithOptionalVersion, WithVersion } from './repo.interface';

// TODO probably we should create a dedicated interface whit like DocumentWithIdAndTimestamps

export class MongoAggregateRepo<A, AM extends DocumentWithId> implements IRepo<A>, IInit {
    protected readonly collection: Collection<AM>;
    protected readonly MONGODB_UNIQUE_INDEX_CONSTRAINT_ERROR = 11000;

    constructor(
        protected readonly serializer: ISerializer<A, AM>,
        protected readonly mongoClient: MongoClient,
        protected readonly collectionName: string,
        collection?: Collection<AM>,
        protected readonly repoHooks?: IRepoHooks<AM>,
        protected readonly logger: ILogger = console,
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

    protected async upsertWriteModel(aggregateModel: AM, aggregateVersion: number, session: ClientSession) {
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
        // FIXME in this point we don't know whether the aggregate will be successfully saved or not
        this.logger.debug(
            `Aggregate with id ${
                aggregateModel.id
            } and version ${aggregateVersion} saved successfully. ${JSON.stringify(aggregateModel)}`,
        );
    }

    protected async handleRepoHooks(aggregateModel: AM, session: ClientSession) {
        try {
            if (this.repoHooks) {
                await this.repoHooks.onSave(aggregateModel, session);
                this.logger.debug(`RepoHook onSave method executed successfully.`);
            }
        } catch (e) {
            throw new RepoHookError(`RepoHook onSave method failed with error: ${e.message}`);
        }
    }

    protected catchSaveTransaction(e: any, aggregateVersion: number, aggregateModel: AM) {
        // FIXME verify the field name because constraints could be added on other fields
        if (e.code === this.MONGODB_UNIQUE_INDEX_CONSTRAINT_ERROR) {
            if (isTheFirstVersion(aggregateVersion)) {
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

        function isTheFirstVersion(aggregateVersion: number) {
            return aggregateVersion === 0;
        }
    }

    public async getById(id: string): Promise<WithVersion<A> | null> {
        const aggregateModel = await this.collection.findOne({ id: id } as any);
        this.logger.debug(`Retrieving aggregate ${id}. Found: ${JSON.stringify(aggregateModel)}`);
        if (!aggregateModel) return null;

        return this.modelToAggregateWithVersion(aggregateModel);
    }

    private modelToAggregateWithVersion(aggregateModel: WithId<AM>): WithVersion<A> {
        const aggregate = this.serializer.modelToAggregate(aggregateModel as AM);
        return merge<A, { __version: number }>(aggregate, { __version: aggregateModel.__version });
    }

    public async getByIdOrThrow(id: string): Promise<WithVersion<A>> {
        const aggregate = await this.getById(id);
        if (!aggregate) throw new AggregateNotFoundError(`Aggregate ${id} not found.`);
        return aggregate;
    }
}
