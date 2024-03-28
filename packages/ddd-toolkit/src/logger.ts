export interface ILogger {
    log: (message: string, ...optionalParams: any[]) => void;
    debug: (message: string, ...optionalParams: any[]) => void;
    warn: (message: string, ...optionalParams: any[]) => void;
    error: (message: string, ...optionalParams: any[]) => void;
}

export const loggerMock: ILogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
