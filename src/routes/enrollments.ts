import express from "express";
import { and, eq, sql, getTableColumns, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { enrollments, classes, user } from "../db/schema/index.js";

const router = express.Router();

// Get all enrollments for a specific class
router.get('/class/:classId', async (req, res) => {
    try {
        const classId = Number(req.params.classId);
        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: 'Invalid class ID' });
        }

        const enrolledStudents = await db
            .select({
                enrollmentId: enrollments.id,
                enrolledAt: enrollments.createdAt,
                student: {
                    ...getTableColumns(user),
                }
            })
            .from(enrollments)
            .leftJoin(user, eq(enrollments.studentId, user.id))
            .where(eq(enrollments.classId, classId))
            .orderBy(desc(enrollments.createdAt));

        res.status(200).json({ data: enrolledStudents });
    } catch (e) {
        console.error(`GET /enrollments/class/:classId error: ${e}`);
        res.status(500).json({ error: 'Failed to get class enrollments' });
    }
});

// Enroll a student into a class
router.post('/', async (req, res) => {
    try {
        const { classId, studentId } = req.body;
        const numericClassId = Number(classId);

        if (!Number.isFinite(numericClassId) || !studentId) {
            return res.status(400).json({ error: 'classId and studentId are required' });
        }

        // Check if class exists
        const [targetClass] = await db.select().from(classes).where(eq(classes.id, numericClassId));
        if (!targetClass) {
            return res.status(404).json({ error: 'Class not found' });
        }

        // Check duplicate enrollment
        const [existing] = await db
            .select()
            .from(enrollments)
            .where(and(eq(enrollments.classId, numericClassId), eq(enrollments.studentId, studentId)));

        if (existing) {
            return res.status(400).json({ error: 'Student is already enrolled in this class' });
        }

        // Check capacity
        const countRes = await db
            .select({ count: sql<number>`count(*)` })
            .from(enrollments)
            .where(eq(enrollments.classId, numericClassId));

        const currentEnrolled = Number(countRes[0]?.count ?? 0);

        if (currentEnrolled >= targetClass.capacity) {
            return res.status(400).json({ error: 'Class capacity limit reached' });
        }

        const [newEnrollment] = await db
            .insert(enrollments)
            .values({ classId: numericClassId, studentId })
            .returning();

        res.status(201).json({ data: newEnrollment });
    } catch (e) {
        console.error(`POST /enrollments error: ${e}`);
        res.status(500).json({ error: 'Failed to enroll student' });
    }
});

// Unenroll a student (delete enrollment by ID)
router.delete('/:id', async (req, res) => {
    try {
        const enrollmentId = Number(req.params.id);
        if (!Number.isFinite(enrollmentId)) {
            return res.status(400).json({ error: 'Invalid enrollment ID' });
        }

        const [deleted] = await db
            .delete(enrollments)
            .where(eq(enrollments.id, enrollmentId))
            .returning();

        if (!deleted) {
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        res.status(200).json({ data: deleted });
    } catch (e) {
        console.error(`DELETE /enrollments/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to unenroll student' });
    }
});

export default router;
