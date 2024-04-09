import { IQuery } from './query-bus.interface';

export abstract class Query<TPayload, TResult> implements IQuery<TPayload, TResult> {
    readonly name: string;
    readonly _resultType: TResult;

    protected constructor(public readonly payload: TPayload) {
        this.name = this.constructor.name;
    }
}
