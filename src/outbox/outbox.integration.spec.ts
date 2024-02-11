import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { DEFAULT_OUTBOX_COLLECTION_NAME, Outbox } from './outbox';
import { eventually } from '../utils';

describe('Outbox integration', () => {
    let mongodb: MongoMemoryReplSet;
    let mongoClient: MongoClient;

    const publishEventFnMock = jest.fn();

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
    });

    afterAll(async () => {
        await mongoClient.close();
        await mongodb.stop();
    });

    beforeEach(async () => {
        jest.resetAllMocks();
    });

    afterEach(async () => {
        await mongoClient.db().collection(DEFAULT_OUTBOX_COLLECTION_NAME).deleteMany({});
    });

    const eventFixture = { id: '1', payload: 'foo-payload', routingKey: 'foo-rk' };

    let outbox: Outbox;

    beforeEach(async () => {
        outbox = new Outbox(mongoClient, publishEventFnMock, 'foo-aggregate');
    });

    describe('schedule events', () => {
        beforeEach(async () => {
            await outbox.scheduleEvents([eventFixture]);
        });

        it('should schedule events', async () => {
            const events = await outbox.getCollection().find().toArray();
            expect(events).toHaveLength(1);
            expect(events[0].event).toEqual(eventFixture);
            expect(events[0].status).toEqual('scheduled');
        });
    });

    describe('publish events', () => {
        beforeEach(async () => {
            await outbox.scheduleEvents([eventFixture]);
            await outbox.publishEvents([eventFixture.id]);
        });

        it('should publish events', async () => {
            const events = await outbox.getCollection().find().toArray();
            expect(events).toHaveLength(1);
            expect(events[0].status).toEqual('published');
            expect(publishEventFnMock).toHaveBeenCalledWith([eventFixture]);
        });
    });

    describe('monitoring', () => {
        beforeEach(async () => {
            await outbox.startMonitoring();
            await outbox.scheduleEvents([eventFixture]);
        });

        it('should monitor scheduled events', async () => {
            await eventually(() => expect(publishEventFnMock).toHaveBeenCalledWith([eventFixture]));
        });
    });
});
