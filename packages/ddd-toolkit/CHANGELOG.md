# @fizzbuds/ddd-toolkit

## 0.2.0

### Minor Changes

-   63136b5: Introduced a MongoBasicRepo useful for CRUD needs

## 0.1.12

### Patch Changes

-   8b4c852: fix(local-command-bus): throw on send with unregistered command handler

## 0.1.11

### Patch Changes

-   6985ff0: add mongodb 6

## 0.1.10

### Patch Changes

-   b2b81e8: fix(core): wrong outbox scheduleEvents behaviour with 0 events

## 0.1.9

### Patch Changes

-   a799318: fix(core): wrong behaviour on handlers failing in local-event-bus with publishAndWaitForHandlers method

## 0.1.8

### Patch Changes

-   d6e623b: fix(core): add missing outbox exports

## 0.1.7

### Patch Changes

-   286ec16: remove loggermock exports

## 0.1.6

### Patch Changes

-   26611dc: add logger export

## 0.1.5

### Patch Changes

-   00c5db8: fix(core): wrong optional result type in query

## 0.1.4

### Patch Changes

-   efa24d4: feat(core): add simple query bus

## 0.1.3

### Patch Changes

-   b7f507d: fix(core): missing event bus exports

## 0.1.2

### Patch Changes

-   c9b5375: fix(core): wrong handle return type in ICommandHandler

## 0.1.1

### Patch Changes

-   82c09b4: fix(core): missing command bus exports

## 0.1.0

### Minor Changes

-   a32b38a: feat(core): add outbox to mongo aggregate repo
-   a32b38a: feat(core): add publish with concurrency control in outbox
-   a32b38a: feat(core): add mongo outbox implementation
-   a32b38a: feat(mongo-query-repo): separate mongo-aggregate-repo-with-outbox class

### Patch Changes

-   a32b38a: fix(core): missing scheduledEventIds in mongo aggregate repo with outbox
-   a32b38a: refactor(core): introduce ITerminate and rename outbox dispose
-   a32b38a: refactor(core): add IInit to outbox
-   a32b38a: test(outbox): remove duplication
-   a32b38a: chore: remove generic id since not clean
-   a32b38a: refactor(core): better naming

## 0.0.39

### Patch Changes

-   ffb1238: add getByIdOrThrow to IAggregateRepo

## 0.0.38

### Patch Changes

-   864aed2: typo in core package folder

## 0.0.37

### Patch Changes

-   5caadf9: Add pre publish script

## 0.0.36

### Patch Changes

-   80c004e: fix(mongo-query-repo): warning in case of missing index

## 0.0.35

### Patch Changes

-   ed5eff6: chore: introduce pnpm workspaces
-   ed5eff6: ci: introduce changeset
