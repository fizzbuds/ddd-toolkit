import { ClientSession, Collection, MongoClient } from 'mongodb';
import { IEvent, ILogger } from '@fizzbuds/ddd-toolkit';

export interface IBusPersistence {
    init(): Promise<void>;

    terminate(): Promise<void>;

    persistEvent(event: IEvent<unknown>, status: 'pending' | 'published', session?: unknown): Promise<void>;

    getEventStatus(event: IEvent<unknown>): Promise<'pending' | 'published' | null>;

    getPendingEvents(): Promise<IEvent<unknown>[]>;
}

export class MongoBusPersistence implements IBusPersistence {
    private readonly collection: Collection<{
        event: IEvent<unknown>;
        status: 'pending' | 'published';
    }>;

    constructor(
        protected readonly mongoClient: MongoClient,
        private readonly logger: ILogger,
    ) {
        this.collection = this.mongoClient.db().collection('bus_persistence');
    }

    async init(): Promise<void> {}

    async persistEvent(
        event: IEvent<unknown>,
        status: 'pending' | 'published',
        session?: ClientSession,
    ): Promise<void> {
        await this.collection.updateOne({ event }, { $set: { status } }, { upsert: true, session });
    }

    async getEventStatus(event: IEvent<unknown>): Promise<'pending' | 'published' | null> {
        const doc = await this.collection.findOne({ event });
        return doc?.status ?? null;
    }

    async terminate(): Promise<void> {}

    async getPendingEvents(): Promise<IEvent<unknown>[]> {
        const docs = await this.collection.find({ status: 'pending' }).toArray();
        return docs.map((doc) => doc.event);
    }
}
