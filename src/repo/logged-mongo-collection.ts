import {
    AnyBulkWriteOperation,
    BulkWriteOptions,
    Collection,
    CreateIndexesOptions,
    Document,
    Filter,
    FindOptions,
    IndexSpecification,
    ObjectId,
    OptionalUnlessRequiredId,
    UpdateFilter,
    UpdateOptions,
} from 'mongodb';
import { ILogger } from './logger';

export class LoggedMongoCollection<TSchema extends Document> {
    constructor(private readonly collection: Collection<TSchema>, private readonly logger: ILogger) {
        this.collection = collection;
    }

    async createIndex(indexSpec: IndexSpecification, options: CreateIndexesOptions) {
        const res = await this.collection.createIndex(indexSpec, options);
        this.logger.debug(`createIndex ${logObject(indexSpec)} ${logObject(options)}. Created ${logObject(res)}`);
        return res;
    }

    async find(filter: Filter<TSchema>, options?: FindOptions) {
        const res = await this.collection.find(filter, options).toArray();
        this.logger.debug(`find ${logObject(filter)} ${logObject(options)}. Found ${res.length} documents`);
        return res;
    }

    async findOne(filter: Filter<TSchema>, options?: FindOptions) {
        const res = await this.collection.findOne(filter, options);
        this.logger.debug(`findOne ${logObject(filter)} ${logObject(options)}. Found ${logObject(res)}`);
        return res;
    }

    async updateOne(
        filter: Filter<TSchema>,
        update: UpdateFilter<TSchema> | Partial<TSchema>,
        options: UpdateOptions = {},
    ) {
        const res = await this.collection.updateOne(filter, update, options);
        this.logger.debug(
            `updateOne ${logObject(filter)} ${logObject(update)} ${logObject(options)}. Updated ${logObject(res)}`,
        );

        return res;
    }

    async bulkWrite(operations: AnyBulkWriteOperation<TSchema>[], options: BulkWriteOptions = {}) {
        const res = await this.collection.bulkWrite(operations, options);
        this.logger.debug(`bulkWrite ${logObject(operations)} ${logObject(options)}. BulkWrote ${logObject(res)}`);
        return res;
    }

    async insertOne(doc: OptionalUnlessRequiredId<TSchema>) {
        const res = await this.collection.insertOne(doc);
        this.logger.debug(`insertOne ${logObject(doc)}. Inserted ${logObject(res)}`);
        return res;
    }

    async aggregate<TResp>(pipeline: Document[]) {
        const res = await this.collection.aggregate(pipeline).toArray();
        this.logger.debug(`aggregate ${logObject(pipeline)}`);
        return res as any as TResp;
    }
}

const logObject = (data: any) => JSON.stringify(StrObjectParser.parse(data));

export class StrObjectParser {
    static parse(data: any): any {
        if (typeof data === 'string') return this.parseStr(data);
        else if (Array.isArray(data)) return data.map(this.parse.bind(this));
        else if (typeof data === 'object' && data !== null) return this.parseObj(data);
        else return data;
    }

    private static parseStr(data: string) {
        if (data.length > 100) {
            return data.slice(0, 100) + '...(more chars)';
        } else {
            return data;
        }
    }

    private static parseObj(data: any) {
        if (data instanceof ObjectId) {
            return data.toString() + ' (ObjectId instance)';
        }
        if (data instanceof Date) {
            return data.toISOString() + ' (Date instance)';
        }
        if (data && data.constructor.name === 'ClientSession') {
            return '(MongoSession instance)';
        }
        return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, StrObjectParser.parse(value)]));
    }
}
