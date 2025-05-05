import { MongoAggregateRepo } from '../mongo-aggregate-repo';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { TestAggregate, TestModel, TestSerializer } from './example.serializer';
import { AggregateNotFoundError } from '../../errors';

describe('MongoAggregateRepo MongoDB Integration', () => {
    let mongodb: MongoMemoryReplSet;
    let mongoClient: MongoClient;
    let aggregateRepo: MongoAggregateRepo<TestAggregate, TestModel>;
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

        aggregateRepo = new MongoAggregateRepo<TestAggregate, TestModel>(
            new TestSerializer(),
            mongoClient,
            collectionName,
            undefined,
            undefined,
            undefined,
        );
        await aggregateRepo.init();
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
        describe('Given an existing aggregate', () => {
            describe('When saving', () => {
                const id1 = 'id1';
                beforeEach(async () => {
                    await aggregateRepo.save({ id: id1, data: 'value' });
                });

                it('should be saved into aggregate write model', async () => {
                    expect(await aggregateRepo.getById(id1)).toMatchObject({
                        id: id1,
                        data: 'value',
                    });
                });
            });
        });

        describe('Given an un-existing aggregate', () => {
            describe('When getById', () => {
                it('should return null', async () => {
                    expect(await aggregateRepo.getById('not-existing-id')).toBeNull();
                });
            });

            describe('When getByIdOrThrow', () => {
                it('should throw AggregateNotFoundError', async () => {
                    await expect(() => aggregateRepo.getByIdOrThrow('not-existing-id')).rejects.toThrowError(
                        AggregateNotFoundError,
                    );
                });
            });
        });
    });

    describe('Optimistic Lock', () => {
        describe('Given a saved aggregate', () => {
            const id1 = 'id1';
            beforeEach(async () => {
                await aggregateRepo.save({ id: id1, data: 'value' });
            });

            describe('When getting from db the aggregate', () => {
                it('should return an aggregate with version 1', async () => {
                    expect(await aggregateRepo.getById(id1)).toMatchObject({ __version: 1 });
                });
            });

            describe('When saving a new instance with the same id', () => {
                it('should throw due to unique index on id', async () => {
                    const newAggregate = { id: id1, data: 'newValue' };
                    await expect(async () => await aggregateRepo.save(newAggregate)).rejects.toThrowError(
                        'duplicated id',
                    );
                });
            });

            describe('When saving a new instance with undefined __version', () => {
                it('should throw due to optimistic locking', async () => {
                    const newAggregate = { id: id1, data: 'newValue', __version: undefined };
                    await expect(async () => await aggregateRepo.save(newAggregate)).rejects.toThrowError(
                        'duplicated id', // FIXME more precise error for optimistic lock
                    );
                });
            });

            describe('When saving and getting multiple times the aggregate', () => {
                it('should increase the aggregate version', async () => {
                    const firstInstance = await aggregateRepo.getById(id1);
                    if (firstInstance === null) throw new Error('Not found');
                    await aggregateRepo.save(firstInstance);

                    const secondInstance = await aggregateRepo.getById(id1);
                    if (secondInstance === null) throw new Error('Not found');
                    await aggregateRepo.save(secondInstance);

                    const thirdInstance = await aggregateRepo.getById(id1);
                    if (thirdInstance === null) throw new Error('Not found');
                    expect(thirdInstance).toMatchObject({ __version: 3 });
                });
            });

            describe('When saving an outdated aggregate', () => {
                it('should throw an optimistic locking error', async () => {
                    const firstInstance = await aggregateRepo.getById(id1);
                    if (firstInstance === null) throw new Error('Not found');

                    const secondInstance = await aggregateRepo.getById(id1);
                    if (secondInstance === null) throw new Error('Not found');
                    await aggregateRepo.save(secondInstance);

                    await expect(async () => await aggregateRepo.save(firstInstance)).rejects.toThrowError(
                        'optimistic locking',
                    ); // FIXME more precise error for optimistic lock
                });
            });
        });
    });
});
