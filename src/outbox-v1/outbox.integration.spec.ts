import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { DEFAULT_OUTBOX_COLLECTION_NAME, OutboxV1 } from './outbox-v1';

describe('Outbox v1 integration', () => {
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
        let outbox: OutboxV1;

        beforeEach(() => {
            outbox = new OutboxV1('test', mongoClient, publishEventFnMock, aggregateName);
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
                await sleep(5); // Needed to wait for the change stream to be triggered
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
                    await sleep(5); // Needed to wait for the change stream to be triggered
                    expect(publishEventFnMock).not.toBeCalled();
                });
            });
        });

        describe('When schedule an event', () => {
            beforeEach(async () => {
                await outbox.scheduleEvent(event);
            });

            it('should be save event as scheduled', async () => {
                expect(await outbox.getCollection().findOne({ status: 'scheduled' })).toMatchObject({
                    scheduledBy: 'test',
                });
            });
        });

        describe('Given some scheduled events', () => {
            const scheduledEventsCount = 3;

            beforeEach(async () => {
                await runNTimes(() => outbox.scheduleEvent(event), scheduledEventsCount);
            });

            describe('Given a resolving publish function', () => {
                beforeEach(() => publishEventFnMock.mockResolvedValue(null));

                describe('When publish all scheduled events', () => {
                    beforeEach(async () => await outbox.publishAllScheduledEvents());

                    it('should publish all scheduled events', async () => {
                        expect(publishEventFnMock).toBeCalledWith(event);
                        expect(publishEventFnMock).toBeCalledTimes(scheduledEventsCount);
                    });

                    it('should mark all scheduled events as sent', async () => {
                        expect(await outbox.getCollection().countDocuments({ status: { $ne: 'published' } })).toBe(0);
                    });

                    it('should add executedAt to all scheduled events', async () => {
                        expect(await outbox.getCollection().countDocuments({ publishedAtISO: null })).toBe(0);
                    });
                });
            });

            describe('Given a partial resolving execute function', () => {
                beforeEach(() => {
                    publishEventFnMock
                        .mockResolvedValueOnce(null)
                        .mockRejectedValueOnce(null)
                        .mockResolvedValueOnce(null);
                });

                describe('When publish all scheduled events', () => {
                    beforeEach(async () => await outbox.publishAllScheduledEvents());

                    it('should mark only a few events as published', async () => {
                        expect(await outbox.getCollection().countDocuments({ status: 'published' })).toBe(2);
                    });

                    it('should set failedAtISO on some events', async () => {
                        expect(await outbox.getCollection().countDocuments({ failedAtISO: { $ne: null } })).toBe(1);
                    });
                });
            });
        });

        describe('Given an active outbox watching', () => {
            beforeEach(async () => {
                void outbox.startOutboxWatching();
            });

            describe('When an event is scheduled', () => {
                it('should publish the scheduled event', async () => {
                    await outbox.scheduleEvent(event);
                    await sleep(1); // Needed to wait for the change stream to be triggered
                    expect(publishEventFnMock).toBeCalledWith(event);
                });
            });
        });
    });

    describe('Given multiple hosts', () => {
        let outbox1: OutboxV1;
        let outbox2: OutboxV1;

        beforeEach(() => {
            outbox1 = new OutboxV1('test-1', mongoClient, publishEventFnMock, aggregateName);
            outbox2 = new OutboxV1('test-2', mongoClient, publishEventFnMock, aggregateName);
        });

        describe('Given some scheduled events', () => {
            const scheduledEventsCount = 3;

            beforeEach(async () => {
                await runNTimes(() => outbox1.scheduleEvent(event), scheduledEventsCount);
                await runNTimes(() => outbox2.scheduleEvent(event), scheduledEventsCount);
            });

            describe('When execute all scheduled events', () => {
                beforeEach(async () => {
                    await outbox1.publishAllScheduledEvents();
                });

                it('should execute all events', async () => {
                    expect(await outbox1.getCollection().countDocuments({ status: { $ne: 'published' } })).toBe(0);
                });
            });

            describe('When execute all events scheduled by me', () => {
                beforeEach(async () => {
                    await outbox1.publishAllEventsScheduledByMe();
                });

                it('should execute only some jobs', async () => {
                    expect(await outbox1.getCollection().countDocuments({ status: { $ne: 'published' } })).toBe(3);
                });
            });
        });
    });

    describe('Given multiple outbox instances', () => {
        const publishEventFnMock2 = jest.fn();
        const publishEventFnMock1 = jest.fn();

        let outbox1: OutboxV1;
        let outbox2: OutboxV1;

        beforeEach(() => {
            outbox1 = new OutboxV1('same-hostname', mongoClient, publishEventFnMock1, 'aggregate-1');
            outbox2 = new OutboxV1('same-hostname', mongoClient, publishEventFnMock2, 'aggregate-2');
        });

        describe('Given some scheduled events for each outbox', () => {
            beforeEach(async () => {
                await outbox1.scheduleEvent(event);
                await outbox2.scheduleEvent(event);
            });

            describe('When publish all scheduled events', () => {
                it('should publish only events related to the current outbox', async () => {
                    await outbox1.publishAllScheduledEvents();
                    expect(publishEventFnMock1).toBeCalledTimes(1);
                });
            });

            describe('When publish all scheduled events scheduled by me', () => {
                it('should publish only events related to the current outbox', async () => {
                    await outbox1.publishAllEventsScheduledByMe();
                    expect(publishEventFnMock1).toBeCalledTimes(1);
                });
            });
        });

        describe('Given an active outbox watching', () => {
            beforeEach(async () => {
                void outbox1.startOutboxWatching();
                void outbox2.startOutboxWatching();
            });

            describe('When an event is scheduled', () => {
                it('should publish only events related to the current outbox', async () => {
                    await outbox1.scheduleEvent(event);
                    await outbox2.scheduleEvent(event);
                    await sleep(10); // Needed to wait for the change stream to be triggered
                    expect(publishEventFnMock1).toBeCalledTimes(1);
                    expect(publishEventFnMock2).toBeCalledTimes(1);
                });
            });
        });
    });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runNTimes = async (asyncFn: () => Promise<void>, n: number) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of Array.from({ length: n })) {
        await asyncFn();
    }
};
