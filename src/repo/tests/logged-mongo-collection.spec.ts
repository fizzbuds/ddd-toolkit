import { StrObjectParser } from '../logged-mongo-collection';
import { MongoClient, ObjectId } from 'mongodb';

describe('LoggedMongoCollection', () => {
    describe('StrObjectParser', () => {
        describe('Parse short string', () => {
            it('should return same string', () => {
                expect(StrObjectParser.parse('short string')).toEqual('short string');
            });
        });

        describe('Parse long string', () => {
            it('should return only first 100 characters', () => {
                const longString = 'a'.repeat(200);
                expect(StrObjectParser.parse(longString)).toEqual('a'.repeat(100) + '...(more chars)');
            });
        });

        describe('Parse JS date', () => {
            it('should return ISO string', () => {
                const date = new Date(0);
                expect(StrObjectParser.parse(date)).toEqual('1970-01-01T00:00:00.000Z (Date instance)');
            });
        });

        describe('Parse Mongo ObjectId', () => {
            it('should return a string', () => {
                const objectId = new ObjectId('000000000000000000000000');
                expect(StrObjectParser.parse(objectId)).toEqual('000000000000000000000000 (ObjectId instance)');
            });
        });

        describe('Parse Mongo Session', () => {
            it('should return a string', () => {
                const session = new MongoClient('mongodb://localhost').startSession();

                expect(StrObjectParser.parse(session)).toEqual('(MongoSession instance)');
            });
        });
    });
});
