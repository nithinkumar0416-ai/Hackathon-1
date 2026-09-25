import multer from 'multer';

const storage = multer.memoryStorage();

// Accept all common document types
const ALLOWED_TYPES = {
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'text/x-markdown': ['.md'],
  'application/octet-stream': ['.pdf', '.docx', '.txt', '.md'], // fallback MIME
};

const fileFilter = (req, file, cb) => {
  const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
  const allowedExts = ['.pdf', '.txt', '.md', '.docx', '.doc'];
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not supported. Allowed: PDF, TXT, MD, DOCX`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

export default upload;
