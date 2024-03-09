import { ExponentialBackoff } from './exponential-backoff';

describe('ExponentialBackoff', () => {
    let exponentialBackoff: ExponentialBackoff;
    const initialDelayMs = 1000;

    beforeEach(() => {
        exponentialBackoff = new ExponentialBackoff(initialDelayMs);
    });

    describe('When get delay', () => {
        it('Should return initial delay when retryCount is 1', () => {
            expect(exponentialBackoff.getDelay(1)).toBe(initialDelayMs);
        });

        it('Should return initial delay * 2 when retryCount is 2', () => {
            expect(exponentialBackoff.getDelay(2)).toBe(initialDelayMs * 2);
        });

        it('Should return initial delay * 4 when retryCount is 3', () => {
            expect(exponentialBackoff.getDelay(3)).toBe(initialDelayMs * 4);
        });
    });
});
