import express from "express";
import { ilike, or, and, sql, eq, desc, getTableColumns } from "drizzle-orm";
import { db } from "../db/index.js";
import { classes, subjects, user, enrollments } from "../db/schema/index.js";
import { departments } from "../db/schema/index.js";

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { search, subject, teacher, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(classes.name, `%${search}%`),
                    ilike(classes.inviteCode, `%${search}%`)
                )
            );
        }

        if (subject) {
            const subjectPattern = `%${String(subject).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(
                ilike(subjects.name, subjectPattern)
            );
        }

        if (teacher) {
            const teacherPattern = `%${String(teacher).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(
                ilike(user.name, teacherPattern)
            );
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause);

        const totalCount = Number(countResult[0]?.count ?? 0);

        const classesList = await db
            .select({
                ...getTableColumns(classes),
                subject: { ...getTableColumns(subjects) },
                teacher: { ...getTableColumns(user) }
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause)
            .orderBy(desc(classes.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: classesList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /classes error: ${e}`);
        res.status(500).json({ error: 'Failed to get classes' });
    }
});

router.get('/:id', async (req, res) => {
  const classId = Number(req.params.id);

  if (!Number.isFinite(classId))
    return res.status(400).json({ error: 'Invalid class ID.' });

  const [classDetails] = await db
    .select({
      ...getTableColumns(classes),
      subject: {
        ...getTableColumns(subjects),
      },
      department: {
        ...getTableColumns(departments),
      },
      teacher: {
        ...getTableColumns(user),
      },
    })
    .from(classes)
    .leftJoin(subjects, eq(classes.subjectId, subjects.id))
    .leftJoin(user, eq(classes.teacherId, user.id))
    .leftJoin(departments, eq(subjects.departmentId, departments.id))
    .where(eq(classes.id, classId));

  if (!classDetails)
    return res.status(404).json({ error: 'No Class found.' });

  res.status(200).json({ data: classDetails });
});

router.post('/', async (req, res) => {
    try {
        const [createdClass] = await db
            .insert(classes)
            .values({ ...req.body, inviteCode: Math.random().toString(36).substring(2, 9), schedules: req.body.schedules ?? [] })
            .returning();

        if(!createdClass) throw Error;

        res.status(201).json({ data: createdClass });
    } catch (e) {
        console.error(`POST /classes error ${e}`);
        res.status(500).json({ error: e});
    }
});

router.put('/:id', async (req, res) => {
    try {
        const classId = Number(req.params.id);
        const [updatedClass] = await db
            .update(classes)
            .set({ ...req.body })
            .where(eq(classes.id, classId))
            .returning();

        if (!updatedClass) {
            return res.status(404).json({ error: 'Class not found' });
        }
        res.status(200).json({ data: updatedClass });
    } catch (e) {
        console.error(`PUT /classes/:id error ${e}`);
        res.status(500).json({ error: 'Failed to update class' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const classId = Number(req.params.id);
        const [deletedClass] = await db.delete(classes).where(eq(classes.id, classId)).returning();
        if (!deletedClass) {
            return res.status(404).json({ error: 'Class not found' });
        }
        res.status(200).json({ data: deletedClass });
    } catch (e) {
        console.error(`DELETE /classes/:id error ${e}`);
        res.status(500).json({ error: 'Failed to delete class' });
    }
});

router.post('/join', async (req, res) => {
    try {
        const { inviteCode, studentId } = req.body;
        if (!inviteCode || !studentId) {
            return res.status(400).json({ error: 'Invite code and student ID are required' });
        }

        const [foundClass] = await db.select().from(classes).where(eq(classes.inviteCode, inviteCode));
        if (!foundClass) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }

        // Check if student already enrolled
        const [existingEnrollment] = await db
            .select()
            .from(enrollments)
            .where(and(eq(enrollments.classId, foundClass.id), eq(enrollments.studentId, studentId)));

        if (existingEnrollment) {
            return res.status(400).json({ error: 'Already enrolled in this class' });
        }

        // Check capacity
        const countRes = await db
            .select({ count: sql<number>`count(*)` })
            .from(enrollments)
            .where(eq(enrollments.classId, foundClass.id));
        const currentEnrolled = Number(countRes[0]?.count ?? 0);

        if (currentEnrolled >= foundClass.capacity) {
            return res.status(400).json({ error: 'Class capacity has been reached' });
        }

        const [newEnrollment] = await db
            .insert(enrollments)
            .values({ classId: foundClass.id, studentId })
            .returning();

        res.status(201).json({ data: { enrollment: newEnrollment, class: foundClass } });
    } catch (e) {
        console.error(`POST /classes/join error ${e}`);
        res.status(500).json({ error: 'Failed to join class' });
    }
});

export default router;