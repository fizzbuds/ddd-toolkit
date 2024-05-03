# Getting started

## Domain driven design

Domain-Driven Design (DDD) improves software by emphasizing understanding the problem domain and modeling it directly
within the software. This approach enhances communication, promotes modular design, and encourages iterative
development, leading to higher quality, more maintainable, and adaptable software systems.

## Motivation

For the inexperienced, building an application with DDD principles is not easy. The Web offers us many resources, and
navigating through them is not so simple.
We ran into complex implementations that created many problems for us and, above all, were not necessary for our
situation.

We decided to collect in this library the components of the tactical DDD for which we experienced a better cost-benefit
ratio.

We are well aware that the perfect solution does not exist, but these components provide an excellent starting point for
building an application that fully respects the principles of tactical DDD.

## Installation

::: warning
The idea is that the core package contains only the basic interfaces and implementations.

Additional packages will allow to install different implementations (repo with postgres, bus with rabbit etc etc)

At the current state however it contains the implementation for **mongodb**.
:::

```bash
pnpm install @fizzbuds/ddd-toolkit mongodb@5

```

At this time, the ddd-toolkit package offers the following features out of the box:

- **Aggregate repo** with _serialization_, _optimistic lock_, and optionally _outbox pattern_
- **Command bus** with in-memory implementation
- **Event bus** with in-memory implementation
- **Query bus** with in-memory implementation
