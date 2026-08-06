import express from "express";
import { ilike, or, and, sql, eq, desc, getTableColumns } from "drizzle-orm";
import { user } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { search, role, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(user.name, `%${search}%`),
                    ilike(user.email, `%${search}%`),
                )
            );
        }

        if (role) {
            filterConditions.push(
                eq(user.role, String(role) as any)
            );
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .where(whereClause);

        const totalCount = Number(countResult[0]?.count ?? 0);

        const usersList = await db
            .select({
                ...getTableColumns(user),
            })
            .from(user)
            .where(whereClause)
            .orderBy(desc(user.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: usersList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /users error: ${e}`);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const [foundUser] = await db.select().from(user).where(eq(user.id, userId));
        if (!foundUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json({ data: foundUser });
    } catch (e) {
        console.error(`GET /users/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { id, name, email, role, emailVerified, image, imageCldPubId } = req.body;
        const userId = id || `user_${Date.now()}`;
        const [newUser] = await db
            .insert(user)
            .values({
                id: userId,
                name: name || 'New User',
                email: email,
                role: role || 'student',
                emailVerified: emailVerified ?? false,
                image: image ?? null,
                imageCldPubId: imageCldPubId ?? null,
            })
            .returning();
        res.status(201).json({ data: newUser });
    } catch (e) {
        console.error(`POST /users error: ${e}`);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const { name, email, role, image, imageCldPubId, emailVerified } = req.body;
        const [updatedUser] = await db
            .update(user)
            .set({
                ...(name && { name }),
                ...(email && { email }),
                ...(role && { role }),
                ...(image !== undefined && { image }),
                ...(imageCldPubId !== undefined && { imageCldPubId }),
                ...(emailVerified !== undefined && { emailVerified }),
            })
            .where(eq(user.id, userId))
            .returning();

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json({ data: updatedUser });
    } catch (e) {
        console.error(`PUT /users/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const [deletedUser] = await db.delete(user).where(eq(user.id, userId)).returning();
        if (!deletedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json({ data: deletedUser });
    } catch (e) {
        console.error(`DELETE /users/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

export default router;
