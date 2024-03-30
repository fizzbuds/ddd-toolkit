export const waitFor = async (statement: () => void | Promise<void>, timeout = 1000): Promise<void> => {
    const startTime = Date.now();

    let latestStatementError;
    while (true) {
        try {
            await statement();
            return;
        } catch (e) {
            latestStatementError = e;
        }

        if (Date.now() - startTime > timeout) throw latestStatementError;

        await new Promise((resolve) => setTimeout(resolve, 100));
    }
};

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
