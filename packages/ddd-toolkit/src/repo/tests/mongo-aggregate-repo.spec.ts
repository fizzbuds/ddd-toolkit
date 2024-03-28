import { MongoAggregateRepo } from '../mongo-aggregate-repo';
import 'jest';
import { ISerializer } from '../serializer.interface';
import { collectionMock, mongoClientMock } from './mongo.mock';

const serializerMock: ISerializer<any, any> = {
    modelToAggregate: jest.fn(),
    aggregateToModel: jest.fn().mockReturnValue({ id: 'id' }),
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
