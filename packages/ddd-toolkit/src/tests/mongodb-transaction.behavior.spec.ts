import { ClientSession, Collection, MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Executable documentation for MongoDB transaction behavior.
 *
 * These tests use the MongoDB driver directly. They do not import or test any
 * ddd-toolkit code; they only document database guarantees that toolkit code
 * may rely on.
 */
describe('MongoDB transaction behavior', () => {
    let mongodb: MongoMemoryReplSet;
    let mongoClient: MongoClient;
    let collection: Collection;

    beforeAll(async () => {
        mongodb = await MongoMemoryReplSet.create({
            replSet: {
                count: 1,
                dbName: 'test',
                storageEngine: 'wiredTiger',
            },
        });

        mongoClient = new MongoClient(mongodb.getUri());
        await mongoClient.connect();
        collection = mongoClient.db().collection('test');
    });

    afterEach(async () => {
        await collection.deleteMany({});
    });

    afterAll(async () => {
        await mongoClient.close();
        await mongodb.stop();
    });

    it('supports ordinary updates', async () => {
        await collection.insertOne({ id: 'uuid1', value: 0 });
        await collection.updateOne({ id: 'uuid1' }, { $set: { value: 1 } });

        const document = await collection.findOne({ id: 'uuid1' });

        expect(document?.value).toBe(1);
    });

    describe('concurrent access', () => {
        let session1: ClientSession;
        let session2: ClientSession;

        beforeEach(async () => {
            session1 = mongoClient.startSession();
            session2 = mongoClient.startSession();
            await collection.insertOne({ id: 'uuid1', value: 0 });
        });

        afterEach(async () => {
            for (const session of [session1, session2]) {
                if (session.inTransaction()) await session.abortTransaction();
                await session.endSession();
            }
        });

        it('does not expose uncommitted writes to another session', async () => {
            session1.startTransaction();

            const valueBeforeWrite = await collection.findOne({ id: 'uuid1' }, { session: session1 });
            await collection.updateOne({ id: 'uuid1' }, { $set: { value: 1 } }, { session: session1 });
            const valueInOtherSession = await collection.findOne({ id: 'uuid1' }, { session: session2 });

            await session1.commitTransaction();

            expect(valueBeforeWrite?.value).toBe(0);
            expect(valueInOtherSession?.value).toBe(0);
        });

        it('rejects a concurrent write to the same document', async () => {
            session1.startTransaction();
            session2.startTransaction();

            await collection.updateOne({ id: 'uuid1' }, { $set: { value: 1 } }, { session: session1 });

            await expect(
                collection.updateOne({ id: 'uuid1' }, { $set: { value: 2 } }, { session: session2 }),
            ).rejects.toMatchObject({ code: 112 });

            await session1.commitTransaction();
        });
    });
});
