import { Collection, CreateIndexesOptions, Document, IndexSpecification, MongoClient } from 'mongodb';
import { isEmpty } from 'lodash';
import { ILogger } from './logger';
import { IInit } from '../init.interface';

export abstract class MongoQueryRepo<RM extends Document> implements IInit {
    protected readonly collection: Collection<RM>;
    protected abstract readonly indexes: { indexSpec: IndexSpecification; options?: CreateIndexesOptions }[];

    protected constructor(
        protected readonly mongoClient: MongoClient,
        protected readonly collectionName: string,
        collection?: Collection<RM>,
        protected readonly logger: ILogger = console,
    ) {
        if (!collection) {
            this.collection = mongoClient.db().collection(this.collectionName);
        }
    }

    async init() {
        if (!isEmpty(this.indexes)) {
            for (const { indexSpec, options } of this.indexes) {
                await this.collection.createIndex(indexSpec, options || {});
            }
        }
    }
}
