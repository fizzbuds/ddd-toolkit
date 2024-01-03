import { OutboxPattern } from '../../outbox-pattern';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

describe('Outbox Pattern integration', () => {
    let mongodb: MongoMemoryReplSet;
    let mongoClient: MongoClient;
    let outbox: OutboxPattern;

    const sendCallbackMock = jest.fn();

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
        outbox = new OutboxPattern('test', mongoClient, sendCallbackMock);
    });

    beforeEach(async () => {
        await outbox.getCollection().deleteMany({});
        jest.resetAllMocks();
    });

    afterAll(async () => {
        await mongoClient.close();
        await mongodb.stop();
    });

    const eventRoutingKey = 'eventRoutingKey';
    const eventPayload = { foo: 'bar' };

    describe('When schedule an event', () => {
        beforeEach(async () => {
            await outbox.scheduleEvent(eventRoutingKey, eventPayload);
        });

        it('should be saved as scheduled', async () => {
            expect(await outbox.getCollection().count({ status: 'scheduled' })).toBe(1);
            expect(await outbox.getCollection().findOne({ status: 'scheduled' })).toMatchObject({
                producerHostname: 'test',
            });
        });
    });

    describe('Given some scheduled events', () => {
        const scheduledEventsCount = 3;

        beforeEach(async () => {
            await runNTimes(() => outbox.scheduleEvent(eventRoutingKey, eventPayload), scheduledEventsCount);
        });

        describe('Given a resolving send callback', () => {
            beforeEach(() => sendCallbackMock.mockResolvedValue(null));

            describe('When sending all scheduled events', () => {
                beforeEach(async () => await outbox.sentAllScheduledEvents());

                it('should send all scheduled events', async () => {
                    expect(sendCallbackMock).toBeCalledWith(eventRoutingKey, eventPayload);
                    expect(sendCallbackMock).toBeCalledTimes(scheduledEventsCount);
                });

                it('should mark all scheduled events as sent', async () => {
                    expect(await outbox.getCollection().count({ status: { $ne: 'sent' } })).toBe(0);
                });
            });
        });

        describe('Given a partial-resolving send callback', () => {
            beforeEach(() => {
                sendCallbackMock.mockResolvedValueOnce(null).mockRejectedValueOnce(null).mockResolvedValueOnce(null);
            });

            describe('When sending all scheduled events', () => {
                beforeEach(async () => await outbox.sentAllScheduledEvents());

                it('should mark only a few events as sent ', async () => {
                    expect(await outbox.getCollection().count({ status: { $ne: 'sent' } })).toBe(1);
                });
            });
        });
    });

    describe('Given an active polling', () => {
        beforeEach(async () => {
            void outbox.startMyScheduledEventsPolling();
        });

        describe('When an event is scheduled', () => {
            it('should send the scheduled event', async () => {
                await outbox.scheduleEvent(eventRoutingKey, eventPayload);
                await sleep(1); // Needed to wait for the change stream to be triggered
                expect(sendCallbackMock).toBeCalledWith(eventRoutingKey, eventPayload);
            });
        });
    });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runNTimes = async (asyncFn: () => Promise<void>, n: number) => {
    for (const _ of Array.from({ length: n })) {
        await asyncFn();
    }
};
