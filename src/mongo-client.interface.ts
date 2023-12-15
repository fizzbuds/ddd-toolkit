export interface IMongoClient {
    db: () => {
        collection: <T>(name: string) => ICollection<T>;
    };
    startSession: () => {
        withTransaction: (callback: () => Promise<void>) => Promise<any>;
        endSession: () => Promise<void>;
    };
}

export interface ICollection<T> {
    createIndex: (indexSpec: IndexSpecification, options: { unique: true }) => Promise<string>;
    findOne: (query: { id: string }) => Promise<T | null>;
    updateOne: (query: { id: string; __version: number }, update: any, options: any) => Promise<any>;
}

type IndexSpecification = OneOrMore<
    | string
    | [string, IndexDirection]
    | {
          [key: string]: IndexDirection;
      }
    | Map<string, IndexDirection>
>;

type OneOrMore<T> = T | ReadonlyArray<T>;

type IndexDirection = 1;
