const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const cleanDatabase = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error("❌ MONGO_URI is not set in .env file");
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    const dbName = mongoose.connection.name;
    console.log(`✅ Connected to MongoDB database: "${dbName}"`);

    const User = require("../models/User");
    const Student = require("../models/Student");
    const File = require("../models/File");
    const Attendance = require("../models/Attendance");

    // 1. Verify admin account exists to prevent lock-out
    const admin = await User.findOne({ role: "admin" });
    if (!admin) {
      console.error("❌ No admin account found! Aborting to prevent lockout.");
      process.exit(1);
    }
    console.log(`👑 Preserving Admin account: ${admin.name} (${admin.email})`);

    // 2. Remove all non-admin users (students, teachers, librarians)
    const userRes = await User.deleteMany({ role: { $ne: "admin" } });
    console.log(`🧹 Deleted ${userRes.deletedCount} non-admin user(s)`);

    // 3. Remove student profiles
    const studentRes = await Student.deleteMany({});
    console.log(`🧹 Deleted ${studentRes.deletedCount} student profile(s)`);

    // 4. Remove all files
    const fileRes = await File.deleteMany({});
    console.log(`🧹 Deleted ${fileRes.deletedCount} file(s)`);

    // 5. Remove all attendance records
    const attRes = await Attendance.deleteMany({});
    console.log(`🧹 Deleted ${attRes.deletedCount} attendance record(s)`);

    // 6. Clean registered_faces collection
    const facesCol = mongoose.connection.db.collection("registered_faces");
    const faceCount = await facesCol.countDocuments();
    if (faceCount > 0) {
      await facesCol.deleteMany({});
      console.log(`🧹 Deleted ${faceCount} registered face embedding(s)`);
    }

    // 7. Clean library & event collections if any
    const booksCol = mongoose.connection.db.collection("librarybooks");
    const transCol = mongoose.connection.db.collection("booktransactions");
    const eventsCol = mongoose.connection.db.collection("events");
    const passesCol = mongoose.connection.db.collection("eventpasses");

    await booksCol.deleteMany({});
    await transCol.deleteMany({});
    await eventsCol.deleteMany({});
    await passesCol.deleteMany({});

    console.log("\n🎉 Database cleanup complete!");
    console.log("Remaining users in database:");
    const remainingUsers = await User.find({}).select("name email role status").lean();
    remainingUsers.forEach(u => console.log(`   - [${u.role}] ${u.name} (${u.email})`));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Cleanup error:", error.message);
    process.exit(1);
  }
};

cleanDatabase();
