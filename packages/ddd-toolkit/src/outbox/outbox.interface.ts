import { IEvent } from '../event-bus/event-bus.interface';

export interface IOutbox {
    init(): Promise<void>;

    dispose(): Promise<void>;

    scheduleEvents(events: IEvent<unknown>[], transaction: unknown): Promise<string[]>;

    publishEvents(eventIds: string[]): Promise<void>;
}
