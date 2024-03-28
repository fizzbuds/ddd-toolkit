import { collectionMock, mongoClientMock } from './mongo.mock';
import { MongoQueryRepo } from '../mongo-query-repo';
import { loggerMock } from '../../logger';

class TestMongoQueryRepo extends MongoQueryRepo<any> {
    protected readonly indexes = [{ indexSpec: { id: 1 }, options: { unique: true } }];
}

class TestMongoQueryRepoWithoutIndexes extends MongoQueryRepo<any> {
    protected readonly indexes = [];
}

describe('MongoQueryRepo', () => {
    let testQueryRepo: MongoQueryRepo<any>;

    beforeEach(() => {
        testQueryRepo = new TestMongoQueryRepo(mongoClientMock, 'collectionName', undefined);
    });

    describe('init', () => {
        it('should call createIndex to create an index for id field', async () => {
            await testQueryRepo.init();
            expect(collectionMock.createIndex).toHaveBeenCalledWith({ id: 1 }, { unique: true });
        });

        it('should log a warning message if no indexes are defined', async () => {
            const testQueryRepoWithoutIndexes = new TestMongoQueryRepoWithoutIndexes(
                mongoClientMock,
                'collectionName',
                undefined,
                loggerMock,
            );
            await testQueryRepoWithoutIndexes.init();
            expect(loggerMock.warn).toHaveBeenCalledWith('No indexes defined for collectionName');
        });
    });
});
