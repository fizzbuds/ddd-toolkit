import { ICommand } from './command-bus.interface';

export abstract class Command<TPayload> implements ICommand<TPayload> {
    readonly name: string;

    protected constructor(public readonly payload: TPayload) {
        this.name = this.constructor.name;
    }
}
