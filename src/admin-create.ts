import minimist from 'minimist';
import { Users } from './model/model-utils.js';
import { postgres } from './model/model-postgres.js';
import { randomUUID } from 'crypto';
import { ACL } from './utils/acl.js';

const args = minimist(process.argv.slice(2));

if (!args.email) {
    throw new Error('--email is required');
}

const email: string = args.email;
const db = await postgres();

const salt = randomUUID();
const password = randomUUID();

const hashedPassword = await ACL.passwordHashGenerate(password, salt);
const newUser = await Users(db).create({
    username: email,
    hashed_password: hashedPassword,
    salt: Buffer.from(salt),
    name: undefined
});

await ACL.resetPassword(db, email);
console.log(`User ${email} was created and a password reset email has been sent.`);
