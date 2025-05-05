import { MongoBasicRepo } from '../mongo-basic.repo';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

interface TestModel {
    id: string;
    data: string;
}

class TestRepository extends MongoBasicRepo<TestModel> {}

describe('MongoBasicRepo MongoDB Integration', () => {
    let mongodb: MongoMemoryReplSet;
    let mongoClient: MongoClient;
    let basicRepo: MongoBasicRepo<TestModel>;
    const collectionName = 'collectionName';

    beforeAll(async () => {
        mongodb = await MongoMemoryReplSet.create({
            replSet: {
                count: 1,
                dbName: 'test',
                storageEngine: 'wiredTiger',
            },
        });
        mongoClient = new MongoClient(mongodb.getUri());
        await mongoClient.connect();

        basicRepo = new TestRepository(mongoClient, collectionName, undefined, undefined);
        await basicRepo.init();
    });

    afterEach(async () => {
        jest.resetAllMocks();
        await mongoClient.db().collection(collectionName).deleteMany({});
    });

    afterAll(async () => {
        await mongoClient.db().collection(collectionName).drop();
        await mongoClient.close();
        await mongodb.stop();
    });

    describe('Save and Get', () => {
        describe('Given an existing model', () => {
            describe('When saving', () => {
                const id1 = 'id1';
                beforeEach(async () => {
                    await basicRepo.save({ id: id1, data: 'value' });
                });

                it('should be saved', async () => {
                    expect(await basicRepo.getById(id1)).toMatchObject({
                        id: id1,
                        data: 'value',
                    });
                });
            });
        });

        describe('Given a non existing document', () => {
            describe('When getById', () => {
                it('should return null', async () => {
                    expect(await basicRepo.getById('not-existing-id')).toBeNull();
                });
            });

            describe('When getByIdOrThrow', () => {
                it('should throw error', async () => {
                    await expect(() => basicRepo.getByIdOrThrow('not-existing-id')).rejects.toThrow();
                });
            });
        });
    });

    describe('Optimistic Lock', () => {
        describe('Given a saved document', () => {
            const id1 = 'id1';
            beforeEach(async () => {
                await basicRepo.save({ id: id1, data: 'value' });
            });

            describe('When getting from db the aggregate', () => {
                it('should return a document with version 1', async () => {
                    expect(await basicRepo.getById(id1)).toMatchObject({ __version: 1 });
                });
            });

            describe('When saving a new instance with the same id', () => {
                it('should throw due to unique index on id', async () => {
                    const newDocument = { id: id1, data: 'newValue' };
                    await expect(async () => await basicRepo.save(newDocument)).rejects.toThrow('duplicated id');
                });
            });

            describe('When saving a new instance with undefined __version', () => {
                it('should throw due to optimistic locking', async () => {
                    const newDocument = { id: id1, data: 'newValue', __version: undefined };
                    await expect(async () => await basicRepo.save(newDocument)).rejects.toThrow('duplicated id');
                });
            });

            describe('When saving and getting multiple times the document', () => {
                it('should increase the version', async () => {
                    const firstInstance = await basicRepo.getById(id1);

                    if (firstInstance === null) throw new Error('Not found');
                    await basicRepo.save(firstInstance);

                    const secondInstance = await basicRepo.getById(id1);
                    if (secondInstance === null) throw new Error('Not found');
                    await basicRepo.save(secondInstance);

                    const thirdInstance = await basicRepo.getById(id1);
                    if (thirdInstance === null) throw new Error('Not found');
                    expect(thirdInstance).toMatchObject({ __version: 3 });
                });
            });

            describe('When saving an outdated document', () => {
                it('should throw an optimistic locking error', async () => {
                    const firstInstance = await basicRepo.getById(id1);
                    if (firstInstance === null) throw new Error('Not found');

                    const secondInstance = await basicRepo.getById(id1);
                    if (secondInstance === null) throw new Error('Not found');
                    await basicRepo.save(secondInstance);

                    await expect(async () => await basicRepo.save(firstInstance)).rejects.toThrow('optimistic locking');
                });
            });
        });
    });
});
