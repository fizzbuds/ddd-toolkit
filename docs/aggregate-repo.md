# Aggregate repo

## Intro

In Domain-Driven Design (DDD), an aggregate is a cluster of domain objects that can be treated as a single unit. It acts
as a transactional boundary, ensuring consistency and integrity within the domain model. Aggregates encapsulate the
invariant rules that govern the interactions among their constituent objects, allowing for a clear and manageable domain
structure. By defining boundaries around related entities, aggregates promote better organization, scalability, and
maintainability of the domain model, facilitating easier development and evolution of complex systems.

## Aggregate

An aggregate is a plan javascript class. Here is an example of a MembershipFeesAggregate:

```typescript
class ShoppingCartItemEntity {
    constructor(public readonly productId: string, public readonly quantity: number) {
    }
}

class ShoppingCartAggregate {
    constructor(
        public readonly shoppingCartId: string,
        public readonly maxItemsAllowed: number,
        public readonly items: ShoppingCartItemEntity[] = [],
    ) {
    }

    static createSmallEmpty(shoppingCartId: string): ShoppingCartAggregate {
        return new ShoppingCartAggregate(shoppingCartId, 5);
    }

    addItem(item: ShoppingCartItemEntity): void {
        const totalQuantity = this.items.reduce((acc, currentItem) => acc + currentItem.quantity, 0);
        if (totalQuantity + item.quantity > this.maxItemsAllowed) {
            throw new Error(`Exceeded maximum items allowed in the shopping cart (${this.maxItemsAllowed})`);
        }
        this.items.push(item);
    }

    removeItem(productId: string): void {
        const index = this.items.findIndex((item) => item.productId === productId);
        if (index !== -1) this.items.splice(index, 1);
    }
}
```

A few observations

- Use ubiquitous language
- Use static methods to create the aggregate
- Use different classes for entity or value object.

## Serializer

The aggregate is saved on a database. The serializer converts the aggregate to its db representation.

```typescript
import { ISerializer } from '@fizzbuds/ddd-toolkit';

// ShoppingCartAggregateModel can be a mongoose schema or a dynamodb table
type ShoppingCartAggregateModel = {
    shoppingCartId: string;
    maxItemsAllowed: number;
    items: { productId: string; quantity: number }[];
};

export class ShoppingCartAggregateSerializer implements ISerializer<ShoppingCartAggregate, ShoppingCartAggregateModel> {
    modelToAggregate(model: ShoppingCartAggregateModel): ShoppingCartAggregate {
        return new ShoppingCartAggregate(
            model.shoppingCartId,
            model.maxItemsAllowed,
            model.items.map(({ productId, quantity }) => new ShoppingCartItemEntity(productId, quantity)),
        );
    }

    aggregateToModel(aggregate: ShoppingCartAggregate): ShoppingCartAggregateModel {
        return {
            shoppingCartId: aggregate.shoppingCartId,
            maxItemsAllowed: aggregate.maxItemsAllowed,
            items: aggregate.items.map(({ productId, quantity }) => ({ productId, quantity })),
        };
    }
}

```

## Mongo aggregate repo

```typescript
import { MongoAggregateRepo } from '@fizzbuds/ddd-toolkit';

export class ShoppingCartAggregateRepo extends MongoAggregateRepo<
    ShoppingCartAggregate,
    ShoppingCartAggregateModel
> {
    private static logger = new Logger(ShoppingCartAggregateRepo.name);

    constructor(mongoClient: MongoClient) {
        super(
            new ShoppingCartAggregateSerializer(),
            mongoClient,
            'shopping_carts',
            undefined,
            undefined,
            MemberRegistrationAggregateRepo.logger,
        );
    }
}
```

## Basic usage

```typescript
const mongoClient = await (new MongoClient('mongodb://localhost:27017')).connect()
const shoppingCartAggregateRepo = new ShoppingCartAggregateRepo(mongoClient);

const shoppingCart = ShoppingCartAggregate.createSmallEmpty('foo-cart-id');
await shoppingCartAggregateRepo.save(shoppingCart);

const retrievedShoppingCart = await shoppingCartAggregateRepo.getById('foo-cart-id');
retrievedShoppingCart.addItem(new ShoppingCartItemEntity('product-1', 1));
await shoppingCartAggregateRepo.save(retrievedShoppingCart);

```

## Feature: optimistic lock 🔐

### Intro

An optimistic lock is a concurrency control mechanism used in computer systems to manage access to shared resources,
such as databases or files, in a way that promotes concurrency and prevents conflicts between multiple users or
processes.

Unlike pessimistic locking, where resources are locked from the moment they are accessed until they are
released, optimistic locking assumes that conflicts between users are rare. Instead of immediately locking a resource
upon access, optimistic locking allows multiple users to access the resource concurrently and only checks for conflicts
at the time of updating. If a conflict is detected, typically due to another user modifying the resource since it was
last accessed, the system can resolve the conflict by either rejecting the update or merging the changes.

Optimistic
locking promotes scalability and performance in systems with low contention, making it a preferred choice for many
modern applications.

### Example

```typescript

const cartInstance1 = await shoppingCartAggregateRepo.getById('foo-cart-id');

const cartInstance2 = await shoppingCartAggregateRepo.getById('foo-cart-id');
await shoppingCartAggregateRepo.save(cartInstance2);

// This will throw an error ❌
await shoppingCartAggregateRepo.save(cartInstance1);
```

## Feature: save hook 🪝

### Intro

Separating the read model from the write model in many cases is very useful.
If the aggregate is optimised to represent bounded transactionality and to coordinate entities and value objects, a
read model is a model optimised for reading data.

Again from a pragmatic point of view, the first step in obtaining a read model is to compose the read model in
transaction when saving the write model (aggregate).

Ddd toolkit provides a hook mechanism to allow you to compose the read model when saving the write model.

::: warning
The hook is called in the same transaction as the write model save.
This implies that with this method the read model **must use the same database** as the write model
:::

### Example

```typescript
type CartsReadModel = {
    shoppingCartId: string;
    totalItems: number;
};

class CartsReadModelRepo {
    private readonly collection: Collection<CartsReadModel>;

    constructor(mongoClient: MongoClient) {
        this.collection = mongoClient.db().collection('carts_read_model');
    }

    // 👇🏽 upsert the read model on each write model save
    async save(model: CartsReadModel, session: ClientSession) {
        await this.collection.updateOne(
            { shoppingCartId: model.shoppingCartId },
            { $set: { totalItems: model.totalItems } },
            { upsert: true, session },
        );
    }
}


class CartsRepoHook implements IRepoHooks<ShoppingCartAggregateModel> {

    constructor(private readonly cartsReadModelRepo: CartsReadModelRepo) {
    }

    public async onSave(aggregateModel: ShoppingCartAggregateModel, clientSession: ClientSession) {
        const cartReadModel = this.composeReadModel(aggregateModel);

        await this.cartsReadModelRepo.save(cartReadModel, session);
    }

    private composeReadModel(aggregateModel: ShoppingCartAggregateModel): CartsReadModel {
        return {
            shoppingCartId: aggregateModel.id,
            totalItems: this.items.reduce((acc, currentItem) => acc + currentItem.quantity, 0)
        };
    }
}


export class ShoppingCartAggregateRepo extends MongoAggregateRepo<
    ShoppingCartAggregate,
    ShoppingCartAggregateModel
> {
    private static logger = new Logger(ShoppingCartAggregateRepo.name);

    constructor(mongoClient: MongoClient, cartsRepoHook: CartsRepoHook) {
        super(
            new ShoppingCartAggregateSerializer(),
            mongoClient,
            'shopping_carts',
            undefined,
            cartsRepoHook, // 👈🏽 pass the hook instance to the aggregate repo
            MemberRegistrationAggregateRepo.logger,
        );
    }
}



```
