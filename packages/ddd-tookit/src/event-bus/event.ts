import { IEvent } from './event-bus.interface';

export abstract class Event<TPayload> implements IEvent<TPayload> {
    readonly name: string;

    protected constructor(public readonly payload: TPayload) {
        this.name = this.constructor.name;
    }
}
