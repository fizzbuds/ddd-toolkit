import { Collection, CreateIndexesOptions, Document, IndexSpecification, MongoClient } from 'mongodb';
import { isEmpty } from 'lodash';

interface Logger {
    log: (message: string) => void;
    error: (message: string) => void;
}

export abstract class MongoQueryRepo<RM extends Document> {
    protected readonly collection: Collection<RM>;
    protected abstract readonly indexes: { indexSpec: IndexSpecification; options: CreateIndexesOptions }[];

    protected constructor(
        mongoClient: MongoClient,
        private readonly collectionName: string,
        private readonly logger: Logger = console,
    ) {
        // TODO wrap collection with a proxy to log all queries
        this.collection = mongoClient.db().collection(this.collectionName);
    }

    async onModuleInit() {
        this.logger.log(`Creating index for id field.`);
        await this.collection.createIndex({ id: 1 }, { unique: true });
        if (!isEmpty(this.indexes)) {
            for (const { indexSpec, options } of this.indexes) {
                this.logger.log(`Creating index for ${JSON.stringify(indexSpec)} field.`);
                await this.collection.createIndex(indexSpec, options);
            }
        }
    }
}
