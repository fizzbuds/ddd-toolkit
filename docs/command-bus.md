# Command bus

## Intro

A command bus is a fundamental architectural pattern used in software development, particularly in the context of
building applications following the Command Query Responsibility Segregation (CQRS) paradigm.

Acting as a mediator between the application's components, the command bus receives commands to perform from
various parts of the system and routes them to the appropriate handlers or command handlers responsible for executing
the requested operations. This abstraction simplifies the communication flow within the application, decoupling the
sender of the command from its execution logic. By centralizing command processing, the command bus promotes a cleaner
and more maintainable codebase, enhancing modularity and scalability in complex software systems.

## Local Command Bus

Ddd toolkit provides a simple in-memory implementation of a command bus.

- `register`: register a command handler for a specific command.
- `send`: executes a command. Resolves immediately, without waiting for the effective execution of the command.
- `sendSync`: executes a command. Resolves when the effective execution of the command is completed.

::: info
The `send` method implements a retry mechanism by default. This means that if the command handler throws an error, the
command bus will retry to execute the command handler until the maximum number of retries is reached.
:::

::: warning PRAGMATIC ALERT 📣
As mentioned above, the greatest benefit of using a command bus over direct method calls is to centralise and
standardise.
We wanted to include the send method (in addition to sendSync) because in some contexts there is a risk of coupling to
synchronous commands. Send allows us to develop our application without assuming that commands are local (and thus can
return data / can be synchronous).

In general, when asynchronicity is introduced into a system, complexity explodes.

:::

## Basic usage

Define CommandBus

```typescript
import { LocalCommandBus } from '@fizzbuds/ddd-toolkit';


export class CommandBus extends LocalCommandBus {
    constructor() {
        super(new Logger(CommandBus.name));
    }
}
```

Define a command

```typescript
type DeleteMemberCommandPayload = { memberId: string };

class DeleteMemberCommand extends Command<DeleteMemberCommandPayload> {
    constructor(public readonly payload: DeleteMemberCommandPayload) {
        super(payload);
    }
}

```

Define a command handler

```typescript
import { LocalCommandBus } from '@fizzbuds/ddd-toolkit';


export class DeleteCommandHandler implements ICommandHandler<DeleteMemberCommand> {
    async handle({ payload }: DeleteMemberCommand) {
        // Delete member logic
    }
}
```

Try it out

```typescript
const commandBus = new CommandBus();

commandBus.registerHandler(DeleteMemberCommand, new DeleteCommandHandler())


await commandBus.send(new DeleteMemberCommand({ memberId: '123' }));

```







