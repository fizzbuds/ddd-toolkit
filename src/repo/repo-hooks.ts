import { ClientSession } from 'mongodb';

export interface IRepoHooks<A> {
    onSave(aggregate: A, mongoSession?: ClientSession): Promise<void>;
}
