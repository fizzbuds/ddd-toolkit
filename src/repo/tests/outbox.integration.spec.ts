import { Outbox, OUTBOX_COLLECTION_NAME } from '../../outbox';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

type Job = {
    foo: string;
};

describe('Outbox integration', () => {
    let mongodb: MongoMemoryReplSet;
    let mongoClient: MongoClient;

    const executeJobFnMock = jest.fn();

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
    });

    beforeEach(async () => {
        jest.resetAllMocks();
    });

    afterEach(async () => {
        await mongoClient.db().collection(OUTBOX_COLLECTION_NAME).deleteMany({});
    });

    afterAll(async () => {
        await mongoClient.close();
        await mongodb.stop();
    });

    const job = { foo: 'bar' };

    describe('Given a single host', () => {
        let outbox: Outbox<Job>;

        beforeEach(() => {
            outbox = new Outbox('test', mongoClient, executeJobFnMock);
        });

        describe('When schedule a job', () => {
            beforeEach(async () => {
                await outbox.scheduleJob(job);
            });

            it('should be save job as scheduled', async () => {
                expect(await outbox.getCollection().findOne({ status: 'scheduled' })).toMatchObject({
                    scheduledBy: 'test',
                });
            });
        });

        describe('Given some scheduled jobs', () => {
            const scheduledJobsCount = 3;

            beforeEach(async () => {
                await runNTimes(() => outbox.scheduleJob(job), scheduledJobsCount);
            });

            describe('Given a resolving execute function', () => {
                beforeEach(() => executeJobFnMock.mockResolvedValue(null));

                describe('When sending all scheduled jobs', () => {
                    beforeEach(async () => await outbox.executeAllScheduledJobs());

                    it('should send all scheduled jobs', async () => {
                        expect(executeJobFnMock).toBeCalledWith(job);
                        expect(executeJobFnMock).toBeCalledTimes(scheduledJobsCount);
                    });

                    it('should mark all scheduled jobs as sent', async () => {
                        expect(await outbox.getCollection().countDocuments({ status: { $ne: 'executed' } })).toBe(0);
                    });

                    it('should add executedAt to all scheduled jobs', async () => {
                        expect(await outbox.getCollection().countDocuments({ executedAt: { $ne: null } })).toBe(0);
                    });
                });
            });

            describe('Given a partial-resolving execute function', () => {
                beforeEach(() => {
                    executeJobFnMock
                        .mockResolvedValueOnce(null)
                        .mockRejectedValueOnce(null)
                        .mockResolvedValueOnce(null);
                });

                describe('When execute all scheduled jobs', () => {
                    beforeEach(async () => await outbox.executeAllScheduledJobs());

                    it('should mark only a few jobs as sent ', async () => {
                        expect(await outbox.getCollection().countDocuments({ status: { $ne: 'executed' } })).toBe(1);
                    });
                });
            });
        });

        describe('Given an active outbox watching', () => {
            beforeEach(async () => {
                void outbox.startOutboxWatching();
            });

            describe('When an job is scheduled', () => {
                it('should execute the scheduled job', async () => {
                    await outbox.scheduleJob(job);
                    await sleep(1); // Needed to wait for the change stream to be triggered
                    expect(executeJobFnMock).toBeCalledWith(job);
                });
            });
        });
    });

    describe('Given multiple hosts', () => {
        let outbox1: Outbox<Job>;
        let outbox2: Outbox<Job>;

        beforeEach(() => {
            outbox1 = new Outbox('test-1', mongoClient, executeJobFnMock);
            outbox2 = new Outbox('test-2', mongoClient, executeJobFnMock);
        });

        describe('Given some scheduled jobs', () => {
            const scheduledJobsCount = 3;

            beforeEach(async () => {
                await runNTimes(() => outbox1.scheduleJob(job), scheduledJobsCount);
                await runNTimes(() => outbox2.scheduleJob(job), scheduledJobsCount);
            });

            describe('When execute all scheduled jobs', () => {
                beforeEach(async () => {
                    await outbox1.executeAllScheduledJobs();
                });

                it('should execute all jobs', async () => {
                    expect(await outbox1.getCollection().countDocuments({ status: { $ne: 'executed' } })).toBe(0);
                });
            });

            describe('When execute all jobs scheduled by me', () => {
                beforeEach(async () => {
                    await outbox1.executeAllJobsScheduledByMe();
                });

                it('should execute only some jobs', async () => {
                    expect(await outbox1.getCollection().countDocuments({ status: { $ne: 'executed' } })).toBe(3);
                });
            });
        });
    });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runNTimes = async (asyncFn: () => Promise<void>, n: number) => {
    for (const _ of Array.from({ length: n })) {
        await asyncFn();
    }
};
