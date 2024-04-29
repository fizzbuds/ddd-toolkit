import {
    AggregateNotFoundError,
    DuplicatedIdError,
    IAggregateRepo,
    IInit,
    ILogger,
    IRepoHooks,
    ISerializer,
    OptimisticLockError,
    WithOptionalVersion,
    WithVersion,
} from '@fizzbuds/ddd-toolkit';
import { Pool } from 'pg';
import { merge } from 'lodash';

export class PostgresAggregateRepo<A, AM extends { id: string }> implements IAggregateRepo<A>, IInit {
    constructor(
        protected readonly serializer: ISerializer<A, AM>,
        protected readonly pool: Pool,
        protected readonly tableName: string,
        protected readonly repoHooks?: IRepoHooks<AM>,
        protected readonly logger: ILogger = console,
    ) {}

    async init() {
        await this.pool.query(
            `CREATE TABLE IF NOT EXISTS ${this.tableName} (
            id TEXT NOT NULL,
            version INTEGER NOT NULL,
            model JSONB NOT NULL,
            PRIMARY KEY (id)
        );`,
        );
    }

    async save(aggregate: WithOptionalVersion<A>) {
        const aggregateModel = this.serializer.aggregateToModel(aggregate);
        const aggregateVersion = aggregate.__version || 0;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const { rows } = await client.query(`SELECT id, version FROM ${this.tableName} WHERE id = $1 FOR UPDATE`, [
                aggregateModel.id,
            ]);

            if (rows.length === 0) {
                await client.query(
                    `INSERT INTO ${this.tableName}(id, version, model)
                VALUES($1, $2, $3)`,
                    [aggregateModel.id, aggregateVersion + 1, JSON.stringify(aggregateModel)],
                );
            } else {
                const { id, version } = rows[0];
                if (version !== aggregateVersion) {
                    if (aggregateVersion === 0) {
                        throw new DuplicatedIdError(
                            `Cannot save aggregate with id: ${aggregateModel.id} due to duplicated id.`,
                        );
                    } else {
                        throw new OptimisticLockError(
                            `Cannot save aggregate with id: ${aggregateModel.id} due to optimistic locking.`,
                        );
                    }
                }
                await client.query(`UPDATE ${this.tableName} SET version = $1, model = $2 WHERE id = $3`, [
                    aggregateVersion + 1,
                    JSON.stringify(aggregateModel),
                    id,
                ]);
            }

            await this.pool.query('COMMIT');
        } catch (e) {
            await this.pool.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    public async getById(id: string): Promise<WithVersion<A> | null> {
        const queryText: string = `SELECT * FROM ${this.tableName} WHERE id = $1`;
        const { rows } = await this.pool.query(queryText, [id]);
        if (rows.length === 0) return null;
        const aggregateModel = rows[0].model;
        this.logger.debug(
            `Retrieving aggregate ${id}. Found: ${JSON.stringify(rows[0].model)} with version ${rows[0].version}`,
        );

        const aggregate = this.serializer.modelToAggregate(aggregateModel as AM);
        return merge<A, { __version: number }>(aggregate, { __version: rows[0].version });
    }

    public async getByIdOrThrow(id: string): Promise<WithVersion<A>> {
        const aggregate = await this.getById(id);
        if (!aggregate) throw new AggregateNotFoundError(`Aggregate ${id} not found.`);
        return aggregate;
    }
}
