import express from 'express';
import { routes_admin } from './admin.js';

export function routes(app: express.Express) {
    routes_admin(app);
}
