import { ILogger } from '../logger';
import { IQuery, IQueryBus, IQueryClass, IQueryHandler } from './query-bus.interface';

export class LocalQueryBus implements IQueryBus {
    private handlers: { [key: string]: IQueryHandler<IQuery<unknown, unknown>> } = {};

    constructor(private logger: ILogger) {}

    public register<Q extends IQuery<unknown, unknown>>(query: IQueryClass<Q>, handler: IQueryHandler<Q>): void {
        if (this.handlers[query.name]) throw new Error(`Query ${query.name} is already registered`);
        this.handlers[query.name] = handler;
        this.logger.debug(`Query ${query.name} registered`);
    }

    public async execute<Q extends IQuery<unknown, unknown>>(query: Q): Promise<Q['_resultType']> {
        const handler = this.handlers[query.name] as IQueryHandler<Q>;
        if (!handler) throw new Error(`No handler found for ${query.name}`);
        return await handler.handle(query);
    }
}
