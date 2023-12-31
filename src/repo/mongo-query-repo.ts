import { CreateIndexesOptions, Document, IndexSpecification, MongoClient } from 'mongodb';
import { isEmpty } from 'lodash';
import { LoggedMongoCollection } from './logged-mongo-collection';
import { ILogger } from './logger';

export abstract class MongoQueryRepo<RM extends Document> {
    protected readonly collection: LoggedMongoCollection<RM>;
    protected abstract readonly indexes: { indexSpec: IndexSpecification; options?: CreateIndexesOptions }[];

    protected constructor(
        mongoClient: MongoClient,
        private readonly collectionName: string,
        private readonly logger: ILogger = console,
    ) {
        this.collection = new LoggedMongoCollection(mongoClient.db().collection(this.collectionName), this.logger);
    }

    async onModuleInit() {
        await this.collection.createIndex({ id: 1 }, { unique: true });
        if (!isEmpty(this.indexes)) {
            for (const { indexSpec, options } of this.indexes) {
                await this.collection.createIndex(indexSpec, options || {});
            }
        }
    }
}
