import { ILogger } from '../logger';
import { ICommand, ICommandBus, ICommandClass, ICommandHandler } from './command-bus.interface';
import { ExponentialBackoff, IRetryMechanism } from '../event-bus/exponential-backoff';
import { inspect } from 'util';

export class LocalCommandBus implements ICommandBus {
    private readonly retryMechanism: IRetryMechanism;

    private handlers: { [key: string]: ICommandHandler<ICommand<unknown>> } = {};

    constructor(
        private logger: ILogger,
        private readonly retryMaxAttempts = 5,
        retryInitialDelay = 100,
    ) {
        this.retryMechanism = new ExponentialBackoff(retryInitialDelay);
    }

    public register<C extends ICommand<unknown>>(command: ICommandClass<C>, handler: ICommandHandler<C>): void {
        if (this.handlers[command.name]) throw new Error(`Command ${command.name} is already registered`);
        this.handlers[command.name] = handler;
    }

    public async send<C extends ICommand<unknown>>(command: C): Promise<void> {
        const handler = this.handlers[command.name] as ICommandHandler<C>;
        if (!handler) {
            this.logger.warn(`No handler found for ${command.name}`);
            return;
        }

        void this.handleCommand(command, handler);
    }

    private async handleCommand<C extends ICommand<unknown>>(command: C, handler: ICommandHandler<C>, attempt = 0) {
        try {
            await handler.handle(command);
        } catch (error) {
            if (attempt < this.retryMaxAttempts) {
                const nextAttempt = attempt + 1;
                const delay = this.retryMechanism.getDelay(nextAttempt);
                this.logger.warn(
                    `${handler.constructor.name} failed to handle ${command.name} command. Attempt ${nextAttempt}/${this.retryMaxAttempts}. Delaying for ${delay}ms.`,
                );
                setTimeout(() => this.handleCommand(command, handler, nextAttempt), delay);
                return;
            }
            this.logger.error(
                `${handler.constructor.name} failed to handle ${command.name} command due to ${inspect(error)}`,
            );
        }
    }
}
