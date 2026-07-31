import { eq } from "drizzle-orm";
import { db } from "./db";
import { departments } from "./db/schema";

async function main() {
  try {
    console.log("Performing CRUD operations...");

    // CREATE
    const [newDept] = await db
      .insert(departments)
      .values({ code: "TEST", name: "Test Department", description: "Temporary demo row" })
      .returning();

    if (!newDept) {
      throw new Error("Failed to create department");
    }

    console.log("✅ CREATE: New department created:", newDept);

    // READ
    const foundDept = await db
      .select()
      .from(departments)
      .where(eq(departments.id, newDept.id));
    console.log("✅ READ: Found department:", foundDept[0]);

    // UPDATE
    const [updatedDept] = await db
      .update(departments)
      .set({ name: "Updated Test Department" })
      .where(eq(departments.id, newDept.id))
      .returning();

    if (!updatedDept) {
      throw new Error("Failed to update department");
    }

    console.log("✅ UPDATE: Department updated:", updatedDept);

    // DELETE
    await db.delete(departments).where(eq(departments.id, newDept.id));
    console.log("✅ DELETE: Department deleted.");

    console.log("\nCRUD operations completed successfully.");
  } catch (error) {
    console.error("❌ Error performing CRUD operations:", error);
    process.exit(1);
  }
}

main();