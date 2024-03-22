import { ClientSession } from 'mongodb';

export interface IRepoHooks<AM> {
    onSave(aggregateModel: AM, mongoSession?: ClientSession): Promise<void>;
}
