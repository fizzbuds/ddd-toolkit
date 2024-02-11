export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const intersection = <T>(a: T[], b: T[]) => a.filter((value) => b.includes(value));

export const difference = <T>(a: T[], b: T[]) => a.filter((value) => !b.includes(value));

export const eventually = async (expectation: () => void, timeout = 5000, interval = 100) => {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
        const checkExpectation = () => {
            try {
                expectation();
                resolve(true);
            } catch (error) {
                if (Date.now() - startTime > timeout) {
                    reject(new Error(`Timed out waiting for expectation to pass within ${timeout}ms`));
                } else {
                    setTimeout(() => checkExpectation(), interval);
                }
            }
        };
        checkExpectation();
    });
};
