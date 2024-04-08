# @fizzbuds/ddd-toolkit

## 0.1.1

### Patch Changes

- 82c09b4: fix(core): missing command bus exports

## 0.1.0

### Minor Changes

- a32b38a: feat(core): add outbox to mongo aggregate repo
- a32b38a: feat(core): add publish with concurrency control in outbox
- a32b38a: feat(core): add mongo outbox implementation
- a32b38a: feat(mongo-query-repo): separate mongo-aggregate-repo-with-outbox class

### Patch Changes

- a32b38a: fix(core): missing scheduledEventIds in mongo aggregate repo with outbox
- a32b38a: refactor(core): introduce ITerminate and rename outbox dispose
- a32b38a: refactor(core): add IInit to outbox
- a32b38a: test(outbox): remove duplication
- a32b38a: chore: remove generic id since not clean
- a32b38a: refactor(core): better naming

## 0.0.39

### Patch Changes

- ffb1238: add getByIdOrThrow to IAggregateRepo

## 0.0.38

### Patch Changes

- 864aed2: typo in core package folder

## 0.0.37

### Patch Changes

- 5caadf9: Add pre publish script

## 0.0.36

### Patch Changes

- 80c004e: fix(mongo-query-repo): warning in case of missing index

## 0.0.35

### Patch Changes

- ed5eff6: chore: introduce pnpm workspaces
- ed5eff6: ci: introduce changeset
