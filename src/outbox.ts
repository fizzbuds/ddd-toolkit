import { hostname as osHostName } from 'os';
import { ClientSession, Collection, MongoClient, ObjectId } from 'mongodb';
import { ILogger } from './repo/logger';

type OutBoxModel = {
    _id: string;
    scheduledBy: string;
    job: any;
    scheduledAtISO: string;
    status: 'scheduled' | 'executed';
    executedAtISO?: string;
};

export const OUTBOX_COLLECTION_NAME = 'outbox';

export class Outbox<TJob> {
    private readonly collection: Collection<OutBoxModel>;

    constructor(
        private readonly hostname = osHostName(),
        mongoClient: MongoClient,
        private readonly executeJobFn: (job: TJob) => Promise<void>,
        private readonly logger: ILogger = console,
    ) {
        this.collection = mongoClient.db().collection(OUTBOX_COLLECTION_NAME);
    }

    public async scheduleJob(job: TJob, session?: ClientSession) {
        await this.collection.insertOne(
            {
                _id: new ObjectId().toString(),
                job,
                status: 'scheduled',
                scheduledBy: this.hostname,
                scheduledAtISO: new Date().toISOString(),
            },
            { session },
        );
        this.logger.debug(`Scheduled job ${JSON.stringify(job)} for host ${this.hostname}`);
    }

    public async executeAllScheduledJobs() {
        const scheduledJobs = await this.collection.find({ status: 'scheduled' }).toArray();
        this.logger.debug(`Found ${scheduledJobs.length} jobs scheduled by all hosts`);

        for (const scheduledJob of scheduledJobs) await this.executeJob(scheduledJob);
    }

    public async executeAllJobsScheduledByMe() {
        const scheduledJobs = await this.collection.find({ status: 'scheduled', scheduledBy: this.hostname }).toArray();
        this.logger.debug(`Found ${scheduledJobs.length} jobs scheduled by ${this.hostname}`);

        for (const scheduledJob of scheduledJobs) await this.executeJob(scheduledJob);
    }

    public async startOutboxWatching() {
        this.logger.debug(`Starting watching. Host ${this.hostname}`);
        const changeStream = this.collection.watch([{ $match: { 'fullDocument.scheduledBy': this.hostname } }]);
        for await (const change of changeStream) {
            await this.executeJob((change as any).fullDocument as OutBoxModel);
        }
    }

    public getCollection() {
        return this.collection;
    }

    private async executeJob(outBoxModel: OutBoxModel) {
        try {
            await this.executeJobFn(outBoxModel.job);
            await this.collection.updateOne(
                { _id: outBoxModel._id },
                {
                    $set: {
                        status: 'executed',
                        executedAtISO: new Date().toISOString(),
                    },
                },
            );
        } catch (e) {
            this.logger.warn(`Failed to execute job ${JSON.stringify(outBoxModel.job)}`);
        }
    }
}
