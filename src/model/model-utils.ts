import { Database, OrderDirection, TableType, and, col, eqCol as eqCol, gt } from "crud";
import { IModelObject } from "./model.js";
import { User, TUsers, Group, TGroups, TGroupUsers, GroupUser } from "../utils/acl.js";
import { PrimaryKey } from "./model-postgres.js";

const DOCUMENT_STORAGE_ROOT = process.env.DOCUMENT_STORAGE_ROOT!;

type TT<T extends IModelObject> = TableType<T>;

// resources have a db trigger. this trigger has not run before insertReturning gets its return data
// so we do fetch in two steps
async function resourceCreate<T extends IModelObject>(db: Database, tableType: TT<T>, template: T): Promise<T> {
    let documentId = await db.table(tableType)
        .insertReturning<T, { id: PrimaryKey }>(template)
        .first();
    return (await db.table(tableType)
        .where(eqCol(tableType.id, documentId.id))
        .first<T>())!;
}

async function voidCreate<T extends IModelObject>(db: Database, tableType: TT<T>, ...rest: T[]): Promise<void> {
    await db.table(tableType)
        .insert<T>(...rest);
}

async function simpleCreate<T extends IModelObject, R extends Object>(db: Database, tableType: TT<T>, template: T): Promise<R> {
    return await db.table(tableType)
        .insertReturning<T, R>(template).first();
}

async function getById<T extends IModelObject>(db: Database, tableType: TT<T>, id: PrimaryKey): Promise<T | undefined> {
    const ass = await db.table(tableType)
        .where(eqCol(tableType.id, id))
        .first<T>();
    return ass;
}

export function Users(db: Database) {
    return new class UserImpl {
        async get(userId: PrimaryKey): Promise<User | undefined> {
            return await getById(db, TUsers, userId);
        }
        async getByName(userName: string): Promise<User | undefined> {
            return await db.table(TUsers)
                .where(eqCol(TUsers.username, userName))
                .first<User>();
        }
        async list(): Promise<User[]> {
            return await db.table(TUsers)
                .where(gt(col(TUsers.id), 0))
                .order(col(TUsers.username), OrderDirection.ascending)
                .select<User>().rows();
        }
        async listGroups(userId: PrimaryKey): Promise<Group[]> {
            return await db.table(TGroups)
                .leftJoin(TGroupUsers.group_id, TGroups.id)
                .where(eqCol(TGroupUsers.user_id, userId))
                .select<Group>().rows();
        }
        async addToGroup(userId: PrimaryKey, groupId: PrimaryKey) {
            await db.table(TGroupUsers)
                .insert<GroupUser>({group_id: groupId, user_id: userId});
        }
        async removeFromGroup(userId: PrimaryKey, groupId: PrimaryKey) {
            await db.table(TGroupUsers)
                .where(
                    and(
                        eqCol(TGroupUsers.user_id, userId),
                        eqCol(TGroupUsers.group_id, groupId)))
                .delete();
        }
        async create(template: User): Promise<User> {
            return await db.table(TUsers)
                .insertReturning<User, User>(template).first();
        }
    }
}

export function Groups(db: Database) {
    return new class GroupImpl {
        async get(userId: PrimaryKey): Promise<Group | undefined> {
            return await getById(db, TGroups, userId);
        }
        async list(): Promise<Group[]> {
            return await db.table(TGroups)
                .where(gt(col(TGroups.id), 0))
                .order(col(TGroups.name), OrderDirection.ascending)
                .select<Group>().rows();
        }
        async create(group: Group): Promise<Group> {
            return await db.table(TGroups)
                .insertReturning<Group, Group>(group).first();
        }
    }
}

