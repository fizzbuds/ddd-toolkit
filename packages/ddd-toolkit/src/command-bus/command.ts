import { ICommand } from './command-bus.interface';

export abstract class Command<TPayload, TResponse = void> implements ICommand<TPayload, TResponse> {
    readonly name: string;
    readonly _returnType: TResponse;

    protected constructor(public readonly payload: TPayload) {
        this.name = this.constructor.name;
    }
}
