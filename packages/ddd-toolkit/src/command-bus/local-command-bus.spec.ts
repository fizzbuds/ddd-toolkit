import { LocalCommandBus } from './local-command-bus';
import { Command } from './command';
import { waitFor } from '../utils';
import { ICommandHandler } from './command-bus.interface';
import { ILogger } from '../logger';
import { IContextManager } from './context-manager.interface';

const loggerMock: ILogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

class FooCommand extends Command<{ foo: string }, { ok: boolean }> {
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
    afterEach(() => jest.resetAllMocks());

    describe('Given an command bus', () => {
        let commandBus: LocalCommandBus<unknown>;

        beforeEach(() => {
            commandBus = new LocalCommandBus(loggerMock, 3, 100);
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
            const FooHandlerMock = jest.fn();

            class FooCommandHandler implements ICommandHandler<FooCommand> {
                async handle(command: FooCommand) {
                    return await FooHandlerMock(command);
                }
            }

            beforeEach(() => {
                commandBus.register(FooCommand, new FooCommandHandler());
            });

            describe('When send a foo command', () => {
                it('Should call handler with commandName and payload', async () => {
                    const command = new FooCommand({ foo: 'bar' });
                    await commandBus.send(command);

                    await waitFor(() => expect(FooHandlerMock).toBeCalledWith(command));
                });
            });

            describe('When sendSync a foo command', () => {
                beforeEach(() => {
                    FooHandlerMock.mockResolvedValueOnce({ ok: true });
                });
                it('Should call handler with commandName and payload', async () => {
                    const command = new FooCommand({ foo: 'bar' });
                    const result = await commandBus.sendSync(command);
                    expect(result).toEqual({ ok: true });
                });
            });

            describe('Given a handler registered for bar command', () => {
                const BarHandlerMock = jest.fn();

                class BarCommandHandler implements ICommandHandler<BarCommand> {
                    async handle(command: BarCommand) {
                        return await BarHandlerMock(command);
                    }
                }

                beforeEach(() => {
                    commandBus.register(BarCommand, new BarCommandHandler());
                });

                describe('When send FooCommand', () => {
                    it('Should call only FooCommand handler', async () => {
                        const command = new FooCommand({ foo: 'bar' });
                        await commandBus.send(command);

                        await waitFor(() => expect(FooHandlerMock).toBeCalledWith(command));
                        expect(BarHandlerMock).not.toBeCalled();
                    });
                });

                describe('When send BarCommand', () => {
                    it('Should call only BarCommand handler', async () => {
                        const command = new BarCommand({ foo: 'bar' });
                        await commandBus.send(command);

                        expect(FooHandlerMock).not.toBeCalled();
                        expect(BarHandlerMock).toBeCalledWith(command);
                    });
                });
            });
        });

        describe('Given one registered handler which fails the first execution but not the second', () => {
            const handlerMock = jest.fn();

            class FooCommandHandlerOk implements ICommandHandler<FooCommand> {
                async handle(command: FooCommand) {
                    return await handlerMock(command);
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

    describe('Given a command bus with context manager', () => {
        type TContext = { contextKey: string };

        let commandBus: LocalCommandBus<TContext>;

        class FooContextManager implements IContextManager<TContext> {
            public async wrapWithContext<T>(operation: (context: TContext) => Promise<T>): Promise<T> {
                const context: TContext = { contextKey: 'foo-bar' };
                return await operation(context);
            }
        }

        beforeEach(() => {
            commandBus = new LocalCommandBus(loggerMock, 3, 100, new FooContextManager());
        });

        it('should be defined', () => {
            expect(commandBus).toBeDefined();
        });

        describe('Given one registered handler to foo command', () => {
            const FooHandlerMock = jest.fn();

            class FooCommandHandler implements ICommandHandler<FooCommand> {
                async handle(...args: unknown[]) {
                    return await FooHandlerMock(args);
                }
            }

            beforeEach(() => {
                commandBus.register(FooCommand, new FooCommandHandler());
            });

            describe('When sendSync a foo command', () => {
                it('context should be passed to command', async () => {
                    const command = new FooCommand({ foo: 'bar' });
                    await commandBus.sendSync(command);

                    expect(FooHandlerMock).toHaveBeenCalledWith([command, { contextKey: 'foo-bar' }]);
                });
            });
        });
    });

    it('default retry max attempts should be 0', () => {
        const commandBus = new LocalCommandBus(loggerMock);
        expect(commandBus['retryMaxAttempts']).toBe(0);
    });
});
