import { LocalEventBus } from './local-event-bus';
import { Event } from './event';
import { ILogger } from '../logger';

class FooEvent extends Event<{ foo: string }> {
    constructor(public readonly payload: { foo: string }) {
        super(FooEvent.name, payload);
    }
}

class BarEvent extends Event<{ foo: string }> {
    constructor(public readonly payload: { foo: string }) {
        super(BarEvent.name, payload);
    }
}

const loggerMock: ILogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
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
            let handler1Mock: jest.Mock;
            beforeEach(() => {
                handler1Mock = jest.fn();
                eventBus.subscribe(
                    {
                        handle: handler1Mock,
                    },
                    FooEvent,
                );
            });

            describe('When publish a foo event', () => {
                it('Should call handler with eventName and payload', async () => {
                    const event = new FooEvent({ foo: 'bar' });
                    await eventBus.publish(event);

                    expect(handler1Mock).toBeCalledWith(event);
                });
            });

            describe('Given another subscribed handler to foo event', () => {
                let handler2Mock: jest.Mock;
                beforeEach(() => {
                    handler2Mock = jest.fn();
                    eventBus.subscribe(
                        {
                            handle: handler2Mock,
                        },
                        FooEvent,
                    );
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
                let handler3Mock: jest.Mock;
                beforeEach(() => {
                    handler3Mock = jest.fn();
                    eventBus.subscribe(
                        {
                            handle: handler3Mock,
                        },
                        BarEvent,
                    );
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
            let handlerOkMock: jest.Mock;
            let handlerKoMock: jest.Mock;

            beforeEach(() => {
                handlerOkMock = jest.fn().mockResolvedValue('ok');
                handlerKoMock = jest.fn().mockRejectedValue(new Error('ko'));
                eventBus.subscribe(
                    {
                        handle: handlerOkMock,
                    },
                    FooEvent,
                );
                eventBus.subscribe(
                    {
                        handle: handlerKoMock,
                    },
                    FooEvent,
                );
            });

            describe('When publish event', () => {
                const event = new FooEvent({ foo: 'bar' });
                it('publish should throw an exception', async () => {
                    await expect(eventBus.publish(event)).rejects.toThrow();
                });

                it('both handler should be called', async () => {
                    try {
                        await eventBus.publish(event);
                    } catch (e) {}
                    expect(handlerOkMock).toBeCalledWith(event);
                    expect(handlerKoMock).toBeCalledWith(event);
                });
            });
        });
    });
});
