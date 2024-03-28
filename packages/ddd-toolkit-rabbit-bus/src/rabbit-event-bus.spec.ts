import { Event, IEventHandler, ILogger } from '../../ddd-toolkit/src';
import { RabbitEventBus } from './rabbit-event-bus';
import { MongoBusPersistence } from './mongo-bus-persistence';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

const loggerMock: ILogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

class FooEvent extends Event<{ foo: string }> {
    constructor(public readonly payload: { foo: string }) {
        super(payload);
    }
}

class BarEvent extends Event<{ bar: string }> {
    constructor(public readonly payload: { bar: string }) {
        super(payload);
    }
}

describe('RabbitEventBus', () => {
    afterEach(() => jest.resetAllMocks());
    let replset: MongoMemoryReplSet;
    let mongoClient: MongoClient;
    let mongoBusPersistence: MongoBusPersistence;

    beforeAll(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 4 } });
        mongoClient = await new MongoClient(replset.getUri()).connect();
        mongoBusPersistence = new MongoBusPersistence(mongoClient, loggerMock);
    });

    afterAll(async () => {
        await mongoClient.close();
        await replset.stop();
    });

    describe('Given a RabbitEventBus instance', () => {
        let rabbitEventBus: RabbitEventBus;

        beforeEach(() => {
            rabbitEventBus = new RabbitEventBus(
                'amqp://user:password@localhost',
                'exchange',
                'queue',
                10,
                3,
                undefined,
                loggerMock,
                mongoBusPersistence,
            );
        });

        describe('When init is called', () => {
            beforeEach(async () => {
                await rabbitEventBus.init();
            });

            afterEach(async () => {
                await rabbitEventBus.terminate();
            });

            it('should be connected', async () => {
                await rabbitEventBus.publish({ name: 'test', payload: 'test' });
            });
        });

        describe('Given an initialized RabbitEventBus', () => {
            beforeEach(async () => await rabbitEventBus.init());
            afterEach(async () => await rabbitEventBus.terminate());

            describe('Given a handler subscribed to an event', () => {
                const handlerMock = jest.fn();

                class FooEventHandler implements IEventHandler<FooEvent> {
                    async handle(event: FooEvent) {
                        handlerMock(event);
                    }
                }

                beforeEach(async () => await rabbitEventBus.subscribe(FooEvent, new FooEventHandler()));

                describe('When publish successfully event', () => {
                    it('should call the handler', async () => {
                        const event = new FooEvent({ foo: 'foo' });
                        await rabbitEventBus.publish(event);

                        await waitFor(() => expect(handlerMock).toBeCalledWith(event));
                    });

                    it('should persist the event with published status', async () => {
                        await rabbitEventBus.publish(new FooEvent({ foo: 'foo' }));

                        expect(await mongoBusPersistence.getEventStatus(new FooEvent({ foo: 'foo' }))).toBe(
                            'published',
                        );
                    });
                });

                describe('When publish event fail', () => {
                    it('should persist the event with pending status', async () => {
                        await rabbitEventBus.terminate();
                        try {
                            await rabbitEventBus.publish(new FooEvent({ foo: 'foo' }));
                        } catch (e) {}

                        expect(await mongoBusPersistence.getEventStatus(new FooEvent({ foo: 'foo' }))).toBe('pending');

                        await rabbitEventBus.init();
                    });
                });
            });

            describe('Given two handler subscribed to two different event', () => {
                const FooHandlerMock = jest.fn();
                const BarHandlerMock = jest.fn();

                class FooEventHandler implements IEventHandler<FooEvent> {
                    async handle(event: FooEvent) {
                        FooHandlerMock(event);
                    }
                }

                class BarEventHandler implements IEventHandler<BarEvent> {
                    async handle(event: BarEvent) {
                        BarHandlerMock(event);
                    }
                }

                beforeEach(async () => {
                    await rabbitEventBus.subscribe(FooEvent, new FooEventHandler());
                    await rabbitEventBus.subscribe(BarEvent, new BarEventHandler());
                });

                describe('When publish Foo event', () => {
                    it('should call only foo handler', async () => {
                        const event = new FooEvent({ foo: 'foo' });
                        await rabbitEventBus.publish(event);

                        await waitFor(() => expect(FooHandlerMock).toBeCalledWith(event));
                        await waitFor(() => expect(BarHandlerMock).not.toBeCalled());
                    });
                });

                describe('When publish Bar event', () => {
                    it('should call only bar handler', async () => {
                        const event = new BarEvent({ bar: 'bar' });
                        await rabbitEventBus.publish(event);

                        await waitFor(() => expect(BarHandlerMock).toBeCalled());
                        await waitFor(() => expect(FooHandlerMock).not.toBeCalledWith(event));
                    });
                });

                describe('When publish both Bar and Foo event', () => {
                    it('should call only bar handler', async () => {
                        await rabbitEventBus.publish(new BarEvent({ bar: 'bar' }));
                        await rabbitEventBus.publish(new FooEvent({ foo: 'doo' }));

                        await waitFor(() => expect(BarHandlerMock).toBeCalled());
                        await waitFor(() => expect(FooHandlerMock).toBeCalled());
                    });
                });
            });

            describe('Given some pending events', () => {
                describe('When publishAllPendingEvents', () => {
                    it('should publish all pending events', async () => {
                        const fooHandlerMock = jest.fn();
                        const barHandlerMock = jest.fn();

                        class FooEventHandler implements IEventHandler<FooEvent> {
                            async handle(event: FooEvent) {
                                fooHandlerMock(event);
                            }
                        }

                        class BarEventHandler implements IEventHandler<BarEvent> {
                            async handle(event: BarEvent) {
                                barHandlerMock(event);
                            }
                        }

                        await rabbitEventBus.subscribe(FooEvent, new FooEventHandler());
                        await rabbitEventBus.subscribe(BarEvent, new BarEventHandler());

                        await mongoBusPersistence.persistEvent(new FooEvent({ foo: 'foo' }), 'pending');
                        await mongoBusPersistence.persistEvent(new BarEvent({ bar: 'bar' }), 'pending');

                        await rabbitEventBus.publishAllPendingEvents();

                        await waitFor(() => expect(fooHandlerMock).toBeCalled());
                        await waitFor(() => expect(barHandlerMock).toBeCalled());
                    });
                });
            });
        });
    });
});

async function waitFor(statement: () => void, timeout = 1000): Promise<void> {
    const startTime = Date.now();

    let latestStatementError;
    while (true) {
        try {
            statement();
            return;
        } catch (e) {
            latestStatementError = e;
        }

        if (Date.now() - startTime > timeout) throw latestStatementError;

        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
