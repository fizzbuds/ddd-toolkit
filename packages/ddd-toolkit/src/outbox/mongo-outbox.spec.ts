import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoOutbox } from './mongo-outbox';
import { Event } from '../event-bus/event';
import { waitFor } from '../utils';

class FooEvent extends Event<{ foo: string }> {
    constructor(public readonly payload: { foo: string }) {
        super(payload);
    }
}

class BarEvent extends Event<{ foo: string }> {
    constructor(public readonly payload: { foo: string }) {
        super(payload);
    }
}

describe('Mongo outbox', () => {
    let mongodb: MongoMemoryReplSet;
    let mongoClient: MongoClient;

    let outbox: MongoOutbox;

    const PublishEventsFnMock = jest.fn();

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
        outbox = new MongoOutbox(mongoClient, 'outbox', async (events) => PublishEventsFnMock(events));
    });

    afterAll(async () => {
        await outbox.terminate();
        await mongoClient.close();
        await mongodb.stop();
    });

    afterEach(async () => {
        jest.resetAllMocks();
        await outbox['outboxCollection'].deleteMany({});
    });

    describe('When scheduleEvents with two events', () => {
        it('should return two objectIds', async () => {
            const events = [new FooEvent({ foo: 'bar' }), new BarEvent({ foo: 'bar' })];
            const session = mongoClient.startSession();
            const ids = await outbox.scheduleEvents(events, session);
            expect(ids.length).toBe(2);
            expect(ids.every(ObjectId.isValid)).toBe(true);
        });

        beforeEach(async () => {
            const events = [new FooEvent({ foo: 'bar' }), new BarEvent({ foo: 'bar' })];
            const session = mongoClient.startSession();
            await outbox.scheduleEvents(events, session);
        });

        it('should insert two events in the outbox', async () => {
            const events = await outbox['outboxCollection'].find().toArray();
            expect(events.length).toBe(2);
            expect(events[0]).toMatchObject({
                _id: expect.any(ObjectId),
                contextName: null,
                event: expect.any(Object),
                scheduledAt: expect.any(Date),
                status: 'scheduled',
            });
        });
    });

    describe('Given two scheduled events', () => {
        const events = [new FooEvent({ foo: 'bar' }), new BarEvent({ foo: 'bar' })];
        let eventIds: string[];
        beforeEach(async () => {
            const session = mongoClient.startSession();
            eventIds = await outbox.scheduleEvents(events, session);
        });

        describe('Given a resolving publishEventsFn', () => {
            beforeEach(() => {
                PublishEventsFnMock.mockResolvedValue('ok');
            });

            describe('When publish', () => {
                it('should call publishEventsFn once', async () => {
                    await outbox.publishEvents(eventIds);
                    expect(PublishEventsFnMock).toBeCalled();
                });

                it('should pass both events to publishEventsFn', async () => {
                    await outbox.publishEvents(eventIds);
                    expect(PublishEventsFnMock).toBeCalledWith(events);
                });

                it('should update the status of the events to published', async () => {
                    await outbox.publishEvents(eventIds);
                    const events = await outbox['outboxCollection'].find().toArray();
                    expect(events.every((event) => event.status === 'published')).toBe(true);
                });

                it('should set the publishedAt date', async () => {
                    await outbox.publishEvents(eventIds);
                    const events = await outbox['outboxCollection'].find().toArray();
                    expect(events[0].publishedAt).toEqual(expect.any(Date));
                });
            });
        });

        describe('Given a rejecting publishEventsFn', () => {
            beforeEach(() => {
                PublishEventsFnMock.mockRejectedValue('error');
            });

            describe('When publish', () => {
                it('should call publishEventsFn once', async () => {
                    await outbox.publishEvents(eventIds);
                    expect(PublishEventsFnMock).toBeCalled();
                });

                it('should not update the status of the events to published', async () => {
                    await outbox.publishEvents(eventIds);
                    const events = await outbox['outboxCollection'].find().toArray();
                    expect(events.every((event) => event.status === 'scheduled')).toBe(true);
                });
            });
        });

        describe('When startMonitoring', () => {
            it('after about 1 second it should publish them', async () => {
                const now = Date.now();
                await outbox.init();
                await waitFor(() => expect(PublishEventsFnMock).toBeCalled(), 3000);
                const elapsed = Date.now() - now;
                console.log(`Elapsed: ${elapsed}ms`);
                expect(elapsed).toBeGreaterThan(1000);
            });
        });
    });
});
