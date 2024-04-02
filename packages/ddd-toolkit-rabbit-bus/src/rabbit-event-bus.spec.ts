import { Event, IEventHandler, ILogger, waitFor } from '@fizzbuds/ddd-toolkit';
import { RabbitEventBus } from './index';

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

    let rabbitEventBus: RabbitEventBus;

    beforeEach(async () => {
        rabbitEventBus = new RabbitEventBus('amqp://guest:guest@localhost', 'exchange', 10, 3, undefined, loggerMock);
        await rabbitEventBus.init();
    });

    afterEach(async () => await rabbitEventBus.terminate());

    describe('Given an handler subscribed to an event', () => {
        const handlerMock = jest.fn();

        class FooEventHandler implements IEventHandler<FooEvent> {
            async handle(event: FooEvent) {
                handlerMock(event);
            }
        }

        beforeEach(async () => await rabbitEventBus.subscribe(FooEvent, new FooEventHandler()));

        describe('When publish an event', () => {
            it('should call the handler', async () => {
                const event = new FooEvent({ foo: 'foo' });
                await rabbitEventBus.publish(event);

                await waitFor(() => expect(handlerMock).toBeCalledWith(event));
            });
        });

        describe('When publish an invalid event (not json)', () => {
            it('should warn', async () => {
                rabbitEventBus['connection']['producerChannel'].publish('exchange', 'FooEvent', Buffer.from(''));
                await rabbitEventBus['connection']['producerChannel'].waitForConfirms();

                await waitFor(() =>
                    expect(loggerMock.warn).toBeCalledWith('Message discarded due to invalid format (not json)'),
                );
            });
        });

        describe('When publish an invalid event (without event)', () => {
            it('should warn', async () => {
                rabbitEventBus['connection']['producerChannel'].publish(
                    'exchange',
                    'FooEvent',
                    Buffer.from(JSON.stringify({})),
                );
                await rabbitEventBus['connection']['producerChannel'].waitForConfirms();

                await waitFor(() => expect(loggerMock.warn).toBeCalledWith('Message discarded due to invalid format'));
            });
        });

        describe('When subscribe another handler with same name', () => {
            it('should throw an error', async () => {
                await expect(rabbitEventBus.subscribe(FooEvent, new FooEventHandler())).rejects.toThrow();
            });
        });
    });

    describe('Given two handler subscribed to the same event', () => {
        const handler1Mock = jest.fn();
        const handler2Mock = jest.fn();

        class Foo1EventHandler implements IEventHandler<FooEvent> {
            async handle(event: FooEvent) {
                handler1Mock(event);
            }
        }

        class Foo2EventHandler implements IEventHandler<FooEvent> {
            async handle(event: FooEvent) {
                handler2Mock(event);
            }
        }

        beforeEach(async () => {
            await rabbitEventBus.subscribe(FooEvent, new Foo1EventHandler());
            await rabbitEventBus.subscribe(FooEvent, new Foo2EventHandler());
        });

        describe('When publish an event', () => {
            it('should call both handlers', async () => {
                const event = new FooEvent({ foo: 'foo' });
                await rabbitEventBus.publish(event);

                await waitFor(() => {
                    expect(handler1Mock).toBeCalledWith(event);
                    expect(handler2Mock).toBeCalledWith(event);
                });
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
                expect(BarHandlerMock).not.toBeCalled();
            });
        });

        describe('When publish Bar event', () => {
            it('should call only bar handler', async () => {
                const event = new BarEvent({ bar: 'bar' });
                await rabbitEventBus.publish(event);

                await waitFor(() => expect(BarHandlerMock).toBeCalled());
                expect(FooHandlerMock).not.toBeCalledWith(event);
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

    describe('Given no handler subscribed', () => {
        class FooEventHandler implements IEventHandler<FooEvent> {
            async handle() {}
        }

        beforeEach(async () => {
            await rabbitEventBus.subscribe(FooEvent, new FooEventHandler());
            rabbitEventBus['handlers'] = [];
        });

        describe('When publish Foo event', () => {
            const event = new FooEvent({ foo: 'foo' });

            it('should warn', async () => {
                await rabbitEventBus.publish(event);

                await waitFor(() =>
                    expect(loggerMock.warn).toBeCalledWith('Message discarded due to missing handler for FooEvent'),
                );
            });
        });
    });

    describe('Given a rejecting handler subscribed to an event', () => {
        const handlerMock = jest.fn();

        class FooEventHandler implements IEventHandler<FooEvent> {
            async handle(event: FooEvent) {
                handlerMock(event);
            }
        }

        beforeEach(async () => {
            handlerMock.mockImplementation(() => {
                throw new Error();
            });
            await rabbitEventBus.subscribe(FooEvent, new FooEventHandler());
        });

        describe('When publish an event', () => {
            it('should call the handler', async () => {
                const event = new FooEvent({ foo: 'foo' });
                await rabbitEventBus.publish(event);

                await waitFor(() => {
                    expect(loggerMock.error).toBeCalledWith(expect.stringContaining('Message sent to dlq'));
                }, 5000);
            });
        });
    });

    describe('Given a temporarily rejecting handler subscribed to an event', () => {
        const handlerMock = jest.fn();

        class FooEventHandler implements IEventHandler<FooEvent> {
            async handle(event: FooEvent) {
                handlerMock(event);
            }
        }

        beforeEach(async () => {
            handlerMock.mockImplementationOnce(() => {
                throw new Error();
            });
            handlerMock.mockImplementationOnce(() => {
                throw new Error();
            });
            handlerMock.mockImplementationOnce(() => 'ok');
            await rabbitEventBus.subscribe(FooEvent, new FooEventHandler());
        });

        describe('When publish an event', () => {
            it('should call the handler', async () => {
                const event = new FooEvent({ foo: 'foo' });
                await rabbitEventBus.publish(event);

                await waitFor(() => {
                    expect(loggerMock.warn).toHaveBeenNthCalledWith(
                        2,
                        expect.stringContaining('Message re-queued due'),
                    );
                    expect(handlerMock).toBeCalledTimes(3);
                }, 5000);
            });
        });
    });
});
