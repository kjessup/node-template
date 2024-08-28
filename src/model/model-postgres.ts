import { postgres as p, pgPool as pp } from 'pg-node-crud';
import { Database } from 'crud';

const embeddingLength = 1536;

export type PrimaryKey = number;

export const postgres = p;
export const pgPool = pp;

export async function postgresInit(callback: (db: Database) => Promise<void>) {
    const db = await postgres();
    await db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, 
        username TEXT UNIQUE, 
        hashed_password bytea, 
        salt bytea, 
        name TEXT 
    );
    CREATE TABLE IF NOT EXISTS groups (
        id serial PRIMARY KEY,
        name TEXT UNIQUE,
        description TEXT UNIQUE,
        
        resource_key TEXT NOT NULL DEFAULT 'invalid'
    );
    CREATE TABLE IF NOT EXISTS group_users (
        group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(group_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS federated_credentials ( 
        id SERIAL PRIMARY KEY, 
        user_id INTEGER NOT NULL, 
        provider TEXT NOT NULL, 
        subject TEXT NOT NULL, 
        UNIQUE (provider, subject) 
    );
    CREATE TABLE IF NOT EXISTS password_reset_requests (
        id SERIAL PRIMARY KEY, 
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, 
        token TEXT NOT NULL, 
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `);
    
    await db.run(`
    CREATE TABLE IF NOT EXISTS resources (
        key TEXT PRIMARY KEY
    );
    
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_type') THEN
            CREATE TYPE permission_type AS ENUM ('read', 'write', 'create', 'delete');
        END IF;
    END$$;
    
    CREATE TABLE IF NOT EXISTS user_permissions (
        user_id INT NOT NULL,
        resource_key TEXT NOT NULL,
        type permission_type NOT NULL,
        UNIQUE (user_id, resource_key, type),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (resource_key) REFERENCES resources(key) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS group_permissions (
        group_id INT NOT NULL,
        resource_key TEXT NOT NULL,
        type permission_type NOT NULL,
        UNIQUE (group_id, resource_key, type),
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (resource_key) REFERENCES resources(key) ON DELETE CASCADE
    );
    `);
    
    await db.run(`
    CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        PRIMARY KEY ("sid")
    )
    WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    await db.run(`
        CREATE OR REPLACE FUNCTION delete_resource()
        RETURNS TRIGGER AS $$
        BEGIN
            DELETE FROM resources WHERE key = OLD.resource_key;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION insert_resource_on_insert()
        RETURNS TRIGGER AS $$
        DECLARE
            generatedKey TEXT;
        BEGIN
            -- Generate the key
            generatedKey := TG_TABLE_NAME || '-' || NEW.id;
            -- Insert into resources table
            INSERT INTO resources(key) VALUES (generatedKey);
            -- Update the original table's row with the generated key
            EXECUTE 'UPDATE ' || quote_ident(TG_TABLE_NAME) || 
                    ' SET resource_key = $1 WHERE id = $2'
            USING generatedKey, NEW.id;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);
    
    await db.run(`
        CREATE TABLE IF NOT EXISTS mime_types (
            id SERIAL PRIMARY KEY,
            type TEXT NOT NULL UNIQUE,
            source TEXT DEFAULT NULL,
            compressible BOOL DEFAULT TRUE,
            charset TEXT DEFAULT NULL
        );
        CREATE TABLE IF NOT EXISTS mime_type_extensions (
            type_id INT NOT NULL REFERENCES mime_types(id) ON DELETE CASCADE,
            extension TEXT NOT NULL
        );
    `);

    // RESOURCE TABLE TRIGGERS
    // const resourceTables = ['example'];
    // await db.run(resourceTables.map(n => `
    //     CREATE OR REPLACE TRIGGER delete_resource_trigger_${n}
    //     AFTER DELETE ON ${n}
    //     FOR EACH ROW EXECUTE FUNCTION delete_resource();

    //     CREATE OR REPLACE TRIGGER trigger_after_insert_${n}
    //     AFTER INSERT ON ${n}
    //     FOR EACH ROW EXECUTE FUNCTION insert_resource_on_insert();
    // `).join('\n'));

    // MIGRATIONS
    // await db.run(`
    // ALTER TABLE assistants ADD COLUMN IF NOT EXISTS resource_key TEXT NOT NULL DEFAULT 'invalid';
    // `);

    await callback(db);
    db.close();
}
