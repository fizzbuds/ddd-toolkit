import { IEvent } from '../event-bus/event-bus.interface';

export interface IOutbox {
    init(): Promise<void>;

    terminate(): Promise<void>;

    scheduleEvents(events: IEvent<unknown>[], transaction: unknown): Promise<string[]>;

    publishEvents(scheduledEventsIds: string[]): Promise<void>;
}
