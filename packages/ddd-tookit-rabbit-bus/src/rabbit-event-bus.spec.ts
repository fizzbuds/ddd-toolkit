import { RabbitEventBus } from './rabbit-event-bus';
import { Event, IEventHandler, ILogger } from '@fizzbuds/ddd-toolkit/src';

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

describe('RabbitEventBus', () => {
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

                beforeEach(() => {
                    rabbitEventBus.subscribe(FooEvent, new FooEventHandler());
                });

                describe('When publish an event', () => {
                    it('should call the handler', async () => {
                        const event = new FooEvent({ foo: 'bar' });
                        await rabbitEventBus.publish(event);

                        await waitFor(() => expect(handlerMock).toBeCalledWith(event));
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
