import sys
import os
import json
import re
import urllib.request
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(override=True)

if len(sys.argv) != 3:
    print(json.dumps({"status": "error", "message": "invalid_number_of_arguments"}))
    sys.exit(1)

student_id = sys.argv[1]
file_category = sys.argv[2]
token = os.environ.get('AUTH_TOKEN', '')
if not token:
    print(json.dumps({"status": "error", "message": "missing_auth_token"}))
    sys.exit(1)
if not re.match(r'^[a-zA-Z0-9]+$', student_id):
    print(json.dumps({"status": "error", "message": "invalid_student_id_format"}))
    sys.exit(1)

allowed_categories = ["handwriting_sample", "assignment", "all"]
if file_category not in allowed_categories:
    print(json.dumps({"status": "error", "message": "invalid_file_category"}))
    sys.exit(1)

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    print(json.dumps({"status": "error", "message": "mongodb_not_set"}))
    sys.exit(1)

try:
    from pymongo.uri_parser import parse_uri
    client = MongoClient(MONGO_URI)
    db_name = parse_uri(MONGO_URI).get("database") or "test"
    db = client[db_name]
    collection = db["files"]
except Exception:
    print(json.dumps({"status": "error", "message": "database_connection_failed"}))
    sys.exit(1)

output_dir = os.path.join(os.path.dirname(__file__), "fetched_files")
try:
    os.makedirs(output_dir, exist_ok=True)
    for f in os.listdir(output_dir):
        if student_id in f:
            filepath = os.path.join(output_dir, f)
            if os.path.isfile(filepath):
                os.remove(filepath)
except Exception:
    print(json.dumps({"status": "error", "message": "failed_to_prepare_output_directory"}))
    client.close()
    sys.exit(1)

result_files = []


def save_file(document, label):
    """Save a file from either a Cloudinary URL (fileUrl) or MongoDB buffer (fileData)."""
    try:
        extension = {
            "application/pdf": ".pdf", "image/png": ".png",
            "image/jpeg": ".jpg", "image/jpg": ".jpg"
        }.get(document.get("contentType", ""))

        if not extension:
            return None

        filename = f"{label}_{student_id}{extension}"
        file_path = os.path.join(output_dir, filename)

        # Prefer Cloudinary URL if available
        file_url = document.get("fileUrl")
        if file_url:
            urllib.request.urlretrieve(file_url, file_path)
            return file_path

        # Fallback to MongoDB buffer
        file_data = document.get("fileData")
        if file_data:
            with open(file_path, "wb") as f:
                f.write(file_data)
            return file_path

        return None
    except Exception as e:
        print(f"[fetch_file] Error saving {label}: {e}", file=sys.stderr)
        return None


if file_category == "all":
    sample_doc = collection.find_one({"studentId": student_id, "fileCategory": "handwriting_sample"})
    if not sample_doc:
        print(json.dumps({"status": "error", "message": "handwriting_sample_not_found"}))
        client.close()
        sys.exit(1)
    sample_path = save_file(sample_doc, "handwriting_sample")
    if not sample_path:
        print(json.dumps({"status": "error", "message": "failed_to_save_sample"}))
        client.close()
        sys.exit(1)
    result_files.append(sample_path)
    assignment_doc = collection.find_one(
        {"studentId": student_id, "fileCategory": "assignment"},
        sort=[("uploadDate", -1)])
    if not assignment_doc:
        print(json.dumps({"status": "error", "message": "assignment_not_found"}))
        client.close()
        sys.exit(1)
    assignment_path = save_file(assignment_doc, "latest_assignment")
    if not assignment_path:
        print(json.dumps({"status": "error", "message": "failed_to_save_assignment"}))
        client.close()
        sys.exit(1)
    result_files.append(assignment_path)
else:
    file_doc = collection.find_one({"studentId": student_id, "fileCategory": file_category})
    if not file_doc:
        print(json.dumps({"status": "error", "message": f"{file_category}_not_found"}))
        client.close()
        sys.exit(1)
    file_path = save_file(file_doc, file_category)
    if not file_path:
        print(json.dumps({"status": "error", "message": f"failed_to_save_{file_category}"}))
        client.close()
        sys.exit(1)
    result_files.append(file_path)

print(json.dumps({"status": "success", "files": result_files}))
client.close()