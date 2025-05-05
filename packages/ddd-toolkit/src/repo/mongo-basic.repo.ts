import { ClientSession, Collection, Document, MongoClient, ObjectId } from 'mongodb';

interface ILogger {
    log: (message: string, ...optionalParams: any[]) => void;
    debug: (message: string, ...optionalParams: any[]) => void;
    warn: (message: string, ...optionalParams: any[]) => void;
    error: (message: string, ...optionalParams: any[]) => void;
}

export type WithOptionalVersion<T> = T & { __version?: number };
export type WithVersion<T> = T & { __version: number };
export type DocumentWithId = { id: string } & Document;

export type MongoDocument<T> = T & {
    _id: ObjectId;
    createdAt: Date;
    updatedAt: Date;
};

export abstract class MongoBasicRepo<M extends DocumentWithId> {
    protected readonly collection: Collection<M>;
    protected readonly MONGODB_UNIQUE_INDEX_CONSTRAINT_ERROR = 11000;

    constructor(
        protected readonly mongoClient: MongoClient,
        protected readonly collectionName: string,
        collection?: Collection<M>,
        protected readonly logger: ILogger = console,
    ) {
        if (!collection) {
            this.collection = mongoClient.db().collection(this.collectionName);
        }
    }

    async init() {
        await this.collection.createIndex({ id: 1 }, { unique: true });
    }

    async save(document: WithOptionalVersion<M>) {
        const documentVersion = document.__version || 0;
        const session = this.mongoClient.startSession();
        try {
            await session.withTransaction(async () => {
                await this.upsertWriteModel(document, documentVersion, session);
            });
        } catch (e) {
            this.catchSaveTransaction(e, documentVersion, document);
        } finally {
            await session.endSession();
        }
    }

    protected async upsertWriteModel(model: M, modelVersion: number, session: ClientSession) {
        await this.collection.updateOne(
            { id: model.id, __version: modelVersion } as any,
            {
                $set: {
                    ...(model as M),
                    __version: modelVersion + 1,
                    createdAt: undefined, // TODO make sure createdAt is not set again
                    updatedAt: new Date(),
                },
                $setOnInsert: { createdAt: new Date() } as any,
            },
            { upsert: true, session, ignoreUndefined: true },
        );
        this.logger.debug(
            `Document with id ${model.id} and version ${modelVersion} saved successfully. ${JSON.stringify(model)}`,
        );
    }

    protected catchSaveTransaction(e: any, documentVersion: number, document: M) {
        // FIXME verify the field name because constraints could be added on other fields
        if (e.code === this.MONGODB_UNIQUE_INDEX_CONSTRAINT_ERROR) {
            if (isTheFirstVersion(documentVersion)) {
                throw new Error(`Cannot save document with id: ${document.id} due to duplicated id.`);
            } else {
                throw new Error(`Cannot save document with id: ${document.id} due to optimistic locking.`);
            }
        }
        throw e;

        function isTheFirstVersion(documentVersion: number) {
            return documentVersion === 0;
        }
    }

    public async getById(id: string): Promise<MongoDocument<WithVersion<M>> | null> {
        const document = await this.collection.findOne<MongoDocument<WithVersion<M>>>({ id: id } as any);
        this.logger.debug(`Retrieving document with id ${id}. Found: ${JSON.stringify(document)}`);
        if (!document) return null;

        return document;
    }

    public async getByIdOrThrow(id: string): Promise<WithVersion<M>> {
        const document = await this.getById(id);
        if (!document) throw new Error(`Document ${id} not found.`);
        return document;
    }
}
