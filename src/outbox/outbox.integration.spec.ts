import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { DEFAULT_OUTBOX_COLLECTION_NAME, Outbox } from './outbox';

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

    beforeEach(async () => {
        jest.resetAllMocks();
    });

    afterEach(async () => {
        await mongoClient.db().collection(DEFAULT_OUTBOX_COLLECTION_NAME).deleteMany({});
    });

    afterAll(async () => {
        await mongoClient.close();
        await mongodb.stop();
    });

    const aggregateName = ' foo-aggregate';
    const event = { eventPayload: 'foo-payload', eventRoutingKey: 'foo-rk' };

    describe('Given a ready outbox', () => {
        let outbox: Outbox;

        beforeEach(() => {
            outbox = new Outbox(mongoClient, publishEventFnMock, aggregateName);
        });

        afterEach(async () => {
            await outbox.terminate();
        });

        describe('When init', () => {
            beforeEach(async () => {
                await outbox.init();
            });

            it('should start the outbox watching', async () => {
                await outbox.scheduleEvent(event);
                await sleep(500); // Needed to wait for the change stream to be triggered
                expect(publishEventFnMock).toBeCalled();
            });
        });

        describe('Given an active outbox watching', () => {
            beforeEach(async () => {
                await outbox.init();
            });

            describe('When terminate', () => {
                beforeEach(async () => {
                    await outbox.terminate();
                });

                it('should stop the outbox watching', async () => {
                    await outbox.scheduleEvent(event);
                    await sleep(500); // Needed to wait for the change stream to be triggered
                    expect(publishEventFnMock).not.toBeCalled();
                });
            });
        });

        describe('When schedule an event', () => {
            beforeEach(async () => {
                await outbox.scheduleEvent(event);
            });

            it('should be save event as scheduled', async () => {
                expect(await outbox.getCollection().find({ status: 'scheduled' }).toArray()).toHaveLength(1);
            });
        });

        describe('Given an active outbox watching', () => {
            beforeEach(async () => {
                void outbox.startOutboxWatching();
            });

            describe('When an event is scheduled', () => {
                it('should publish the scheduled event', async () => {
                    await outbox.scheduleEvent(event);
                    await sleep(500); // Needed to wait for the change stream to be triggered
                    expect(publishEventFnMock).toBeCalledWith(event);
                });
            });
        });
    });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
