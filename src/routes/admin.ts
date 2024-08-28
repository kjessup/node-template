import express from 'express';
import { postgres } from '../model/model-postgres.js';
import { ACL, PasswordResetRequest, TPasswordResetRequests, TUsers } from '../utils/acl.js';
import { randomUUID } from 'crypto';
import { Users } from '../model/model-utils.js';
import { sendError, sendTemplateInner } from '../utils/htmx.js';
import { ensureLoggedIn } from 'connect-ensure-login';
import { eqCol } from 'crud';

export function routes_admin(app: express.Express) {

    // async function passwordHashGenerate(password: string, salt: string): Promise<Buffer> {
    //     return new Promise((resolve, reject) => {
    //         crypto.pbkdf2(password, salt, 310000, 32, 'sha256', (err, hashedPassword) => {
    //             if (err) {
    //                 reject(err);
    //             } else {
    //                 resolve(hashedPassword);
    //             }
    //         });
    //     });
    // }

    function validate(username: string | undefined, password: string | undefined) {
        if (!username || !password) {
            throw new Error('Invalid username or password.');
        }
    }

    app.get('/admin',
        ensureLoggedIn('/login'),
        async (req, res) => {
            const db = await postgres();
            try {
                const user = req.user;
                // ensure permissions
                // TODO: revisit this. adding admin groups would change the logic
                await ACL.can(user, ACL.PermissionType.WRITE, ACL.AnyUser, db);
                res.render('admin', { user, users: await Users(db).list() });
            } catch (e) {
                res.redirect(301, '/dashboard');
            } finally {
                db.close();
            }
        });
        
    app.post('/admin/create-user', 
        ensureLoggedIn('/login'), 
        async (req, res) => {
            const db = await postgres();
            try {
                const user = req.user;
                await ACL.can(user, ACL.PermissionType.WRITE, ACL.AnyUser, db);

                const { username, password } = req.body;
                
                validate(username, password);
                const salt = randomUUID();
                const hashedPassword = await ACL.passwordHashGenerate(password, salt);
                const newUser = await Users(db).create({
                    username,
                    hashed_password: hashedPassword,
                    salt: Buffer.from(salt),
                    name: undefined
                });
                await sendTemplateInner('user-list', { user: newUser }, 'partials/admin-user-list-item', res, 'beforeend');
                
            } catch (e) {
                console.error(e);
                await sendError(new AggregateError([e], "Error creating an assistant"), res);
            } finally {
                db.close();
            }
        });
        
    app.get('/password-reset',
        async (req, res) => {
            const db = await postgres();
            try {
                const token = req.query.token;
                if (!token) {
                    res.redirect(301, '/login');
                    return;
                }
                const resetReq = await db.table(TPasswordResetRequests)
                    .where(eqCol(TPasswordResetRequests.token, token as string))
                    .first<PasswordResetRequest>() 
                if (!resetReq) {
                    res.redirect(301, '/login');
                    return;
                }
                const user = await Users(db).get(resetReq.user_id!);
                if (!user) {
                    res.redirect(301, '/login');
                    return;
                }
                let msg = '';
                res.render('password-reset', { user, token, msg });
                
            } catch (e) {
                res.redirect(301, '/login');
            } finally {
                db.close();
            }
        });
    

    app.post('/password-reset',
        async (req, res) => {
            const db = await postgres();
            try {
                const token = req.body.token;
                if (!token) {
                    res.redirect(301, '/login');
                    return;
                }
                const resetReq = await db.table(TPasswordResetRequests)
                    .where(eqCol(TPasswordResetRequests.token, token as string))
                    .first<PasswordResetRequest>() 
                if (!resetReq) {
                    res.redirect(301, '/login');
                    return;
                }
                const user = await Users(db).get(resetReq.user_id!);
                if (!user) {
                    res.redirect(301, '/login');
                    return;
                }
                let msg = '';
                const password = req.body.password;
                if (password && 
                    typeof password === 'string' &&
                    password === req.body['confirm-password']) {
                        
                    const salt = user.salt!.toString();
                    const hashedPassword = await ACL.passwordHashGenerate(password, salt);
                
                    await db.table(TUsers)
                        .where(eqCol(TUsers.id, user.id!))
                        .update<{hashed_password: Buffer}>({hashed_password: hashedPassword});
                    
                    res.redirect(301, '/login');
                    return;
                } else {
                    msg = 'Enter your new password and then confirm it. Entries must match.';
                }

                res.render('password-reset', { user, token, msg });
                
            } catch (e) {
                res.redirect(301, '/login');
            } finally {
                db.close();
            }
        });
    
    app.get('/password-reset-request',
        async (req, res) => {
            const db = await postgres();
            try {
                res.render('password-reset-request', {  });
            } catch (e) {
                res.redirect(301, '/login');
            } finally {
                db.close();
            }
        });
    app.post('/password-reset-request',
        async (req, res) => {
            const db = await postgres();
            try {
                const username = req.body.username;
                if (!username || (typeof username !== 'string')) {
                    res.render('password-reset-request', {  });
                    return;
                }
                await ACL.resetPassword(db, username);
                res.redirect(301, '/login');
            } catch (e) {
                res.redirect(301, '/login');
            } finally {
                db.close();
            }
        });
}
