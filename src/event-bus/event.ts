import { IEvent } from './event-bus.interface';

export abstract class Event<TPayload> implements IEvent<TPayload> {
    protected constructor(
        public readonly name: string,
        public readonly payload: TPayload,
    ) {}
}
