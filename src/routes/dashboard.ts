import express from "express";
import { sql, eq, desc, getTableColumns } from "drizzle-orm";
import { db } from "../db/index.js";
import { user, departments, subjects, classes, enrollments } from "../db/schema/index.js";

const router = express.Router();

router.get('/stats', async (req, res) => {
    try {
        // 1. KPI Totals
        const userCountRes = await db.select({ count: sql<number>`count(*)` }).from(user);
        const totalUsers = Number(userCountRes[0]?.count ?? 0);

        const deptCountRes = await db.select({ count: sql<number>`count(*)` }).from(departments);
        const totalDepartments = Number(deptCountRes[0]?.count ?? 0);

        const subjectCountRes = await db.select({ count: sql<number>`count(*)` }).from(subjects);
        const totalSubjects = Number(subjectCountRes[0]?.count ?? 0);

        const classCountRes = await db.select({ count: sql<number>`count(*)` }).from(classes);
        const totalClasses = Number(classCountRes[0]?.count ?? 0);

        const activeClassCountRes = await db.select({ count: sql<number>`count(*)` }).from(classes).where(eq(classes.status, 'active'));
        const activeClasses = Number(activeClassCountRes[0]?.count ?? 0);

        const enrollmentCountRes = await db.select({ count: sql<number>`count(*)` }).from(enrollments);
        const totalEnrollments = Number(enrollmentCountRes[0]?.count ?? 0);

        // 2. Chart 1: User Distribution by Role
        const userRolesRes = await db
            .select({ role: user.role, count: sql<number>`count(*)` })
            .from(user)
            .groupBy(user.role);

        const userDistribution = userRolesRes.map(r => ({
            role: r.role.charAt(0).toUpperCase() + r.role.slice(1),
            count: Number(r.count)
        }));

        // 3. Chart 2: Classes by Department
        const classesByDeptRes = await db
            .select({
                departmentName: departments.name,
                count: sql<number>`count(${classes.id})`
            })
            .from(departments)
            .leftJoin(subjects, eq(subjects.departmentId, departments.id))
            .leftJoin(classes, eq(classes.subjectId, subjects.id))
            .groupBy(departments.id, departments.name);

        const classesByDepartment = classesByDeptRes.map(item => ({
            department: item.departmentName,
            count: Number(item.count)
        }));

        // 4. Chart 3: Capacity Status per Class
        const classListings = await db
            .select({
                id: classes.id,
                name: classes.name,
                capacity: classes.capacity,
                status: classes.status,
            })
            .from(classes)
            .limit(10);

        const capacityStatus = await Promise.all(
            classListings.map(async (cls) => {
                const enrRes = await db
                    .select({ count: sql<number>`count(*)` })
                    .from(enrollments)
                    .where(eq(enrollments.classId, cls.id));
                const enrolled = Number(enrRes[0]?.count ?? 0);
                const fillPercentage = Math.round((enrolled / (cls.capacity || 1)) * 100);

                return {
                    id: cls.id,
                    className: cls.name,
                    enrolled,
                    capacity: cls.capacity,
                    fillPercentage,
                    isWarning: fillPercentage >= 80,
                };
            })
        );

        // 5. Chart 4: Enrollment Trends (Enrollment counts per class)
        const enrollmentTrends = capacityStatus.map(item => ({
            name: item.className.length > 15 ? item.className.substring(0, 15) + '...' : item.className,
            students: item.enrolled,
            capacity: item.capacity
        }));

        // 6. Recent Activity Feed
        const recentEnrollments = await db
            .select({
                id: enrollments.id,
                createdAt: enrollments.createdAt,
                studentName: user.name,
                className: classes.name,
            })
            .from(enrollments)
            .leftJoin(user, eq(enrollments.studentId, user.id))
            .leftJoin(classes, eq(enrollments.classId, classes.id))
            .orderBy(desc(enrollments.createdAt))
            .limit(5);

        const recentClasses = await db
            .select({
                id: classes.id,
                name: classes.name,
                createdAt: classes.createdAt,
                teacherName: user.name,
            })
            .from(classes)
            .leftJoin(user, eq(classes.teacherId, user.id))
            .orderBy(desc(classes.createdAt))
            .limit(5);

        res.status(200).json({
            data: {
                metrics: {
                    totalUsers,
                    totalDepartments,
                    totalSubjects,
                    totalClasses,
                    activeClasses,
                    totalEnrollments,
                },
                charts: {
                    userDistribution,
                    classesByDepartment,
                    capacityStatus,
                    enrollmentTrends,
                },
                activityFeed: {
                    recentEnrollments,
                    recentClasses,
                }
            }
        });
    } catch (e) {
        console.error(`GET /dashboard/stats error: ${e}`);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});

export default router;
