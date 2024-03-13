import { LocalEventBus } from './local-event-bus';
import { Event } from './event';
import { ILogger } from '../logger';

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

const loggerMock: ILogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

describe('LocalEventBus', () => {
    describe('Given an event bus', () => {
        let eventBus: LocalEventBus;

        beforeEach(() => {
            eventBus = new LocalEventBus(loggerMock);
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
        });

        describe('Given one subscribed handler to foo event', () => {
            const handler1Mock = jest.fn();

            class FooEventHandler {
                async handle(event: FooEvent) {
                    await handler1Mock(event);
                }
            }

            beforeEach(() => {
                eventBus.subscribe(new FooEventHandler(), FooEvent);
            });

            describe('When publish a foo event', () => {
                it('Should call handler with eventName and payload', async () => {
                    const event = new FooEvent({ foo: 'bar' });
                    await eventBus.publish(event);

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
                    eventBus.subscribe(new FooEventHandler2(), FooEvent);
                });

                describe('When publish event', () => {
                    it('Should call two handlers with eventName and payload', async () => {
                        const event = new FooEvent({ foo: 'bar' });
                        await eventBus.publish(event);

                        expect(handler1Mock).toBeCalledWith(event);
                        expect(handler2Mock).toBeCalledWith(event);
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
                    eventBus.subscribe(new BarEventHandler(), BarEvent);
                });

                describe('When publish FooEvent', () => {
                    it('Should call only FooEvent handler', async () => {
                        const event = new FooEvent({ foo: 'bar' });
                        await eventBus.publish(event);

                        expect(handler1Mock).toBeCalledWith(event);
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
                    throw new Error('ko');
                }
            }

            beforeEach(() => {
                handlerOkMock.mockResolvedValue('ok');
                handlerKoMock.mockRejectedValue(new Error('ko'));
                eventBus.subscribe(new FooEventHandlerOk(), FooEvent);
                eventBus.subscribe(new FooEventHandlerKo(), FooEvent);
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
                eventBus.subscribe(new FooEventHandlerOk(), FooEvent);
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
                        expect(loggerMock.warn).toBeCalledTimes(1);
                        expect(loggerMock.warn).toBeCalledWith(
                            expect.stringContaining('FooEventHandlerOk failed to handle FooEvent event. Attempt 1/3'),
                        );
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
