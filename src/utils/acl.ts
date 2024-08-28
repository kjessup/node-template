
import { Column, Database, OrderDirection, Table, TableColumnMetadata, and, col, eqCol, generateMetadata, inExp, or, str } from "crud";
import { IModelObject } from "../model/model.js";
import { postgres } from "../model/model-postgres.js";
import crypto, { randomUUID } from 'crypto';
import { Users } from "../model/model-utils.js";
import ejs from "ejs";
import { sendmail } from "./email.js";

export type WebSocketAuth = WebSocket & { user?: User };
export type UserWithSocket = User & { socket?: WebSocket };
export type UserWithCancellation = User & { 
    cancel?: boolean;
    running?: boolean;
};

@Table('users')
export class User implements IModelObject, Express.User {
    @Column()
    public id?: number;
    @Column()
    public username?: string;
    @Column()
    public hashed_password?: Buffer;
    @Column()
    public salt?: Buffer;
    @Column()
    public name?: string;
}
export const TUsers = generateMetadata(User);

@Table('groups')
export class Group implements IModelObject, ACL.IResource {
    @Column()
    public id?: number;
    @Column()
    public name?: string;
    @Column()
    public description?: string;
    @Column()
    public resource_key?: string;
}
export const TGroups = generateMetadata(Group);

@Table('group_users')
export class GroupUser {
    @Column()
    public group_id?: number;
    @Column()
    public user_id?: number;
}
export const TGroupUsers = generateMetadata(GroupUser);

@Table('federated_credentials')
export class FederatedCredential implements IModelObject {
    @Column()
    public id?: number;
    @Column()
    public user_id?: number;
    @Column()
    public provider?: string;
    @Column()
    public subject?: string;
}
export const TFederatedCredentials = generateMetadata(FederatedCredential);

@Table('password_reset_requests')
export class PasswordResetRequest implements IModelObject {
    @Column()
    public id?: number;
    @Column()
    public user_id?: number;
    @Column()
    public token?: string;
    @Column()
    public created_at?: Date;
}
export const TPasswordResetRequests = generateMetadata(PasswordResetRequest);

// Defines a permission on a resource
@Table('user_permissions')
export class UserPermission implements IModelObject {
    id?: number;
    @Column()
    resource_key?: string;
    @Column()
    user_id?: number;
    @Column()
    type?: ACL.PermissionType;
}

// not exported
const TUserPermissions = generateMetadata(UserPermission);

@Table('group_permissions')
export class GroupPermission implements IModelObject {
    id?: number;
    @Column()
    resource_key?: string;
    @Column()
    group_id?: number;
    @Column()
    type?: ACL.PermissionType;
}

// not exported
const TGroupPermissions = generateMetadata(GroupPermission);

export namespace ACL {

    export const AnyUser: User & IResource = {
        id: -1,
        resource_key: 'user-any'
    }

    export const SuperUsersGroup: Group & IResource = {
        id: -1,
        resource_key: 'groups-su'
    }

    export async function resetPassword(db: Database, username: string) {
        const user = await Users(db).getByName(username);
        if (!user) {
            return;
        }
        const token = randomUUID();
        try {
            const rend = await ejs.renderFile(
                `src/views/email/email-reset-password-text.ejs`, 
                { user, url: `http://${process.env.HOST_NAME}${process.env.HOST_PORT ? `:${process.env.HOST_PORT}` : ''}/password-reset?token=${token}` },
                { root: 'src/views/' });
            await db.table(TPasswordResetRequests)
                .insert<PasswordResetRequest>({user_id: user.id, token});
            await sendmail(user.username!, 'Password reset request', rend, undefined);
        } catch (e) {
            console.error(`${e}`);
            throw e;
        }
    }

    export async function passwordHashGenerate(password: string, salt: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            crypto.pbkdf2(password, salt, 310000, 32, 'sha256', (err, hashedPassword) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(hashedPassword);
                }
            });
        });
    }

    export async function initACL(db: Database) {
        // bootstrap general resource types
        const resourceTables = [AnyUser];
        for (const T of resourceTables) {
            await db.sql('INSERT INTO resources (key) VALUES ($1) ON CONFLICT DO NOTHING',
                str(T.resource_key!));
        }

        await db.sql('INSERT INTO users (id, name) VALUES ($1, \'any user\') ON CONFLICT DO NOTHING',
            AnyUser.id!);
        await db.sql('INSERT INTO groups (id, name) VALUES ($1, \'super users\') ON CONFLICT DO NOTHING',
            SuperUsersGroup.id!);
    }

    // Represents a basic resource in the system
    export interface IResource extends IModelObject {
        resource_key?: string;
    }

    // Enumeration for standard permission types
    export enum PermissionType {
        CREATE = 'create',
        READ = 'read',
        WRITE = 'write',
        DELETE = 'delete'
    }

    export const PermissionRWD = [ACL.PermissionType.DELETE, ACL.PermissionType.WRITE, ACL.PermissionType.READ];
    export const PermissionAll = [ACL.PermissionType.CREATE, ACL.PermissionType.DELETE, ACL.PermissionType.WRITE, ACL.PermissionType.READ];

    // functions which directly act on the permissions tables follow
    // 
    //

    export async function add(target: User | Group | undefined, actions: ACL.PermissionType[], resource: ACL.IResource, db: Database | undefined): Promise<void> {
        if (target === undefined) {
            return;
        }
        const ownDb = db === undefined;
        if (ownDb) {
            db = await postgres();
        }
        try {
            const key = resource.resource_key!;
            const m = actions.map(p => {
                return {
                    resource_key: key,
                    type: p,
                    user_id: target.id!
                };
            });
            if ('username' in target) {
                await db!.table(TUserPermissions)
                    .insert<UserPermission>(...m);
            } else {
                await db!.table(TGroupPermissions)
                    .insert<GroupPermission>(...m);
            }
        } finally {
            if (ownDb) {
                db?.close();
            }
        }
    }

    export async function allPermissions(user: User, db: Database | undefined): Promise<{ resource_key: string, type: ACL.PermissionType }[]> {
        const ownDb = db === undefined;
        if (ownDb) {
            db = await postgres();
        }
        try {
            const sql = `
            SELECT DISTINCT resource_key, "type" from (
                -- Check direct permissions
                SELECT resource_key, "type"
                FROM user_permissions
                WHERE user_id = $1 or user_id = $2
                
                UNION ALL
                
                -- Check group permissions
                SELECT resource_key, "type"
                FROM group_permissions gp
                INNER JOIN group_users gu ON gp.group_id = gu.group_id
                WHERE gu.user_id = $1 or gu.user_id = $2
            ) AS has_permission`;
            const permissions = await db!.sql<{ resource_key: string, type: ACL.PermissionType }>(sql,
                user.id!, ACL.AnyUser.id!);
            return permissions;
        } finally {
            if (ownDb) {
                db?.close();
            }
        }
    }

    export async function permissions(user: User, resource: ACL.IResource, db: Database | undefined): Promise<ACL.PermissionType[]> {
        const ownDb = db === undefined;
        if (ownDb) {
            db = await postgres();
        }
        try {
            const key = resource.resource_key!;
            const sql = `
            SELECT DISTINCT "type" from (
                -- Check direct permissions
                SELECT "type"
                FROM user_permissions
                WHERE (user_id = $1 or user_id = $2)
                  AND resource_key = $3
                
                UNION ALL
                
                -- Check group permissions
                SELECT "type"
                FROM group_permissions gp
                INNER JOIN group_users gu ON gp.group_id = gu.group_id
                WHERE (gu.user_id = $1 or gu.user_id = $2)
                  AND gp.resource_key = $3
            ) AS has_permission`;
            const permissions = await db!.sql<{ type: ACL.PermissionType }>(sql,
                user.id!, ACL.AnyUser.id!, resource.resource_key!);
            return permissions.map(p => p.type);
        } finally {
            if (ownDb) {
                db?.close();
            }
        }
    }

    export async function can(user: User | undefined, action: ACL.PermissionType, resource: ACL.IResource | undefined, db: Database | undefined, anyUser: boolean = false): Promise<boolean> {
        if (user === undefined) {
            throw new Error('Invalid user');
        }
        if (resource === undefined) {
            throw new Error('Invalid resource');
        }
        const ownDb = db === undefined;
        if (ownDb) {
            db = await postgres();
        }
        try {
            const sql = `
            SELECT EXISTS (
                -- Check direct permissions
                SELECT 1
                FROM user_permissions
                WHERE (user_id = $1 or user_id = $2)
                  AND resource_key = $3
                  AND "type" = $4
                
                UNION ALL
                
                -- Check group permissions
                SELECT 1
                FROM group_permissions gp
                INNER JOIN group_users gu ON gp.group_id = gu.group_id
                WHERE (gu.user_id = $1 or gu.user_id = $2)
                  AND gp.resource_key = $3
                  AND gp."type" = $4
            ) AS has_permission`;

            const [{ has_permission: hasPermission }] = await db!.sql<{ has_permission: boolean }>(sql,
                user.id!, ACL.AnyUser.id!, resource.resource_key!, action);
            if (!hasPermission) {
                throw new Error('Unauthorized');
            }
            return true;
        } finally {
            if (ownDb) {
                db?.close();
            }
        }
    }

    export async function listGroupIds(db: Database, user: User): Promise<number[]> {
        return (await db.table(TGroupUsers)
            .where(eqCol(TUserPermissions.user_id, (user.id!)))
            .select<{ group_id: number }>()
            .rows()).map(r => r.group_id);
    }
}

