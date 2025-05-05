import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { TestAggregate, TestModel, TestSerializer } from './example.serializer';
import { MongoOutbox } from '../../outbox/mongo-outbox';
import { IOutbox } from '../../outbox/outbox.interface';
import { waitFor } from '../../utils';
import { Event } from '../../event-bus/event';
import { MongoAggregateRepoWithOutbox } from '../mongo-aggregate-repo-with-outbox';

describe('MongoAggregateRepo MongoDB Integration', () => {
    let mongodb: MongoMemoryReplSet;
    let mongoClient: MongoClient;
    let aggregateRepo: MongoAggregateRepoWithOutbox<TestAggregate, TestModel>;
    let outbox: IOutbox;
    const collectionName = 'collectionName';

    const EventBusPublishMock = jest.fn();

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

        outbox = new MongoOutbox(mongoClient, undefined, async (events) => {
            await EventBusPublishMock(events);
        });

        aggregateRepo = new MongoAggregateRepoWithOutbox<TestAggregate, TestModel>(
            new TestSerializer(),
            mongoClient,
            collectionName,
            outbox,
            undefined,
            undefined,
            undefined,
        );
        await aggregateRepo.init();
        await outbox.init();
    });

    afterEach(async () => {
        jest.resetAllMocks();
        await mongoClient.db().collection(collectionName).deleteMany({});
    });

    afterAll(async () => {
        await outbox.terminate();
        await mongoClient.db().collection(collectionName).drop();
        await mongoClient.close();
        await mongodb.stop();
    });

    describe('Outbox', () => {
        class FooEvent extends Event<{ foo: string }> {
            constructor(public readonly payload: { foo: string }) {
                super(payload);
            }
        }

        describe('When saveAndPublishEvents is called', () => {
            it('should publish the events', async () => {
                const aggregate = { id: 'foo-id', data: 'value' };
                const events = [new FooEvent({ foo: 'bar' })];
                await aggregateRepo.saveAndPublish(aggregate, events);
                await waitFor(() => {
                    expect(EventBusPublishMock).toBeCalledWith(events);
                });
            });
        });
    });
});
