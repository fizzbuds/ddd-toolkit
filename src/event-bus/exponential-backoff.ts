export interface IExponentialBackoff {
    getDelay(retryCount: number): number;
}

export class ExponentialBackoff implements IExponentialBackoff {
    constructor(private readonly initialDelayMs: number) {}

    public getDelay(retryCount: number): number {
        return Math.floor(this.initialDelayMs * Math.pow(2, retryCount - 1));
    }
}
