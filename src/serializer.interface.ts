export interface ISerializer<A, AM> {
    aggregateToModel: (aggregate: A) => AM;
    modelToAggregate: (aggregateModel: AM) => A;
}
