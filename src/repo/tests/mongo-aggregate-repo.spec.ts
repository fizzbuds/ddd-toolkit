import { MongoAggregateRepo } from '../mongo-aggregate-repo';
import 'jest';
import { MongoClient } from 'mongodb';
import { ISerializer } from '../serializer.interface';

const serializerMock: ISerializer<any, any> = {
    modelToAggregate: jest.fn(),
    aggregateToModel: jest.fn().mockReturnValue({ id: 'id' }),
};

const mongoClientMock = {
    db: () => ({
        collection: () => collectionMock,
    }),
    startSession: (): any => sessionMock,
} as any as MongoClient;

const collectionMock = {
    createIndex: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
};

const sessionMock = {
    withTransaction: (callback: () => Promise<void>) => callback(),
    endSession: jest.fn(),
};
describe('MongoAggregateRepo', () => {
    let mongoAggregateRepo: MongoAggregateRepo<any, any>;
    beforeEach(() => {
        mongoAggregateRepo = new MongoAggregateRepo(serializerMock, mongoClientMock, 'collectionName');
    });

    describe('constructor', () => {
        it('should create an instance', () => {
            expect(mongoAggregateRepo).toBeDefined();
        });
    });

    describe('init', () => {
        it('should call createIndex to create an index for id field', async () => {
            await mongoAggregateRepo.init();
            expect(collectionMock.createIndex).toHaveBeenCalledWith({ id: 1 }, { unique: true });
        });
    });

    describe('getById', () => {
        it('should call findOne with id', async () => {
            await mongoAggregateRepo.getById('id');
            expect(collectionMock.findOne).toHaveBeenCalledWith({ id: 'id' });
        });
    });

    describe('save', () => {
        it('should call updateOne with id', async () => {
            await mongoAggregateRepo.save({ id: 'id' });
            expect(collectionMock.updateOne).toHaveBeenCalled();
        });
    });
});
