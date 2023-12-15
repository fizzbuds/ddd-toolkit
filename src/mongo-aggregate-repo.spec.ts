import { MongoAggregateRepo } from './mongo-aggregate-repo';
import { ISerializer } from './serializer.interface';
import 'jest';
import { IMongoClient } from './mongo-client.interface';

const serializerMock: ISerializer<any, any> = {
    modelToAggregate: jest.fn(),
    aggregateToModel: jest.fn().mockReturnValue({ id: 'id' }),
};

const mongoClientMock: IMongoClient = {
    db: () => ({
        collection: () => collectionMock,
    }),
    startSession: () => sessionMock,
};

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

    describe('onModuleInit', () => {
        it('should call createIndex to create an index for id field', async () => {
            await mongoAggregateRepo.onModuleInit();
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
