import express from "express";
import { ilike, or, and, sql, eq, desc, getTableColumns } from "drizzle-orm";
import { db } from "../db/index.js";
import { departments, subjects } from "../db/schema/index.js";

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(departments.name, `%${search}%`),
                    ilike(departments.code, `%${search}%`)
                )
            );
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(departments)
            .where(whereClause);

        const totalCount = Number(countResult[0]?.count ?? 0);

        const departmentsList = await db
            .select({
                ...getTableColumns(departments),
            })
            .from(departments)
            .where(whereClause)
            .orderBy(desc(departments.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: departmentsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /departments error: ${e}`);
        res.status(500).json({ error: 'Failed to get departments' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const deptId = Number(req.params.id);
        if (!Number.isFinite(deptId)) {
            return res.status(400).json({ error: 'Invalid department ID' });
        }
        const [foundDept] = await db.select().from(departments).where(eq(departments.id, deptId));
        if (!foundDept) {
            return res.status(404).json({ error: 'Department not found' });
        }
        res.status(200).json({ data: foundDept });
    } catch (e) {
        console.error(`GET /departments/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to get department' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { code, name, description } = req.body;
        const [newDept] = await db
            .insert(departments)
            .values({ code, name, description })
            .returning();
        res.status(201).json({ data: newDept });
    } catch (e) {
        console.error(`POST /departments error: ${e}`);
        res.status(500).json({ error: 'Failed to create department' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const deptId = Number(req.params.id);
        const { code, name, description } = req.body;
        const [updatedDept] = await db
            .update(departments)
            .set({
                ...(code && { code }),
                ...(name && { name }),
                ...(description !== undefined && { description }),
            })
            .where(eq(departments.id, deptId))
            .returning();

        if (!updatedDept) {
            return res.status(404).json({ error: 'Department not found' });
        }
        res.status(200).json({ data: updatedDept });
    } catch (e) {
        console.error(`PUT /departments/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to update department' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const deptId = Number(req.params.id);
        
        // Check for linked subjects
        const linkedSubjects = await db.select().from(subjects).where(eq(subjects.departmentId, deptId));
        if (linkedSubjects.length > 0) {
            return res.status(400).json({
                error: 'Cannot delete department with associated subjects. Please remove subjects first.'
            });
        }

        const [deletedDept] = await db.delete(departments).where(eq(departments.id, deptId)).returning();
        if (!deletedDept) {
            return res.status(404).json({ error: 'Department not found' });
        }
        res.status(200).json({ data: deletedDept });
    } catch (e) {
        console.error(`DELETE /departments/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to delete department' });
    }
});

export default router;
