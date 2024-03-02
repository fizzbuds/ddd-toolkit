import { IRepoHooks } from './repo-hooks';
import { Collection, Document, MongoClient } from 'mongodb';
import { ISerializer } from './serializer.interface';
import { merge } from 'lodash';
import { DuplicatedIdError, OptimisticLockError, RepoHookError } from '../errors';
import { ILogger } from '../logger';
import { IInit } from '../init.interface';

export interface IAggregateRepo<A> {
    // TODO add id as a generic type
    getById: (id: string) => Promise<WithVersion<A> | null>;
    save: (aggregate: A) => Promise<void>;
}

export type DocumentWithId = { id: string } & Document;

export type WithVersion<T> = T & { __version: number };

type WithOptionalVersion<T> = T & { __version?: number };

// TODO probably we should create a dedicated interface whit like DocumentWithIdAndTimestamps
const MONGODB_UNIQUE_INDEX_CONSTRAINT_ERROR = 11000;

export class MongoAggregateRepo<A, AM extends DocumentWithId> implements IAggregateRepo<A>, IInit {
    protected readonly collection: Collection<AM>;
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

                try {
                    if (this.repoHooks) {
                        await this.repoHooks.onSave(aggregateModel, session);
                        this.logger.debug(`RepoHook onSave method executed successfully.`);
                    }
                } catch (e) {
                    throw new RepoHookError(`RepoHook onSave method failed with error: ${e.message}`);
                }
            });
        } catch (e) {
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
        } finally {
            await session.endSession();
        }
    }

    // TODO evaluate to implement getOrThrow
    async getById(id: string): Promise<WithVersion<A> | null> {
        const aggregateModel = await this.collection.findOne({ id: id } as any);
        this.logger.debug(`Retrieving aggregate ${id}. Found: ${JSON.stringify(aggregateModel)}`);
        if (!aggregateModel) return null;
        const aggregate = this.serializer.modelToAggregate(aggregateModel as AM);
        return merge<A, { __version: number }>(aggregate, { __version: aggregateModel.__version });
    }

    private isTheFirstVersion(aggregateVersion: number) {
        return aggregateVersion === 0;
    }
}
