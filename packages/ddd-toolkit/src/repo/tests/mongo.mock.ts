import { MongoClient } from 'mongodb';

export const mongoClientMock = {
    db: () => ({
        collection: () => collectionMock,
    }),
    startSession: (): any => sessionMock,
} as any as MongoClient;

export const collectionMock = {
    createIndex: jest.fn().mockResolvedValue('my-index'),
    findOne: jest.fn(),
    updateOne: jest.fn(),
};

const sessionMock = {
    withTransaction: (callback: () => Promise<void>) => callback(),
    endSession: jest.fn(),
};
