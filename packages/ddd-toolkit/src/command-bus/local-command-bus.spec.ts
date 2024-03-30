import { LocalCommandBus } from './local-command-bus';
import { Command } from './command';
import { loggerMock } from '../logger';
import { waitFor } from '../utils';

class FooCommand extends Command<{ foo: string }> {
    constructor(public readonly payload: { foo: string }) {
        super(payload);
    }
}

class BarCommand extends Command<{ foo: string }> {
    constructor(public readonly payload: { foo: string }) {
        super(payload);
    }
}

describe('LocalCommandBus', () => {
    describe('Given an command bus', () => {
        let commandBus: LocalCommandBus;

        beforeEach(() => {
            commandBus = new LocalCommandBus(loggerMock, 3, 100);
        });

        afterEach(() => {
            jest.resetAllMocks();
        });

        describe('Given no registered handler to foo command', () => {
            describe('When send a foo command', () => {
                it('Should log warning message', async () => {
                    const command = new FooCommand({ foo: 'bar' });
                    await commandBus.send(command);

                    expect(loggerMock.warn).toBeCalledWith(`No handler found for ${FooCommand.name}`);
                });
            });
        });

        describe('Given one registered handler to foo command', () => {
            const handler1Mock = jest.fn();

            class FooCommandHandler {
                async handle(command: FooCommand) {
                    await handler1Mock(command);
                }
            }

            beforeEach(() => {
                commandBus.register(FooCommand, new FooCommandHandler());
            });

            describe('When send a foo command', () => {
                it('Should call handler with commandName and payload', async () => {
                    const command = new FooCommand({ foo: 'bar' });
                    await commandBus.send(command);

                    await waitFor(() => expect(handler1Mock).toBeCalledWith(command));
                });
            });

            describe('Given a handler registered for bar command', () => {
                const handler3Mock = jest.fn();

                class BarCommandHandler {
                    async handle(command: BarCommand) {
                        await handler3Mock(command);
                    }
                }

                beforeEach(() => {
                    commandBus.register(BarCommand, new BarCommandHandler());
                });

                describe('When send FooCommand', () => {
                    it('Should call only FooCommand handler', async () => {
                        const command = new FooCommand({ foo: 'bar' });
                        await commandBus.send(command);

                        await waitFor(() => expect(handler1Mock).toBeCalledWith(command));
                        expect(handler3Mock).not.toBeCalled();
                    });
                });

                describe('When send BarCommand', () => {
                    it('Should call only BarCommand handler', async () => {
                        const command = new BarCommand({ foo: 'bar' });
                        await commandBus.send(command);

                        expect(handler1Mock).not.toBeCalled();
                        expect(handler3Mock).toBeCalledWith(command);
                    });
                });
            });
        });

        describe('Given one registered handler which fails the first execution but not the second', () => {
            const handlerMock = jest.fn();

            class FooCommandHandlerOk {
                async handle(command: FooCommand) {
                    await handlerMock(command);
                }
            }

            beforeEach(() => {
                handlerMock.mockRejectedValueOnce(new Error('ko')).mockResolvedValueOnce('ok');
                commandBus.register(FooCommand, new FooCommandHandlerOk());
            });

            describe('When send command', () => {
                const command = new FooCommand({ foo: 'bar' });

                beforeEach(async () => await commandBus.send(command));

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
                            expect.stringContaining(
                                'FooCommandHandlerOk failed to handle FooCommand command. Attempt 1/3',
                            ),
                        );
                    });
                });
            });
        });
    });
});
