# 🎓 EduTrack – Smart Educational Management System

**EduTrack** is a modern, full-stack educational management platform that streamlines daily academic operations through AI-powered biometric verification and digital management tools.

---

## 📖 About the Project

EduTrack eliminates manual paper roll calls, prevents proxy attendance, and unifies academic workflows into a single dashboard. 

### Key Capabilities:
- **Biometric Face Attendance:** Teachers mark student attendance via a live webcam. An AI facial recognition model matches student faces against registered embeddings in real time and uploads a timestamped proof photo to the cloud.
- **Handwriting Similarity Check:** An AI comparison engine evaluates student handwriting samples against reference submissions to flag inconsistencies.
- **Digital Library Management:** Complete book cataloging, issuing, returning, and tracking transaction histories for students.
- **Classroom Resources:** Teachers can upload study materials, assignments, and syllabi that students can view and download.
- **Event Management:** Organizers can issue campus event passes for registered students.
- **Role-Based Access Control:** Strict security separating **Admin**, **Teacher**, **Student**, and **Librarian** privileges.

---

## 👥 User Roles & Dashboards

1. **System Administrator**
   - Review, approve, or reject new Teacher and Librarian registrations.
   - Manage all user accounts, view total counts, and monitor platform health.
   
2. **Teacher**
   - Conduct student attendance with real-time facial recognition.
   - Review subject-wise attendance logs and view webcam proof photos.
   - Upload syllabus files and homework assignments.

3. **Student**
   - Check personalized attendance records and status per subject.
   - Browse issued library books and due dates.
   - Access study notes, assignments, and campus event passes.

4. **Librarian**
   - Add, edit, and organize library book collections.
   - Issue books to students and process returns with status tracking.
   - Search student borrowing histories.

---

## 🛠️ Tools & Technologies Used

### Frontend
- **React 18:** Component-based UI library.
- **Vite:** High-performance frontend build tool.
- **Axios:** API communication with automatic JWT token interceptors.
- **Lucide React:** Modern UI icon library.
- **React Toastify:** Interactive alert and notification system.
- **HTML5 WebCam / Canvas:** Live camera stream for biometric face captures.

### Backend
- **Node.js & Express.js:** RESTful API server.
- **JSON Web Tokens (JWT):** Secure stateless session authentication.
- **BcryptJS:** Secure password hashing.
- **Helmet & Dynamic CORS:** Web security and cross-origin resource sharing protection.
- **Express Rate Limit:** Brute-force and DDoS request throttling.

### AI & Machine Learning Microservices
- **Python 3.10+ & FastAPI:** High-speed asynchronous microservice APIs.
- **Dlib & `face_recognition`:** 128-dimensional biometric facial embedding detection and matching.
- **PyTorch:** Neural network models for handwriting sample analysis.
- **OpenCV & Pillow (PIL):** Image transformation, cropping, and preprocessing.

### Cloud & DevOps Infrastructure
- **Vercel:** Hosts the production React application.
- **Render:** Hosts the Node.js API server and the 2 Python AI microservices.
- **MongoDB Atlas:** Managed cloud database for users, attendances, books, and descriptors.
- **Cloudinary:** Cloud storage for student webcam attendance photos and document assets.
- **UptimeRobot:** Automated health check monitoring to prevent container cold starts.
- **GitHub:** Source code management and CI/CD deployment pipelines.
