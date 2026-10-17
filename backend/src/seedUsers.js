import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "./config/database.js";
import User from "./models/User.js";

dotenv.config();

const seedUsers = async () => {
  try {
    await connectDB();

    const {
      ADMIN_NAME,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      STAFF_NAME,
      STAFF_EMAIL,
      STAFF_PASSWORD,
    } = process.env;

    // Check & seed ADMIN user
    if (!ADMIN_NAME?.trim() || !ADMIN_EMAIL?.trim() || !ADMIN_PASSWORD) {
      console.log(
        "Skipping ADMIN user: ADMIN_NAME, ADMIN_EMAIL, or ADMIN_PASSWORD is missing in environment variables."
      );
    } else {
      const normalizedAdminEmail = ADMIN_EMAIL.trim().toLowerCase();
      const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await User.findOneAndUpdate(
        { email: normalizedAdminEmail },
        {
          name: ADMIN_NAME.trim(),
          email: normalizedAdminEmail,
          passwordHash: adminHash,
          role: "ADMIN",
          isActive: true,
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
      console.log(`ADMIN user (${normalizedAdminEmail}) upserted successfully.`);
    }

    // Check & seed STAFF user
    if (!STAFF_NAME?.trim() || !STAFF_EMAIL?.trim() || !STAFF_PASSWORD) {
      console.log(
        "Skipping STAFF user: STAFF_NAME, STAFF_EMAIL, or STAFF_PASSWORD is missing in environment variables."
      );
    } else {
      const normalizedStaffEmail = STAFF_EMAIL.trim().toLowerCase();
      const staffHash = await bcrypt.hash(STAFF_PASSWORD, 10);
      await User.findOneAndUpdate(
        { email: normalizedStaffEmail },
        {
          name: STAFF_NAME.trim(),
          email: normalizedStaffEmail,
          passwordHash: staffHash,
          role: "STAFF",
          isActive: true,
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
      console.log(`STAFF user (${normalizedStaffEmail}) upserted successfully.`);
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Seeding users failed:", error.message);
    process.exit(1);
  }
};

seedUsers();
