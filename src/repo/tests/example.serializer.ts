import { ISerializer } from '../serializer.interface';

export type TestAggregate = {
    id: string;
    data: string;
};
export type TestModel = TestAggregate;
export class TestSerializer implements ISerializer<TestAggregate, TestModel> {
    public aggregateToModel(aggregate: TestAggregate): TestAggregate {
        return {
            id: aggregate['id'],
            data: aggregate['data'],
        };
    }

    public modelToAggregate(aggregateModel: TestModel) {
        return { id: aggregateModel.id, data: aggregateModel.data };
    }
}
