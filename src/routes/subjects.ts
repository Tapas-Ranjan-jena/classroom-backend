import express from "express";
import { ilike, or, and, sql, eq, desc, getTableColumns } from "drizzle-orm";
import { departments, subjects, classes } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { search, department, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(subjects.name, `%${search}%`),
                    ilike(subjects.code, `%${search}%`),
                )
            );
        }

        if (department) {
            const deptPattern = `%${String(department).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(
                ilike(departments.name, deptPattern)
            );
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause);

        const totalCount = Number(countResult[0]?.count ?? 0);

        const subjectsList = await db
            .select({
                ...getTableColumns(subjects),
                department: { ...getTableColumns(departments) }
            })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause)
            .orderBy(desc(subjects.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: subjectsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /subjects error: ${e}`);
        res.status(500).json({ error: 'Failed to get subjects' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const subjectId = Number(req.params.id);
        if (!Number.isFinite(subjectId)) {
            return res.status(400).json({ error: 'Invalid subject ID' });
        }
        const [foundSubject] = await db
            .select({
                ...getTableColumns(subjects),
                department: { ...getTableColumns(departments) }
            })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(eq(subjects.id, subjectId));

        if (!foundSubject) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        res.status(200).json({ data: foundSubject });
    } catch (e) {
        console.error(`GET /subjects/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to get subject' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { departmentId, name, code, description } = req.body;
        const [newSubject] = await db
            .insert(subjects)
            .values({ departmentId: Number(departmentId), name, code, description })
            .returning();
        res.status(201).json({ data: newSubject });
    } catch (e) {
        console.error(`POST /subjects error: ${e}`);
        res.status(500).json({ error: 'Failed to create subject' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const subjectId = Number(req.params.id);
        const { departmentId, name, code, description } = req.body;
        const [updatedSubject] = await db
            .update(subjects)
            .set({
                ...(departmentId && { departmentId: Number(departmentId) }),
                ...(name && { name }),
                ...(code && { code }),
                ...(description !== undefined && { description }),
            })
            .where(eq(subjects.id, subjectId))
            .returning();

        if (!updatedSubject) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        res.status(200).json({ data: updatedSubject });
    } catch (e) {
        console.error(`PUT /subjects/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to update subject' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const subjectId = Number(req.params.id);

        const linkedClasses = await db.select().from(classes).where(eq(classes.subjectId, subjectId));
        if (linkedClasses.length > 0) {
            return res.status(400).json({
                error: 'Cannot delete subject with active classes. Remove classes first.'
            });
        }

        const [deletedSubject] = await db.delete(subjects).where(eq(subjects.id, subjectId)).returning();
        if (!deletedSubject) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        res.status(200).json({ data: deletedSubject });
    } catch (e) {
        console.error(`DELETE /subjects/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to delete subject' });
    }
});

export default router;