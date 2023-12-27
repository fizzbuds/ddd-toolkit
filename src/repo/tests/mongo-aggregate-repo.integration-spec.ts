import { MongoAggregateRepo } from '../mongo-aggregate-repo';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { TestAggregate, TestModel, TestSerializer } from './example.serializer';

describe('MongoAggregateRepo MongoDB Integration', () => {
    let mongodb: MongoMemoryReplSet;
    let aggregateRepo: MongoAggregateRepo<TestAggregate, TestModel>;

    beforeAll(async () => {
        mongodb = await MongoMemoryReplSet.create({
            replSet: {
                count: 1,
                dbName: 'test',
                storageEngine: 'wiredTiger',
            },
        });
        const mongoClient = new MongoClient(mongodb.getUri());
        await mongoClient.connect();

        aggregateRepo = new MongoAggregateRepo<TestAggregate, TestModel>(
            new TestSerializer(),
            mongoClient,
            'collectionName',
        );
        await aggregateRepo.onModuleInit();
    });

    afterEach(async () => {
        jest.resetAllMocks();
    });

    afterAll(async () => {
        await mongodb.stop();
    });

    describe('When saving an aggregate', () => {
        const id1 = 'id1';
        beforeEach(async () => {
            await aggregateRepo.save({ id: id1, data: 'value' });
        });

        it('should be saved into write model', async () => {
            expect(await aggregateRepo.getById(id1)).toMatchObject({
                id: id1,
                data: 'value',
            });
        });
    });
    //
    // describe('Given a created example', () => {
    //     let exampleId: ExampleId;
    //
    //     beforeEach(async () => {
    //         exampleId = await commands.createCmd();
    //     });
    //
    //     describe('When add-name', () => {
    //         it('should save name into read model', async () => {
    //             await commands.addNameCmd(exampleId as unknown as GenericId, 'Foo');
    //
    //             expect(await queries.getOneExampleQuery(exampleId.toString())).toMatchObject({ name: 'Foo' });
    //         });
    //     });
    // });
    //
    // describe('Optimistic Lock', () => {
    //     describe('Given a created aggregate', () => {
    //         let exampleId: ExampleId;
    //
    //         beforeEach(async () => {
    //             exampleId = await commands.createCmd();
    //         });
    //
    //         describe('When getting from db the aggregate', () => {
    //             it('should return an aggregate with version 1', async () => {
    //                 expect(await aggregateRepo.getById(exampleId)).toMatchObject({ __version: 1 });
    //             });
    //         });
    //
    //         describe('When creating a new instance with the same id', () => {
    //             it('should throw due to unique index on id', async () => {
    //                 const newAggregate = new ExampleAggregateRoot(exampleId);
    //                 await expect(async () => await aggregateRepo.save(newAggregate)).rejects.toThrowError(
    //                     'duplicated id',
    //                 );
    //             });
    //         });
    //
    //         describe('When saving an aggregate with undefined __version', () => {
    //             it('should throw due to optimistic locking', async () => {
    //                 const aggregate = await aggregateRepo.getById(exampleId);
    //                 if (aggregate === null) throw new Error('Example not found');
    //                 aggregate.addName('Foo');
    //                 aggregate.__version = undefined!;
    //
    //                 await expect(async () => await aggregateRepo.save(aggregate)).rejects.toThrowError('duplicated id');
    //             });
    //         });
    //
    //         describe('When multiple saved aggregate changes', () => {
    //             it('should increase the aggregate version', async () => {
    //                 const firstInstance = await aggregateRepo.getById(exampleId);
    //                 if (firstInstance === null) throw new Error('Example not found');
    //                 firstInstance.addName('Foo');
    //                 await aggregateRepo.save(firstInstance);
    //
    //                 const secondInstance = await aggregateRepo.getById(exampleId);
    //                 if (secondInstance === null) throw new Error('Example not found');
    //                 secondInstance.addName('Bar');
    //                 await aggregateRepo.save(secondInstance);
    //
    //                 const thirdInstance = await aggregateRepo.getById(exampleId);
    //                 if (thirdInstance === null) throw new Error('Example not found');
    //                 expect(thirdInstance).toMatchObject({ __version: 3 });
    //             });
    //         });
    //
    //         describe('When saving an outdated aggregate', () => {
    //             it('should throw an optimistic locking error', async () => {
    //                 const firstInstance = await aggregateRepo.getById(exampleId);
    //                 if (firstInstance === null) throw new Error('Example not found');
    //                 firstInstance.addName('Foo');
    //
    //                 const secondInstance = await aggregateRepo.getById(exampleId);
    //                 if (secondInstance === null) throw new Error('Example not found');
    //                 secondInstance.addName('Bar');
    //                 await aggregateRepo.save(secondInstance);
    //
    //                 await expect(async () => await aggregateRepo.save(firstInstance)).rejects.toThrowError(
    //                     'optimistic locking',
    //                 );
    //             });
    //         });
    //     });
    // });
});
