import { Document } from 'mongodb';

export type DocumentWithId = { id: string } & Document;
export type WithVersion<T> = T & { __version: number };
export type WithOptionalVersion<T> = T & { __version?: number };

export interface IRepo<A> {
    getById: (id: string) => Promise<WithVersion<A> | null>;
    getByIdOrThrow: (id: string) => Promise<WithVersion<A>>;
    save: (aggregate: A) => Promise<void>;
}
