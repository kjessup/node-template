// import dotenv from 'dotenv';
// dotenv.config();
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import path from 'path';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import fs from 'fs/promises';
import https from 'https';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { ensureLoggedIn } from 'connect-ensure-login';
import { and, eqCol, int, str } from 'crud';
import { PrimaryKey, pgPool, postgres, postgresInit } from './model/model-postgres.js';
import { ACL, User, TUsers, TFederatedCredentials } from './utils/acl.js';
import { Users } from './model/model-utils.js';
import { routes } from './routes/routes.js';

passport.serializeUser(function (user: User, done) {
    done(null, user.id);
});

async function deserializeUser(id: PrimaryKey, done: (arg0: null, arg1: User | undefined) => void) {
    const db = await postgres();
    try {
        const user = await db.table(TUsers)
            .where(eqCol(TUsers.id, id))
            .first<User>();
        done(null, user);
    } finally {
        db.close();
    }
}

passport.deserializeUser<PrimaryKey>(deserializeUser);

const app = express();

const PgSession = pgSession(session);

const sessionParser = session({
    store: new PgSession({
        pool: pgPool, // Use the existing pg pool
        tableName: 'session' // Optional. Use a custom table name for storing sessions
    }),
    secret: process.env.SESSION_SECRET!, // Replace with a real secret key
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
});

app.use((req: any, res: any, next: any) => {
    const result = sessionParser(req, res, next);
    return result;
});

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(async (username, password, cb) => {
    const db = await postgres();
    try {
        const no = () => cb(null, false, { message: 'Incorrect username or password.' });
        const user = await db.table(TUsers)
            .where(eqCol(TUsers.username, username.toLowerCase()))
            .first<User>();
        if (!user || !user.hashed_password) {
            return no();
        }

        crypto.pbkdf2(password, user.salt || username.toLowerCase(), 310000, 32, 'sha256', (err, hashedPassword) => {
            if (err) { 
                return cb(err); 
            }
            if (!crypto.timingSafeEqual(user.hashed_password!, hashedPassword)) {
                return no();
            }
            return cb(null, user);
        });
    } catch (err) {
        return cb(err);
    } finally {
        db.close();
    }
}));

/*
// Configure CORS (simple usage, allowing all origins)
const corsOptions = {
    origin: ['https://play.google.com', process.env.CORS_ORIGIN!], // This is not recommended for production
    // For production, you might specify allowed origins, methods etc.
    // origin: 'https://yourdomain.com',
    // methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    // allowedHeaders: 'Content-Type,Authorization'
};

app.use(cors(corsOptions));
*/

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join('.', 'src', 'views'));

app.use(express.static(path.join('.', 'public')));

app.use('/bootstrap', express.static(path.join('.', 'node_modules', 'bootstrap')));

app.get('/', async (req: Request, res: any) => {
    try {
        res.redirect(301, '/login');
    } catch (e) {
        res.status(500).send("An error occurred while loading the page.");
    }
});

app.get('/dashboard',
    ensureLoggedIn('/login'),
    async (req, res) => {
        try {
            const user = req.user;
            res.render('dashboard', { user: req.user! });
        } catch (e) {
            res.status(500).send("An error occurred while loading the page.");
        }
    });



app.post('/logout', (req, res, next) => {
    req.logout(function (err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { host: `${process.env.HOST_NAME}${process.env.HOST_PORT ? `:${process.env.HOST_PORT}` : ''}` });
});

app.post('/login',
    passport.authenticate('local', { failureRedirect: '/login', failureMessage: true }),
    (req: Request, res: any) => {
        res.redirect(301, '/dashboard')
});

// -----

function printRoutes() {
    console.log('Registered routes:');
    app._router.stack.forEach((layer: any) => {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
            const path = layer.route.path;
            console.log(`${methods} ${path}`);
        }
    });
}

export async function startServer() {
    await postgresInit(async (db) => {

        // const d = await fs.readFile('/Users/kjessup/Downloads/db.json');
        // const p = JSON.parse(d.toString());
        // for (const type in p) {
        //     const { source, charset, compressible, extensions } = p[type];
        //     if (extensions === undefined) {
        //         continue;
        //     }
        //     const {id:type_id} = await db.table(TMimeTypes)
        //         .insertReturning<MimeTypes, {id: number}>({
        //             type,
        //             source,
        //             charset,
        //             compressible
        //         }).first();
        //     await db.table(TMimeTypeExtensions)
        //         .insert<MimeTypeExtensions>(
        //             ... extensions.map((extension: string) => { 
        //                 return {
        //                     type_id,
        //                     extension
        //             }}));
        // }

        await ACL.initACL(db);
    });
    
    // ...
    routes(app);

    const port = process.env.LOCAL_PORT ? parseInt(process.env.LOCAL_PORT) : 4000;
    //const wss = new WebSocketServer({ clientTracking: false, noServer: true });
    let servers = [
        app.listen(port, 'localhost')];

    if (process.env.DEBUG_AUTH === '1') {
        const privateKey = await fs.readFile('./localhost+4-key.pem');
        const certificate = await fs.readFile('./localhost+4.pem');
        servers.push(
            https.createServer({
                key: privateKey,
                cert: certificate
            }, app).listen(4030, process.env.HOST_NAME));
    }
    
    console.log(`Server is running on port ${port}`);
    printRoutes();
}

await startServer();
