import { LocalQueryBus, Query } from './../';
import { loggerMock } from '../logger';
import { waitFor } from '../utils';

class FooQuery extends Query<{ foo: string }> {
    constructor(public readonly payload: { foo: string }) {
        super(payload);
    }
}

class BarQuery extends Query<{ foo: string }> {
    constructor(public readonly payload: { foo: string }) {
        super(payload);
    }
}

describe('LocalQueryBus', () => {
    describe('Given a query bus', () => {
        let queryBus: LocalQueryBus;

        beforeEach(() => {
            queryBus = new LocalQueryBus(loggerMock);
        });

        afterEach(() => {
            jest.resetAllMocks();
        });

        describe('Given no registered handler to foo query', () => {
            describe('When execute a foo query', () => {
                it('should throw', async () => {
                    const query = new FooQuery({ foo: 'bar' });
                    await expect(() => queryBus.execute(query)).rejects.toThrow(
                        `No handler found for ${FooQuery.name}`,
                    );
                });
            });
        });

        describe('Given one registered handler to foo query', () => {
            const handler1Mock = jest.fn();

            class FooQueryHandler {
                async handle(query: FooQuery) {
                    await handler1Mock(query);
                }
            }

            beforeEach(() => {
                queryBus.register(FooQuery, new FooQueryHandler());
            });

            describe('When execute a foo query', () => {
                it('Should call handler', async () => {
                    const query = new FooQuery({ foo: 'bar' });
                    await queryBus.execute(query);

                    await waitFor(() => expect(handler1Mock).toBeCalledWith(query));
                });
            });

            describe('Given a handler registered for bar query', () => {
                const handler3Mock = jest.fn();

                class BarQueryHandler {
                    async handle(query: BarQuery) {
                        await handler3Mock(query);
                    }
                }

                beforeEach(() => {
                    queryBus.register(BarQuery, new BarQueryHandler());
                });

                describe('When execute foo query', () => {
                    it('Should call only foo query handler', async () => {
                        const query = new FooQuery({ foo: 'bar' });
                        await queryBus.execute(query);

                        await waitFor(() => expect(handler1Mock).toBeCalledWith(query));
                        expect(handler3Mock).not.toBeCalled();
                    });
                });

                describe('When send bar query', () => {
                    it('Should call only bar query handler', async () => {
                        const query = new BarQuery({ foo: 'bar' });
                        await queryBus.execute(query);

                        expect(handler1Mock).not.toBeCalled();
                        expect(handler3Mock).toBeCalledWith(query);
                    });
                });
            });
        });

        describe('Given one registered handler which fails the execution', () => {
            const handlerMock = jest.fn();

            class FooQueryHandler {
                async handle(query: FooQuery) {
                    await handlerMock(query);
                }
            }

            beforeEach(() => {
                handlerMock.mockRejectedValueOnce(new Error('ko'));
                queryBus.register(FooQuery, new FooQueryHandler());
            });

            describe('When execute query', () => {
                const query = new FooQuery({ foo: 'bar' });

                it('should throw', async () => {
                    await expect(() => queryBus.execute(query)).rejects.toThrow('ko');
                });
            });
        });
    });
});
