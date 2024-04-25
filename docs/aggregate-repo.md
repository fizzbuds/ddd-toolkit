# Aggregate repo

## Aggregate

In Domain-Driven Design (DDD), an aggregate is a cluster of domain objects that can be treated as a single unit. It acts
as a transactional boundary, ensuring consistency and integrity within the domain model. Aggregates encapsulate the
invariant rules that govern the interactions among their constituent objects, allowing for a clear and manageable domain
structure. By defining boundaries around related entities, aggregates promote better organization, scalability, and
maintainability of the domain model, facilitating easier development and evolution of complex systems.

### Aggregate

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

### Serializer

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

### Mongo aggregate repo

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
            MemberRegistrationAggregateRepo.logger,
        );
    }
}
```

### Usage

```typescript
const mongoClient = await (new MongoClient('mongodb://localhost:27017')).connect()
const shoppingCartAggregateRepo = new ShoppingCartAggregateRepo(mongoClient);

const shoppingCart = ShoppingCartAggregate.createSmallEmpty('foo-cart-id');
await shoppingCartAggregateRepo.save(shoppingCart);

const retrievedShoppingCart = await shoppingCartAggregateRepo.getById('foo-cart-id');
retrievedShoppingCart.addItem(new ShoppingCartItemEntity('product-1', 1));
await shoppingCartAggregateRepo.save(retrievedShoppingCart);

```