import { collectionMock, mongoClientMock } from './mongo.mock';
import { MongoQueryRepo } from '../mongo-query-repo';
import { loggerMock } from '../../logger';

interface TestQueryModel {
    id: string;
    otherId: string;
}

class TestMongoQueryRepo extends MongoQueryRepo<TestQueryModel> {
    protected readonly indexes = [{ indexSpec: { id: 1 }, options: { unique: true } }];
}

class TestMongoQueryRepoWithoutIndexes extends MongoQueryRepo<TestQueryModel> {
    protected readonly indexes = [];
}

class TestMongoQueryRepoWithMultipleIndexes extends MongoQueryRepo<TestQueryModel> {
    protected readonly indexes: (
        | { indexSpec: { id: number }; options: { unique: boolean } }
        | {
              indexSpec: { otherId: number };
              options: { unique: boolean };
          }
    )[] = [
        { indexSpec: { id: 1 }, options: { unique: true } },
        { indexSpec: { otherId: 1 }, options: { unique: true } },
    ];
}

describe('MongoQueryRepo', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('init', () => {
        it('should call createIndex to create an index for id field', async () => {
            const testQueryRepo = new TestMongoQueryRepo(mongoClientMock, 'collectionName', undefined);

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
            expect(collectionMock.createIndex).not.toHaveBeenCalled();
        });

        it('should call createIndex multiple times if there are multiple indexes', async () => {
            const testQueryRepoWithMultipleIndexes = new TestMongoQueryRepoWithMultipleIndexes(
                mongoClientMock,
                'collectionName',
                undefined,
            );

            await testQueryRepoWithMultipleIndexes.init();

            expect(collectionMock.createIndex).toHaveBeenCalledTimes(2);
            expect(collectionMock.createIndex).toHaveBeenCalledWith({ id: 1 }, { unique: true });
            expect(collectionMock.createIndex).toHaveBeenCalledWith({ otherId: 1 }, { unique: true });
        });
    });
});
