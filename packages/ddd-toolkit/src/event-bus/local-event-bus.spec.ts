import { LocalEventBus } from './local-event-bus';
import { Event } from './event';
import { ILogger } from '../logger';
import { sleep, waitFor } from '../utils';

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

class BarEvent extends Event<{ foo: string }> {
    constructor(public readonly payload: { foo: string }) {
        super(payload);
    }
}

describe('LocalEventBus', () => {
    describe('Given an event bus', () => {
        let eventBus: LocalEventBus;

        beforeEach(() => {
            eventBus = new LocalEventBus(loggerMock, 3, 100);
        });

        afterEach(() => {
            jest.resetAllMocks();
        });

        describe('Given no subscribed handler to foo event', () => {
            describe('When publish a foo event', () => {
                it('Should log warning message', async () => {
                    const event = new FooEvent({ foo: 'bar' });
                    await eventBus.publish(event);

                    expect(loggerMock.warn).toBeCalledWith(`No handler found for ${FooEvent.name}`);
                });
            });

            describe('When publishAndWaitForHandlers a foo event', () => {
                it('Should log warning message', async () => {
                    const event = new FooEvent({ foo: 'bar' });
                    await eventBus.publishAndWaitForHandlers(event);

                    expect(loggerMock.warn).toBeCalledWith(`No handler found for ${FooEvent.name}`);
                });
            });
        });

        describe('Given one subscribed handler to foo event', () => {
            const handler1Mock = jest.fn();

            class FooEventHandler {
                async handle(event: FooEvent) {
                    await sleep(10);
                    await handler1Mock(event);
                }
            }

            beforeEach(() => {
                eventBus.subscribe(FooEvent, new FooEventHandler());
            });

            describe('When publish a foo event', () => {
                it('Should call handler with eventName and payload', async () => {
                    const event = new FooEvent({ foo: 'bar' });
                    await eventBus.publish(event);

                    await waitFor(() => expect(handler1Mock).toBeCalledWith(event));
                });
            });

            describe('When publishAndWaitForHandlers a foo event', () => {
                it('Should call handler with eventName and payload', async () => {
                    const event = new FooEvent({ foo: 'bar' });
                    await eventBus.publishAndWaitForHandlers(event);

                    expect(handler1Mock).toBeCalledWith(event);
                });
            });

            describe('Given another subscribed handler to foo event', () => {
                const handler2Mock = jest.fn();

                class FooEventHandler2 {
                    async handle(event: FooEvent) {
                        await handler2Mock(event);
                    }
                }

                beforeEach(() => {
                    eventBus.subscribe(FooEvent, new FooEventHandler2());
                });

                describe('When publish event', () => {
                    it('Should call two handlers with eventName and payload', async () => {
                        const event = new FooEvent({ foo: 'bar' });
                        await eventBus.publish(event);

                        await waitFor(() => expect(handler1Mock).toBeCalledWith(event));
                        await waitFor(() => expect(handler2Mock).toBeCalledWith(event));
                    });
                });
            });

            describe('Given a handler subscribed for bar event', () => {
                const handler3Mock = jest.fn();

                class BarEventHandler {
                    async handle(event: BarEvent) {
                        await handler3Mock(event);
                    }
                }

                beforeEach(() => {
                    eventBus.subscribe(BarEvent, new BarEventHandler());
                });

                describe('When publish FooEvent', () => {
                    it('Should call only FooEvent handler', async () => {
                        const event = new FooEvent({ foo: 'bar' });
                        await eventBus.publish(event);

                        await waitFor(() => expect(handler1Mock).toBeCalledWith(event));
                        expect(handler3Mock).not.toBeCalled();
                    });
                });

                describe('When publish BarEvent', () => {
                    it('Should call only BarEvent handler', async () => {
                        const event = new BarEvent({ foo: 'bar' });
                        await eventBus.publish(event);

                        expect(handler1Mock).not.toBeCalled();
                        expect(handler3Mock).toBeCalledWith(event);
                    });
                });
            });
        });

        describe('Given two subscribed handlers (with one that fail) for foo event', () => {
            const handlerOkMock = jest.fn();
            const handlerKoMock = jest.fn();

            class FooEventHandlerOk {
                async handle(event: FooEvent) {
                    await handlerOkMock(event);
                }
            }

            class FooEventHandlerKo {
                async handle(event: FooEvent) {
                    await handlerKoMock(event);
                }
            }

            beforeEach(() => {
                handlerOkMock.mockResolvedValue('ok');
                handlerKoMock.mockRejectedValue(new Error('ko'));
                eventBus.subscribe(FooEvent, new FooEventHandlerOk());
                eventBus.subscribe(FooEvent, new FooEventHandlerKo());
            });

            describe('When publish event', () => {
                const event = new FooEvent({ foo: 'bar' });

                it('publish should not throw any exception', async () => {
                    await eventBus.publish(event);
                });

                it('both handler should be called', async () => {
                    await eventBus.publish(event);
                    expect(handlerOkMock).toBeCalledWith(event);
                    expect(handlerKoMock).toBeCalledWith(event);

                    await waitFor(() => {
                        expect(handlerOkMock).toBeCalledTimes(1);
                        expect(handlerKoMock).toBeCalledTimes(1);
                    });
                });

                it('should log error for failing handler', async () => {
                    await eventBus.publish(event);
                    await waitFor(() =>
                        expect(loggerMock.error).toBeCalledWith(
                            expect.stringContaining('HandlerKo failed to handle FooEvent event'),
                        ),
                    );
                });
            });

            describe('When publishAndWaitForHandlers event', () => {
                const event = new FooEvent({ foo: 'bar' });

                it('publish throw an exception', async () => {
                    await expect(() => eventBus.publishAndWaitForHandlers(event)).rejects.toThrow();
                });

                it('both handler should be called', async () => {
                    try {
                        await eventBus.publishAndWaitForHandlers(event);
                    } catch {}
                    expect(handlerOkMock).toBeCalledWith(event);
                    expect(handlerKoMock).toBeCalledWith(event);

                    expect(handlerOkMock).toBeCalledTimes(1);
                    expect(handlerKoMock).toBeCalledTimes(3);
                });
            });
        });

        describe('Given one subscribed handler which fails the first execution but not the second', () => {
            const handlerMock = jest.fn();

            class FooEventHandlerOk {
                async handle(event: FooEvent) {
                    await handlerMock(event);
                }
            }

            beforeEach(() => {
                handlerMock.mockRejectedValueOnce(new Error('ko')).mockResolvedValueOnce('ok');
                eventBus.subscribe(FooEvent, new FooEventHandlerOk());
            });

            describe('When publish event', () => {
                const event = new FooEvent({ foo: 'bar' });

                beforeEach(async () => await eventBus.publish(event));

                it('handler should be called two times', async () => {
                    await waitFor(() => {
                        expect(handlerMock).toBeCalledTimes(2);
                    });
                });

                it('should not log error for failing handler', async () => {
                    await waitFor(() => {
                        expect(handlerMock).toBeCalledTimes(2);
                        expect(loggerMock.error).not.toBeCalled();
                    });
                });

                it('should log one retry for failing handler', async () => {
                    await waitFor(() => {
                        expect(handlerMock).toBeCalledTimes(2); // needed to wait for the second call to be done
                        expect(loggerMock.warn).toBeCalledTimes(1);
                        expect(loggerMock.warn).toBeCalledWith(
                            expect.stringContaining('FooEventHandlerOk failed to handle FooEvent event. Attempt 2/3'),
                        );
                    });
                });
            });

            describe('When publishAndWaitForHandlers event', () => {
                const event = new FooEvent({ foo: 'bar' });

                beforeEach(async () => {
                    await eventBus.publishAndWaitForHandlers(event);
                });

                it('handler should be called two times', async () => {
                    expect(handlerMock).toBeCalledTimes(2);
                });

                it('should log one retry for failing handler', async () => {
                    expect(loggerMock.warn).toBeCalledTimes(1);
                    expect(loggerMock.warn).toBeCalledWith(
                        expect.stringContaining('FooEventHandlerOk failed to handle FooEvent event. Attempt 2/3'),
                    );
                });
            });
        });
    });
});
